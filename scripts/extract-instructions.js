// One-shot script: extract the instruction block from mcp/index.js into a
// standalone file so both transports (npm + Cloudflare Worker) can share it.
// After this runs, mcp/index.js can be refactored to load the file instead
// of carrying the string inline.
//
// Run once from repo root:  node scripts/extract-instructions.js
// Idempotent — safe to re-run.

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "mcp", "index.js");
const OUT = path.join(__dirname, "..", "openapi", "mcp-instructions.md");

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split("\n");

// Locate the array literal: scan forward from `instructions: [` to the
// matching `].join("\n"),`. 1-indexed line numbers reported by grep translate
// to 0-indexed slice bounds.
let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (startIdx === -1 && /instructions:\s*\[/.test(lines[i])) {
    startIdx = i;
  } else if (startIdx !== -1 && /^\s*\]\.join\(/.test(lines[i])) {
    endIdx = i;
    break;
  }
}

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not locate instructions array in mcp/index.js");
  process.exit(1);
}

// slice(start, end) gives us the array opener through the last backtick
// entry (non-inclusive of the `].join(...)` line, which is what we want).
const snippet = lines.slice(startIdx, endIdx).join("\n");

// Strip the `instructions:` label, add a fresh closing `]` and `.join("\n")`
// so eval returns a plain string.
const code = snippet.replace(/^\s*instructions:\s*/, "") + "].join('\\n')";

let text;
try {
  // eval executes the template-literal array literally — ideal because we
  // want the interpolated form, NOT the source tokens.
  text = eval(code);
} catch (err) {
  console.error("eval failed:", err.message);
  process.exit(1);
}

fs.writeFileSync(OUT, text, "utf8");
console.log(`wrote ${text.length} bytes to ${path.relative(process.cwd(), OUT)}`);
