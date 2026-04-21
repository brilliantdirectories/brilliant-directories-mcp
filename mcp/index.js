#!/usr/bin/env node

/**
 * Brilliant Directories MCP Server
 *
 * Exposes all BD API v2 endpoints as MCP tools.
 * Reads the OpenAPI spec and auto-generates tool definitions.
 *
 * Usage:
 *   brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
 *
 * Or via env vars:
 *   BD_API_KEY=YOUR_KEY BD_API_URL=https://your-site.com brilliant-directories-mcp
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const readline = require("readline");
const { URL } = require("url");

// Read package version once at startup (keeps User-Agent + server init in sync with package.json)
const PACKAGE_VERSION = (() => {
  try {
    return require("./package.json").version;
  } catch {
    return "unknown";
  }
})();

// Track in-flight HTTP requests so SIGTERM/SIGINT can drain cleanly
const IN_FLIGHT_REQUESTS = new Set();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    apiKey: process.env.BD_API_KEY || "",
    apiUrl: process.env.BD_API_URL || "",
    verify: false,
    setup: false,
    help: false,
    debug: process.env.BD_DEBUG === "1" || process.env.BD_DEBUG === "true",
    client: "",   // "cursor" | "claude-desktop" | "windsurf" | "claude-code" | "print" | ""
    yes: false,   // auto-confirm any "continue anyway?" prompts (for non-interactive use)
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--api-key" || args[i] === "--apiKey") && args[i + 1]) {
      config.apiKey = args[++i];
    } else if ((args[i] === "--url" || args[i] === "--api-url") && args[i + 1]) {
      config.apiUrl = args[++i];
    } else if (args[i] === "--verify") {
      config.verify = true;
    } else if (args[i] === "--setup") {
      config.setup = true;
    } else if (args[i] === "--client" && args[i + 1]) {
      config.client = args[++i].toLowerCase();
    } else if (args[i] === "--yes" || args[i] === "-y") {
      config.yes = true;
    } else if (args[i] === "--debug") {
      config.debug = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      config.help = true;
    }
  }

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  // Setup mode skips the API-key-required check - wizard will prompt for them
  if (config.setup) {
    return config;
  }

  // Normalize URL: strip trailing slash, ensure protocol
  config.apiUrl = config.apiUrl.replace(/\/+$/, "");
  if (config.apiUrl && !/^https?:\/\//i.test(config.apiUrl)) {
    config.apiUrl = "https://" + config.apiUrl;
  }

  if (!config.apiKey) {
    console.error("Error: API key required. Use --api-key YOUR_KEY or set BD_API_KEY env var.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }
  if (!config.apiUrl) {
    console.error("Error: Site URL required. Use --url https://your-site.com or set BD_API_URL env var.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  return config;
}

function printHelp() {
  console.log(`brilliant-directories-mcp - MCP server for the Brilliant Directories API

FIRST TIME?  Just run this and answer 2 questions:
  npx brilliant-directories-mcp --setup

Usage:
  brilliant-directories-mcp --setup                                    Interactive wizard (recommended for humans)
  brilliant-directories-mcp --setup --url URL --api-key KEY --client cursor [--yes]
                                                                       Non-interactive setup (for AI agents / scripts)
  brilliant-directories-mcp --api-key KEY --url URL                    Run the MCP server
  brilliant-directories-mcp --verify --api-key KEY --url URL           Test credentials and exit
  BD_API_KEY=KEY BD_API_URL=URL brilliant-directories-mcp              Run via env vars

Options:
  --setup          Run setup. If --url, --api-key, and --client are all provided, runs non-interactively.
                   Otherwise prompts interactively for any missing value.
  --api-key KEY    Your BD API key (or set BD_API_KEY env var)
  --url URL        Your BD site URL, e.g. https://mysite.com (or BD_API_URL env var)
  --client NAME    Which MCP client to configure. One of:
                     cursor          writes to ~/.cursor/mcp.json
                     claude-desktop  writes to the Claude Desktop config
                     windsurf        writes to ~/.codeium/windsurf/mcp_config.json
                     claude-code     prints the "claude mcp add" command to run
                     print           prints the JSON config only, does not write any file
                   If omitted in interactive setup, the wizard asks.
  --yes, -y        Auto-confirm any "continue anyway?" prompts (non-interactive safety)
  --verify         Test credentials against /api/v2/token/verify and exit
  --debug          Log every HTTP request + response to stderr (or set BD_DEBUG=1)
  --help, -h       Show this help

Get an API key: BD Admin > Developer Hub > Generate API Key
Docs: https://github.com/brilliantdirectories/brilliant-directories-mcp`);
}

// ---------------------------------------------------------------------------
// OpenAPI spec -> MCP tools
// ---------------------------------------------------------------------------

function loadSpec() {
  // Try the in-package location first (what npm ships), then fall back to the
  // monorepo location (repo-root openapi/ sibling of mcp/) for local development.
  const candidates = [
    path.join(__dirname, "openapi", "bd-api.json"),
    path.join(__dirname, "..", "openapi", "bd-api.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  console.error(`Error: OpenAPI spec not found. Looked in:`);
  for (const p of candidates) console.error(`  ${p}`);
  console.error(`This is a packaging bug - please open an issue at https://github.com/brilliantdirectories/brilliant-directories-mcp/issues`);
  process.exit(1);
}

/**
 * Convert OpenAPI path operations to MCP tool definitions.
 * Each operation becomes one tool with:
 *   - name: operationId
 *   - description: summary + description
 *   - inputSchema: merged path params + query params + requestBody properties
 */
function buildTools(spec) {
  const tools = [];
  const toolMap = {}; // operationId -> { method, path, params, bodyProps }
  const seenIds = new Map(); // operationId -> "METHOD path" for duplicate detection

  for (const [urlPath, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.operationId) continue;

      // Self-defense: duplicate operationIds would silently overwrite each other in toolMap.
      // Fail loudly on startup instead of mysterious "tool not found" errors later.
      const location = `${method.toUpperCase()} ${urlPath}`;
      if (seenIds.has(op.operationId)) {
        console.error(`Error: duplicate operationId "${op.operationId}" in OpenAPI spec.`);
        console.error(`  First seen at: ${seenIds.get(op.operationId)}`);
        console.error(`  Also found at: ${location}`);
        console.error(`Each endpoint must have a unique operationId. Fix openapi/bd-api.json.`);
        process.exit(1);
      }
      seenIds.set(op.operationId, location);

      const properties = {};
      const required = [];

      // Path parameters
      if (op.parameters) {
        for (const param of op.parameters) {
          // Resolve $ref if needed
          const p = param.$ref
            ? resolveRef(spec, param.$ref)
            : param;

          if (p.in === "path") {
            properties[p.name] = p.schema || { type: "string" };
            if (p.description) properties[p.name].description = p.description;
            required.push(p.name);
          } else if (p.in === "query" && !["limit", "page", "property", "property_value", "property_operator", "order_column", "order_type"].includes(p.name)) {
            // Non-standard query params (like form_name)
            properties[p.name] = p.schema || { type: "string" };
            if (p.description) properties[p.name].description = p.description;
            if (p.required) required.push(p.name);
          }
        }
      }

      // Standard pagination/filter params for GET list endpoints
      if (method === "get" && op.parameters) {
        const hasLimit = op.parameters.some(
          (p) => (p.name === "limit" || (p.$ref && p.$ref.includes("/limit")))
        );
        if (hasLimit) {
          properties.limit = { type: "integer", description: "Records per page (default 25, max 100)" };
          properties.page = { type: "string", description: "Pagination cursor (use next_page from previous response)" };
          properties.property = { type: "string", description: "Field name to filter by" };
          properties.property_value = { type: "string", description: "Value to filter by" };
          properties.property_operator = { type: "string", description: "Filter operator: =, LIKE, >, <, >=, <=" };
          properties.order_column = { type: "string", description: "Column to sort by" };
          properties.order_type = { type: "string", description: "Sort direction: ASC or DESC" };
        }
      }

      // Request body properties
      let bodyProps = {};
      if (op.requestBody) {
        const content = op.requestBody.content;
        const schema = content?.["application/x-www-form-urlencoded"]?.schema;
        if (schema && schema.properties) {
          for (const [key, val] of Object.entries(schema.properties)) {
            properties[key] = { ...val };
          }
          if (schema.required) {
            for (const r of schema.required) {
              if (!required.includes(r)) required.push(r);
            }
          }
          bodyProps = schema.properties;
        }
      }

      const tool = {
        name: op.operationId,
        description: [op.summary, op.description].filter(Boolean).join(" - "),
        inputSchema: {
          type: "object",
          properties,
        },
      };
      if (required.length > 0) {
        tool.inputSchema.required = required;
      }

      tools.push(tool);
      toolMap[op.operationId] = {
        method: method.toUpperCase(),
        path: urlPath,
        bodyProps,
      };
    }
  }

  return { tools, toolMap };
}

