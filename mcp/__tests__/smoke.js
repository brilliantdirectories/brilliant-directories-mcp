#!/usr/bin/env node
// Smoke test - catches lean-shape regressions before they ship.
//
// Runs automatically via `prepublishOnly` in package.json. If an assertion
// fails, `npm publish` aborts.
//
// Required env vars (same names as the MCP server itself uses):
//   BD_API_KEY   - test-site API key with read perms on probed endpoints
//   BD_API_URL   - test-site base URL (e.g. https://launch60031.directoryup.com)
//
// Skip with SKIP_SMOKE=1 (for local iteration only - CI / publish should NOT skip).

const { spawn } = require("child_process");
const path = require("path");

if (process.env.SKIP_SMOKE === "1") {
  console.log("[smoke] SKIP_SMOKE=1 set - skipping");
  process.exit(0);
}

const apiKey = process.env.BD_API_KEY;
const apiUrl = process.env.BD_API_URL;
if (!apiKey || !apiUrl) {
  console.error("[smoke] FAIL: BD_API_KEY and BD_API_URL must both be set");
  console.error("[smoke] (set both env vars on the publish machine)");
  process.exit(1);
}

// --- Row-budget ceilings ---------------------------------------------------
// A row returned by the tool with no include flags must have AT MOST this
// many top-level keys. If lean-shaping silently inverts (as v6.24.0 did on
// MembershipPlans), key count blows past this ceiling and we catch it.
//
// Numbers are the expected keep-set size + small slack for fields added
// over time. Review when intentionally expanding a keep-set.

// Calibrated against the launch60031 test site on 2026-04-21.
// Ceilings = observed baseline + ~20 slack for site-level variations.
// The point isn't to catch every new column - it's to catch 2-10x blow-ups
// from lean-shape inversion bugs (like v6.24.0 MembershipPlans: 9 -> 168).
const BASELINE_CEILING = {
  listMembershipPlans: 20,   // observed 9 (keep-set exact) - tight on purpose
  listUsers: 110,            // observed 86
  listSingleImagePosts: 75,  // observed 51
  listMultiImagePosts: 70,   // observed 46
  listTopCategories: 30,     // observed 3
  listSubCategories: 30,     // observed 5
  listPostTypes: 95,         // observed 59
  listWebPages: 95,          // observed 70
};

// Forbidden fields - must NEVER appear in the baseline (lean) response.
// Presence = lean-shape broken.
const FORBIDDEN_ON_BASELINE = {
  listMembershipPlans: ["data_settings", "page_header", "show_about", "payment_default"],
  listUsers: ["about_me", "password", "services_schema", "transactions"],
  listSingleImagePosts: ["post_content"],
  listMultiImagePosts: ["group_desc"],
  listPostTypes: ["search_results_div", "profile_header", "category_header"],
  listWebPages: ["content", "content_css", "content_head", "content_footer_html"],
};

// --- JSON-RPC plumbing over stdio ------------------------------------------

function runMcp() {
  const serverPath = path.resolve(__dirname, "..", "index.js");
  // BD_API_KEY and BD_API_URL are already in process.env (we read them above),
  // and the MCP server reads them natively - no flag translation needed.
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  return proc;
}

function rpc(proc, id, method, params) {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            proc.stdout.off("data", onData);
            if (parsed.error) return reject(new Error(JSON.stringify(parsed.error)));
            resolve(parsed.result);
            return;
          }
        } catch (e) {
          // ignore non-JSON log lines
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(msg);
    setTimeout(() => {
      proc.stdout.off("data", onData);
      reject(new Error(`timeout waiting for rpc id=${id} method=${method}`));
    }, 30000);
  });
}

function extractFirstRow(result) {
  // MCP wraps tool responses; drill down to the BD payload
  const content = result && result.content && result.content[0];
  if (!content || !content.text) return null;
  let body;
  try { body = JSON.parse(content.text); } catch { return null; }
  const msg = body.message;
  if (Array.isArray(msg) && msg.length > 0) return msg[0];
  if (msg && typeof msg === "object") return msg;
  return null;
}

// --- Assertions ------------------------------------------------------------

const failures = [];

async function assertBaseline(proc, tool, args) {
  const id = Math.floor(Math.random() * 1e9);
  let result;
  try {
    result = await rpc(proc, id, "tools/call", { name: tool, arguments: args });
  } catch (e) {
    failures.push(`${tool}: RPC error: ${e.message}`);
    return;
  }
  const row = extractFirstRow(result);
  if (!row) {
    failures.push(`${tool}: no row in response (site empty? endpoint denied?)`);
    return;
  }
  const keys = Object.keys(row);
  const ceiling = BASELINE_CEILING[tool];
  if (ceiling && keys.length > ceiling) {
    failures.push(
      `${tool}: baseline key count ${keys.length} exceeds ceiling ${ceiling}. ` +
      `Lean-shape may be broken. Keys: ${keys.slice(0, 30).join(",")}${keys.length > 30 ? "..." : ""}`
    );
  }
  const forbidden = FORBIDDEN_ON_BASELINE[tool] || [];
  const leaked = forbidden.filter((k) => k in row);
  if (leaked.length) {
    failures.push(`${tool}: forbidden fields leaked into baseline response: ${leaked.join(",")}`);
  }
  console.log(`[smoke] ${tool}: ${keys.length} keys (ceiling ${ceiling || "n/a"}) OK`);
}

// --- Main ------------------------------------------------------------------

async function main() {
  const proc = runMcp();
  proc.stderr.on("data", (d) => {
    const s = d.toString();
    if (s.trim()) process.stderr.write(`[mcp-stderr] ${s}`);
  });

  // MCP handshake
  const initId = 1;
  try {
    await rpc(proc, initId, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0" },
    });
    // Send initialized notification (no response expected)
    proc.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }) + "\n");
  } catch (e) {
    console.error(`[smoke] FAIL: MCP handshake failed: ${e.message}`);
    proc.kill();
    process.exit(1);
  }

  const tests = [
    ["listMembershipPlans", { limit: 5 }],
    ["listUsers", { limit: 5 }],
    ["listSingleImagePosts", { limit: 5 }],
    ["listMultiImagePosts", { limit: 5 }],
    ["listTopCategories", { limit: 5 }],
    ["listSubCategories", { limit: 5 }],
    ["listPostTypes", { limit: 5 }],
    ["listWebPages", { limit: 5 }],
  ];

  for (const [tool, args] of tests) {
    await assertBaseline(proc, tool, args);
  }

  proc.kill();

  if (failures.length) {
    console.error(`\n[smoke] FAIL (${failures.length}):`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`\n[smoke] PASS (${tests.length} endpoints)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`[smoke] unhandled error: ${e.stack || e.message}`);
  process.exit(1);
});