function resolveRef(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`Invalid $ref: ${JSON.stringify(ref)} (must start with "#/")`);
  }
  const parts = ref.replace("#/", "").split("/");
  let obj = spec;
  for (const part of parts) {
    if (obj == null || typeof obj !== "object") {
      throw new Error(`Unresolvable $ref: "${ref}" - segment "${part}" has no parent object`);
    }
    if (!(part in obj)) {
      throw new Error(`Unresolvable $ref: "${ref}" - segment "${part}" not found`);
    }
    obj = obj[part];
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Lean-response shapers (v6.15.0 users, v6.16.0 posts + categories)
//
// Pattern: strip heavy nested buckets + debug residue by default; opt back in
// per-call via include_* flags. Applied between BD response and agent return.
// Shared helper `stripKeys(row, keys)` removes a list of fields in place.
// ---------------------------------------------------------------------------

function stripKeys(row, keys) {
  if (!row || typeof row !== "object") return;
  for (const k of keys) delete row[k];
}

// --- v6.15.0 USERS (listUsers / getUser / searchUsers) --------------------

const USER_LEAN_INCLUDE_FLAGS = [
  "include_password",
  "include_subscription",
  "include_clicks",
  "include_photos",
  "include_transactions",
  "include_profession",
  "include_tags",
  "include_services",
  "include_seo_hidden",
  "include_about", // v6.16.0
];

const USER_LEAN_ALWAYS_STRIP = ["save", "form", "formname", "sized", "faction", "result"];

const USER_LEAN_SEO_BUNDLE = [
  "seo_page_title_hidden",
  "seo_page_description_hidden",
  "seo_page_keywords_hidden",
  "seo_social_page_title_hidden",
  "seo_social_page_description_hidden",
  "search_description",
];

function applyUserLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const include = {
    password: !!includeFlags.include_password,
    subscription: !!includeFlags.include_subscription,
    clicks: !!includeFlags.include_clicks,
    photos: !!includeFlags.include_photos,
    transactions: !!includeFlags.include_transactions,
    profession: !!includeFlags.include_profession,
    tags: !!includeFlags.include_tags,
    services: !!includeFlags.include_services,
    seo_hidden: !!includeFlags.include_seo_hidden,
    about: !!includeFlags.include_about,
  };
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const totalPhotos = Array.isArray(row.photos_schema) ? row.photos_schema.length : 0;
    stripKeys(row, USER_LEAN_ALWAYS_STRIP);
    if (!include.password) delete row.password;
    if (!include.subscription) delete row.subscription_schema;
    if (!include.photos) delete row.photos_schema;
    if (!include.transactions) delete row.transactions;
    if (!include.profession) delete row.profession_schema;
    if (!include.tags) delete row.tags;
    if (!include.services) delete row.services_schema;
    if (!include.clicks) {
      const total =
        row.user_clicks_schema && row.user_clicks_schema.total_clicks !== undefined
          ? row.user_clicks_schema.total_clicks
          : 0;
      row.total_clicks = total;
      delete row.user_clicks_schema;
    }
    if (!include.seo_hidden) stripKeys(row, USER_LEAN_SEO_BUNDLE);
    if (!include.about) delete row.about_me;
    if (!include.photos) row.total_photos = totalPhotos;
    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const USER_READ_TOOLS = new Set(["listUsers", "getUser", "searchUsers"]);

// --- v6.16.0 POSTS (list/get/search SingleImagePost + MultiImagePost) -----

const POST_LEAN_INCLUDE_FLAGS = [
  "include_content",
  "include_post_seo",
  "include_author_full",
  "include_clicks",
  "include_photos",
];

// Promoted from nested data_category (v6.17.0). data_id + data_type are already
// top-level on the BD row; we only promote the remaining 4 identity/routing fields.
const POST_TYPE_SUMMARY_PROMOTE = ["system_name", "data_name", "data_filename", "form_name"];

const POST_LEAN_ALWAYS_STRIP = [
  // Admin-form residue that leaks into post read responses. 100% useless to agents.
  "form", "au_location", "noheader", "id", "save", "website_id", "form_name",
  "myid", "method", "au_link", "au_limit", "au_main_info", "au_comesf",
  "au_header", "au_hint", "au_length", "au_module", "au_photo", "au_selector",
  "au_ttlimit", "auHeaderTitle", "sized", "subaction", "formname",
  "logged_user", "form_security_token", "auto_image_import",
];

const POST_LEAN_SEO_BUNDLE = [
  "post_meta_title",
  "post_meta_description",
  "post_meta_keywords",
];

// HTML body field names differ between post families:
// Single: post_content. Multi: group_desc.
const POST_HTML_BODY_FIELDS = ["post_content", "group_desc"];

const AUTHOR_SUMMARY_FIELDS = [
  "user_id",
  "first_name",
  "last_name",
  "company",
  "email",
  "phone_number",
  "filename",
  "image_main_file",
  "subscription_id",
  "active",
];

function applyPostLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const include = {
    content: !!includeFlags.include_content,
    post_seo: !!includeFlags.include_post_seo,
    author_full: !!includeFlags.include_author_full,
    clicks: !!includeFlags.include_clicks,
    photos: !!includeFlags.include_photos,
  };
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    stripKeys(row, POST_LEAN_ALWAYS_STRIP);

    // Author: replace full `user` nested object with a curated summary under `author`.
    // include_author_full=1 preserves the original `user` key untouched.
    if (row.user && typeof row.user === "object") {
      if (include.author_full) {
        // Keep original `user` as-is. No summary needed.
      } else {
        const author = {};
        for (const k of AUTHOR_SUMMARY_FIELDS) {
          if (k in row.user) author[k] = row.user[k];
        }
        // If BD didn't include image_main_file on the nested user (varies),
        // leave it as undefined - agent can do a getUser if they need it.
        row.author = author;
        delete row.user;
      }
    }

    // Post-type: promote 4 identity/routing fields to top level, then drop the full
    // config object. data_id + data_type are already top-level on the BD row.
    // Full post-type config (sidebars, code fields, search modules, etc.) is never
    // returned on post reads - agents needing it call getPostType(data_id) directly.
    if (row.data_category && typeof row.data_category === "object") {
      for (const k of POST_TYPE_SUMMARY_PROMOTE) {
        if (row[k] === undefined && row.data_category[k] !== undefined) {
          row[k] = row.data_category[k];
        }
      }
      delete row.data_category;
    }

    // Clicks: strip click array, surface total_clicks.
    if (!include.clicks) {
      const total =
        row.user_clicks_schema && row.user_clicks_schema.total_clicks !== undefined
          ? row.user_clicks_schema.total_clicks
          : 0;
      row.total_clicks = total;
      delete row.user_clicks_schema;
    }

    // list_service: platform-inconsistent, almost always `false`. Strip always.
    delete row.list_service;

    // Post content HTML body - opt-in. Field name differs: Single=post_content, Multi=group_desc.
    if (!include.content) stripKeys(row, POST_HTML_BODY_FIELDS);

    // Post SEO meta bundle - opt-in. (Single only; Multi posts don't have these.)
    if (!include.post_seo) stripKeys(row, POST_LEAN_SEO_BUNDLE);

    // Multi-image posts nest the full photo array under `users_portfolio`.
    // Strip by default, surface total_photos count, keep cover photo URLs from first entry.
    if (Array.isArray(row.users_portfolio)) {
      const totalPhotos = row.users_portfolio.length;
      if (!include.photos) {
        const first = row.users_portfolio[0];
        if (first && first.file_main_full_url) {
          row.cover_photo_url = first.file_main_full_url;
        }
        if (first && first.file_thumbnail_full_url) {
          row.cover_thumbnail_url = first.file_thumbnail_full_url;
        }
        row.total_photos = totalPhotos;
        delete row.users_portfolio;
      }
    }

    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const POST_READ_TOOLS = new Set([
  "listSingleImagePosts",
  "getSingleImagePost",
  "searchSingleImagePosts",
  "listMultiImagePosts",
  "getMultiImagePost",
  "searchMultiImagePosts",
]);

// --- v6.16.0 CATEGORIES (top + sub) ---------------------------------------
//
// Categories are lean-by-default. Hierarchy linkage fields (profession_id on
// top+sub; master_id on sub for sub-sub parent) are ALWAYS returned so agents
// can traverse top -> sub -> sub-sub without opt-in. SEO-style metadata
// (desc, keywords, image, icon, sort_order, lead_price, timestamps) is
// hold-back behind include_category_schema=1.

const CATEGORY_LEAN_INCLUDE_FLAGS = ["include_category_schema"];

const CATEGORY_SCHEMA_BUNDLE = [
  "desc",
  "keywords",
  "image",
  "icon",
  "sort_order",
  "lead_price",
  "revision_timestamp",
  "tablesExists",
];

function applyCategoryLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  if (includeFlags.include_category_schema) return body;
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    stripKeys(row, CATEGORY_SCHEMA_BUNDLE);
    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const CATEGORY_READ_TOOLS = new Set([
  "listTopCategories",
  "getTopCategory",
  "listSubCategories",
  "getSubCategory",
]);

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

function makeRequest(config, method, urlPath, queryParams, bodyParams) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, config.apiUrl);

    // Add query params
    if (queryParams) {
      for (const [key, val] of Object.entries(queryParams)) {
        if (val !== undefined && val !== null && val !== "") {
          fullUrl.searchParams.set(key, String(val));
        }
      }
    }

    const isHttps = fullUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    let bodyStr = "";
    if (bodyParams && Object.keys(bodyParams).length > 0) {
      bodyStr = new URLSearchParams(
        Object.entries(bodyParams).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ).toString();
    }

    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      method: method,
      headers: {
        "X-Api-Key": config.apiKey,
        "Accept": "application/json",
        "User-Agent": `brilliant-directories-mcp/${PACKAGE_VERSION} (node/${process.version})`,
      },
    };

    if (bodyStr) {
      options.headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    if (config.debug) {
      // Redact API key from logged headers
      const safeHeaders = { ...options.headers, "X-Api-Key": "***REDACTED***" };
      // Redact sensitive body keys
      const SENSITIVE_KEYS = new Set(["password", "passwd", "pwd", "token", "api_key", "apikey", "cookie", "secret", "auth"]);
      const safeBody = bodyStr
        ? bodyStr.split("&").map((pair) => {
            const idx = pair.indexOf("=");
            if (idx === -1) return pair;
            const key = decodeURIComponent(pair.slice(0, idx));
            return SENSITIVE_KEYS.has(key.toLowerCase()) ? `${pair.slice(0, idx)}=***REDACTED***` : pair;
          }).join("&")
        : "";
      console.error(`[debug] -> ${method} ${fullUrl.href}`);
      console.error(`[debug]   headers: ${JSON.stringify(safeHeaders)}`);
      if (safeBody) console.error(`[debug]   body: ${safeBody}`);
    }

    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (config.debug) {
          console.error(`[debug] <- ${res.statusCode} ${method} ${fullUrl.href}`);
          console.error(`[debug]   body: ${data.length > 500 ? data.slice(0, 500) + "...[truncated]" : data}`);
        }
        const retryAfter = res.headers && res.headers["retry-after"];
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), retryAfter });
        } catch {
          resolve({ status: res.statusCode, body: data, retryAfter });
        }
      });
    });
    IN_FLIGHT_REQUESTS.add(req);
    req.on("close", () => IN_FLIGHT_REQUESTS.delete(req));

    req.on("error", (err) => {
      if (config.debug) console.error(`[debug] ✗ ${method} ${fullUrl.href} - ${err.message}`);
      reject(err);
    });
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timed out after 30s"));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden && process.stdin.isTTY) {
      // Mask input for API key
      process.stdout.write(question);
      const onData = (char) => {
        const c = char.toString("utf8");
        if (c === "\n" || c === "\r" || c === "\r\n" || c === "\u0004") {
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
        } else if (c === "\u0003") {
          // Ctrl+C
          process.exit(130);
        } else {
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function normalizeUrl(input) {
  let u = (input || "").trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function getClientConfigPath(client) {
  const home = os.homedir();
  switch (client) {
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
    case "claude-desktop":
      if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      } else if (process.platform === "win32") {
        return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
      } else {
        return path.join(home, ".config", "Claude", "claude_desktop_config.json");
      }
    case "windsurf":
      return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    case "claude-code":
      return null; // Claude Code uses `claude mcp add` CLI - we print instructions instead
    default:
      return null;
  }
}

function buildMcpServerEntry(apiKey, apiUrl) {
  return {
    command: "npx",
    args: ["-y", "brilliant-directories-mcp", "--api-key", apiKey, "--url", apiUrl],
  };
}

function writeClientConfig(configPath, serverName, entry) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let existing = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf8").trim();
      if (raw) existing = JSON.parse(raw);
      if (!existing.mcpServers || typeof existing.mcpServers !== "object") {
        existing.mcpServers = {};
      }
    } catch (err) {
      console.error(`\nCould not parse existing config at ${configPath}`);
      console.error(`Error: ${err.message}`);
      console.error("Skipping write to avoid overwriting. Fix the file manually and rerun --setup.");
      return false;
    }
  }

  existing.mcpServers[serverName] = entry;
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n");
  return true;
}

async function runSetup(cliConfig) {
  cliConfig = cliConfig || {};
  const flagUrl = cliConfig.apiUrl || "";
  const flagKey = cliConfig.apiKey || "";
  const flagClient = (cliConfig.client || "").toLowerCase();
  const autoYes = !!cliConfig.yes;

  // Non-interactive when all three required values are provided via flags or env
  const nonInteractive = !!(flagUrl && flagKey && flagClient);

  console.log("");
  console.log("Brilliant Directories MCP - Setup Wizard");
  console.log("=========================================");
  if (nonInteractive) {
    console.log("(non-interactive mode - all values supplied via flags)");
  }
  console.log("");

  // URL
  let apiUrl = flagUrl;
  if (apiUrl) {
    apiUrl = normalizeUrl(apiUrl);
  } else {
    while (!apiUrl) {
      const raw = await prompt("Your BD site URL (e.g. https://mysite.com): ");
      if (!raw) {
        console.log("  Please enter your site URL.");
        continue;
      }
      apiUrl = normalizeUrl(raw);
    }
  }

  // API Key
  let apiKey = flagKey;
  if (!apiKey) {
    console.log("");
    console.log("Get an API key from: BD Admin > Developer Hub > Generate API Key");
    while (!apiKey) {
      const raw = await prompt("Your BD API key: ", { hidden: true });
      if (!raw) {
        console.log("  Please paste your API key.");
        continue;
      }
      apiKey = raw;
    }
  }

  // Verify
  console.log("");
  process.stdout.write("Testing connection... ");
  try {
    const result = await makeRequest({ apiKey, apiUrl, debug: false }, "GET", "/api/v2/token/verify", null, null);
    if (result.status >= 200 && result.status < 300 && result.body?.status === "success") {
      console.log("OK");
    } else {
      console.log("FAILED");
      console.log(`  HTTP ${result.status}: ${JSON.stringify(result.body)}`);
      console.log("");
      console.log("Setup will still write the config, but your AI agent won't be able to call the API until this is fixed.");
      if (autoYes || nonInteractive) {
        console.log("Continuing because --yes or --url/--api-key/--client were all provided.");
      } else {
        const proceed = await prompt("Continue anyway? (y/N): ");
        if (!/^y/i.test(proceed)) {
          console.log("Setup cancelled.");
          process.exit(1);
        }
      }
    }
  } catch (err) {
    console.log("FAILED");
    console.log(`  ${err.message}`);
    if (autoYes || nonInteractive) {
      console.log("Continuing because --yes or --url/--api-key/--client were all provided.");
    } else {
      const proceed = await prompt("Continue anyway? (y/N): ");
      if (!/^y/i.test(proceed)) {
        console.log("Setup cancelled.");
        process.exit(1);
      }
    }
  }

  // Client selection
  const entry = buildMcpServerEntry(apiKey, apiUrl);
  const serverName = "brilliant-directories";

  const CLIENT_MAP = {
    cursor:          { key: "cursor",         label: "Cursor" },
    "claude-desktop":{ key: "claude-desktop", label: "Claude Desktop" },
    windsurf:        { key: "windsurf",       label: "Windsurf" },
    "claude-code":   { key: "claude-code",    label: "Claude Code" },
    print:           { key: "other",          label: "Print-only" },
    other:           { key: "other",          label: "Other" },
  };

  let clientKey, clientLabel;
  if (flagClient) {
    const picked = CLIENT_MAP[flagClient];
    if (!picked) {
      console.error(`Error: unknown --client value "${flagClient}". Expected one of: cursor, claude-desktop, windsurf, claude-code, print.`);
      process.exit(1);
    }
    clientKey = picked.key;
    clientLabel = picked.label;
  } else {
    console.log("");
    console.log("Where are you using this?");
    console.log("  1) Cursor");
    console.log("  2) Claude Desktop");
    console.log("  3) Windsurf");
    console.log("  4) Claude Code (CLI)");
    console.log("  5) Other / just show me the config");
    const choice = await prompt("Choice [1-5]: ");
    switch ((choice || "").trim()) {
      case "1": clientKey = "cursor"; clientLabel = "Cursor"; break;
      case "2": clientKey = "claude-desktop"; clientLabel = "Claude Desktop"; break;
      case "3": clientKey = "windsurf"; clientLabel = "Windsurf"; break;
      case "4": clientKey = "claude-code"; clientLabel = "Claude Code"; break;
      default: clientKey = "other"; clientLabel = "Other";
    }
  }

  console.log("");

  if (clientKey === "claude-code") {
    console.log("For Claude Code, run this command in your terminal:");
    console.log("");
    console.log(`  claude mcp add ${serverName} -- npx -y brilliant-directories-mcp --api-key ${apiKey} --url ${apiUrl}`);
    console.log("");
    console.log("Then restart Claude Code and ask: \"List members on my BD site\"");
  } else if (clientKey === "other") {
    console.log("Add this to your MCP client's config file:");
    console.log("");
    console.log(JSON.stringify({ mcpServers: { [serverName]: entry } }, null, 2));
    console.log("");
    console.log("Then restart your client and ask: \"List members on my BD site\"");
  } else {
    const configPath = getClientConfigPath(clientKey);
    const wrote = writeClientConfig(configPath, serverName, entry);
    if (wrote) {
      console.log(`Config written to:`);
      console.log(`  ${configPath}`);
      console.log("");
      console.log(`Done! Restart ${clientLabel} and ask Claude:`);
      console.log(`  "List members on my BD site"`);
    }
  }

  console.log("");
  process.exit(0);
}

async function runVerify(config) {
  try {
    const result = await makeRequest(config, "GET", "/api/v2/token/verify", null, null);
    if (result.status >= 200 && result.status < 300 && result.body?.status === "success") {
      console.log(`OK - credentials verified against ${config.apiUrl}`);
      if (result.body.data) {
        console.log(JSON.stringify(result.body.data, null, 2));
      }
      process.exit(0);
    } else {
      console.error(`FAIL - HTTP ${result.status}`);
      console.error(typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2));
      process.exit(2);
    }
  } catch (err) {
    console.error(`FAIL - ${err.message}`);
    process.exit(2);
  }
}

async function main() {
  const config = parseArgs();

  if (config.setup) {
    await runSetup(config);
    return;
  }

  if (config.verify) {
    await runVerify(config);
    return;
  }

  const spec = loadSpec();
  const { tools, toolMap } = buildTools(spec);

  const server = new Server(
    {
      name: "brilliant-directories-mcp",
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: [
        `You operate Brilliant Directories sites. These tools and their descriptions are your native capability set, grounded in BD's live behavior.`,
        ``,
        `If a user assumes a capability that doesn't exist, say so plainly and suggest the closest supported path. Never fabricate tool calls, invent fields, or silently substitute. For genuinely-supported capabilities, just use them.`,
        ``,
        `**Every write goes to a live production site - there is no staging mode, no sandbox, no \`?dry_run=1\`.** Every create/update/delete takes effect immediately on the real public site. For bulk operations (many records, potentially destructive changes, schema-like edits) confirm intent with the user before executing.`,
        ``,
        `For business decisions (who, what, when, tone, scope), ask only what you need to proceed, then execute.`,
        ``,
        `Chain or run multiple tools to compile the data points needed. Most real tasks need more than one call - e.g., creating a member with a scraped logo: \`listMembershipPlans\` (pick plan) -> \`createUser\` (with \`profession_name\`, \`services\`, \`logo\` URL, \`auto_image_import=1\`). Writing a blog post authored by a member: \`listUsers\` (find author) -> \`listPostTypes\` (find blog type, read its \`data_type\`) -> \`createSingleImagePost\`.`,
        ``,
        `**Update-tool schemas are DOCUMENTATION, not whitelists - universal rule across every \`update*\` tool.** The \`properties\` listed on each update tool's request body name the commonly-edited, enum-tagged, or interaction-annotated fields; they are NOT a server-side allow list. BD's backend accepts any field it recognizes as a column/EAV key on the target resource.

**If a field appears in the resource's \`get*\` / \`list*\` response but not in the \`update*\` schema, send it on update and BD will persist it** - the MCP wrapper forwards unlisted keys verbatim; it does NOT strip them. Do not refuse an edit because a field is absent from the schema. Phrases like "commonly-edited", "editable fields", "main settings" elsewhere in tool descriptions are GUIDANCE, not restrictions - any column returned on GET can be written on UPDATE.

**Workflow when a user asks to change a field not in the update schema:**

1. Confirm the field exists in the resource's current GET response with a sensible current value.
2. Send the update with that field name.
3. Confirm round-trip by re-reading the record.

Only refuse if the field genuinely doesn't exist on the resource, or the user is asking for a structural change the resource doesn't support.

**Updates use PATCH semantics - send ONLY the fields you want to change; omitted fields are untouched.** Never re-send a full record just to tweak one setting. Example: to flip \`content_layout\` to \`1\` on a WebPage, send just \`seo_id\` + \`content_layout=1\` - don't re-send \`content\`, \`title\`, \`meta_desc\`, etc.

Single narrow exception: the post-type code-group all-or-nothing save rule on \`updatePostType\` (search-results and profile triplets) - see its tool description. Everywhere else, PATCH.`,
        ``,
        `**CSV fields: ALWAYS comma-only, NO spaces - universal rule across every field that stores a comma-separated list.** When you write a CSV value (e.g. \`feature_categories\`, \`services\`, \`post_category\`, \`data_settings\`, \`triggers\`, comma-separated tag/user ID lists, \`stock_libraries\`, etc.), write it as \`"A,B,C"\` - NEVER \`"A, B, C"\` with spaces after commas.

**Why:** BD splits on the raw \`,\` character WITHOUT trimming whitespace. \`"A, B, C"\` gets stored internally as three options: \`"A"\`, \`" B"\` (leading space), \`" C"\` (leading space). Downstream consumers that look up values (URL filters like \`?category[]=B\`, \`post_category\` matches on posts, option-key lookups, dropdown renderers) treat the clean and space-prefixed values as DIFFERENT strings - a post tagged with the space-prefixed value becomes invisible to filters that use the clean value, causing silent data-linkage failures.

This applies to EVERY CSV-bearing field on EVERY endpoint (create or update).

**Normalization workflow:**

- When a user provides categories/options in natural language with spaces ("Category 1, Category 2, Category 3"), normalize to \`"Category 1,Category 2,Category 3"\` before sending.
- When updating a field that MIGHT already contain space-prefixed values from prior writes, first \`getX\` to see the stored form, normalize, and write back the clean version - then also update any posts/records referencing the old space-prefixed values so they continue to match.

**Exception:** inside a single option name, spaces are fine. \`"Patient Care Tips,Medical Conditions"\` is correct - the rule is strictly about the SEPARATOR, not the content.`,
        ``,
        `Capabilities worth knowing inherently (BD-specific, not typical REST):`,
        `- External image URLs auto-fetch to local storage when \`auto_image_import=1\` on \`createUser\`/\`updateUser\`. Don't download client-side.`,
        `- Categories and sub-categories auto-create by NAME on \`createUser\` - pass \`profession_name\` and \`services\` as strings, no pre-creation needed. On \`updateUser\`, add \`create_new_categories=1\` for the same behavior.`,
        `- \`services\` supports \`Parent=>Child\` for sub-sub-category nesting in one call: \`services="Honda=>2022,Toyota"\`.`,
        `- Welcome emails are silent by default. Pass \`send_email_notifications=1\` on \`createUser\` to fire them.`,
        `- Profile URLs are \`<site>/<user.filename>\` - \`filename\` is the full relative path; never prepend \`/business/\`, \`/profile/\`, etc.`,
        ``,
        `Member taxonomy (distinct from post types) - three tiers, three tool families. A member has EXACTLY ONE Top Category (\`profession_id\`) and MANY Sub / Sub-Sub Categories nested under it:`,
        `- Top Categories -> \`TopCategory*\` tools (BD: "professions" / \`list_professions\`). One per member, set via \`profession_id\` or \`profession_name\`.`,
        `- Sub + Sub-Sub Categories -> \`SubCategory*\` tools (BD: "services" / \`list_services\`). Multiple per member, all scoped under that member's single \`profession_id\`. Sub-subs via \`master_id\`.`,
        `- Member↔sub links with pricing/specialty metadata -> \`MemberSubCategoryLink*\` (BD: \`rel_services\`). Without metadata, the user's \`services\` CSV field is enough.`,
        ``,
        `Post endpoint routing - post types split by \`data_type\` (call \`listPostTypes\` / \`getPostType\` first):`,
        `- \`data_type=4\` -> \`createMultiImagePost\` (albums, galleries, Property, Product)`,
        `- \`data_type=9\` or \`20\` -> \`createSingleImagePost\` (blog, event, job, coupon, video)`,
        `- \`data_type=10\` is Member Listings (singleton, system-seeded) - not post-creatable via \`createSingleImagePost\`/\`createMultiImagePost\`, but its search-result page fields ARE editable via \`updatePostType\` (see Member Listings rule)`,
        `- Others (13/21/29) are admin-internal, not post-creatable`,
        ``,
        `No bulk write endpoints - every create/update/delete is one record at a time. Processing 500 members means 500 calls. Paced sequentially under rate limits (below).`,
        ``,
        `Rate limit: 100 req/60s (raisable to 1000/min via BD support). Each call takes ~1-3 seconds round-trip, so bulk jobs add up to real minutes - tell the user an honest estimate upfront (e.g. 500 records ≈ 10-15 minutes). On 429, wait 60s+ before retrying - BD's window resets every 60s, so shorter backoffs just burn failing calls. Call \`verifyToken\` before large jobs to confirm the key works and check headroom, avoiding half-run imports.`,
        ``,
        `**HTTP status codes and error shapes agents should recognize.** Authoritative reference: https://support.brilliantdirectories.com/support/solutions/articles/12000108046 (BD's public API overview article - auth, rate limits, pagination, filters).

**Success:** \`HTTP 200\` with \`{status: "success", message: ...}\` (where \`message\` can be object/array/string depending on endpoint).

**Error:** \`{status: "error", message: "<reason>"}\` with the following codes:

- \`400\` - bad request (missing or invalid params).
- \`401\` - unauthorized (invalid/missing API key - regenerate in BD Admin -> Developer Hub).
- \`403\` - forbidden (valid key, but not enabled for THIS endpoint).
- \`405\` - method not allowed (wrong HTTP verb - usually means a tool call constructed the request incorrectly; not normally reachable via the MCP tools).
- \`429\` - rate-limited with the exact body \`{"status":"error","message":"Too many API requests per minute"}\`.

**API key one-shot display:** when a BD admin generates a new API key in Developer Hub, BD shows it ONCE at creation and never again - there's no "reveal key" button afterward. If a user says they lost their API key, the answer is always "generate a new one" (the old key can optionally be revoked); there is no recovery path for the original value.`,
        ``,
        `**Member Listings post type (\`data_type=10\`, singleton per BD site)** - the only post type with NO profile/detail page of its own. Controls the Member Search Results page UI/UX; members render via BD's core member profile system.

**Edit path:**

1. \`listPostTypes property=data_type property_value=10 property_operator==\` -> receive the single record.
2. \`updatePostType\` with that \`data_id\`.
3. Cache \`data_id\` for the session.

For the common-edit cheat-sheet and Member-Listings-specific guardrails (which fields have no rendering effect, etc.), see \`updatePostType\`'s tool description.

**Universal post-type safety** (applies to EVERY post type on every \`updatePostType\` call, not just Member Listings) - **do NOT mutate these structural fields** on any post type:

- \`data_type\`
- \`system_name\`
- \`data_name\`
- \`data_active\`
- \`data_filename\`
- \`form_name\`
- \`software_version\`
- \`display_order\`

BD system-seeds these on post-type creation; changing any of them breaks rendering across the site.`,
        ``,
        `**Post-type code fields - master-fallback on GET + all-or-nothing save per group.** Across all post types, up to eight HTML/PHP template fields begin backed by the BD-core master template and only persist locally in the site DB once an admin or API call saves them: \`category_header\`, \`search_results_div\`, \`category_footer\`, \`profile_header\`, \`profile_results_layout\`, \`profile_footer\`, \`search_results_layout\`, \`comments_code\`.

**GET behavior:** \`getPostType\` / \`listPostTypes\` return the MASTER value for any code field with no local override - agents always see the real rendered code, not an empty string.

**WRITE behavior - all-or-nothing per group:** if you update ANY field in a group, you MUST include every field in that group on the same write (copy unchanged fields verbatim from the prior GET). Omitting group-mates causes them to drift back to master on next render.

**Groups:**

1. **Search-results triplet** - \`category_header\` + \`search_results_div\` + \`category_footer\` (every post type, including Member Listings).
2. **Profile/detail triplet** - \`profile_header\` + \`profile_results_layout\` + \`profile_footer\` (only post types with per-record detail pages - NOT Member Listings).
3. **Standalone \`search_results_layout\`** - misleading name; this is actually the single-record DETAIL page wrapper (BD's \`single.php\` analogue).
4. **Standalone \`comments_code\`** - auxiliary footer code that renders directly after \`search_results_layout\` on the detail page; used for embed widgets, schema markup, pixels.

Groups 3 and 4 save independently (no group rule). Neither applies to Member Listings.

**Workflow for any code edit:** GET -> build payload with the changed field + all group-mates from the GET response -> \`updatePostType\` -> \`refreshSiteCache\`.

**Code-field trust level:** widget-equivalent - arbitrary HTML, CSS, JS, iframes, and PHP are all accepted and evaluated server-side at render. BD text-label tokens (\`%%%text_label%%%\`) and PHP variables (\`<?php echo $user_data['full_name']; ?>\`) work in templates. Input sanitization rules (XSS/SQLi patterns) do NOT apply to these fields - anyone with API permission to edit post-type code already has full site code control.

**Always call \`refreshSiteCache\` after any successful \`updatePostType\`** (code fields or settings) - post-type edits are cached and won't reflect publicly until refreshed.`,
        ``,
        `**Post-type custom fields discovery.** When creating/updating a post (any \`createSingleImagePost\` / \`updateSingleImagePost\` / \`createMultiImagePost\` / \`updateMultiImagePost\` call), the record carries BOTH the standard post columns AND per-post-type CUSTOM FIELDS defined by the site admin (dropdowns, text inputs, checkboxes with site-specific valid values). These custom fields are NOT in the OpenAPI schema - they're discovered at runtime.

**Before any post write that touches fields beyond the obvious standard columns, call the appropriate fields-discovery endpoint:**

- \`getSingleImagePostFields\` (by \`form_name\`) - for data_type 9/20 posts.
- \`getMultiImagePostFields\` - for data_type 4.
- \`getPostTypeCustomFields\` (by \`data_id\`) - general.

The response lists every writable field with its \`key\`, \`label\`, and whether it's \`required\` + (for dropdowns) the allowed \`options\`. Use these values verbatim on the write.

For member custom fields, \`getUserFields\` returns the per-site member field schema.

**Don't guess custom-field values** - they're per-site and drift between sites; guessing risks 400s or silent corruption.`,
        ``,
        `**Form creation recipe - every \`createForm\` call MUST follow this recipe, or submissions error out.**

**Required field values on the form itself:**

1. \`form_url\` = \`/api/widget/json/post/Bootstrap%20Theme%20-%20Function%20-%20Save%20Form\` - exact value, URL-encoded spaces kept as \`%20\`.
2. \`table_index\` = \`ID\`.
3. \`form_action_type\` = \`widget\` (safe default; user may override to \`notification\` or \`redirect\`). Never leave empty for a public-facing form.
4. If \`form_action_type=widget\` (default): \`form_action_div\` = \`#main-content\` - the DOM target element swapped when the success pop-up fires. Required for widget action; must include the leading \`#\`.
5. \`form_email_on\` = \`0\` (agent default OFF; admin UI default is ON but that spams inboxes from AI-generated forms).
6. If \`form_action_type=redirect\`: also set \`form_target\` = destination URL. **Not schema-enforced - agent MUST remember**. BD accepts the create without it and the form silently goes nowhere on submit.

**Required tail pattern on form fields** (when \`form_action_type\` is \`widget\` / \`notification\` / \`redirect\`):

The fields list MUST end with \`field_type=ReCaptcha\`, then \`field_type=HoneyPot\`, then \`field_type=Button\` - in that exact order - and these three MUST be the three HIGHEST-ORDERED fields on the form (no other field can have \`field_order\` equal to or greater than theirs).

To pick values: call \`listFormFields\`, find the current max \`field_order\`, then use \`max+1\` / \`max+2\` / \`max+3\` for ReCaptcha / HoneyPot / Button. Never add fields AFTER Button - it's always the tail.

ReCaptcha and HoneyPot need no configuration beyond \`field_type\` (OMIT \`field_required\`, \`field_placeholder\`, view-flags - BD handles these fields server-side).

**Button \`input_class\` is REQUIRED** - pattern \`btn btn-lg btn-block <variant>\` where variant is a Bootstrap class (\`btn-primary\` / \`btn-secondary\` / \`btn-danger\` / \`btn-success\` / \`btn-warning\` / \`btn-info\` / \`btn-dark\`) or a custom site-CSS class. Example: \`input_class="btn btn-lg btn-block btn-secondary"\`.

Without every rule above, BD errors on submit and the form won't function. Audit existing forms before \`updateForm\` flips them into a public-facing \`form_action_type\` - run \`listFormFields\` first to confirm the tail pattern exists.`,
        ``,
        `**Form field visibility toggles - use the view-flag fields; do NOT hack via CSS or email-template editing.** Every form field has 5 display-setting fields, each a \`1\`/\`0\` toggle.

**Default ON (\`1\`) for all 5 when creating a new field** - that matches the BD admin UI default. Set to \`0\` ONLY when the user explicitly asks to hide the field from that surface.

**The 5 view flags:**

- \`field_input_view\` - Input View (editable form rendering).
- \`field_display_view\` - Display View (read-only display on submission-confirmation / record-detail page).
- \`field_lead_previews\` - Lead Previews (whether the value shows in the lead-preview card before a member pays to unlock full lead details).
- \`field_email_view\` - Include in Emails (whether the field appears in notification emails to admins/submitters).
- \`field_table_view\` - Table View (whether the field appears as a column in admin-UI data tables).

**Common asks -> correct flag:**

- "Hide this field from the notification email" -> \`field_email_view=0\` (NOT: strip the merge token from the email template).
- "Show publicly but don't display on the confirmation page" -> \`field_display_view=0\`.
- "Hide from the admin data table" -> \`field_table_view=0\`.

Never reach for CSS \`display:none\`, template string-manipulation, or JS hiding when a flag exists - the flags are the supported, audit-safe path and survive BD template re-generation.`,
        ``,
        `**API key permissions are per-endpoint, toggled in BD Admin -> Developer Hub on the key.** A 403 "API Key does not have permission to access this endpoint" means THIS key is missing THIS endpoint.

Asymmetry is normal - e.g. \`createUser\` may be enabled (it silently auto-creates missing top categories via \`profession_name\`) while \`listTopCategories\` is not. \`verifyToken\` confirms the key is valid but does NOT validate the endpoint set, so a multi-endpoint job can pass \`verifyToken\` and still 403 mid-run.

**On a 403:** tell the user the exact denied endpoint and ask them to enable it in Developer Hub. Don't substitute a different endpoint. (Distinct from an invalid/revoked key, which fails \`verifyToken\` outright.)

**Special case for \`list_professions/*\` and \`list_services/*\`** (the endpoints behind \`listTopCategories\` / \`listSubCategories\` / \`getTopCategory\` / \`getSubCategory\` / \`createTopCategory\` / etc.):

- These paths are NOT in BD's Swagger spec, so the Developer Hub UI does NOT generate toggles for them.
- The "Categories (Professions)" / "Services" toggles in the UI gate DIFFERENT endpoints (\`/api/v2/category/*\` and \`/api/v2/service/*\`) which read separate legacy tables with likely-empty data.
- Enabling those UI toggles will NOT fix 403s on our tools.
- The real fix requires admin-side manual INSERT into \`bd_api_key_permissions\` for each specific path.

Flag this as a BD platform gap when reporting the 403 to the site admin.`,
        ``,
        `**Pagination (all \`list*\` / \`search*\` endpoints).**

- \`limit\` = records per page, default 25, server-capped at 100. Values >100 silently clamped (verified: \`limit=150\` returned 100 rows + cursor).
- \`page\` = opaque base64 cursor from previous response's \`next_page\` (format \`base64_encode("{n}*_*{limit}")\`). Pass back verbatim; **never decode or construct**. Numeric \`page=2\` decodes to garbage and server silently resets to page 1 -> you loop page 1 forever.
- \`per_page\` is silently ignored.
- When \`page\` is sent, \`limit\` is IGNORED (size is baked into the token). To change page size, start over with \`limit=N\` and no \`page\`.

**Row weight - lean-by-default with opt-in \`include_*\` flags** across 3 resource families. Only opt in when the task actually needs that nested data.

**Users** (\`listUsers\` / \`getUser\` / \`searchUsers\`, ~2KB lean row): core columns + \`revenue\` + \`image_main_file\` + \`filename_hidden\` + \`total_clicks\` + \`total_photos\` always returned. Flags:

- \`include_password=1\` - bcrypt hash
- \`include_subscription=1\` - full plan object (\`subscription_id\` always kept)
- \`include_clicks=1\` - click history array
- \`include_photos=1\` - photo array (\`image_main_file\` URL always kept)
- \`include_transactions=1\` - invoice array
- \`include_profession=1\` - category metadata (\`profession_id\` always kept)
- \`include_tags=1\` - member tags array
- \`include_services=1\` - sub-categories array (BD's \`list_services\` = sub-categories)
- \`include_seo_hidden=1\` - SEO meta bundle
- \`include_about=1\` - \`about_me\` HTML bio (v6.16.0)

**Posts** (\`listSingleImagePosts\` / \`getSingleImagePost\` / \`searchSingleImagePosts\` / \`listMultiImagePosts\` / \`getMultiImagePost\` / \`searchMultiImagePosts\`, ~1.5-2KB lean row): core columns + \`author: {...}\` 10-field summary (replaces full \`user\` nested object) + \`total_clicks\` + (Multi only) \`cover_photo_url\` / \`cover_thumbnail_url\` / \`total_photos\`. Post rows always include \`data_id\`, \`data_type\`, \`system_name\`, \`data_name\`, \`data_filename\`, \`form_name\` for post-type routing. Full post-type config (sidebars, code fields, search modules, h1/h2, timestamps) is NOT returned on post reads - call \`getPostType\` with \`data_id\` if you need it. Flags:

- \`include_content=1\` - HTML body (\`post_content\` on Single, \`group_desc\` on Multi)
- \`include_post_seo=1\` - \`post_meta_title\` / \`post_meta_description\` / \`post_meta_keywords\` (Single only)
- \`include_author_full=1\` - restores full \`user\` nested object (password, token, all fields); replaces curated \`author\` summary
- \`include_clicks=1\` - click history array
- \`include_photos=1\` - full \`users_portfolio\` photo array (Multi only; Single has single \`post_image\` field always kept)

**Categories** (\`listTopCategories\` / \`getTopCategory\` / \`listSubCategories\` / \`getSubCategory\`, v6.16.0): hierarchy linkage always returned - \`profession_id\` on top+sub, \`master_id\` on sub (parent sub for sub-sub), \`name\`, \`filename\`. SEO bundle (\`desc\`, \`keywords\`, \`image\`, \`icon\`, \`sort_order\`, \`lead_price\`, \`revision_timestamp\`) stripped unless \`include_category_schema=1\`.

Other endpoints (leads, reviews, widgets, etc.) return full rows - budget context with \`limit=5\` for those if you only need a few fields.

**Count-only idiom - use this for any "how many X" question:** call \`list*\` with \`limit=1\` and read \`total\` from the envelope. One tiny call, no records enumerated.

**Envelope:**

- \`total\`, \`current_page\`, \`total_pages\` arrive as STRINGS - cast before arithmetic.
- Stop condition: \`current_page >= total_pages\`, NOT \`next_page === ""\` (non-empty on last page is normal).
- Default sort on most \`list*\` is modtime-ish, NOT by primary key - pass \`order_column\` for deterministic order.

**Sequential-page recipe:**

1. \`listX limit=10\` -> 10 rows + \`next_page\`.
2. \`listX page=<token>\` (no \`limit\`) -> next 10 + new token.
3. Repeat.
4. Stop at \`current_page >= total_pages\`.

Example: 118 members at \`limit=10\` = 12 calls.`,
        ``,
        `**Filter properties (\`property\` / \`property_value\` / \`property_operator\`) must reference a REAL persisted column - never guess, never filter on DERIVED response fields.** This is the one case where the universal "schema-is-documentation" rule (write any field you see on GET) does NOT extend to FILTER: writes accept unlisted real columns, filters do not.

**Known derived fields silently unfilterable** (appear on GET responses but are computed/joined server-side, not columns on the underlying table):

- \`listUsers\` (complete verified set): \`full_name\`, \`status\`, \`user_location\`, \`image_main_file\`, \`card_info\`, \`revenue\`, \`subscription_schema\`, \`profession_schema\`, \`photos_schema\`, \`services_schema\`, \`tags\`, \`user_clicks_schema\`, \`transactions\`
- Similar derived-field patterns exist on posts/leads/reviews

If unsure what's filterable, call the fields endpoint for the authoritative column list: \`getUserFields\`, \`getSingleImagePostFields\`, \`getMultiImagePostFields\`, \`getPostTypeCustomFields\`.

**Silent-drop detection (critical sanity check):** BD returns \`status: success\` with the FULL unfiltered \`total\` when the filter is silently dropped (bad operator, unknown column, derived field, unsupported value-shape). After every filtered call, compare filtered \`total\` vs. a known unfiltered \`total\` - if equal, your filter was dropped and you have the full table.

The error envelope \`{status: "error", message: "<X> not found", total: 0}\` fires for bad \`property\` NAME, bad cursor, bad \`order_column\`, LIKE-with-wildcards (see below), AND legitimate empty results - all indistinguishable; treat as "zero or malformed." Observed \`<X>\` variants: \`user\`, \`record\`, \`data_categories\`, internal table names.

**Operator reliability:**

- \`=\` - the only reliable operator across endpoints. Exact, case-insensitive on strings via \`utf8_general_ci\`. Numeric zero-sentinel works (\`profession_id=0\` returns members with no top category).
- \`LIKE\` with \`%\` wildcards - returns \`"user not found"\` even on populated columns. Verified: \`first_name LIKE 'Sample%'\` and \`email LIKE '%sample%'\` both 0 hits on records that clearly match. Conflates with bad-column error shape - debugging trap.
- \`LIKE\` without wildcards - silently behaves as \`=\`. Passes trivial tests, fails real ones.
- \`is_null\` / \`is_not_null\` / \`property_value=""\` - silent no-ops (see null-filter rule below).
- \`!=\`, \`in\`, \`not_in\`, \`between\`, \`>\`, \`<\`, \`>=\`, \`<=\` - sometimes observed in the backend but per-endpoint-variable (not all in the spec enum). Do not rely on without per-call verification.

For partial text matching on users, use \`searchUsers q=<keyword>\` instead of \`LIKE\`. Expanded operator set is in BD's QA pipeline; retest post-deploy before trusting.`,
        ``,
        `**Null / empty-value filters are silent no-ops - don't use them.** \`is_null\`, \`is_not_null\`, and \`property_value=""\` with \`=\` all drop silently and return the full unfiltered dataset (verified on listUsers/118 records). For missing-string-value discovery (no \`logo\`, \`phone_number\`, \`website\`, etc.): paginate with \`limit=5-10\`, filter each page client-side, accumulate only the fields you need. Numeric zero-sentinel IS the exception - \`profession_id=0\` with \`=\` correctly returns the 8 members with no top category. Use \`=0\` for any integer FK where "unset" is stored as zero.`,
        ``,
        `**SEO content for a category/sub-category = create a WebPage, NOT update \`desc\`.** The word "description" is a lexical trap - ignore it; route by INTENT.

**If a user says any of these, route to \`createWebPage\` / \`updateWebPage\`:**

- "write a description for the Doctor category that ranks on Google"
- "improve the category description so it shows up in search results"
- "add SEO content" / "add meta tags"
- "write intro copy for the category page"
- "better SEO for my sub-categories"

All route to \`createWebPage\` (or \`updateWebPage\` if one exists) with \`seo_type=profile_search_results\` and the matching slug.

**Do NOT route to \`updateTopCategory.desc\` or \`updateSubCategory.desc\`** even when the user literally says "description" - those fields are short internal taxonomy-row labels that most BD themes don't render. SEO copy written there persists to a dead field while the live search page stays untouched.

Apply the SEO-intent -> WebPage routing rule across \`createTopCategory\` / \`updateTopCategory\` / \`createSubCategory\` / \`updateSubCategory\`. The full \`profile_search_results\` recipe (slug hierarchy, required defaults, auto-generated meta) is in the Member Search Results SEO pages rule below.`,
        ``,
        `**Member profile SEO is site-wide, not per-member.** \`updateUser\` has NO SEO meta fields (no \`meta_title\`, \`meta_desc\`, \`meta_keywords\`). Per-member SEO tags render from the site-wide Member Profile template, which is a WebPage with \`seo_type=profile\`. Do NOT stuff SEO prose into \`about_me\` or \`search_description\` expecting it to become \`<title>\` or \`<meta>\` - \`about_me\` is profile body HTML, \`search_description\` is the snippet shown on member-search result cards. If a user asks for "SEO for my members" or "better meta tags on member profiles," the answer is: edit the single site-wide \`seo_type=profile\` WebPage (template with merge tokens like \`%%%full_name%%%\`) - not each member's record.`,
        ``,
        `**Profile-photo detection - use \`image_main_file\`, not \`logo\` or \`profile_photo\`.** The \`logo\` and \`profile_photo\` top-level columns are import-pipeline inputs (used by \`createUser\`/\`updateUser\` to point at a source URL for auto-import) - they are \`null\` on reads even for members with photos rendered live. The authoritative signal is \`image_main_file\`: always populated, falls back to \`<site>/images/profile-profile-holder.png\` when no photo exists. Member HAS a real photo IFF \`image_main_file\` does NOT end with \`profile-profile-holder.png\`. Alternative: \`photos_schema\` array non-empty. Both \`image_main_file\` and \`photos_schema\` are DERIVED response fields - read them client-side, don't filter on them (see silent-drop rule).`,
        ``,
        `**Filter by category/taxonomy = filter by ID, not name.** \`listUsers\` takes \`property=profession_id\` (a numeric \`list_professions\` row), not a category name string.

**Resolution chains:**

- Category name -> \`listTopCategories\` -> match \`name\` -> grab \`profession_id\` -> then \`listUsers\`.
- Subscription/plan name -> \`listMembershipPlans\` -> grab \`subscription_id\` -> filter \`listUsers\` by \`subscription_id\`.
- Sub-category on users -> \`listMemberSubCategoryLinks\` filtered by \`service_id\` to get \`user_id\`s, then fetch those users. Don't LIKE-match the CSV \`service\` column on users.

**Ranking-by-membership warning (N+1 fan-out):** there is no server-side \`ORDER BY member_count\` on categories. "Top N categories by member count" on a site with K categories requires \`K × listUsers limit=1 property=profession_id&property_value=<id>\` calls. If K > 20, tell the user the scope upfront and ask whether to narrow (e.g. active categories only, or top-level only) before fanning out.`,
        ``,
        `Filters are single-condition only: \`property=<field>&property_value=<val>&property_operator==\`. Multi-condition array-syntax filters are not honored - combine conditions by narrowing server-side with the most selective single field, then CLIENT-SIDE filtering the returned rows by the remaining fields of the pair/triple. Applies equally to users_meta lookups and to every join-table pre-check (createLeadMatch, createTagRelationship, createMemberSubCategoryLink).`,
        ``,
        `**Field-vs-hack rule (universal) - when BD ships a first-class field/toggle for a thing the user asks about, USE THE FIELD.** Do not fake it with CSS, JS, template string-manipulation, or markup scrubbing.

Common cases:

- WebPage full-bleed - \`content_layout=1\`, NOT margin/padding hacks (see WebPage asset routing rule below)
- Page chrome hiding - WebPage \`hide_header\` / \`hide_footer\` / \`hide_top_right\` / \`hide_header_links\` / \`hide_from_menu\`, NOT \`display:none\` in \`content_css\`
- Widget render surface - \`widget_viewport\` (\`front\`/\`admin\`/\`both\`), NOT \`@media\` queries or \`body.admin-panel\` JS detection inside widget code
- Unsubscribe footer suppression - EmailTemplate \`unsubscribe_link=0\`, NOT stripping the merge token out of \`email_body\`
- Retire a plan - MembershipPlan \`sub_active=0\`, NOT hacking signup widget markup
- Remove payment cycles from public checkout (but keep for admin-created subs) - MembershipPlan \`hide_*_amount\` toggles
- Per-field visibility - FormField view-flag toggles (\`field_input_view\` / \`field_display_view\` / \`field_lead_previews\` / \`field_email_view\` / \`field_table_view\`), NOT CSS or email-template surgery

Before reaching for a CSS/JS workaround on anything user-facing, check the resource's GET response for a field/toggle - those are the supported, audit-safe paths.`,
        ``,
        `**WebPage full-bleed layout - use \`content_layout=1\`, NOT CSS margin hacks.** BD pages default to a max-width container ("Normal Width"); individual sections stay inside. For a section spanning the full browser width (full-bleed background color band, hero-style image, viewport-wide photo strip), set **\`content_layout=1\`** ("Full Screen Page Width" in admin) on \`createWebPage\` / \`updateWebPage\`. Then write normal HTML in \`content\`, give each full-bleed section its own background via a scoped \`content_css\` rule (e.g. \`.my-page .mission { background: #182e45; padding: 80px 30px; }\`), and wrap the readable text inside each section in \`<div class="container">\` or a page-scoped \`max-width\` inner class. Copy stays centered, background goes edge-to-edge.

NEVER fake full-bleed with \`margin: 0 -9999px; padding: 0 9999px\` or negative horizontal margins - breaks horizontal scroll, fights \`overflow: hidden\` parents, blocks future layout changes. BD anti-pattern. Default \`content_layout=0\` stays right for plain content pages.

**WebPage asset routing - route each code type to its dedicated field:**

- \`content\` - Froala rich-text body. HTML ONLY. Froala strips \`<style>\`, \`<script>\`, \`<form>\`, \`<input>\`, \`<select>\`, \`<textarea>\`, \`contenteditable=\` attributes, AND inline \`style="..."\` attributes on save. Supports \`[widget=Name]\` / \`[form=Name]\` shortcodes and \`%%%template_tokens%%%\`.
- \`content_css\` - raw CSS (NO \`<style>\` wrapper), renders in page head. Scope every selector to a unique page class; never bare \`body\`/\`h1\`/\`p\`; never target reserved BD classes \`.container\`/\`.froala-table\`/\`.image-placeholder\`.
- \`content_footer_html\` - JavaScript + script embeds (wrap in \`<script>\` tags). IIFE-wrap and scope to page class. Third-party embeds, pixels, schema. NOT for body HTML.
- \`content_head\` - head-only deps: \`<link>\` stylesheets, \`<meta>\` tags, JSON-LD, external stylesheets, Google Fonts, head-required scripts.
- \`content_footer\` - MISLEADING NAME. Page-access gate enum: \`""\` (public, default), \`"members_only"\` (non-members hit the login/signup wall), \`"digital_products"\` (only buyers of a specific digital product can view). Do NOT put HTML here.

**ALL CSS goes in \`content_css\` - inline \`style="..."\` NOT supported** (Froala strips on save). Give every styled element a class, target from \`content_css\`. No exceptions, including one-offs.

**NEVER \`@import\` inside \`content_css\`.** Render-blocking; causes FOUC/CLS. Load external stylesheets + Google Fonts in \`content_head\` as \`<link rel="stylesheet" href="...">\`, then use the declared font/class in \`content_css\`. Same for any third-party CSS dependency.

**SVG/canvas prohibited in \`content\`** - Froala strips. For charts/diagrams/data viz, build a custom Widget (\`createWidget\`) holding the raw SVG or chart JS, embed via \`[widget=Widget Name]\` shortcode. Widgets render outside Froala's sanitizer and accept arbitrary HTML/SVG/JS. For lightweight visuals (comparison tables, colored callouts, step-lists), styled \`<div>\`/\`<table>\` via \`content_css\` renders cleanly.

**PHP NOT supported** in any of these fields - they're data, not server-side templates. For PHP logic, suggest a widget.

**Admin Froala editor gotcha:** editor applies \`content_css\` but does NOT run \`content_footer_html\` JS. Hide-by-default CSS (scroll reveals, tab panels, accordion collapse, modals, non-active slider slides) will permanently hide content in the editor. Gate such rules behind a \`.js-ready\` class on a page-scoped wrapper (\`.my-page.js-ready .reveal { opacity:0 }\` NOT \`.my-page .reveal { opacity:0 }\`), and have \`content_footer_html\` JS add that class as its FIRST line: \`document.querySelector('.my-page')?.classList.add('js-ready');\`. Live site: class added, CSS activates. Admin: class never added, content stays visible/editable.`,
        ``,
        `Brand kit - call \`getBrandKit\` ONCE at the start of any design-related task (building a widget, WebPage, post template, email, hero banner - anything where colors or fonts are chosen) so your output visually matches the site's brand. Returns a compact semantic palette (body / primary / dark / muted / success / warm / alert accents, card surface) plus body + heading Google Fonts, with inline \`usage_guidance\` explaining which role each color plays and tint rules. Cache the result for the rest of the session - the brand kit rarely changes within one conversation. **Derive hover/tinted/gradient colors from the returned palette values - never introduce unrelated hues.** The returned \`body.font\` and \`heading_font\` are already globally loaded on the site; do NOT redeclare them in \`content_css\` unless deliberately switching to a different family (and then \`@import\` the new Google Font in the same CSS).`,
        ``,
        `**Hero section readability safe-defaults. Apply on TRANSITION only** - when an agent is turning the hero ON (setting \`enable_hero_section\` from \`0\`/unset to \`1\` or \`2\`, either on \`createWebPage\` with hero enabled or on \`updateWebPage\` that flips the toggle) AND the user hasn't explicitly set the color/overlay/padding values.

**Defaults** (ensure white text is readable over whatever background image):

- \`h1_font_color="rgb(255,255,255)"\`
- \`h2_font_color="rgb(255,255,255)"\`
- \`hero_content_overlay_color="rgb(0,0,0)"\`
- \`hero_content_overlay_opacity="0.5"\`
- \`hero_top_padding="100"\`
- \`hero_bottom_padding="100"\`

Applies to BOTH \`content\` and \`profile_search_results\` page types.

**Do NOT re-apply defaults on updates that don't touch \`enable_hero_section\`.** If the hero is already on and the user is tweaking a single hero field, respect their existing color/overlay/padding values. Only the field(s) they explicitly asked about should change.

**Hero + first-section BG-color gap fix:** if the hero is enabled AND the first content section has any background color, BD inserts a ~40px white gap between them. Add \`.hero_section_container + div.clearfix-lg {display:none}\` to \`content_css\` to close the gap. Safe to include whenever hero is enabled and the page's first section has a colored background.

**Cache refresh required on hero create/update:** after ANY \`createWebPage\` / \`updateWebPage\` that touches \`enable_hero_section\` or any \`hero_*\` / \`h1_font_*\` / \`h2_font_*\` field, call \`refreshSiteCache\` immediately - hero changes are cached and won't reflect publicly until refreshed.`,
        ``,
        `**Hero image sourcing.** Whenever an agent enables a hero (\`enable_hero_section=1\` or \`2\`) without an image URL supplied by the user, pick a CONTENT-RELEVANT stock photo. **Never use random/placeholder generators** (picsum.photos, lorem pixel, placekitten, etc.).

**Preferred source: Pexels** (https://www.pexels.com) - free license, no attribution required, stable URLs, reliable image hotlinking.

**Workflow:**

1. Pick a search term from the page topic:
   - Page about "doctors in LA" -> search "doctor office" or "medical professional"
   - IVF clinics -> "fertility clinic" or "couple holding hands"
   - Beauty salons -> "hair salon interior"
2. Choose a safe-for-work image without watermarks/logos.
3. Use the **"large" variant URL** - Pexels' direct-download-large size. NOT "original" (often 5000+px, too heavy for a hero banner).

Pexels large URL pattern: \`https://images.pexels.com/photos/<ID>/pexels-photo-<ID>.jpeg?auto=compress&cs=tinysrgb&w=1800\`

If the user supplies their own image URL, use that instead.

**Never hotlink from sources with restrictive licenses** (Getty, Shutterstock watermark-stripped, etc.) - reputational risk for the site.`,
        ``,
        `**users_meta IDENTITY RULE (applies to every users_meta read, update, and delete - no exceptions).** A users_meta row is identified by the PAIR \`(database, database_id)\` PLUS a \`key\`. The same \`database_id\` value can exist in users_meta pointing at different parent tables - e.g. \`database_id=123\` might refer to rows in \`users_data\`, \`list_seo\`, \`data_posts\`, and \`subscription_types\` simultaneously, all unrelated records that happen to share the same numeric ID. Even low IDs like \`1\` routinely return hundreds of cross-table rows.

**Safety rules (read, update, especially DELETE):**

- **ALWAYS** filter/match on BOTH \`database\` AND \`database_id\` together - never \`database_id\` alone.
- **NEVER** loop-delete by \`database_id\` alone - this WILL delete unrelated records on other tables.
- When the MCP list tool doesn't expose array-syntax multi-filter, list by whichever single field narrows hardest (usually \`database_id\`), then CLIENT-SIDE filter results by \`database\` match before acting.

A single mistake here can cascade-destroy member data, plan metadata, and page settings that happen to share the same ID across unrelated tables.`,
        ``,
        `**WebPage users_meta field-update workaround (CRITICAL).** BD's \`list_seo\` table has a mix of DIRECT columns and EAV-stored fields in the \`users_meta\` table (keyed by \`database=list_seo\` + \`database_id=<seo_id>\` + \`key=<field>\`).

- On CREATE: \`createWebPage\` writes ALL fields correctly - direct columns AND users_meta rows are seeded together.
- On UPDATE: \`updateWebPage\` only writes the direct columns - **users_meta-stored fields are SILENTLY IGNORED** (the write succeeds but the new value doesn't persist, live-verified).

**EAV-backed fields that MUST be updated via \`updateUserMeta\` / \`createUserMeta\`** (not \`updateWebPage\`):

\`linked_post_category\`, \`linked_post_type\`, \`disable_preview_screenshot\`, \`disable_css_stylesheets\`, \`hero_content_overlay_opacity\`, \`hero_link_target_blank\`, \`hero_background_image_size\`, \`hero_link_size\`, \`hero_link_color\`, \`hero_content_font_size\`, \`hero_section_content\`, \`hero_column_width\`, \`h2_font_weight\`, \`h1_font_weight\`, \`h2_font_size\`, \`h1_font_size\`, \`hero_link_text\`, \`hero_link_url\`.

**This is a verified-live list; BD's \`list_seo\` EAV layer may include additional columns beyond these 18.** Reliable detection: after \`updateWebPage\`, re-GET and compare; if the value didn't persist, fall back to the EAV path. Any GET-returned \`list_seo\` field can be written via EAV.

**Update workflow for each EAV field:**

1. \`listUserMeta\` with filter \`database=list_seo\`, \`database_id=<seo_id>\`, \`key=<field>\` to find the existing \`meta_id\`.
2. If found -> \`updateUserMeta(meta_id=..., value=<new value>)\`.
3. If not found -> \`createUserMeta(database=list_seo, database_id=<seo_id>, key=<field>, value=<new value>)\`.

**Reads merge automatically:** \`getWebPage\` / \`listWebPages\` return the merged record including users_meta values at the top level. You do NOT need to query UserMeta separately for reads.

**Delete cleanup:** \`deleteWebPage\` deletes the \`list_seo\` row but does NOT cascade-delete the corresponding users_meta rows. After \`deleteWebPage(seo_id)\`:

1. \`listUserMeta\` with \`database=list_seo\`, \`database_id=<deleted seo_id>\` to find orphan meta rows.
2. \`deleteUserMeta\` each one by its \`meta_id\`.

Be SURGICAL - only delete meta rows where \`database_id\` exactly matches the deleted page's \`seo_id\`; NEVER bulk-delete across other \`database_id\` values or other \`database\` table values.`,
        ``,
        `**Timestamps - treat as REQUIRED on every update, even though BD doesn't enforce them.** BD does NOT auto-populate \`revision_timestamp\` or \`date_updated\` on update (live-verified: an \`updateWidget\` call that omits both leaves them at their prior values even though the rest of the record changed). If an agent skips them, admin-UI "Last Update" displays stay stale, "recently updated" sorts lie, cache invalidation can misfire, and audit trails become unreliable.

**Always include them in every \`update*\` payload.** The tool schema doesn't list these fields explicitly, but the MCP wrapper forwards unlisted keys verbatim, so sending them works.

**Formats:**

- \`revision_timestamp\` -> \`YYYY-MM-DD HH:mm:ss\` (dashes + colons, e.g. \`2026-04-20 19:34:51\`). Universal across widgets, forms, email templates, top categories, sub-categories, post types, membership plans, users_meta, AND list_seo WebPages.
- \`date_updated\` -> resource-dependent:
  - Widgets: \`YYYY-MM-DD HH:mm:ss\` (same as revision_timestamp).
  - list_seo WebPages: \`YYYYMMDDHHmmss\` (no separators, e.g. \`20260420193451\`).
  - Same field name, different formats - verify against the GET response.
- \`date_added\` on users_meta -> \`YYYYMMDDHHmmss\`.

**Which fields per resource:**

- Widgets - both (both dashes-and-colons).
- WebPages - both (different formats per above).
- Forms, email templates, categories, sub-categories, post types, membership plans, users_meta - \`revision_timestamp\` only.

Set the current time in every exposed timestamp field on every update. On create, BD usually seeds initial timestamps server-side, but passing them explicitly is safe and recommended.`,
        ``,
        `**Member Search Results SEO pages - thin-content remedy.** BD auto-generates dynamic search URLs for every location+category combo (e.g. \`california/beverly-hills/plumbers\`). Google penalizes thin pages (1-2 members). Convert to static via \`createWebPage\` with \`seo_type="profile_search_results"\` + \`filename=<exact slug>\` + custom SEO copy in \`content\`.

Slug hierarchy (no leading slash, \`/\`-separated, any left-parent droppable): \`country/state/city/top_cat/sub_cat\`.

**CRITICAL: \`filename\` MUST be a real location/category slug BD's dynamic router recognizes.** Arbitrary/made-up slugs (\`my-cool-page\`, \`foo-bar\`) return HTTP 404 publicly even though the \`list_seo\` record is created successfully - BD has no dynamic page to override. Country-only slug (\`united-states\` alone) also does NOT render for this page type - country slug only works as a left-parent PREFIX on longer slugs. For arbitrary-URL static pages, use \`seo_type=content\` instead (content pages route at any \`filename\`).

Every slug segment must come from live lookups:

- \`listCountries\` - country slug = lowercase country_name with spaces -> hyphens (no country_filename field exists)
- \`listStates\` - \`state_filename\`
- \`listCities\` - \`city_filename\` for the slug. (BD schema typo: the city PK is \`locaiton_id\` NOT \`location_id\` - relevant only for \`getCity\`/\`updateCity\` calls, not for the slug that goes into \`filename\`)
- \`listTopCategories\` - \`filename\`
- \`listSubCategories\` - \`filename\`

Before create, check existence: \`listWebPages property=filename property_value=<slug>\`.

**Required defaults on create AND every update for profile_search_results pages** (unless user overrides):

- \`content_active=1\`
- \`custom_html_placement=4\`
- \`form_name="Member Search Result"\` (sidebar - NOT "Member Profile Page", which is for member profile pages)
- \`menu_layout=3\` (Left Slim)
- \`date_updated=<current YYYYMMDDHHmmss timestamp>\` - BD does NOT auto-populate; always set to now on every write
- \`updated_by\` (optional audit label like "AI Agent" or "API")

**Auto-generate SEO meta for the specific location+category combo** using human names (not slugs) with natural "[city] [category]" / "in [location]" phrasing:

- \`title\` (50-60 chars)
- \`meta_desc\` (150-160 chars)
- \`meta_keywords\` (~200 chars)
- \`facebook_title\` (55-60 chars, differ from title)
- \`facebook_desc\` (110-125 chars)

Do NOT auto-set \`facebook_image\` - needs a user-uploaded asset.

**H1/H2 double-render trap:** if hero enabled AND \`content\` contains \`<h1>\`/\`<h2>\`, both render. Pick one location - not both.

**No max-width wrappers in \`content\` / \`content_css\` on profile_search_results pages.** BD's page layout already supplies the outer container; adding \`max-width: 960px; margin: auto\` (or equivalent) double-constrains and makes SEO copy render as a narrow strip. Let content flow at the natural container width.

Location + Sidebar CRUD are read-only by design in this MCP (create/delete deliberately omitted to prevent collisions with BD's auto-seeding and system layouts).`,
        ``,
        `**Sidebars - \`form_name\` field on WebPages is the SIDEBAR name, not a contact-form slug** (BD's field is misnamed). On post types, the equivalent field is \`category_sidebar\` (same value set, different variable name).

**When setting a sidebar on any page or post type**, the name must match one of:

**(a) The 6 Master Default Sidebars** (always available, never in \`listSidebars\` output - hardcoded in BD core, verbatim order from the admin UI dropdown):

- \`Global Website Search\`
- \`Member Profile Page\`
- \`Member Search Result\`
- \`Personal Post Feed\`
- \`Post Search Result\`
- \`Post Single Page\`

**(b) A custom sidebar row returned by \`listSidebars\`.**

Empty string = no sidebar.

**If the user names a sidebar that's in NEITHER list, DO NOT send it to BD** (the page will render with no sidebar). Instead: ask the user to pick from the valid options - list both master defaults and any customs you find.

**Position** is controlled by \`menu_layout\`:

- \`1\` = Left Wide
- \`2\` = Right Wide
- \`3\` = Left Slim (default on \`profile_search_results\` pages)
- \`4\` = Right Slim`,
        ``,
        `Post category values are per-post-type dropdowns configured by the site admin - NOT a global taxonomy, and there is no \`createPostCategory\` tool. Before setting \`post_category\` on a post create/update, call \`getSingleImagePostFields\` (by \`form_name\`) or \`getPostTypeCustomFields\` (by \`data_id\`) and read the allowed values from the schema. Pass only values that appear there. If the user names a category not in the list, ask whether to pick the closest existing option or have them add it in BD admin first - don't invent values. (This is different from member categories, which ARE created via the API via \`createTopCategory\`/\`createSubCategory\` or auto-created by \`createUser\`.)`,
        ``,
        `Lead routing - when to override auto-match: \`createLead\` accepts \`users_to_match\` (comma-separated member IDs or emails, mixed allowed). When set, BD bypasses the normal category/location/service-area auto-matching and routes the lead to ONLY those members. Use when the caller already knows who should receive the lead (external routing logic, round-robin assignment, VIP escalation). Typically paired with \`auto_match=1\` (runs the match step inline) and \`send_lead_email_notification=1\` (fires the matched-member email) - without the email flag, matches are recorded silently.`,
        ``,
        `Writes are live and immediately visible on the public site. Confirm before any destructive or mass-modification operation. For reversible removal, prefer \`updateUser\` with \`active=3\` (Canceled) over \`deleteUser\` - the record stays queryable and can be reactivated.`,
        ``,
        `Security & input sanitization (every write, every resource). BD stores input verbatim on API writes - BD's backend \`protectUserInputs()\` is NOT invoked on the API path, so THIS rule is the only sanitization layer. Render-time escaping is inconsistent across BD views. Reject writes that contain obvious injection payloads - asking the user to confirm if it looks intentional.`,
        ``,
        `**Pattern matching is case-insensitive for ALL patterns below (not just <script>).** Before matching, HTML-entity-decode the value once (turn \`&#60;script&#62;\` into \`<script>\`, turn \`&amp;#x6a;avascript:\` into \`javascript:\`) and URL-decode once - an agent that matches only the raw form lets encoded payloads through. Reject patterns:`,
        `- **Script/markup tags:** \`<script>\`, \`</script>\`, \`<iframe>\`, \`<object>\`, \`<embed>\`, \`<svg ... on[a-z]+=\` (SVG is a common XSS vector via handlers), standalone \`<style>\` blocks on non-widget/non-email-body fields.`,
        `- **Inline event handlers - pattern-match, not list-match:** ANY \`on[a-z]+=\` attribute pattern (\`onerror\`, \`onload\`, \`onclick\`, \`onmouseover\`, \`onfocus\`, \`onanimationend\`, \`ontoggle\`, \`onpointerdown\`, \`onwheel\`, \`onbeforeprint\`, etc. - 100+ DOM handlers, all fire XSS). Do NOT maintain a fixed list; match the pattern.`,
        `- **Dangerous URL schemes (in \`href\`, \`src\`, or any attribute):** \`javascript:\`, \`data:text/html\`, \`data:application/\`, \`vbscript:\`. Plain \`data:image/*\` (e.g. \`data:image/png;base64,...\`) is fine.`,
        `- **CSS-injection patterns:** inside any \`style="..."\` attribute or \`<style>\` block, reject \`expression(\`, \`javascript:\`, \`data:\`, \`@import\`, \`behavior:\` (old-IE), or any URL scheme pattern.`,
        `- **MySQL attack-shape fragments:** \`; DROP TABLE\`, \`UNION SELECT\` (adjacent OR comment-interspersed like \`UNION/**/SELECT\`), \`OR 1=1\` adjacent to a quote/semicolon, \`' OR '1'='1\`, \`'/**/OR/**/'1'='1\`, trailing SQL comments (\`--\` or \`#\` followed by table/column-like tokens), \`xp_cmdshell\`, \`INFORMATION_SCHEMA\` queries outside legitimate educational content.`,
        ``,
        `Distinguish real content from attack shapes - "we DROP by the office at 5pm" is fine (no TABLE after DROP); "DROP the dose by half" is fine; \`'; DROP TABLE users_data; --\` is not. Legal copy ("Plaintiff vs Defendant"), ampersands ("R&D", "Smith & Jones"), email addresses, and CMS HTML with \`<span>\`/\`<div>\`/\`<table>\` all pass.`,
        ``,
        `Field-strictness split:`,
        `- **Plain-text fields** - reject ANY HTML tags: \`first_name\`, \`last_name\`, \`company\`, \`email\`, \`phone_number\`, URL fields (\`website\`/\`facebook\`/\`twitter\`/\`linkedin\`/\`instagram\`), SEO meta (\`title\`/\`meta_desc\`/\`meta_keywords\`/\`facebook_title\`/\`facebook_desc\`), menu labels, form/widget/menu/email internal names, review name/title, tag name.`,
        `**HTML-allowed fields - allow safe HTML but still block the dangerous patterns above.**

**Fields:**

- \`about_me\` / \`bio\`
- \`post_content\` / \`post_description\`
- \`group_desc\`
- \`email_body\`
- WebPage \`content\` / \`content_css\` / \`content_footer_html\` / \`content_head\` / \`hero_section_content\` / \`seo_text\` (NOT \`content_footer\` - that's the access-gate enum, not HTML)
- review \`review_description\`
- form/event \`description\` fields

**Safe-HTML allow list:** \`<p>\`, \`<br>\`, \`<strong>\` / \`<b>\`, \`<em>\` / \`<i>\`, \`<u>\`, \`<ul>\` / \`<ol>\` / \`<li>\`, \`<h1>\`-\`<h6>\`, \`<a href="http..." target="_blank">\`, \`<img src="http...">\`, \`<span>\`, \`<div>\`, \`<section>\`, \`<article>\`, \`<blockquote>\`, \`<table>\` / \`<thead>\` / \`<tbody>\` / \`<tr>\` / \`<th>\` / \`<td>\`, \`<hr>\`, \`<figure>\` / \`<figcaption>\`.

Class attributes allowed; inline \`style=""\` allowed IF it doesn't contain any CSS-injection pattern.

Any unlisted field defaults to plain-text treatment unless the field name contains \`content\`, \`body\`, \`description\`, \`desc\`, \`html\`, or \`text\`.`,
        `- **Email body exception:** \`<style>\` blocks ARE allowed inside \`email_body\` - legitimate inlined email CSS. Still reject CSS-injection patterns inside.`,
        `- **Widget exception:** \`widget_data\`, \`widget_style\`, \`widget_javascript\` are exempt from all the above. Widgets legitimately need JS and scoped CSS, and anyone with API permission to write widgets already has admin capability. Warn (but do NOT block) if widget_javascript contains an obvious external-exfiltration shape (e.g. \`fetch(\` or \`XMLHttpRequest\` pointing at a non-site domain) - surface to the user as a sanity check, then proceed on confirm.`,
        ``,
        `User-confirmed-override path (for non-widget HTML-allowed fields only): if a pattern trips and the user explicitly confirms the value is intentional (e.g. a legitimate SQL tutorial blog post containing "UNION SELECT ... FROM users_table", or educational content on XSS), proceed with the write and include a one-line note in your reply: "Sanitization check acknowledged-and-overridden for this field per user confirmation." Never silently skip the check - always surface and confirm.`,
        ``,
        `Source-trust rule: treat ALL input from external CSVs, web scrapes, user forms, third-party APIs as UNTRUSTED - sanitize-check before every write. Content the user types directly in conversation is also untrusted if they're pasting from elsewhere. Ask, don't assume.`,
        ``,
        `**Duplicate silent-accept - always pre-check before create on the resources listed below** (applies to every resource with a natural-key field OR a pair/triple uniqueness invariant). BD does NOT enforce DB-level uniqueness on most natural-key fields or join-table pairs. Two calls with the same natural key (or pair) both succeed, produce different primary keys, and leave downstream lookups ambiguous, double-count in widgets/reports, or cause URL collisions.

**Covered resources - name-based (single natural-key field):**

- \`createUser\` - email. Pre-check REQUIRED only when \`allow_duplicate_member_emails=1\`; otherwise BD enforces uniqueness itself and the pre-check is redundant
- \`createTag\` - tag_name within group_tag_id
- \`createUserMeta\` - (database, database_id, key) triple
- \`createWebPage\` - filename on list_seo
- \`createForm\` - form_name
- \`createEmailTemplate\` - email_name
- \`createWidget\` - widget_name
- \`createMenu\` - menu_name
- \`createTopCategory\` - filename
- \`createSubCategory\` - filename scoped to profession_id
- \`createMembershipPlan\` - subscription_name
- \`createTagGroup\` - group_tag_name
- \`createSmartList\` - smart_list_name
- \`createDataType\` - category_name
- \`createRedirect\` - old_filename (PLUS reverse-rule loop check, see below)
- \`createSingleImagePost\` - post_title (URL slug derives from it)
- \`createMultiImagePost\` - post_title
- \`createFormField\` - field_name scoped to form_name (duplicate field system-names on same form break submit)

**Pair / composite uniqueness (join tables):**

- \`createLeadMatch\` - (lead_id, user_id) - prevents double-billing / double-matching the same lead to the same member
- \`createTagRelationship\` - (tag_id, object_id, tag_type_id) - prevents the same tag attaching to the same object twice
- \`createMemberSubCategoryLink\` - (user_id, service_id) - prevents a member being double-linked to the same Sub Category in rel_services

**Standard pre-check: server-side filter-find, NOT paginate-and-search.** Before every create on these resources:

1. Call the corresponding \`list*\` with \`property=<field>&property_value=<proposed>&property_operator==\` - returns one tiny payload regardless of site size (sites have thousands of posts/widgets/redirects/rel_tags; dumping full lists wastes rate limit and context). **For pair/composite uniqueness** (the 3 join-table cases): the server does not yet honor array-syntax multi-condition filters, so filter server-side by the most selective single field of the pair AND CLIENT-SIDE intersect against the remaining field(s) before deciding - both steps required, fallback is still a tiny response.
2. If a match exists: reuse the existing ID, update instead, ask the user, OR (for name-based) pick an alternate and re-check.
3. Only if zero rows, proceed with create.

**Special-case resources - run the expanded workflow in their tool description BEFORE the standard pre-check:**

- \`createUserMeta\` - list -> update-if-found / create-if-not 3-step workflow (see tool description).
- \`createRedirect\` - TWO filter-finds required: exact-pair skip + reverse-rule loop prevention (avoid A->B + B->A infinite loops).`,
        ``,
        `**Orphan users_meta rows after a parent-record delete - BD does NOT cascade.** When you delete a parent resource, any users_meta rows attached to it stay as orphans; the agent must clean them up surgically (see users_meta IDENTITY RULE above - applies to all read/update/delete, not just this cleanup - \`(database, database_id)\` is atomic compound identity, and \`database_id\`-alone queries return cross-table noise).

**Cleanup workflow after any parent delete:**

1. \`listUserMeta\` scoped by \`database_id=<parent id>\`, then CLIENT-SIDE filter to rows where \`database===<parent table>\` before touching any row (server does not yet honor array-syntax multi-filter - client-side filter is mandatory).
2. For each matching row: \`deleteUserMeta(meta_id, database=<parent_table>, database_id=<id>)\` - all three required.

**Delete tools where this cleanup applies:**

**Confirmed EAV (5 tools):**

- \`deleteUser\` -> \`users_data\`
- \`deleteSingleImagePost\` -> \`data_posts\`
- \`deleteMultiImagePost\` -> \`data_posts\`
- \`deleteWebPage\` -> \`list_seo\`
- \`deleteMembershipPlan\` -> \`subscription_types\`

**Probable EAV - run the scoped cleanup; zero rows is a normal expected outcome (12 tools):**

- \`deleteLead\` -> \`leads\`
- \`deleteLeadMatch\` -> \`lead_matches\`
- \`deleteForm\` -> \`forms\`
- \`deleteFormField\` -> \`form_fields\`
- \`deleteReview\` -> \`users_reviews\`
- \`deleteMenu\` -> \`menus\`
- \`deleteMenuItem\` -> \`menu_items\`
- \`deleteWidget\` -> \`data_widgets\`
- \`deleteEmailTemplate\` -> \`email_templates\`
- \`deleteRedirect\` -> \`301_redirects\`
- \`deletePostType\` / \`deleteDataType\` -> \`data_categories\`

Tools NOT listed (tags, taxonomy links, sub-categories, smart lists, clicks, unsubscribes) typically don't have users_meta rows - if in doubt, run the scoped cleanup anyway; zero rows = clean, move on.

**Never loop-delete by \`database_id\` alone** (see identity rule above).`,
        ``,
        `Enum silent-accept (applies across resources). BD's API does NOT strictly validate most integer-enum fields - it accepts values outside the documented set and stores them verbatim, with undefined render behavior. Examples: \`user.active=99\`, \`review.review_status=1\` (doc says invalid), \`lead.lead_status=3\` (doc says value 3 doesn't exist) - all three stored silently. **Always pass only values from the documented enum set in each field's description.** If a user asks for a non-documented value, ask them to pick from the documented set - don't pass through.`,
        ``,
        `**Cache refresh after layout-affecting writes (beyond hero).** After writes that change site layout/rendering, call \`refreshSiteCache\` so public pages reflect the change.

**REQUIRED after:**

1. Hero create/update on WebPages (see earlier rule).
2. Every successful \`updatePostType\` - post-type edits are cached (code fields AND settings) and will not reflect publicly without a refresh.

**Also recommended** (safe no-op if unnecessary - BD's cache handling is conservative):

- \`createMenu\` / \`updateMenu\` / \`createMenuItem\` / \`updateMenuItem\` - navigation changes.
- \`createWidget\` / \`updateWidget\` - widget markup/logic changes.
- \`updateMembershipPlan\` - plan display attrs on public signup pages.
- \`createTopCategory\` / \`updateTopCategory\` / \`createSubCategory\` / \`updateSubCategory\` - taxonomy affects directory navigation.

Direct-column WebPage updates (\`title\`, \`content\`, \`meta_desc\`, etc.) typically reflect immediately in the read API - refresh is optional for those. Running \`refreshSiteCache\` more often than necessary is harmless.`,
        ``,
        `**Never wrap ANY field value in \`<![CDATA[...]]>\`, never entity-escape HTML as \`&lt;\` / \`&gt;\`, and never include tool-call scaffolding tags from your reasoning process in the field value** (e.g. \`<parameter name="content">...</parameter>\`, \`<invoke>\`, \`<function_calls>\`, OpenAI-style \`{"function": {...}}\` wrappers, or any other runtime-specific function-call markup).

BD stores every field verbatim - wrappers, escapes, AND your reasoning scaffolding all get saved as literal visible text on the rendered page.

- For HTML-accepting fields (\`about_me\`, \`post_content\`, \`group_desc\`, \`widget_data\`, \`email_body\`, WebPage \`content\` / \`content_css\` / \`content_footer_html\` / \`content_head\`, etc.): pass raw HTML/CSS/JS directly.
- For plain-text fields: pass plain text.

No XML conventions, no HTML-entity encoding, no function-call wrappers.

**If your final string starts with \`<parameter\` or \`<invoke\` or contains \`</parameter>\` at the end - strip those before sending; that's YOUR scaffolding, not content.**`,
        ``,
        `Write-time params ECHO on reads. Fields like \`profession_name\`, \`services\`, \`credit_action\`, \`credit_amount\`, \`member_tag_action\`, \`member_tags\`, \`create_new_categories\`, \`auto_image_import\` appear on read responses when they were set on a recent write - they are NOT canonical state, just residual input from the last write. Canonical state lives elsewhere: \`profession_id\` + \`profession_schema\` (top category), \`services_schema\` (sub-categories), \`credit_balance\` (current balance as dollar-formatted string like \`"$35.00"\`), \`tags\` array (current tags). Don't build logic that reads these echo fields as truth.`,
        ``,
        `**Response typing quirks to defend against:**

1. **Primary keys and counts come as STRINGIFIED integers** (\`user_id: "1"\`, \`total: "114"\`), but pagination positions (\`current_page\`, \`total_pages\`) come as real NUMBERS. Coerce before comparison.
2. **Empty/absent collection-like fields can come back as literal boolean \`false\`** instead of \`null\` / \`[]\` / \`{}\`. Observed on user records: \`card_info\`, \`tags\`, \`photos_schema\`, \`services_schema\`, \`profession_schema\`, \`transactions\`, \`subscription_details\`, \`user_clicks_schema.clicks\`. Check \`!x || x === false || (Array.isArray(x) && x.length === 0)\` before accessing nested properties.
3. **\`filename_hidden\` on user records is NOT reliable** - on legacy records it can contain a different member's slug. Always use \`filename\` for profile URLs, never \`filename_hidden\`.
4. **\`last_login\` = \`"1970-01-01T00:00:00+00:00"\` means never-logged-in**, not an actual 1970 login.
5. **Unpaid invoice \`datepaid\` = \`"0000-00-00 00:00:00"\`** (MariaDB zero-date). Don't parse as ISO; treat \`datepaid.startsWith("0000")\` as "unpaid."
6. **\`credit_balance\` is a dollar-formatted string** like \`"$35.00"\` or \`"-$24.50"\` (negative allowed - BD doesn't reject deducts that exceed current balance). Parse with \`/^(-)?\\$(\\d+\\.\\d{2})$/\`.`,
        ``,
        `Sensitive fields present in read responses: user records include \`password\` (bcrypt hash), \`token\` (member auth token), and \`cookie\` (session value) - redact before logging responses. There are TWO one-char-different fields: \`user_id\` (numeric PK, stringified - e.g. \`"1"\`) is the canonical identifier; \`userid\` (a cookie-like hash or null) is a legacy form-context field, ignore it.`,
        ``,
        `\`filename\` fields (on users, posts, pages) are NOT stable across updates. BD regenerates the slug when inputs that influence it change - e.g. \`updateUser\` can rewrite a member's \`filename\` from \`/us/city/slug\` to \`/us/city/category/slug\` after a category change. This is expected behavior, not a bug. If you're embedding profile/post URLs in other content (a blog article, email, redirect, another member's bio), write/publish that content AFTER all updates to the referenced records are done, OR re-fetch \`filename\` via \`getUser\`/\`getSingleImagePost\`/\`getWebPage\` right before you use it. Never cache a \`filename\` across an update cycle.`,
      ].join("\n"),
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Synthetic tool: getBrandKit - intercept BEFORE the toolMap lookup so the handler
    // is independent of whether the spec entry happens to be registered in toolMap.
    // BD stores design settings across multiple `layout_group`s (e.g. default_layout,
    // theme_1), and the admin UI reads whichever row has the saved value regardless
    // of group. BD's admin AI Companion also queries by setting_name only, taking
    // whichever layout_group row comes back. We match that behavior: N parallel calls
    // (one per slot in our mapping), each filtered by setting_name only.
    // Rate limit: 20 parallel reads is comfortably under BD's 100 req/60s default.
    if (name === "getBrandKit") {
      const SLOTS_WITH_DEFAULTS = {
        custom_1:   "rgb(255,255,255)",
        custom_2:   "rgb(51,51,51)",
        custom_3:   "Inter",
        custom_58:  "rgb(39,108,207)",
        custom_59:  "rgb(255,255,255)",
        custom_60:  "rgb(24,46,69)",
        custom_61:  "rgb(255,255,255)",
        custom_62:  "rgb(3,138,114)",
        custom_63:  "rgb(255,255,255)",
        custom_64:  "rgb(240,173,78)",
        custom_65:  "rgb(255,255,255)",
        custom_66:  "rgb(217,83,79)",
        custom_67:  "rgb(255,255,255)",
        custom_71:  "rgb(255,255,255)",
        custom_72:  "rgb(230,232,236)",
        custom_73:  "rgb(24,46,69)",
        custom_74:  "rgb(242,243,245)",
        custom_75:  "rgb(24,46,69)",
        custom_134: "rgb(24,46,69)",
        custom_208: null,  // falls back to custom_3 below if still empty
      };
      try {
        const slots = Object.keys(SLOTS_WITH_DEFAULTS);
        // Parallel per-slot fetch - each call is filtered by setting_name only
        // (no layout_group filter, matching BD's handler.php behavior).
        const results = await Promise.all(
          slots.map((slot) =>
            makeRequest(
              config,
              "GET",
              "/api/v2/website_design_settings/get",
              {
                property: "setting_name",
                property_value: slot,
                property_operator: "=",
              },
              null
            ).catch((err) => ({ status: 0, body: null, error: err }))
          )
        );
        const bySlot = {};
        const failedSlots = [];
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const res = results[i];
          if (res && res.status === 200 && res.body && res.body.status === "success") {
            const rows = Array.isArray(res.body.message) ? res.body.message : [];
            // Take the first row BD returns (BD's admin AI Companion does the same  - 
            // takes whichever layout_group row happens to come first for this setting_name).
            if (rows[0] && rows[0].setting_value !== undefined) {
              bySlot[slot] = rows[0].setting_value;
            }
            // Missing row (empty message array) is normal - slot just isn't set on this site;
            // fallback applies silently, not a failure.
          } else {
            // Non-200 / non-success / network error - BD fetch actually failed for this slot
            failedSlots.push(slot);
          }
        }
        // Butler canonical mapping (18 color slots + 2 fonts) with BD-default fallbacks
        const pick = (slot, fallback) => {
          const v = bySlot[slot];
          return (v === undefined || v === null || v === "") ? fallback : v;
        };
        const kit = {
          body: {
            background: pick("custom_1",  "rgb(255,255,255)"),
            text:       pick("custom_2",  "rgb(51,51,51)"),
            font:       pick("custom_3",  "Inter"),
          },
          primary: {
            color:   pick("custom_58", "rgb(39,108,207)"),
            text_on: pick("custom_59", "rgb(255,255,255)"),
          },
          dark: {
            color:   pick("custom_60", "rgb(24,46,69)"),
            text_on: pick("custom_61", "rgb(255,255,255)"),
          },
          muted: {
            color:   pick("custom_74", "rgb(242,243,245)"),
            text_on: pick("custom_75", "rgb(24,46,69)"),
          },
          success_accent: {
            color:   pick("custom_62", "rgb(3,138,114)"),
            text_on: pick("custom_63", "rgb(255,255,255)"),
          },
          warm_accent: {
            color:   pick("custom_64", "rgb(240,173,78)"),
            text_on: pick("custom_65", "rgb(255,255,255)"),
          },
          alert_accent: {
            color:   pick("custom_66", "rgb(217,83,79)"),
            text_on: pick("custom_67", "rgb(255,255,255)"),
          },
          card: {
            background: pick("custom_71",  "rgb(255,255,255)"),
            border:     pick("custom_72",  "rgb(230,232,236)"),
            text:       pick("custom_73",  "rgb(24,46,69)"),
            title:      pick("custom_134", "rgb(24,46,69)"),
          },
          heading_font: pick("custom_208", pick("custom_3", "Inter")),
          usage_guidance: {
            primary:        "Brand color - main CTA buttons, key interactive elements, dominant accents.",
            dark:           "High-contrast sections, strong backgrounds, or text when appropriate to the theme.",
            muted:          "Subtle section backgrounds, dividers, low-emphasis UI areas, badges, pills or tags.",
            success_accent: "Confirmations, positive states, growth indicators, or a complementary design accent when layout benefits from a second color voice.",
            warm_accent:    "Attention accent - badges, highlights, tags, warm visual punctuation when design needs a pop of energy.",
            alert_accent:   "Urgency accent - errors, warnings, sale badges, limited-time callouts, elements that command immediate attention.",
            tint_rule:      "Derive lighter or darker tints from any palette color for backgrounds, hover states, borders, or low-emphasis UI layers. Do NOT introduce new unrelated hues.",
            font_rule:      "body.font and heading_font are already globally loaded on the site - do NOT redefine them in content_css. To switch to a different family on a specific page, load the font in the WebPage's content_head field as a <link rel='stylesheet' href='https://fonts.googleapis.com/...'> tag, then use the font-family in content_css. NEVER @import fonts inside content_css - @import is render-blocking and causes FOUC/CLS (content shifts as the font loads). Same rule applies to external stylesheets: link-tag in content_head, never @import in content_css.",
          },
        };
        // If any BD fetches failed outright (network / non-200), surface it so the
        // agent knows some values are fallbacks, not live site data. A missing row
        // on a successful fetch (slot just isn't set) is NOT a failure - fallback
        // silently applies; that's the documented design.
        if (failedSlots.length > 0) {
          kit._warnings = [
            `${failedSlots.length} of ${slots.length} brand-kit slots failed to fetch from BD (network or non-200 response): ${failedSlots.join(", ")}. Those slots fell back to BD defaults, which may not match the site's actual branding. Retry the tool in a few seconds; if the list persists, the BD API may be having issues.`,
          ];
        }
        return {
          content: [{ type: "text", text: JSON.stringify(kit, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `getBrandKit error: ${err.message || String(err)}` }],
          isError: true,
        };
      }
    }

    // Generic tool dispatch for OpenAPI-backed tools
    const toolDef = toolMap[name];
    if (!toolDef) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      // Extract lean-response include flags (user/post/category read tools); these are
      // MCP-wrapper params, not BD API params - never forward to BD.
      const includeFlags = {};
      const isUserReadTool = USER_READ_TOOLS.has(name);
      const isPostReadTool = POST_READ_TOOLS.has(name);
      const isCategoryReadTool = CATEGORY_READ_TOOLS.has(name);
      const leanFlagList = isUserReadTool
        ? USER_LEAN_INCLUDE_FLAGS
        : isPostReadTool
          ? POST_LEAN_INCLUDE_FLAGS
          : isCategoryReadTool
            ? CATEGORY_LEAN_INCLUDE_FLAGS
            : null;
      if (leanFlagList) {
        for (const flag of leanFlagList) {
          if (args && flag in args) {
            includeFlags[flag] = args[flag];
            delete args[flag];
          }
        }
      }

      // v6.18.0/6.18.1 SAFETY GUARD: users_meta writes must pass compound identity.
      // Protects against cross-table destruction/corruption - the same `database_id`
      // belongs to UNRELATED rows on different parent tables. Acting on meta_id or
      // database_id alone risks mutating/deleting/corrupting an unrelated table.
      //
      // v6.18.1 hardening:
      //   - Case-insensitive tool name match (defense-in-depth)
      //   - createUserMeta included (same corruption risk as update)
      //   - Safely handle undefined/non-object args (no TypeError)
      //   - Reject numeric/string zero for meta_id + database_id (BD AUTO_INCREMENT starts at 1)
      const lname = typeof name === "string" ? name.toLowerCase() : "";
      const isUsersMetaWrite =
        lname === "deleteusermeta" ||
        lname === "updateusermeta" ||
        lname === "createusermeta";
      if (isUsersMetaWrite) {
        const a = (args && typeof args === "object") ? args : {};
        const isCreate = lname === "createusermeta";
        const missing = [];
        const invalid = [];
        // meta_id required only for update/delete; createUserMeta assigns it.
        if (!isCreate) {
          if (a.meta_id === undefined || a.meta_id === null || a.meta_id === "") {
            missing.push("meta_id");
          } else if (a.meta_id === 0 || a.meta_id === "0") {
            invalid.push("meta_id (zero is not a valid row id; BD auto-increment starts at 1)");
          }
        }
        // database required always. Must be non-empty string.
        if (!a.database || typeof a.database !== "string" || a.database.trim() === "") {
          missing.push("database");
        }
        // database_id required always. Reject zero.
        if (a.database_id === undefined || a.database_id === null || a.database_id === "") {
          missing.push("database_id");
        } else if (a.database_id === 0 || a.database_id === "0") {
          invalid.push("database_id (zero is not a valid parent row id)");
        }
        if (missing.length > 0 || invalid.length > 0) {
          const parts = [];
          if (missing.length > 0) parts.push(`Missing: ${missing.join(", ")}`);
          if (invalid.length > 0) parts.push(`Invalid: ${invalid.join("; ")}`);
          return {
            content: [{
              type: "text",
              text: `${name} SAFETY GUARD (v6.18.1): users_meta writes require compound identity (${isCreate ? "database + database_id" : "meta_id + database + database_id"}). ${parts.join(". ")}.\n\nWHY: users_meta rows share database_id values across unrelated tables. A numeric database_id may simultaneously be a WebPage's seo_id, a member's user_id, a post's post_id, AND a plan's subscription_id - all rows with the same ID on different tables. Acting without the full compound identity risks destroying (delete) or corrupting (update/create) unrelated resource metadata on the WRONG parent table.\n\nSAFE PATTERN: always pass the full compound identity on every users_meta write. For orphan-cleanup after a parent delete, list by database_id then CLIENT-SIDE filter to rows where database matches the intended parent table, then delete each matching meta_id with all three fields.\n\nSee top-level users_meta IDENTITY RULE.`
            }],
            isError: true,
          };
        }
      }

      // Build URL path with path params substituted
      let urlPath = toolDef.path;
      const queryParams = {};
      const bodyParams = {};

      for (const [key, val] of Object.entries(args || {})) {
        // Check if this is a path parameter (appears in URL template)
        if (urlPath.includes(`{${key}}`)) {
          urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(String(val)));
        } else if (toolDef.method === "GET") {
          queryParams[key] = val;
        } else if (key in toolDef.bodyProps) {
          bodyParams[key] = val;
        } else {
          // Could be a query param on a non-GET (like limit on search)
          // or a body param not in the spec - send as body
          bodyParams[key] = val;
        }
      }

      const result = await makeRequest(config, toolDef.method, urlPath, queryParams, bodyParams);

      // Apply lean-response shaping per resource family (v6.15.0 users, v6.16.0 posts + categories)
      if (result.body) {
        if (isUserReadTool) result.body = applyUserLean(result.body, includeFlags);
        else if (isPostReadTool) result.body = applyPostLean(result.body, includeFlags);
        else if (isCategoryReadTool) result.body = applyCategoryLean(result.body, includeFlags);
      }

      // Surface rate-limit errors with actionable guidance for the agent
      if (result.status === 429) {
        const retryHint = result.retryAfter
          ? `Server asked you to wait at least ${result.retryAfter} seconds (Retry-After header).`
          : `No Retry-After header - wait at least 60 seconds before retrying (BD's default window).`;
        return {
          content: [
            {
              type: "text",
              text: `Rate limit exceeded (HTTP 429). ${retryHint} BD default is 100 req/60s per API key. For bulk operations: (1) pace requests at slower intervals, (2) wait the indicated backoff before retrying, or (3) ask the customer to contact Brilliant Directories support to have their limit raised (100-1,000/min, not self-service). Server response: ${typeof result.body === "string" ? result.body : JSON.stringify(result.body)}`,
            },
          ],
          isError: true,
        };
      }

      // Surface auth errors with actionable guidance
      if (result.status === 401 || result.status === 403) {
        return {
          content: [
            {
              type: "text",
              text: `Authentication failed (HTTP ${result.status}). The API key is invalid, revoked, or lacks permission for this endpoint. Verify with: npx brilliant-directories-mcp --verify --api-key KEY --url URL. Server response: ${typeof result.body === "string" ? result.body : JSON.stringify(result.body)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.body, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling ${name}: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Graceful shutdown: drain in-flight HTTP requests before exit
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const inflight = IN_FLIGHT_REQUESTS.size;
    if (inflight > 0) {
      console.error(`[${signal}] Draining ${inflight} in-flight request(s)...`);
      const drainTimeout = setTimeout(() => {
        console.error(`[${signal}] Drain timeout - aborting ${IN_FLIGHT_REQUESTS.size} remaining.`);
        for (const req of IN_FLIGHT_REQUESTS) req.destroy();
        process.exit(0);
      }, 5000);
      const checkDrained = setInterval(() => {
        if (IN_FLIGHT_REQUESTS.size === 0) {
          clearTimeout(drainTimeout);
          clearInterval(checkDrained);
          process.exit(0);
        }
      }, 100);
    } else {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Start
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
