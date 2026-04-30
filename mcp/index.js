#!/usr/bin/env node

/**
 * Brilliant Directories MCP Server (npm package — stdio transport)
 *
 * Exposes all BD API v2 endpoints as MCP tools. Reads the OpenAPI spec and
 * auto-generates tool definitions. Runs as a child process launched by the
 * user's MCP-capable AI client (Claude Desktop / Cursor / Claude Code).
 *
 * Usage:
 *   brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
 *
 * Or via env vars:
 *   BD_API_KEY=YOUR_KEY BD_API_URL=https://your-site.com brilliant-directories-mcp
 *
 * =============================================================================
 * MAINTENANCE HYGIENE — hardcoded constants that mirror the OpenAPI spec
 * =============================================================================
 *
 * This file contains hardcoded constants that must stay in sync with the
 * OpenAPI spec at `mcp/openapi/bd-api.json`. The Worker (`src/index.ts` in
 * `bd-cursor-config/brilliant-directories-mcp-hosted/`) has the same
 * constants. When the spec gains a new field, adds/removes a tool, or renames
 * an operation, these mirrors can silently drift — runtime behavior goes
 * wrong quietly (lean shapers strip a real field, write-echo loses a value,
 * etc.) rather than throwing.
 *
 * Detection: `node scripts/schema-drift-check.js` (runs in ~1 second; exits
 * 0 clean / 1 drift / 2 script error). See `feedback_publish_protocol.md`
 * Step 0 — mandatory pre-publish check.
 *
 * Drift-risk tiers (same tiers documented in the Worker header):
 *
 *   🔴 HIGH risk — BD adds fields routinely; silent-drop on miss.
 *     - WRITE_KEEP_SETS — write-echo keep-lists; a missing field means the
 *       echoed response drops it even though the write succeeded.
 *
 *   🟡 MEDIUM risk — spec additions to resource families change lean-default
 *     shape; customers' include_* opt-ins depend on these lists being
 *     complete.
 *     - USER_LEAN_ALWAYS_STRIP, USER_LEAN_SEO_BUNDLE, USER_LEAN_INCLUDE_FLAGS
 *     - POST_LEAN_ALWAYS_STRIP, POST_LEAN_SEO_BUNDLE, POST_LEAN_INCLUDE_FLAGS,
 *       POST_TYPE_SUMMARY_PROMOTE
 *     - CATEGORY_SCHEMA_BUNDLE, CATEGORY_LEAN_INCLUDE_FLAGS
 *     - POST_TYPE_LEAN_ALWAYS_STRIP, POST_TYPE_CODE_BUNDLE,
 *       POST_TYPE_REVIEW_NOTIFICATIONS, POST_TYPE_LEAN_INCLUDE_FLAGS
 *     - WEB_PAGE_CODE_BUNDLE, WEB_PAGE_LEAN_INCLUDE_FLAGS
 *     - PLAN_ALWAYS_KEEP, PLAN_CONFIG_FIELDS, PLAN_DISPLAY_FLAG_FIELDS,
 *       PLAN_LEAN_INCLUDE_FLAGS
 *     - AUTHOR_SUMMARY_FIELDS — fields the author-summary injection returns
 *       on post reads; fewer fields = fewer follow-up getUser round-trips.
 *     - SLOTS_WITH_DEFAULTS (inside getBrandKit handler) — 20 custom_N slots
 *       + default values; a fourth hidden mirror the drift-check script does
 *       NOT currently validate. If BD adds a new custom_N slot for a brand
 *       color or font, getBrandKit silently won't expose it until this map
 *       is updated. Known gap; no automated check today.
 *
 *   🟢 LOW risk — rarely changes; guards against accidents.
 *     - HIDDEN_TOOLS — tools deliberately NOT surfaced to agents (currently
 *       only `createUserMeta`, hidden because it expects a raw custom_N slot
 *       and agents can't safely pick one). Expansion policy: if another tool
 *       needs hiding, add it here AND update drift-check's mirror (which
 *       counts hidden entries), AND bump `mcp/README.md` + `SKILL.md` if
 *       the hidden surface is agent-visible anywhere. Keep CHANGELOG entry
 *       brief: "HIDDEN_TOOLS += toolX (reason)".
 *     - PACKAGE_VERSION — tracks package.json; never drifts if released
 *       through the publish protocol.
 *
 * POST_READ_EXCLUSIONS lives ONLY in `scripts/schema-drift-check.js` (not
 * in this file). The drift check uses it to skip metadata/photo sub-record
 * ops that don't benefit from applyPostLean. Named here for completeness.
 *
 * When drift is found, fix in THREE files then re-run the drift check:
 *   1. This file (`bd-cursor-config/brilliant-directories-mcp/mcp/index.js`)
 *   2. `bd-cursor-config/brilliant-directories-mcp-hosted/src/index.ts` (Worker)
 *   3. `bd-cursor-config/brilliant-directories-mcp/scripts/schema-drift-check.js` (script's own baseline)
 *
 * Note: EAV routing for `updateWebPage` lives on BOTH transports (npm + Worker).
 * When BD gains a new hero/EAV field on `list_seo`, add it to `EAV_ROUTES`
 * in both `mcp/index.js` and the Worker's `src/index.ts` + the drift script.
 * =============================================================================
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

// Read package version once at startup (keeps User-Agent + server init in sync
// with package.json). If package.json is somehow unreadable (malformed tarball,
// filesystem permission issue), fall back to the literal string "unknown".
// This is deliberate — hard-failing at startup would be worse (the MCP server
// can still serve all 173 tools without a valid version string). The "unknown"
// value shows up in the User-Agent sent to BD and in the serverInfo echoed
// on initialize; BD treats both as informational only. If you see "unknown"
// in logs, check the npm tarball's package.json is intact.
const PACKAGE_VERSION = (() => {
  try {
    return require("./package.json").version;
  } catch {
    return "unknown";
  }
})();

// Load the MCP instructions block from the shared file. Single source of
// truth: the same file is fetched by the Cloudflare Worker at runtime, so any
// polish to agent directives ships to BOTH transports on the next deploy.
// If the file is missing (developer checkout without the openapi/ subtree,
// or a malformed npm tarball), fall back to empty string — this npm package
// still functions, agents just lose the cross-cutting directives block in
// the initialize response. Tool definitions still work normally.
const INSTRUCTIONS = (() => {
  try {
    return fs.readFileSync(
      path.join(__dirname, "openapi", "mcp-instructions.md"),
      "utf8"
    );
  } catch {
    return "";
  }
})();

// Track in-flight HTTP requests so SIGTERM/SIGINT can drain cleanly.
// Thread-safety note: this is a plain Set mutated from the single Node.js
// event loop. No locking needed because this package runs as a stdio child
// process on the user's machine — single-threaded by design. If someone
// ever wraps this in `worker_threads` to serve multiple MCP clients from
// one process, replace with a concurrent structure (or accept the race in
// the drain count; the destroy loop still works).
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
  // Spec lives at mcp/openapi/bd-api.json — single canonical location for
  // both npm (reads it from the shipped tarball) and local dev (same path).
  const specPath = path.join(__dirname, "openapi", "bd-api.json");
  if (fs.existsSync(specPath)) {
    return JSON.parse(fs.readFileSync(specPath, "utf8"));
  }
  console.error(`Error: OpenAPI spec not found at ${specPath}`);
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

  // Tools deliberately hidden from the agent surface. BD's endpoint
  // still exists in mcp/openapi/bd-api.json, but we don't register it as a callable
  // MCP tool. See the matching "DELIBERATELY HIDDEN FROM AGENTS" note in the
  // spec's createUserMeta summary (search CHANGELOG.md for "HIDDEN_TOOLS"
  // for the full rationale). tl;dr: BD auto-seeds users_meta on parent
  // create; exposing a manual create action to AI agents causes orphan
  // rows, duplicates, and cross-table corruption. Think twice before
  // adding anything here.
  const HIDDEN_TOOLS = new Set(["createUserMeta"]);

  for (const [urlPath, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.operationId) continue;
      if (HIDDEN_TOOLS.has(op.operationId)) continue;

      // Self-defense: duplicate operationIds would silently overwrite each other in toolMap.
      // Fail loudly on startup instead of mysterious "tool not found" errors later.
      const location = `${method.toUpperCase()} ${urlPath}`;
      if (seenIds.has(op.operationId)) {
        console.error(`Error: duplicate operationId "${op.operationId}" in OpenAPI spec.`);
        console.error(`  First seen at: ${seenIds.get(op.operationId)}`);
        console.error(`  Also found at: ${location}`);
        console.error(`Each endpoint must have a unique operationId. Fix mcp/openapi/bd-api.json.`);
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
            // Non-standard query params (like form_name).
            // The skip-list above is BD's standard pagination/filter param
            // set. We skip them here because they're re-added with richer
            // descriptions by the `method === "get"` block further down
            // (the `hasLimit` branch). Adding them here would double-register
            // with the spec's terse descriptions overriding our richer ones.
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
// Lean-response shapers (users, posts, categories, post types, web pages)
//
// Pattern: strip heavy nested buckets + debug residue by default; opt back in
// per-call via include_* flags. Applied between BD response and agent return.
// Shared helper `stripKeys(row, keys)` removes a list of fields in place.
// ---------------------------------------------------------------------------

function stripKeys(row, keys) {
  if (!row || typeof row !== "object") return;
  for (const k of keys) delete row[k];
}

// --- USERS (listUsers / getUser / searchUsers) ----------------------------

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
  "include_about",
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

// --- POSTS (list/get/search SingleImagePost + MultiImagePost) -------------

const POST_LEAN_INCLUDE_FLAGS = [
  "include_content",
  "include_post_seo",
  "include_author_full",
  "include_clicks",
  "include_photos",
];

// Promoted from nested data_category. data_id + data_type are already
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

// Fields returned in the inlined `_author` object on post reads (when
// include_author=1). Goal: give the agent enough to display an author card
// (name, company, contact, avatar, plan, active-status) without a follow-up
// getUser round-trip. Kept deliberately minimal — anything beyond these 10
// fields is available via an explicit getUser call.
//
// Rationale per field:
//   user_id             — primary key for any follow-up user ops
//   first_name/last_name — display name
//   company             — optional company line on author cards
//   email/phone_number  — contact shown on paid-tier directories
//   filename/image_main_file — avatar (BD serves two size variants)
//   subscription_id     — to badge the author's membership tier
//   active              — to suppress cards for deactivated authors
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

// --- CATEGORIES (top + sub) -----------------------------------------------
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

// NOTE: pattern here differs from User/Post/Plan shapers. Those use an
// `include` object to selectively KEEP/STRIP subsets per flag (multi-axis
// opt-in). Categories only have ONE optional bundle (the schema fields),
// so the all-or-nothing early-return is simpler and equivalent. If future
// category include_* flags are added (e.g. include_category_meta), this
// should be refactored to the include-object pattern like applyUserLean.
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

// --- POST TYPES (listPostTypes / getPostType) -----------------------------
//
// Post-type rows are huge - ~3.5KB minimum, 15-30KB when code fields are
// populated (PHP/HTML template content). Most agent tasks routing through
// post types only need structural/config fields (sidebars, ordering, etc.),
// NOT the PHP code templates. Code templates are what updatePostType's
// all-or-nothing-per-group rule applies to - agents editing post-type code
// opt in via include_code=1.

const POST_TYPE_LEAN_INCLUDE_FLAGS = [
  "include_code",
  "include_post_comment_settings",
  "include_review_notifications",
];

const POST_TYPE_LEAN_ALWAYS_STRIP = [
  // Admin-form residue that leaks into post-type read responses
  "website_id", "myid", "method", "id", "save", "form", "form_fields_name",
  "fromcron", "zzz_fake_field", "customize",
];

const POST_TYPE_CODE_BUNDLE = [
  "search_results_div",
  "search_results_layout",
  "profile_results_layout",
  "profile_header",
  "profile_footer",
  "category_header",
  "category_footer",
  "comments_code",
];

const POST_TYPE_REVIEW_NOTIFICATIONS = [
  "review_admin_notification_email",
  "review_member_notification_email",
  "review_submitter_notification_email",
  "review_approved_submitter_notification_email",
  "review_member_pending_notification_email",
];

function applyPostTypeLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const include = {
    code: !!includeFlags.include_code,
    post_comment_settings: !!includeFlags.include_post_comment_settings,
    review_notifications: !!includeFlags.include_review_notifications,
  };
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    stripKeys(row, POST_TYPE_LEAN_ALWAYS_STRIP);
    if (!include.code) stripKeys(row, POST_TYPE_CODE_BUNDLE);
    if (!include.post_comment_settings) delete row.post_comment_settings;
    if (!include.review_notifications) stripKeys(row, POST_TYPE_REVIEW_NOTIFICATIONS);
    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const POST_TYPE_READ_TOOLS = new Set(["listPostTypes", "getPostType"]);

// --- WEB PAGES (list/get list_seo) ----------------------------------------
//
// Page rows carry heavy asset fields: `content` (body HTML), `content_css`,
// `content_head`, `content_footer_html`. On sites with big pages this trivially
// pushes rows into the 10-30KB range; a `listWebPages limit=25` blows context.
// Most agent tasks routing through WebPages only need structural/meta fields;
// code assets opt in per-request.

const WEB_PAGE_LEAN_INCLUDE_FLAGS = [
  "include_content",
  "include_code",
];

const WEB_PAGE_CODE_BUNDLE = [
  "content_css",
  "content_head",
  "content_footer_html",
];

function applyWebPageLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const include = {
    content: !!includeFlags.include_content,
    code: !!includeFlags.include_code,
  };
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    if (!include.content) delete row.content;
    if (!include.code) stripKeys(row, WEB_PAGE_CODE_BUNDLE);
    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const WEB_PAGE_READ_TOOLS = new Set(["listWebPages", "getWebPage"]);

// --- MEMBERSHIP PLANS ------------------------------------------------------
//
// BD's subscription_types table has ~170 columns. Most agent tasks just need
// the plan IDs + names + pricing to pick one when creating a member. We use
// a KEEP-LIST (not a strip-list) — everything not in the keep-set is dropped.
// Anything new BD adds to the table in the future continues to be stripped
// automatically.

const PLAN_LEAN_INCLUDE_FLAGS = [
  "include_plan_config",
  "include_plan_display_flags",
];

// Always kept — the 9 core fields for picking a plan.
const PLAN_ALWAYS_KEEP = [
  "subscription_id", "subscription_name", "subscription_type", "profile_type",
  "monthly_amount", "yearly_amount", "initial_amount", "lead_price", "searchable",
];

// Restored with include_plan_config=1 — activation, limits, sidebars, forms,
// email templates, upgrade chain, payment/display/index settings.
const PLAN_CONFIG_FIELDS = [
  "sub_active", "search_priority", "auto_activate", "status_after_upgrade",
  "upgradable_membership", "search_membership_permissions",
  "photo_limit", "style_limit", "service_limit", "location_limit",
  "about_form", "listing_details_form", "contact_details_form",
  "signup_sidebar", "profile_sidebar", "signup_email_template",
  "upgrade_email_template", "signup_promotion_widget", "profile_layout",
  "menu_name", "data_settings", "data_settings_read", "location_settings",
  "category_badge", "profile_badge", "subscription_filename",
  "payment_default", "hide_specialties", "email_member", "login_redirect",
  "page_header", "page_footer", "display_ads", "receive_messages",
  "index_rule", "nofollow_links",
];

// Restored with include_plan_display_flags=1 — profile-visibility toggles.
// NOTE: `show_sofware` is spelled with the missing "t" on purpose — it
// matches BD's actual DB column name. Do NOT "fix" this typo; the field
// won't resolve if you correct it. BD shipped the typo years ago and has
// never migrated the column.
const PLAN_DISPLAY_FLAG_FIELDS = [
  "show_about", "show_experience", "show_education", "show_background",
  "show_affiliations", "show_publications", "show_awards", "show_slogan",
  "show_sofware", "show_phone", "seal_link", "website_link", "social_link",
];

function applyPlanLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const include = {
    config: !!includeFlags.include_plan_config,
    display: !!includeFlags.include_plan_display_flags,
  };
  // Build the allowed-keys set per this request
  const allow = new Set(PLAN_ALWAYS_KEEP);
  if (include.config) for (const k of PLAN_CONFIG_FIELDS) allow.add(k);
  if (include.display) for (const k of PLAN_DISPLAY_FLAG_FIELDS) allow.add(k);

  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const out = {};
    for (const k of Object.keys(row)) {
      if (allow.has(k)) out[k] = row[k];
    }
    return out;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const PLAN_READ_TOOLS = new Set(["listMembershipPlans", "getMembershipPlan"]);

// --- Email Template lean shaper -------------------------------------------
// Applies to listEmailTemplates / getEmailTemplate. The heavy field is
// `email_body` — full HTML of the template, can be tens of KB per row.
// Live measurement on a fresh test site (6 templates): email_body was 89%
// of the response payload, avg 8KB per row, max 11KB. Lean default omits
// it; `include_body=1` restores. Same pattern as WebPage `include_content`.

const EMAIL_TEMPLATE_LEAN_INCLUDE_FLAGS = ["include_body"];

function applyEmailTemplateLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const includeBody = !!includeFlags.include_body;
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    if (!includeBody) delete row.email_body;
    return row;
  };
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  return body;
}

const EMAIL_TEMPLATE_READ_TOOLS = new Set(["listEmailTemplates", "getEmailTemplate"]);

// --- REVIEWS (list/get/searchReviews) -------------------------------------
//
// Reviews have 9 flat scalar fields — no nested buckets to strip. The one
// unbounded field is `review_description` (no BD-side length cap); at
// `limit=100` a moderation-queue enumeration can balloon into megabytes of
// free-text. Lean default truncates the body to `REVIEW_BODY_PREVIEW_LEN`
// chars + "…"; `include_full_text=1` restores the full text. When truncation
// fires, the row is tagged `review_description_truncated: true` so the agent
// knows to re-fetch via `getReview` with the flag if it needs the full body.

const REVIEW_LEAN_INCLUDE_FLAGS = ["include_full_text"];

const REVIEW_BODY_PREVIEW_LEN = 500;

function applyReviewLean(body, includeFlags) {
  if (!body || body.status !== "success") return body;
  const includeFull = !!includeFlags.include_full_text;
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    if (includeFull) {
      row.review_description_truncated = false;
      return row;
    }
    const desc = row.review_description;
    if (typeof desc === "string" && desc.length > REVIEW_BODY_PREVIEW_LEN) {
      row.review_description = desc.slice(0, REVIEW_BODY_PREVIEW_LEN) + "…";
      row.review_description_truncated = true;
    } else {
      row.review_description_truncated = false;
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

const REVIEW_READ_TOOLS = new Set(["listReviews", "getReview", "searchReviews"]);

// --- WRITE-RESPONSE LEAN-SHAPING -------------------------------------------
//
// BD's create/update endpoints echo the full updated/created record in the
// response body. That's the same fat shape as a fully-included read — on
// Users it's ~10KB, on populated Post Types ~30-150KB, on content-heavy
// WebPages ~10-30KB. Agents don't need any of that to confirm a write
// landed: primary key + identity fields are enough to say "done, updated
// Mike Matthews (user_id 165)" or "created page 'About Us' at /about-us".
//
// Write responses are ALWAYS lean — no include_* flags to opt into full
// shape. For full record post-write, agent calls the matching get* (where
// include flags DO work).
//
// Keep-set per write family (confirmed from live-data size probes):

const WRITE_KEEP_SETS = {
  // Users
  createUser: ["user_id","first_name","last_name","company","email","filename","active","status","subscription_id","profession_id"],
  updateUser: ["user_id","first_name","last_name","company","email","filename","active","status","subscription_id","profession_id","modtime"],

  // Single-image posts
  createSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image","revision_timestamp"],
  updateSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image","revision_timestamp"],

  // Multi-image posts
  createMultiImagePost: ["group_id","group_name","group_filename","user_id","group_status","data_id","data_type","system_name","data_name","revision_timestamp"],
  updateMultiImagePost: ["group_id","group_name","group_filename","user_id","group_status","data_id","data_type","system_name","data_name","revision_timestamp"],

  // Post types
  // Note: `createPostType` is NOT in the spec (post types are created via
  // the admin UI, not the API). Only update/delete are exposed.
  updatePostType: ["data_id","data_type","system_name","data_name","data_filename","form_name","revision_timestamp"],

  // Top categories
  createTopCategory: ["profession_id","name","filename","revision_timestamp"],
  updateTopCategory: ["profession_id","name","filename","revision_timestamp"],

  // Sub categories
  createSubCategory: ["service_id","name","filename","profession_id","master_id","revision_timestamp"],
  updateSubCategory: ["service_id","name","filename","profession_id","master_id","revision_timestamp"],

  // Web pages
  createWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","date_updated","revision_timestamp"],
  updateWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","date_updated","revision_timestamp"],

  // Widgets — full echo includes widget_data/widget_style/widget_javascript
  // which can be 200KB+ on large widgets (e.g. Admin - Froala Editor Scripts
  // is 204KB of widget_data alone). Strip the three heavy code fields and
  // echo only identity + classification + timestamps + shortcode.
  createWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  updateWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  createMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
  updateMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
  createEmailTemplate: ["email_id","email_name","email_subject","email_type","category_id","notemplate","revision_timestamp"],
  updateEmailTemplate: ["email_id","email_name","email_subject","email_type","category_id","notemplate","revision_timestamp"],
};

// Apply ONLY to success responses. Errors pass through untouched so the
// agent sees the full BD error message.
//
// Known limitation: this shaper handles the two shapes BD actually returns
// on write success — `{status, data: {...record}}` and `{status, data: [row,
// row, ...]}`. It does NOT recurse into deeply nested shapes like
// `{status, message: {created: {...}}}`. If BD ever returns that, the keep
// filter would match zero fields at the top level and the shaper would
// return an empty object — agent would see a confusing "success but no
// fields" echo. Hasn't been observed in any write endpoint; revisit if it
// appears.
function applyWriteLean(toolName, body) {
  const keep = WRITE_KEEP_SETS[toolName];
  if (!keep) return body;
  if (!body || body.status !== "success") return body;

  const keepSet = new Set(keep);
  const shapeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const out = {};
    for (const k of keep) {
      if (k in row) out[k] = row[k];
    }
    return out;
  };

  // BD echoes the record as `message` — sometimes an object, sometimes a
  // single-row array. Both handled.
  if (Array.isArray(body.message)) {
    body.message = body.message.map(shapeRow);
  } else if (body.message && typeof body.message === "object") {
    body.message = shapeRow(body.message);
  }
  // Strings (e.g. "record was deleted") pass through unchanged.
  return body;
}

// Auto-refresh cache after cache-gated writes. BD's renderer + widget cache +
// post-type settings are cache-gated — public surfaces don't reflect writes
// until `/website_settings/refreshCache` fires. Agents skip the post-step
// often, so we do it server-side.
//
// Scope map (AUTO_REFRESH_SCOPE):
//   createWebPage / updateWebPage   -> scope=web_pages   (page render cache;
//                                      also covers list_seo hero-EAV)
//   createWidget  / updateWidget    -> scope=data_widgets
//   updatePostType                  -> "" (full refresh; no targeted scope
//                                      exists for post-type config)
//
// Lenient failure mode: refresh failure does NOT fail the parent write. The
// record is already saved; we annotate auto_cache_refreshed: false + the
// error so the agent can retry `refreshSiteCache` manually.
//
// Timing: web_pages ~5s, data_widgets ~3.5s, full ~5s. Each tool call is
// independent; bulk workflows pay the cost per-call but don't cumulatively
// time out.
async function autoRefreshCache(config, scope) {
  try {
    const body = scope ? { scope } : {};
    const result = await makeRequest(
      config,
      "POST",
      "/api/v2/website_settings/refreshCache",
      null,
      body
    );
    const respBody = result && result.body;
    if (respBody && typeof respBody === "object" && respBody.status === "success") {
      return { ok: true };
    }
    return { ok: false, message: (respBody && respBody.message) || `HTTP ${result && result.status}` };
  } catch (e) {
    return { ok: false, message: e && e.message ? String(e.message) : "network error" };
  }
}

// Tool -> refresh scope map. "" means full refresh (no scope param).
const AUTO_REFRESH_SCOPE = {
  createWebPage: "web_pages",
  updateWebPage: "web_pages",
  createWidget: "data_widgets",
  updateWidget: "data_widgets",
  updatePostType: "",
};

// EAV split-storage routing (mirror of Worker's EAV_ROUTES). BD stores ~27
// `list_seo` fields in `users_meta` with `database=list_seo`; `updateWebPage`
// on the parent silently drops them. We peel EAV fields off before the parent
// update, then upsert each via users_meta (update existing, create if missing).
// The upsert covers the "add hero to a page originally created without hero"
// flow — BD only auto-seeds hero rows on create-with-hero, not later updates.
// Only enumerated eavFields reach this code path, so typo'd keys can't
// pollute users_meta (they flow to the parent update and BD drops them).
const EAV_ROUTES = {
  updateMembershipPlan: {
    eavDatabase: "subscription_types",
    parentPK: "subscription_id",
    eavFields: new Set(["custom_checkout_url"]),
  },
  updateWebPage: {
    eavDatabase: "list_seo",
    parentPK: "seo_id",
    eavFields: new Set([
      "hero_section_content", "hero_image",
      "hero_link_url", "hero_link_text", "hero_link_color", "hero_link_size", "hero_link_target_blank",
      "hero_content_font_size", "hero_content_font_color",
      "hero_content_overlay_opacity", "hero_content_overlay_color",
      "hero_column_width", "hero_alignment",
      "hero_top_padding", "hero_bottom_padding",
      "hero_background_image_size",
      "hero_hide_banner_ad",
      "h1_font_size", "h2_font_size",
      "h1_font_weight", "h2_font_weight",
      "h1_font_color", "h2_font_color",
      "linked_post_type", "linked_post_category",
      "disable_css_stylesheets", "disable_preview_screenshot",
    ]),
  },
};

function splitEavParams(operation, params) {
  const route = EAV_ROUTES[operation];
  if (!route) return { direct: params, eav: {}, route: null };
  const direct = {};
  const eav = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (route.eavFields.has(k)) eav[k] = v;
    else direct[k] = v;
  }
  return { direct, eav, route };
}

async function writeEavFields(config, route, parentId, eavParams) {
  const results = [];
  for (const [key, value] of Object.entries(eavParams)) {
    let metaId = null;
    let existingValue = null;
    try {
      const listResult = await makeRequest(
        config,
        "GET",
        "/api/v2/users_meta/get",
        { property: "key", property_value: key, property_operator: "=", limit: 100 },
        null
      );
      const listBody = listResult && listResult.body;
      const rows = listBody && Array.isArray(listBody.message) ? listBody.message : [];
      const matches = rows.filter(
        (row) =>
          row &&
          String(row.database) === String(route.eavDatabase) &&
          String(row.database_id) === String(parentId)
      );
      if (matches.length > 0 && matches[0].meta_id) {
        metaId = matches[0].meta_id;
        existingValue = matches[0].value !== undefined ? String(matches[0].value) : null;
      }
    } catch {
      results.push({ key, action: "updated", status: "error", message: "EAV lookup failed" });
      continue;
    }
    if (!metaId) {
      try {
        const createResult = await makeRequest(
          config,
          "POST",
          "/api/v2/users_meta/create",
          null,
          { database: route.eavDatabase, database_id: parentId, key, value: String(value) }
        );
        const ok = createResult && createResult.status >= 200 && createResult.status < 300;
        results.push({ key, action: "created", status: ok ? "success" : "error", http: createResult && createResult.status });
      } catch {
        results.push({ key, action: "created", status: "error", message: "EAV create failed" });
      }
      continue;
    }
    // Empty-string update detection: BD's users_meta/update endpoint silently
    // ignores empty `value` params (URL-encoded `value=` arrives but BD
    // treats it as "no change to value" rather than "set to empty"). If we
    // sent the update naively, the response would lie — saying "updated" for
    // a no-op. Detect upfront and report honestly. To actually reset to
    // BD's default (which IS empty for these fields), use deleteUserMeta
    // to remove the row entirely.
    const targetValue = String(value);
    if (targetValue === "" && existingValue !== null && existingValue !== "") {
      results.push({
        key,
        action: "no_change",
        status: "success",
        message: `BD silently no-ops empty-string updates on users_meta — existing value "${existingValue}" preserved. To reset to default, use deleteUserMeta on this meta_id.`,
        meta_id: metaId,
      });
      continue;
    }
    try {
      const updateResult = await makeRequest(
        config,
        "PUT",
        "/api/v2/users_meta/update",
        null,
        { meta_id: metaId, value: targetValue, database: route.eavDatabase, database_id: parentId }
      );
      const ok = updateResult && updateResult.status >= 200 && updateResult.status < 300;
      results.push({ key, action: "updated", status: ok ? "success" : "error", http: updateResult && updateResult.status });
    } catch {
      results.push({ key, action: "updated", status: "error", message: "EAV update failed" });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Agent-scaffolding sanitizer
// ---------------------------------------------------------------------------
//
// Content fields (HTML / CSS / JS / PHP) are cache-gated and stored verbatim
// by BD. Agents occasionally leak reasoning scaffolding into values — CDATA
// wrappers, function-call markup, whole-value entity-escapes — and BD then
// renders that leakage as literal visible text on the live site, breaking
// layouts (page-wide for content_css, site-wide for widget_style).
//
// Belt + suspenders:
//   - Docs rule tells agents never to emit these tokens in content fields
//   - This sanitizer strips them server-side before forwarding to BD
//
// Scope: only the enumerated SCAFFOLDING_SENSITIVE_FIELDS Set. Strips ANY
// occurrence (not just outer wrappers) because these tokens have no legitimate
// place in BD content and the rule is absolute. Entity-escape unwraps only
// when the WHOLE value is entity-escaped (no real `<` or `>` present) — to
// avoid eating entities inside otherwise-valid markup.

const SCAFFOLDING_SENSITIVE_FIELDS = new Set([
  // WebPage body + assets
  "content", "content_css", "content_head", "content_footer_html", "hero_section_content",
  // Widget body + assets
  "widget_data", "widget_style", "widget_javascript",
  // PostType code templates — single source of truth via POST_TYPE_CODE_BUNDLE
  ...POST_TYPE_CODE_BUNDLE,
  // User long-form HTML
  "about_me",
  // Post body fields
  "post_content", "post_caption", "group_desc",
]);

// Patterns to strip (substring matches — aggressive, any occurrence).
// Ordered with closers first so stripping opener doesn't leave orphan closer.
const SCAFFOLDING_TOKENS = [
  "<![CDATA[",
  "]]>",
  "</function_calls>",
  "<function_calls>",
  "</invoke>",
  "</parameter>",
];
// Tag patterns that carry attributes (e.g. `<parameter name="content">`, `<invoke name="tool">`):
const SCAFFOLDING_TAG_REGEX = /<(?:parameter|invoke)\b[^>]*>/gi;

function stripAgentScaffolding(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  let v = value;
  // Remove literal tokens anywhere.
  for (const tok of SCAFFOLDING_TOKENS) {
    if (v.includes(tok)) v = v.split(tok).join("");
  }
  // Remove opening <parameter ...> / <invoke ...> tags with any attributes.
  v = v.replace(SCAFFOLDING_TAG_REGEX, "");
  // Whole-value entity-escaped HTML: if value contains escaped angle brackets
  // but NO real ones, unescape. Only the whole-value case — leaves inline
  // entity-escapes in otherwise-valid markup untouched.
  if (/&lt;|&gt;/.test(v) && !/[<>]/.test(v)) {
    v = v
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
  }
  return v;
}

function sanitizeScaffoldingInArgs(args) {
  if (!args || typeof args !== "object") return args;
  for (const k of Object.keys(args)) {
    if (SCAFFOLDING_SENSITIVE_FIELDS.has(k)) {
      args[k] = stripAgentScaffolding(args[k]);
    }
  }
  return args;
}

// Widget wrapper-tag failsafe — widget_style ONLY.
// Agents occasionally paste a CSS block wrapped in `<style>...</style>` into
// widget_style. BD stores wrappers literally and the renderer then emits
// `<style><style>...</style></style>`, breaking layout. Field description
// already says "no <style> wrapper"; this is the runtime belt.
//
// widget_javascript is DELIBERATELY NOT stripped — BD's renderer requires
// `<script>...</script>` wrapping in widget_javascript for the JS to execute.
// Stripping it would silently break every widget.
//
// widget_data is also untouched — HTML legitimately contains <style>/<script>
// inline.
//
// Surgical: strip ONE outer wrapper only, and only when the value starts with
// `<style>` (whitespace allowed) and ends with the matching `</style>`. Inner
// CSS is preserved byte-for-byte.
//
// Mirrored byte-for-byte in Worker `src/index.ts`. Keep both in sync.
const WIDGET_STYLE_WRAPPER_REGEX = /^\s*<style\b[^>]*>([\s\S]*?)<\/style>\s*$/i;
function stripWidgetWrapperTagsInArgs(args) {
  if (!args || typeof args !== "object") return args;
  const styleVal = args.widget_style;
  if (typeof styleVal === "string") {
    const m = styleVal.match(WIDGET_STYLE_WRAPPER_REGEX);
    if (m) args.widget_style = m[1];
  }
  return args;
}

// Image-URL sanitizer — strips `?query` suffixes before forwarding to BD.
// BD's auto_image_import bakes any `?query` into the stored filename → the
// imported file 404s at CDN. Field descriptions say "bare URL only" but
// agents drift; this is the runtime belt (docs are the suspenders). Also
// trims whitespace in CSV lists (multi-image albums) — BD doesn't trim,
// stray spaces silently fail imports.
//
// SCOPED — do not add fields that aren't in BD's auto_image_import / form-urlencoded
// image-write pipeline. The set below is every field we've confirmed BD processes
// that way and where a query string either bakes into a filename or gets truncated
// by urlencoded parsing. Don't add: `facebook_image` (OG/social — hotlinked by FB
// crawlers, query strings are legitimate for CDN variants), inline image URLs in
// `post_content`/`group_desc` body HTML (Froala stores verbatim; `?w=700` retina
// variants are INTENTIONAL on body images), or any non-URL string field. If BD
// adds a new imported-image field, verify its pipeline behavior with a live test
// before adding it here — over-sanitizing a hotlinked field silently breaks
// retina sharpness on customer content.
//
// Mirrored byte-for-byte in Worker's `src/index.ts`. Keep in sync.
const IMAGE_SINGLE_URL_FIELDS = new Set([
  "post_image",          // single-image posts only; multi handled below
  "hero_image",
  "cover_photo",
  "logo",
  "profile_photo",
  "original_image_url",
]);
const IMAGE_CSV_URL_TOOLS = new Set(["createMultiImagePost", "updateMultiImagePost"]);

// Rich-text body fields where Froala emits <img> tags with fr-dib + fr-fil/fr-fir
// classes. BD's frontend expects `img-rounded` on these images for the corner-
// rounding the rest of the site uses; missing it leaves a single unrounded image
// that visibly breaks the page's visual consistency.
//
// FAILSAFE — the canonical Froala image pattern in the corpus already includes
// `img-rounded` (mcp-instructions.md: `class="fr-dib fr-fil img-rounded"`). This
// auto-add exists for agents pasting raw Froala HTML or migrating content that
// missed the class. Silent on purpose — match-the-platform plumbing, not agent-
// decision territory; do NOT surface as a response echo.
const RICH_TEXT_BODY_FIELDS = new Set(["post_content", "group_desc", "content"]);
function ensureImgRoundedClass(html) {
  if (typeof html !== "string" || !html.includes("<img")) return html;
  // Match <img ...class="...fr-..."...> — only target Froala-style images
  // (those carrying any `fr-*` class). Plain <img> from external paste stays
  // untouched so we don't trample customer markup.
  return html.replace(/<img\b([^>]*?)\bclass\s*=\s*(["'])([^"']*)\2([^>]*)>/gi,
    (match, pre, quote, classes, post) => {
      if (!/\bfr-/.test(classes)) return match; // not Froala-style
      if (/\bimg-rounded\b/.test(classes)) return match; // already present
      const newClasses = (classes + " img-rounded").trim();
      return `<img${pre}class=${quote}${newClasses}${quote}${post}>`;
    });
}
function applyImgRoundedToBodyFields(args) {
  if (!args || typeof args !== "object") return;
  for (const field of RICH_TEXT_BODY_FIELDS) {
    const v = args[field];
    if (typeof v === "string" && v.includes("<img")) {
      const cleaned = ensureImgRoundedClass(v);
      if (cleaned !== v) args[field] = cleaned;
    }
  }
}

function sanitizeSingleImageUrl(url) { return url.trim().split("?")[0]; }
function sanitizeImageUrlsInArgs(toolName, args) {
  if (!args || typeof args !== "object") return;
  // Multi-image post_image is CSV — split, strip each, rejoin.
  if (IMAGE_CSV_URL_TOOLS.has(toolName) && typeof args.post_image === "string") {
    const orig = args.post_image;
    const cleaned = orig.split(",").map(sanitizeSingleImageUrl).filter(Boolean).join(",");
    if (cleaned !== orig) {
      console.error(`[sanitize] ${toolName}: stripped query-string or whitespace from post_image CSV`);
      args.post_image = cleaned;
    }
    return;
  }
  // Everything else: single-URL fields.
  for (const field of IMAGE_SINGLE_URL_FIELDS) {
    const v = args[field];
    if (typeof v === "string" && v.includes("?")) {
      const cleaned = sanitizeSingleImageUrl(v);
      if (cleaned !== v) {
        console.error(`[sanitize] ${toolName}: stripped query-string from ${field}`);
        args[field] = cleaned;
      }
    }
  }
}

// Path-param ID validator — BD's REST API has a SQL-routing bug where any
// /resource/get/{id} call with id<=0 (negative or zero) ignores the filter
// and returns the ENTIRE table. Confirmed live against `/api/v2/list_seo/get/-1`
// and `/api/v2/list_seo/get/0` (each returns all 25 webpages on a fresh site,
// 340KB+ payload). Same risk profile likely affects every numeric-PK GET
// endpoint (34 of them). Reject non-positive integers in path-param position
// before forwarding to BD. Defense-in-depth — also catches typos like
// `seo_id=null` / `seo_id=""` / `seo_id="abc"` that would stringify weirdly
// into the URL. Path-param keys treated as numeric IDs: anything ending in
// `_id` or the bare `id` token. Structural rule = covers current + future
// endpoints automatically. Mirrored in Worker's `src/index.ts`.
function validatePathParamIds(toolPath, args) {
  if (!args || typeof args !== "object") return null;
  const matches = toolPath.match(/\{([^}]+)\}/g) || [];
  for (const tok of matches) {
    const key = tok.slice(1, -1);
    if (!(key.endsWith("_id") || key === "id")) continue;
    if (!(key in args)) continue;
    const v = args[key];
    if (v === null || v === undefined || v === "") {
      return `${key} is required for this operation. Got empty value.`;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return `${key} must be a positive whole integer (>=1, no decimals). Got: ${JSON.stringify(v)}. Negative IDs, 0, and decimals all trigger BD's table-dump bug — wrapper rejects to prevent data leak.`;
    }
  }
  return null;
}

// Hero/h1/h2 enum guard — every enum-typed field on createWebPage /
// updateWebPage that BD persists verbatim to users_meta and renders into CSS
// classes or template logic. BD does NOT validate any of these server-side.
// An invalid value (e.g. hero_alignment="flex-start", h1_font_weight="bold",
// hero_column_width="13") gets stored as-is and breaks rendering. The
// validator rejects anything outside the declared set BEFORE forwarding to
// BD — reject-don't-coerce: silent coercion to defaults masks the agent's
// real intent and produces false-success responses. Discrete-range fields
// (paddings, font sizes) source-of-truth: BD admin form `<select>` options.
// Mirrored in Worker's `src/index.ts`.
const HERO_PADDING_STEPS = Array.from({ length: 21 }, (_, i) => String(i * 10)); // 0..200 step 10
const H1_FONT_SIZE_STEPS = Array.from({ length: 51 }, (_, i) => String(30 + i)); // 30..80 step 1
const H2_FONT_SIZE_STEPS = Array.from({ length: 41 }, (_, i) => String(20 + i)); // 20..60 step 1
const HERO_CONTENT_FONT_SIZE_STEPS = Array.from({ length: 21 }, (_, i) => String(10 + i)); // 10..30 step 1
const HERO_ENUM_FIELDS = {
  enable_hero_section: ["0", "1", "2"],
  hero_link_color: ["primary", "info", "success", "warning", "danger", "default", "secondary"],
  hero_link_size: ["", "btn-lg", "btn-xl"],
  hero_link_target_blank: ["0", "1"],
  hero_alignment: ["left", "center", "right"],
  hero_column_width: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  hero_background_image_size: ["mobile-ready", "standard"],
  hero_hide_banner_ad: ["0", "1"],
  hero_content_overlay_opacity: ["0.0", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1"],
  hero_top_padding: HERO_PADDING_STEPS,
  hero_bottom_padding: HERO_PADDING_STEPS,
  h1_font_size: H1_FONT_SIZE_STEPS,
  h2_font_size: H2_FONT_SIZE_STEPS,
  hero_content_font_size: HERO_CONTENT_FONT_SIZE_STEPS,
  h1_font_weight: ["300", "400", "600", "800"],
  h2_font_weight: ["300", "400", "600", "800"],
};
const HERO_ENUM_TOOLS = new Set(["createWebPage", "updateWebPage"]);

// Reject-don't-coerce on hero enums. Silent coercion (e.g. `#ffffff` →
// `"primary"`, numeric → `"btn-lg"`) is a false-success failure mode: the
// validator passes because the value was already coerced, agent gets
// status:success, their actual intent is discarded. Reject loudly so the
// agent gets a clear actionable error instead of a silent change.
function validateHeroEnumsInArgs(toolName, args) {
  if (!HERO_ENUM_TOOLS.has(toolName) || !args || typeof args !== "object") return null;
  for (const [field, allowed] of Object.entries(HERO_ENUM_FIELDS)) {
    const v = args[field];
    if (v === undefined || v === null) continue;
    // Empty strings are allowed only when "" is in the field's enum
    // (e.g. hero_link_size: "" means "Normal" size). Otherwise treat
    // empty as an invalid value — reject like any other bad input
    // rather than silently slipping through (which would produce a
    // false-success where the agent's empty input "succeeds" but no
    // change is written).
    const s = String(v);
    if (!allowed.includes(s)) {
      return `${field} must be one of: ${allowed.map((x) => `"${x}"`).join(", ")} (you sent: "${s}"). Invalid values are persisted verbatim — BD does not validate server-side, so the value renders as a broken CSS class or breaks the hero layout.`;
    }
  }
  return null;
}

// Hero readability bundle. When `enable_hero_section` transitions from
// off (0/unset) to on (1/2), BD's field-level defaults render an unreadable
// hero (10px text, 0.4 transparent overlay, 0px padding, etc). The corpus
// rule at mcp-instructions.md "Hero section readability safe-defaults"
// names a 9-field recipe that overrides those defaults with values that
// actually look readable. Agents drift on this constantly — they enable
// the hero, set 1-2 fields they care about, and the response says 200 OK
// while the public hero renders broken. Validator below auto-fills any
// omitted bundle field with the canonical default on hero transition,
// echoing what was filled in `_hero_bundle_autofilled`. User-supplied
// values pass through untouched. `hero_image` is required (no default —
// reject if a hero is being enabled without an image).
const HERO_BUNDLE_DEFAULTS = {
  hero_top_padding: "100",
  hero_bottom_padding: "100",
  hero_column_width: "5",
  hero_content_overlay_color: "rgb(0, 0, 0)",
  hero_content_overlay_opacity: "0.5",
  hero_content_font_color: "rgb(255, 255, 255)",
  hero_content_font_size: "18",
  h1_font_color: "rgb(255, 255, 255)",
  h2_font_color: "rgb(255, 255, 255)",
};

function _heroIsOn(v) {
  if (v === undefined || v === null) return false;
  const s = String(v);
  return s === "1" || s === "2";
}

// Returns one of:
//   { error: <message> }                                  — hero turning on without hero_image
//   { autofilled: [<field names>] }                       — bundle gaps were filled
//   null                                                  — no-op (no transition, or already complete)
// Mutates `args` in place: missing bundle fields are set to canonical defaults.
function applyHeroBundleAutofill(toolName, args, currentRecord) {
  if (toolName !== "createWebPage" && toolName !== "updateWebPage") return null;
  if (!args || typeof args !== "object") return null;
  const incomingHero = args.enable_hero_section;
  // On createWebPage, transition is whenever incoming is on.
  // On updateWebPage, transition is incoming on AND current is off/unset.
  let isTransition = false;
  if (toolName === "createWebPage") {
    isTransition = _heroIsOn(incomingHero);
  } else {
    if (incomingHero === undefined) return null;
    if (!_heroIsOn(incomingHero)) return null;
    const currentHero = currentRecord && typeof currentRecord === "object" ? currentRecord.enable_hero_section : undefined;
    isTransition = !_heroIsOn(currentHero);
  }
  if (!isTransition) return null;
  // hero_image is required on transition. No safe default — reject so the
  // agent supplies one (or falls back to seo_type=content if no image).
  const incomingImage = args.hero_image;
  const currentImage = currentRecord && typeof currentRecord === "object" ? currentRecord.hero_image : undefined;
  const haveImage = (typeof incomingImage === "string" && incomingImage !== "") ||
                    (typeof currentImage === "string" && currentImage !== "");
  if (!haveImage) {
    return { error: `Cannot enable hero section without hero_image. Pass hero_image=<URL> in this same call. If the user didn't supply one, walk the image-sourcing ladder (user URL → subject's own web presence → Pexels stock fallback for generic topic-page heroes) and pass the chosen URL. To leave the hero off, set enable_hero_section=0.` };
  }
  const filled = [];
  for (const [field, def] of Object.entries(HERO_BUNDLE_DEFAULTS)) {
    const incoming = args[field];
    if (incoming !== undefined && incoming !== null && incoming !== "") continue;
    // Don't overwrite a value the user previously customized on this record.
    // BD preserves stored hero values across off→on toggles, so on a second
    // transition the field already has the user's last-known value. Only
    // fill when both args AND the current record have nothing.
    const stored = currentRecord && typeof currentRecord === "object" ? currentRecord[field] : undefined;
    if (stored !== undefined && stored !== null && stored !== "") continue;
    args[field] = def;
    filled.push(field);
  }
  return filled.length > 0 ? { autofilled: filled } : null;
}

// data_category page support — validators, autofills, pair-uniqueness guard.
// See Worker `src/index.ts` for full design rationale. Mirrored byte-for-byte.
const POST_TYPES_CACHE = new Map();
const POST_TYPES_TTL_MS = 5 * 60 * 1000;

async function getPostTypesCached(domain, apiKey) {
  const cached = POST_TYPES_CACHE.get(domain);
  if (cached && (Date.now() - cached.fetchedAt) < POST_TYPES_TTL_MS) return cached.rows;
  try {
    const url = new URL(`/api/v2/data_categories/get`, `https://${domain}`);
    url.searchParams.set("limit", "100");
    const resp = await fetch(url.toString(), { method: "GET", headers: { "X-Api-Key": apiKey, Accept: "application/json" } });
    if (!resp.ok) return null;
    const body = await resp.json().catch(() => null);
    const rows = (body && Array.isArray(body.message)) ? body.message : [];
    POST_TYPES_CACHE.set(domain, { rows, fetchedAt: Date.now() });
    return rows;
  } catch { return null; }
}

function _parseFeatureCategories(raw) {
  if (typeof raw !== "string" || raw === "") return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

async function _readLinkedPostMeta(domain, apiKey, seoId) {
  try {
    const url = new URL(`/api/v2/users_meta/get`, `https://${domain}`);
    url.searchParams.append("property[]", "database");
    url.searchParams.append("property[]", "database_id");
    url.searchParams.append("property_value[]", "list_seo");
    url.searchParams.append("property_value[]", String(seoId));
    url.searchParams.append("property_operator[]", "=");
    url.searchParams.append("property_operator[]", "=");
    url.searchParams.set("limit", "100");
    const resp = await fetch(url.toString(), { method: "GET", headers: { "X-Api-Key": apiKey, Accept: "application/json" } });
    if (!resp.ok) return {};
    const body = await resp.json().catch(() => null);
    const rows = (body && Array.isArray(body.message)) ? body.message : [];
    const out = {};
    for (const r of rows) {
      if (r && r.key === "linked_post_type") out.linked_post_type = String(r.value || "");
      if (r && r.key === "linked_post_category") out.linked_post_category = String(r.value || "");
    }
    return out;
  } catch { return null; }
}

async function _findPagesByLinkedPostType(domain, apiKey, linkedPostType) {
  try {
    const url = new URL(`/api/v2/users_meta/get`, `https://${domain}`);
    url.searchParams.append("property[]", "database");
    url.searchParams.append("property[]", "key");
    url.searchParams.append("property[]", "value");
    url.searchParams.append("property_value[]", "list_seo");
    url.searchParams.append("property_value[]", "linked_post_type");
    url.searchParams.append("property_value[]", linkedPostType);
    url.searchParams.append("property_operator[]", "=");
    url.searchParams.append("property_operator[]", "=");
    url.searchParams.append("property_operator[]", "=");
    url.searchParams.set("limit", "100");
    const resp = await fetch(url.toString(), { method: "GET", headers: { "X-Api-Key": apiKey, Accept: "application/json" } });
    if (!resp.ok) return null;
    const body = await resp.json().catch(() => null);
    const rows = (body && Array.isArray(body.message)) ? body.message : [];
    const seoIds = rows
      .filter(r => r && r.database === "list_seo" && r.key === "linked_post_type" && String(r.value) === linkedPostType)
      .map(r => String(r.database_id));
    const pairs = await Promise.all(seoIds.map(async (sid) => {
      const meta = await _readLinkedPostMeta(domain, apiKey, sid);
      return { seo_id: sid, linked_post_category: (meta && meta.linked_post_category) || "post_main_page" };
    }));
    return pairs;
  } catch { return null; }
}

async function applyDataCategoryGuard(domain, apiKey, toolName, args, currentRecord) {
  if (toolName !== "createWebPage" && toolName !== "updateWebPage") return null;
  if (!args || typeof args !== "object") return null;

  let effective = args.seo_type;
  if (effective === undefined && currentRecord) effective = currentRecord.seo_type;
  const seoType = String(effective || "").toLowerCase();

  if (toolName === "createWebPage" && seoType !== "data_category") {
    const fn = args.filename;
    if (fn === undefined || fn === null || fn === "") {
      return { error: `filename is required when seo_type=${seoType || "content"}. Pass a URL slug (e.g. "about-us"). Only seo_type=data_category creates allow filename to be omitted (BD auto-generates a placeholder; the public URL routes via the post type's data_filename + category).` };
    }
  }

  if (seoType !== "data_category") return null;

  let currentMeta = {};
  if (toolName === "updateWebPage" && args.seo_id !== undefined && args.seo_id !== null) {
    const m = await _readLinkedPostMeta(domain, apiKey, args.seo_id);
    if (m) currentMeta = m;
  }

  const incomingType = args.linked_post_type;
  const incomingCategory = args.linked_post_category;
  const effectiveType = (incomingType !== undefined && incomingType !== null && incomingType !== "")
    ? String(incomingType) : currentMeta.linked_post_type;
  if (!effectiveType) {
    return { error: `seo_type=data_category requires linked_post_type (the post type's data_id). Pass linked_post_type=<data_id>. Discover values via listPostTypes — the data_id field on each row.` };
  }

  const postTypes = await getPostTypesCached(domain, apiKey);
  if (!postTypes) return null;
  const matchedPT = postTypes.find(pt => String(pt.data_id) === effectiveType);
  if (!matchedPT) {
    const sampleIds = postTypes.slice(0, 6).map(pt => `${pt.data_id}=${pt.data_name || pt.system_name || "?"}`).join(", ");
    return { error: `linked_post_type=${effectiveType} doesn't match any post type's data_id on this site. Run listPostTypes to discover valid values (sample: ${sampleIds}${postTypes.length > 6 ? ", ..." : ""}).` };
  }

  let effectiveCategory = (incomingCategory !== undefined && incomingCategory !== null && incomingCategory !== "")
    ? String(incomingCategory) : currentMeta.linked_post_category;
  const autofilled = [];
  if (!effectiveCategory) {
    effectiveCategory = "post_main_page";
    args.linked_post_category = "post_main_page";
    autofilled.push("linked_post_category");
  }

  if (effectiveCategory !== "post_main_page") {
    const cats = _parseFeatureCategories(matchedPT.feature_categories);
    if (cats.length === 0) {
      return { error: `Post type ${matchedPT.data_name || matchedPT.system_name || effectiveType} (data_id=${effectiveType}) has no feature_categories defined. linked_post_category must be 'post_main_page' for this post type, or add categories first via updatePostType.` };
    }
    if (!cats.includes(effectiveCategory)) {
      return { error: `linked_post_category='${effectiveCategory}' isn't a valid category for post type ${matchedPT.data_name || matchedPT.system_name || effectiveType}. Valid options: post_main_page, ${cats.join(", ")}. Categories are case-sensitive and must match exactly.` };
    }
  }

  const claimingPages = await _findPagesByLinkedPostType(domain, apiKey, effectiveType);
  if (claimingPages) {
    const ownSeoId = (args.seo_id !== undefined && args.seo_id !== null) ? String(args.seo_id) : null;
    const conflict = claimingPages.find(p => p.linked_post_category === effectiveCategory && p.seo_id !== ownSeoId);
    if (conflict) {
      return { error: `Pair (linked_post_type=${effectiveType}, linked_post_category=${effectiveCategory}) is already claimed by web page seo_id=${conflict.seo_id}. Each post type + category combo can only host ONE data_category page. To re-pin: updateWebPage seo_id=${conflict.seo_id} seo_type=content (releases the slot), then retry. To repurpose the existing page: updateWebPage seo_id=${conflict.seo_id} with new content.` };
    }
  }

  return {
    autofilled: autofilled.length > 0 ? autofilled : undefined,
    pair_validated: { linked_post_type: effectiveType, linked_post_category: effectiveCategory },
  };
}

// Free-form RGB color fields on createWebPage / updateWebPage. BD's hero
// templates expect `rgb(R, G, B)` literally — hex codes (#ffffff), named
// colors (white), and rgba(...) all break the CSS variable interpolation
// BD uses to render these values. The spec descriptions say "RGB format
// ONLY" but agents pass hex anyway. Reject anything that isn't `rgb(R, G, B)`
// with channels in [0, 255]. Whitespace inside the parens is permitted
// (rgb(0,0,0) and rgb(0, 0, 0) both render correctly). Reject-don't-coerce
// to keep parity with the enum validator.
const HERO_RGB_FIELDS = new Set([
  "h1_font_color",
  "h2_font_color",
  "hero_content_font_color",
  "hero_content_overlay_color",
]);
const RGB_PATTERN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
function validateRgbColorsInArgs(toolName, args) {
  if (!HERO_ENUM_TOOLS.has(toolName) || !args || typeof args !== "object") return null;
  for (const field of HERO_RGB_FIELDS) {
    const v = args[field];
    if (v === undefined || v === null || v === "") continue;
    const s = String(v).trim();
    const m = s.match(RGB_PATTERN);
    if (!m) {
      return `${field} must be in rgb(R, G, B) format (e.g. "rgb(0, 0, 0)" or "rgb(255,255,255)") — you sent: "${s}". BD's hero templates only accept rgb() — hex codes, named colors, and rgba() all break rendering.`;
    }
    for (let i = 1; i <= 3; i++) {
      const channel = Number(m[i]);
      if (!Number.isFinite(channel) || channel < 0 || channel > 255) {
        return `${field} channel ${i} out of range (0-255): "${m[i]}" in "${s}".`;
      }
    }
  }
  return null;
}

// Widget name format validator. BD does not enforce uniqueness OR character
// sanity on widget_name, but `[widget=Name]` shortcode resolution gets fragile
// fast with special chars (URL parsing, HTML attribute escaping, BD's own
// shortcode parser). Restrict to a safe character class up front:
//   [A-Za-z0-9 \-+_]+   alphanumeric + space + hyphen + plus + underscore.
// `+` and `_` are allowed because some legacy BD widgets carry them in names.
// Mirrored byte-for-byte in Worker `src/index.ts`. Keep in sync.
const WIDGET_NAME_PATTERN = /^[A-Za-z0-9 \-+_]+$/;
const WIDGET_NAME_TOOLS = new Set(["createWidget", "updateWidget"]);
function validateWidgetNameInArgs(toolName, args) {
  if (!WIDGET_NAME_TOOLS.has(toolName) || !args || typeof args !== "object") return null;
  const v = args.widget_name;
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!WIDGET_NAME_PATTERN.test(s)) {
    return `widget_name must contain only letters, numbers, spaces, hyphens, plus, and underscores — you sent: "${s}". Special characters (slashes, quotes, dots, ampersands, brackets, etc.) break [widget=Name] shortcode resolution. Pick a name like "Mortgage Calculator", "Service-Card-v2", or "C++ Course".`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Money / price field validator
// ---------------------------------------------------------------------------
//
// All BD price/amount fields are USD-denominated, non-negative, max 2
// decimals (cents). BD does NOT validate format server-side: negatives slip
// through (undefined billing-engine behavior), and 3+ decimals get truncated
// or stored verbatim and break downstream rounding.
//
// To extend coverage when BD adds new price fields, just append the field
// name to MONEY_FIELDS — the validator runs on every dispatch and only acts
// on fields actually present in args.
const MONEY_FIELDS = new Set([
  "lead_price",          // top/sub category and membership plan
  "monthly_amount",      // membership plan — billed every 30 days
  "quarterly_amount",    // membership plan — billed every 3 months
  "semiyearly_amount",   // membership plan — billed every 6 months
  "yearly_amount",       // membership plan — billed every 12 months
  "biennially_amount",   // membership plan — billed every 2 years
  "triennially_amount",  // membership plan — billed every 3 years
  "initial_amount",      // membership plan — one-time setup fee
]);
function validateMoneyInArgs(args) {
  if (!args || typeof args !== "object") return null;
  for (const field of MONEY_FIELDS) {
    const v = args[field];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      return `${field} must be a number (got "${v}").`;
    }
    if (n < 0) {
      return `${field} must be >= 0 (got ${v}). BD's billing engine has undefined behavior on negative prices.`;
    }
    // Reject 3+ decimal places. Use string check, not Number arithmetic
    // (floating-point can lose digits — 1.005 -> 1.005 stored as 1.00499...).
    const s = String(v);
    const dot = s.indexOf(".");
    if (dot >= 0 && s.length - dot - 1 > 2) {
      return `${field} must have at most 2 decimal places (got "${v}"). BD stores prices as cents — extra decimals are silently truncated, breaking downstream rounding.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filter-value SQL-injection-shape guard
// ---------------------------------------------------------------------------
//
// BD's filter parser silently DROPS filters whose `property_value` matches
// a pattern its sanitizer chokes on, then returns the FULL (unfiltered)
// table — same data-leak shape as path-param `id=-1`. Verified live: a
// value of `' OR 1=1--` returned all 26 rows on a 1-row-expected query.
//
// Trade-off: legitimate filter values can contain apostrophes (`O'Brien`,
// `Bob's Burgers`) and we don't want to break those. So we reject only the
// canonical SQL-injection patterns (`OR 1=1`, `; DROP`, `UNION SELECT`,
// `-- ` followed by content, `/* ... */` comments). Plain apostrophes pass.
// If BD silently drops a legit-apostrophe filter, the agent will see empty
// results and can switch to `LIKE` or fuzzy search — visible failure path.
const SQLI_PATTERNS = [
  /\bOR\s+\d+\s*=\s*\d+/i,    // OR 1=1
  /\bAND\s+\d+\s*=\s*\d+/i,   // AND 1=1
  /\bUNION\s+SELECT\b/i,
  /\bDROP\s+(?:TABLE|DATABASE)\b/i,
  /\bINSERT\s+INTO\b/i,
  /;\s*(?:DROP|DELETE|UPDATE|INSERT)\b/i,
  /--\s/,                       // -- followed by space (SQL line comment)
  /\/\*[\s\S]*?\*\//,           // /* ... */ block comment
];
function validateFilterValuesInArgs(args) {
  if (!args || typeof args !== "object") return null;
  const check = (label, val) => {
    if (val === undefined || val === null || val === "") return null;
    const s = String(val);
    for (const pat of SQLI_PATTERNS) {
      if (pat.test(s)) {
        return `${label} contains SQL-injection-shape pattern. BD's filter parser silently drops these and returns the FULL unfiltered result set, which is a data-leak risk. Got: "${s.slice(0, 80)}". If you intended to search for text containing operators or comments, use property_operator=LIKE with a simpler value.`;
      }
    }
    return null;
  };
  const e1 = check("property_value", args.property_value);
  if (e1) return e1;
  const arr = args["property_value[]"];
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i++) {
      const e = check(`property_value[${i}]`, arr[i]);
      if (e) return e;
    }
  }
  return null;
}

// Filter operator enum guard. BD's filter parser silently substitutes
// unsupported operators (`!=`, `<>`, `IN`, `NOT IN`, `LIKE BINARY`, etc.)
// with `=` semantics and returns the wrong result set with no warning. Same
// false-success class as the SQLi-shape filter bug. The OpenAPI spec declares
// the valid set in `components.parameters.property_operator.enum`, but Zod's
// generated tool schema strips enum constraints from string properties, so
// runtime enforcement is the only line of defense. Reject with the documented
// enum so the agent can switch to a supported operator (`LIKE`, range ops).
// Verified live 2026-04-30 against find-fitness-pros.directoryup.com. BD's WAF
// strips `<`, `>`, `<>`, `%` from URL params before PHP sees them, so symbol
// inequality forms are unreachable on this endpoint — word-form aliases are
// canonical. `=` and `!=` survive the WAF and are accepted server-side; kept
// for back-compat. `is_null` is BD-broken (returns "<table> not found" on rows
// that should match) — excluded until BD fixes; agents fall back to client-side
// pagination per the corpus rule. PR 5166 hardening: BD now returns clean
// errors for unknown operators, CSV-on-single-value, between range/cardinality
// violations, and like-without-wildcard — no more silent fallback to `=`.
const FILTER_OPERATOR_ALLOWED = new Set([
  "eq", "ne", "neq", "lt", "lte", "gt", "gte",
  "=", "!=",
  "in", "not_in",
  "between",
  "like", "not_like", "LIKE",
  "is_not_null",
]);
function validateFilterOperatorInArgs(args) {
  if (!args || typeof args !== "object") return null;
  const check = (label, val) => {
    if (val === undefined || val === null || val === "") return null;
    const s = String(val);
    // BD's operator parser is case-insensitive — match the same way to avoid
    // rejecting `EQ` / `Between` etc. that BD itself accepts.
    const lower = s.toLowerCase();
    const ok = FILTER_OPERATOR_ALLOWED.has(s) || FILTER_OPERATOR_ALLOWED.has(lower);
    if (!ok) {
      return `${label}='${s}' is not a supported filter operator. Allowed (case-insensitive): eq, ne/neq, lt, lte, gt, gte, in, not_in, between, like, not_like, is_not_null. Symbol forms <, >, <>, % are stripped by BD's WAF — use word-form aliases. is_null is currently broken server-side; paginate and filter client-side until BD ships the fix.`;
    }
    return null;
  };
  const e1 = check("property_operator", args.property_operator);
  if (e1) return e1;
  const arr = args["property_operator[]"];
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i++) {
      const e = check(`property_operator[${i}]`, arr[i]);
      if (e) return e;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 0/1 integer-enum validator
// ---------------------------------------------------------------------------
//
// 48 BD fields declare `enum: [0, 1]` in the schema but BD's runtime accepts
// arbitrary integers (verified live: `specialty=42` stored as-is). Front-end
// logic that branches on `=== 1` then silently treats 42 as truthy, and
// analytics counting `= 1` rows miss it. List auto-derived from the spec
// (excluding `active` which is multi-value `1`-`6` on users + `[0,1]` on
// other tables — too ambiguous to validate without per-tool routing).
// Excluded by user-confirmed semantics:
// - active: multi-value 1-6 on users (not [0,1])
// - status: wrapper-managed below (always 1 on createMultiImagePostPhoto)
// - content_layout: empty OR 1 only (0 is not a real BD value)
// - post_status / group_status: 0, 1, OR 3 (3 = pending admin moderation)
const BOOLEAN_INT_FIELDS = new Set([
  "auto_geocode", "auto_image_import", "auto_match",
  "bootstrap_enabled", "category_active", "category_ignore_search_priority",
  "create_new_categories", "data_active", "definitive",
  "enable_search_results_map", "field_required", "form_email_on", "full",
  "hero_hide_banner_ad", "hero_link_target_blank",
  "hide_biennially_amount", "hide_billing_links", "hide_footer",
  "hide_from_menu", "hide_header", "hide_header_links",
  "hide_initial_amount", "hide_monthly_amount", "hide_notifications",
  "hide_parent_accounts", "hide_quarterly_amount", "hide_reviews_rating_options",
  "hide_semiyearly_amount", "hide_specialties", "hide_top_right",
  "hide_triennially_amount", "hide_yearly_amount",
  "limit_available", "menu_active",
  "post_type_cache_system",
  "recommend", "searchable", "send_email_notifications",
  "send_lead_email_notification", "show_form", "signature",
  "specialty", "sub_active", "unsubscribe_link",
]);
function validateBooleanIntInArgs(args) {
  if (!args || typeof args !== "object") return null;
  for (const field of BOOLEAN_INT_FIELDS) {
    const v = args[field];
    if (v === undefined || v === null || v === "") continue;
    const s = String(v);
    if (s !== "0" && s !== "1") {
      return `${field} must be 0 or 1 (got "${s}"). BD does NOT validate this server-side — it stores arbitrary integers verbatim, which silently break front-end branching and analytics that expect 0/1.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// YYYYMMDDHHmmss datetime field validator
// ---------------------------------------------------------------------------
//
// BD's datetime columns (`date_updated`, `signup_date`, `last_login`, etc.)
// are 14-char varchars expecting `YYYYMMDDHHmmss` packed digits. BD does NOT
// validate format server-side — it silently truncates anything longer to fit
// the column, producing garbage like "2026-04-25 10:" from the agent's
// "2026-04-25 10:00:00" ISO input. Admin UI's "Last Update" sort then breaks
// because the truncated value isn't sortable as a real timestamp.
//
// The set of fields below is the union of all BD endpoints declaring
// `Format: YYYYMMDDHHmmss` in their parameter descriptions. Validating only
// when the field is provided (these are usually optional / auto-maintained;
// agents pass them for migration/backfill).
const DATETIME_14_FIELDS = new Set([
  "date_updated", "date_added", "date_created", "date",
  "signup_date", "last_login",
  "post_live_date", "post_start_date", "post_expire_date",
  "lead_matched", "lead_updated",
]);
function validateDatetime14InArgs(args) {
  if (!args || typeof args !== "object") return null;
  for (const field of DATETIME_14_FIELDS) {
    const v = args[field];
    if (v === undefined || v === null || v === "") continue;
    const s = String(v);
    if (!/^\d{14}$/.test(s)) {
      return `${field} must be 14 digits in YYYYMMDDHHmmss format (e.g. "20260425143022"). Got: "${s}". BD does NOT validate this server-side — it silently truncates longer values to fit the 14-char column, producing corrupted timestamps that break admin-UI sort and cache invalidation.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// System-timestamp wire-injection infrastructure.
//
// Why this exists: Phase 1 audit (2026-04-29) confirmed BD's behavior on
// system timestamps is inconsistent across endpoints — some auto-fill cleanly
// (`createReview.review_added`), some leave the column zero (`createTag.created_at`),
// some stamp Eastern time labeled as `+00:00` (`createLead.date_added`), and
// `revision_timestamp` / `modtime` / `widget.date_updated` are NEVER bumped on
// `update*` calls across every table verified — they freeze at create time.
//
// Wrapper-side strategy: for each (tool, field) entry derived from
// TIMESTAMP_TABLE_RULES, write the current site-tz time (resolved via
// getSiteTimezoneCached → getSiteInfo, 10-min TTL, UTC fallback) in the
// declared format directly into bodyParams AFTER the args→params dispatch loop.
// These fields are NOT in input schema — agents never see them, never pass
// them. Wire-level injection means:
//
//   - BD receives a fresh, correctly-formatted timestamp pinned to the site's
//     own timezone (matches what BD admin "Last Update" displays).
//   - No agent-tz leakage; no freeze-on-update bug.
//   - Zero ambiguity: agents have no override path; the field exists only on
//     the wire, controlled by this one registry.
//
// If a backfill / migration use case ever needs an agent override path for a
// specific field, expose it as a separate explicit Bucket-B field in the spec
// — don't try to make this helper dual-purpose. Clean separation: input schema
// is the agent contract; this helper is the wire-level invariant.
//
// Mirrored byte-for-byte from Worker `brilliant-directories-mcp-hosted/src/index.ts`.
// Keep in sync.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-table timestamp rules — DRY source of truth.
//
// Each entry: { tools: { create, update }, fields: [{ field, format, when }] }
// where `when` is one of:
//   "create"    — wrapper writes on create only (set-once: lead_matched, date_created, created_at)
//   "update"    — wrapper writes on update only (BD's DEFAULT fills on create, but BD doesn't bump on update)
//   "both"      — wrapper writes on both create and update (BD doesn't fill OR bump)
//
// Source of truth: live BD probes 2026-04-29 verifying actual create + update
// behavior on every table. Schema declarations (`ON UPDATE current_timestamp()`)
// are NOT reliable — BD's PHP layer doesn't trigger MySQL's auto-bump.
//
// Format key:
//   "14" → varchar(14) packed `YYYYMMDDHHmmss`
//   "19" → datetime/timestamp `YYYY-MM-DD HH:MM:SS`
//
// Mirrored byte-for-byte from Worker `brilliant-directories-mcp-hosted/src/index.ts`.
// ---------------------------------------------------------------------------

const TIMESTAMP_TABLE_RULES = [
  { create: "createWebPage", update: "updateWebPage", fields: [
    { field: "date_updated",        format: "14", when: "both" },
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createWidget", update: "updateWidget", fields: [
    { field: "date_updated",        format: "14", when: "both" },
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createForm",         update: "updateForm",         fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createFormField",    update: "updateFormField",    fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createMenu",         update: "updateMenu",         fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createMenuItem",     update: "updateMenuItem",     fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createTopCategory",  update: "updateTopCategory",  fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createSubCategory",  update: "updateSubCategory",  fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { create: "createDataType",     update: "updateDataType",     fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },
  { update: "updatePostType",                                   fields: [{ field: "revision_timestamp", format: "19", when: "update" }] },
  { create: "createMembershipPlan", update: "updateMembershipPlan", fields: [{ field: "revision_timestamp", format: "19", when: "both" }] },

  { create: "createSingleImagePost", update: "updateSingleImagePost", fields: [
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createMultiImagePost", update: "updateMultiImagePost", fields: [
    { field: "date_updated",        format: "14", when: "both" },
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createMultiImagePostPhoto", update: "updateMultiImagePostPhoto", fields: [
    { field: "photo_date_added",   format: "14", when: "create" },
    { field: "photo_date_updated", format: "14", when: "both" },
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createEmailTemplate", update: "updateEmailTemplate", fields: [
    { field: "date_created",       format: "14", when: "create" },
    { field: "revision_timestamp", format: "19", when: "both" },
  ]},
  { create: "createTag", update: "updateTag", fields: [
    { field: "created_at", format: "19", when: "create" },
    { field: "updated_at", format: "19", when: "both" },
  ]},
  { create: "createTagGroup", update: "updateTagGroup", fields: [
    { field: "created_at", format: "19", when: "create" },
    { field: "updated_at", format: "19", when: "both" },
  ]},
  { create: "createTagRelationship", fields: [
    { field: "created_at", format: "19", when: "create" },
  ]},
  { create: "createSmartList", fields: [
    { field: "smart_list_created", format: "19", when: "create" },
  ]},
  { update: "updateReview", fields: [
    { field: "review_updated",     format: "14", when: "update" },
    { field: "revision_timestamp", format: "19", when: "update" },
  ]},
  { update: "updateLead", fields: [
    { field: "revision_timestamp", format: "19", when: "update" },
  ]},
  { create: "createLeadMatch", update: "updateLeadMatch", fields: [
    { field: "lead_matched", format: "14", when: "create" },
    { field: "lead_updated", format: "14", when: "both" },
  ]},
  { update: "updateUser", fields: [
    { field: "modtime", format: "19", when: "update" },
  ]},
  { update: "updateUserMeta", fields: [
    { field: "revision_timestamp", format: "19", when: "update" },
  ]},
  { create: "createUserPhoto", fields: [
    { field: "date_added", format: "14", when: "create" },
  ]},
];

// Lookup table generated from TIMESTAMP_TABLE_RULES at module load.
const SYSTEM_TIMESTAMP_FIELDS = (() => {
  const out = {};
  for (const rule of TIMESTAMP_TABLE_RULES) {
    if (rule.create) {
      const fields = rule.fields.filter(f => f.when === "create" || f.when === "both").map(f => ({ field: f.field, format: f.format }));
      if (fields.length > 0) out[rule.create] = fields;
    }
    if (rule.update) {
      const fields = rule.fields.filter(f => f.when === "update" || f.when === "both").map(f => ({ field: f.field, format: f.format }));
      if (fields.length > 0) out[rule.update] = fields;
    }
  }
  return out;
})();

// Site-timezone resolver with module-scope cache. All wrapper-owned timestamps
// render in this site's local time so values stored in BD match what the
// customer's admin UI will display — no UTC↔local skew. TTL: 10 minutes.
// Fallback to "UTC" only on `getSiteInfo` fetch failure (warn logged).
const _siteTzCache = new Map();
const _SITE_TZ_TTL_MS = 10 * 60 * 1000;
async function getSiteTimezoneCached(baseUrl, apiKey) {
  const cacheKey = baseUrl;
  const cached = _siteTzCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < _SITE_TZ_TTL_MS) return cached.tz;
  // Normalize: ensure base ends without trailing slash, has protocol.
  let normalized = baseUrl;
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  normalized = normalized.replace(/\/+$/, "");
  let tz = "UTC";
  try {
    const resp = await fetch(`${normalized}/api/v2/site_info/get`, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });
    if (resp.ok) {
      const body = await resp.json();
      const fetched = body?.message?.timezone;
      if (typeof fetched === "string" && fetched.length > 0) tz = fetched;
      else console.warn(`[getSiteTimezoneCached] ${cacheKey}: getSiteInfo returned no timezone, falling back to UTC`);
    } else {
      console.warn(`[getSiteTimezoneCached] ${cacheKey}: getSiteInfo HTTP ${resp.status}, falling back to UTC`);
    }
  } catch (err) {
    console.warn(`[getSiteTimezoneCached] ${cacheKey}: getSiteInfo failed (${err?.message || err}), falling back to UTC`);
  }
  _siteTzCache.set(cacheKey, { tz, fetchedAt: Date.now() });
  return tz;
}

// Format current time as 14-char `YYYYMMDDHHmmss` in the given IANA timezone.
function _formatNow14InTz(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value || "00";
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}${hh}${get("minute")}${get("second")}`;
}

// Format current time as 19-char `YYYY-MM-DD HH:mm:ss` in the given IANA timezone.
function _formatNow19InTz(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value || "00";
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hh}:${get("minute")}:${get("second")}`;
}

// Wrapper-side wire-injector. For every (field, format) declared in
// SYSTEM_TIMESTAMP_FIELDS[toolName], write the current site-local time directly
// into bodyParams. Always overwrites — these fields are not in input schema,
// so agents have no override path. Caller passes the resolved tz string; this
// function does not fetch.
function autoDefaultSystemTimestamps(toolName, bodyParams, tz) {
  const entries = SYSTEM_TIMESTAMP_FIELDS[toolName];
  if (!entries || !bodyParams || typeof bodyParams !== "object") return bodyParams;
  for (const { field, format } of entries) {
    bodyParams[field] = format === "14" ? _formatNow14InTz(tz) : _formatNow19InTz(tz);
  }
  return bodyParams;
}

// ---------------------------------------------------------------------------
// Slug uniqueness — universal helper
// ---------------------------------------------------------------------------
//
// BD does NOT enforce slug uniqueness server-side, and the public router
// uses ONE site-wide URL namespace shared by web pages, top categories,
// sub categories, and plan public URLs. A duplicate in any of those four
// tables produces non-deterministic render order. Plan checkout URLs and
// post slugs have their own scoped pools.
//
// `reserveSiteUrlSlug` is called once per create/update on slug-bearing
// resources. It probes the right tables in parallel, then either:
//   - returns ok:true with the original slug (no collision)
//   - returns ok:true with a suffixed slug + adjusted info (categories only,
//     when collision found — auto-suffix `-1`, `-2`, ... up to MAX)
//   - returns ok:false with an actionable error (everything else, or when
//     auto-suffix exhausts MAX attempts)
//
// Mirrored byte-for-byte in the Worker `src/index.ts`. Keep in sync.

const SITE_NAMESPACE_TABLES = [
  { table: "list_seo",           field: "filename",              ownIdField: "seo_id",          label: "web page" },
  { table: "list_professions",   field: "filename",              ownIdField: "profession_id",   label: "top category" },
  { table: "list_services",      field: "filename",              ownIdField: "service_id",      label: "sub category" },
  { table: "subscription_types", field: "subscription_filename", ownIdField: "subscription_id", label: "membership plan" },
  { table: "users_data",         field: "filename",              ownIdField: "user_id",         label: "member profile" },
];

// BD-table → REST-endpoint translation. BD's public REST API exposes some
// tables under different path segments than the underlying SQL table name.
// Verified live: `users_data` is `/api/v2/user/*`, NOT `/api/v2/users_data/*`
// (which 404s). Any helper that builds `/api/v2/<table>/...` URLs MUST
// translate via this map first. Wrapper-managed; agents never see it.
//
// One source of truth — add new mismatches here as BD adds tables/endpoints.
// Tables NOT in the map default to using their literal name as the endpoint.
const TABLE_TO_ENDPOINT = {
  users_data: "user",
};
function _tableEndpoint(table) {
  return TABLE_TO_ENDPOINT[table] || table;
}
const SLUG_AUTO_SUFFIX_MAX = 20;
const SLUG_AUTO_SUFFIX_QUIET_THRESHOLD = 4; // suffixes 1-3 are silent; 4+ surfaces _slug_adjusted

// Per-tool routing. Static map = no pattern-matching surprises if BD adds tools.
//   slugField:    which arg holds the slug
//   scope:        'site' | 'plans-checkout' | 'post-type'
//   ownTable:     the resource's own table (excluded from collision scan on update)
//   ownIdField:   the primary-key arg name (for update self-exclusion)
//   autoSuffix:   true = categories (auto -1, -2, ...); false = everything else (reject)
//   postTypeField: required when scope='post-type' (the data_id arg)
//   allowSlash:   true = nested-path slugs allowed (web pages "parent/child",
//                 posts "posttype/post-slug"); false = single-segment only
//                 (categories + plans). Backslash is universally blocked.
//   allowEmpty:   true = empty string is a valid passthrough (membership plans
//                 only — BD allows plans without a public URL); false = empty
//                 is a hard reject (slug is required on these resources).
const SLUG_TOOL_CONFIG = {
  createWebPage:        { slugField: "filename",              scope: "site",            ownTable: "list_seo",          ownIdField: null,           autoSuffix: false, allowSlash: true,  allowEmpty: false },
  updateWebPage:        { slugField: "filename",              scope: "site",            ownTable: "list_seo",          ownIdField: "seo_id",       autoSuffix: false, allowSlash: true,  allowEmpty: false },
  createTopCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_professions",  ownIdField: null,           autoSuffix: true,  allowSlash: false, allowEmpty: false },
  updateTopCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_professions",  ownIdField: "profession_id", autoSuffix: true,  allowSlash: false, allowEmpty: false },
  createSubCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_services",     ownIdField: null,           autoSuffix: true,  allowSlash: false, allowEmpty: false },
  updateSubCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_services",     ownIdField: "service_id",   autoSuffix: true,  allowSlash: false, allowEmpty: false },
  createMembershipPlan: { slugField: "subscription_filename", scope: "site",            ownTable: "subscription_types", ownIdField: null,           autoSuffix: false, allowSlash: false, allowEmpty: true  },
  updateMembershipPlan: { slugField: "subscription_filename", scope: "site",            ownTable: "subscription_types", ownIdField: "subscription_id", autoSuffix: false, allowSlash: false, allowEmpty: true  },
  // member profile filename — site-wide URL namespace (cross-collides with
  // web pages, categories, plans). Path-style slug (state/city/cat/name).
  // BD auto-generates if absent; agents rarely pass it but when they do it
  // must not collide. allowEmpty:true so omitting is fine.
  createUser:           { slugField: "filename",              scope: "site",            ownTable: "users_data",        ownIdField: null,           autoSuffix: false, allowSlash: true,  allowEmpty: true  },
  updateUser:           { slugField: "filename",              scope: "site",            ownTable: "users_data",        ownIdField: "user_id",      autoSuffix: false, allowSlash: true,  allowEmpty: true  },
  // post slugs are scoped per-post-type; pass the post-type's data_id alongside the slug
  updateSingleImagePost: { slugField: "post_filename",  scope: "post-type", ownTable: "data_posts",                ownIdField: "post_id",  postTypeField: "data_id", autoSuffix: false, allowSlash: true,  allowEmpty: false },
  updateMultiImagePost:  { slugField: "group_filename", scope: "post-type", ownTable: "users_portfolio_groups",    ownIdField: "group_id", postTypeField: "data_id", autoSuffix: false, allowSlash: true,  allowEmpty: false },
};

/** Normalize a slug for comparison — match BD's URL router behavior.
 *  BD's `=` filter on slug columns is case-insensitive and trims whitespace,
 *  AND BD's public URL router treats `/foo`, `/Foo`, and `/FOO` as the same
 *  page (`/foo`, `/Foo`, `/FOO` all render the same record). A duplicate-
 *  detection check must therefore match case-insensitively + whitespace-
 *  trimmed; otherwise a "Restaurants" probe against existing "restaurants"
 *  would falsely report no collision and BD would create a routing-conflict
 *  duplicate. */
function _normalizeSlug(s) {
  return String(s).trim().toLowerCase();
}

/** Validate slug format. Rejects:
 *  (a) whitespace OR zero-width / invisible characters (\s plus the
 *      explicit class for soft-hyphen, ZWSP/ZWNJ/ZWJ, format-control,
 *      BOM — invisible chars NOT covered by \s).
 *  (b) backslash and URL-reserved/structural chars (?, #, &, %, <, >, ")
 *      that always break BD routing.
 *  (c) forward slash unless allowSlash=true. When slash IS allowed, the
 *      path structure is validated: no leading or trailing slash, no
 *      empty segments (double slash). Caller must pre-coerce to string;
 *      non-string handling lives at the call site for clearer errors.
 *  Emoji and unicode (CJK, Cyrillic, Arabic, etc.) are deliberately allowed
 *  — BD supports them in URLs. */
// Length caps for slugs. 200 chars total, 100 per segment. Matches CMS/CDN
// conventions; prevents runaway-long URLs that break browsers/email clients.
const SLUG_MAX_LENGTH = 200;
const SLUG_SEGMENT_MAX_LENGTH = 100;
const SLUG_MAX_SEGMENTS = 10;

// BD reserved-route prefixes — slugs whose FIRST segment matches one of
// these would shadow built-in BD routes. Reject upfront. Add new entries
// as BD reserves more top-level routes; comparison is case-insensitive
// (matches BD router behavior).
const SLUG_RESERVED_FIRST_SEGMENTS = new Set([
  "admin",     // BD admin panel
  "account",   // member account / billing pages
  "checkout",  // signup + plan checkout flow
  "api",       // BD REST API at /api/v2/*
  "photos",    // member photo gallery routes
]);

// Caller-bug fingerprint literals — strings that almost always represent
// `String(null)` / `String(undefined)` / `String(NaN)` upstream coercion
// in a buggy caller, not a real intent. JSON-schema `type:string` doesn't
// catch these because they ARE valid strings. Whole-segment match,
// case-insensitive — so `null` rejects but `null-experience` and `null-result`
// still pass.
const SLUG_CALLER_BUG_LITERALS = new Set([
  "null",
  "undefined",
  "nan",
]);

// Decode an `xn--*` Punycode label into its Unicode form for validation
// purposes. Returns the decoded string, or null if the label is malformed
// (in which case the caller falls back to validating the raw label).
// Node's `URL` constructor decodes IDN host labels automatically; we wrap
// the segment as a fake hostname to leverage that without pulling in the
// (deprecated) `punycode` module.
function _tryPunycodeDecode(label) {
  try {
    const u = new URL(`http://${label}.invalid`);
    const host = u.hostname; // already lowercased + IDN-decoded
    const idx = host.lastIndexOf(".invalid");
    return idx > 0 ? host.slice(0, idx) : null;
  } catch {
    return null;
  }
}

function _validateSlugFormat(slug, fieldLabel, allowSlash) {
  if (typeof slug !== "string") return null;
  // Length cap (full slug). Browsers/CDNs typically cap URLs ~2000 chars;
  // most CMSes cap slugs ~200. Hard cap before any other check to avoid
  // wasting cycles on a deliberately massive payload.
  if (slug.length > SLUG_MAX_LENGTH) {
    return `${fieldLabel} is ${slug.length} chars (max ${SLUG_MAX_LENGTH}). BD URL slugs over this length break browsers, CDNs, and email clients.`;
  }
  // Reject NFKC-non-canonical slugs. NFKC compatibility-decomposes
  // Unicode chars that visually look like other chars (e.g. `ﬃ`
  // U+FB03 → `ffi`, full-width digits → ASCII digits, etc.). Two
  // slugs that decompose to the same canonical form should be the
  // SAME slug; allowing both creates phishing-equivalent duplicates
  // that bypass the duplicate-pair guard. We reject the non-
  // canonical form and tell the agent to use the decomposed version.
  const normalized = slug.normalize("NFKC");
  if (normalized !== slug) {
    return `${fieldLabel} '${slug}' contains characters that decompose to a different form under Unicode NFKC normalization (canonical: '${normalized}'). Use the canonical form to avoid creating phishing-equivalent duplicates.`;
  }
  if (/[\s­​-‏⁠-⁤﻿]/.test(slug)) {
    return `${fieldLabel} '${slug}' contains whitespace or invisible characters, which are not allowed in BD URLs. Use hyphens instead (e.g. 'my-page' not 'my page').`;
  }
  // Control + bidi chars (\p{C} = control + format + private-use, covers
  // RTL override U+202E + every C0/C1 control + ZWSP-class redundantly).
  // Future-proof: new Unicode releases that add bidi-control or format
  // chars are auto-rejected without spec maintenance.
  if (/\p{C}/u.test(slug)) {
    return `${fieldLabel} '${slug}' contains control or bidi-override characters (e.g. RTL override U+202E). These enable phishing-display attacks where a slug visually renders differently than its actual content.`;
  }
  // Trailing dot: some routers (IIS, Windows) normalize trailing dots
  // away, making `about.` a duplicate-equivalent of `about`. Reject so
  // both can't coexist on platforms with that quirk.
  if (slug.endsWith(".")) {
    return `${fieldLabel} '${slug}' ends with a dot. Some web servers (IIS, Windows) silently strip trailing dots, making the slug a duplicate of the same name without the dot. Remove the trailing dot.`;
  }
  // URL-reserved chars + RFC 3986 reserved chars + chars that enable
  // phishing-link shapes (`javascript:alert(1)` via `:` + `(` + `)`).
  // Asymmetric reject of `'` vs `"` in earlier versions left an SQLi-shape
  // gap. Now both blocked.
  // BD URL slugs (`filename`, `subscription_filename`, `post_filename`,
  // `group_filename`) never use these characters in practice — social-link
  // fields like `instagram`/`twitter`/`facebook` are SEPARATE fields with
  // their own validation, so rejecting `@` here doesn't affect those.
  if (/[\\?#&%<>"':@;|\[\]{}=()]/.test(slug)) {
    return `${fieldLabel} '${slug}' contains URL-reserved or unsafe characters. Use only letters, digits, hyphens, underscores, and dots (and slashes for nested paths where allowed).`;
  }
  // Structural rules:
  //   (a) cannot start with `-` (anti-pattern; many CMS validators reject)
  //   (b) cannot start with `.` (dotfile shape; could shadow .htaccess)
  //   (c) must contain at least one alphanumeric or unicode letter — pure
  //       punctuation slugs like `---` or `...` route but are useless URLs
  //       and indicate accidental input.
  //   (d) per-segment length cap.
  //   (e) homoglyph guard: each segment must use a SINGLE Unicode script
  //       for letter chars (Latin only OR Cyrillic only OR CJK only,
  //       not Latin + Cyrillic mixed = phishing). ASCII digits, hyphens,
  //       dots, and emoji are script-neutral and don't trigger the rule.
  // Per-segment: applied to the WHOLE slug for non-slash case, and to
  // EACH segment for nested paths (so `valid-slug/-bad` is rejected on
  // the second segment).
  const checkSegment = (seg, label) => {
    if (seg.length > SLUG_SEGMENT_MAX_LENGTH) {
      return `${fieldLabel} '${slug}' has a ${seg.length}-char segment (${label}, max ${SLUG_SEGMENT_MAX_LENGTH}). Each path segment must stay under the cap to avoid CDN/browser truncation.`;
    }
    if (seg.startsWith("-")) {
      return `${fieldLabel} '${slug}' has a segment starting with '-' (${label}). BD URL slugs cannot start with a hyphen.`;
    }
    if (seg.startsWith(".")) {
      return `${fieldLabel} '${slug}' has a segment starting with '.' (${label}). Leading-dot filenames could shadow Apache config and aren't valid BD URL slugs.`;
    }
    // Trailing dot on a segment: IIS/Windows strip trailing dots, making
    // `parent/middle../child` collide with `parent/middle/child`. Whole-slug
    // trailing dot is already rejected above; this catches the per-segment
    // case for nested paths.
    if (seg.endsWith(".")) {
      return `${fieldLabel} '${slug}' has a segment ending with '.' (${label}). Some web servers strip trailing dots from path segments, creating duplicate-equivalent collisions. Remove trailing dots from each segment.`;
    }
    // Punycode (IDN) prefix: `xn--<ascii>` is the wire encoding for Unicode
    // labels. International customers (Asian/RTL/Cyrillic markets) pass
    // legitimate Punycode-encoded slugs through external import pipelines;
    // rejecting on prefix would block them. Instead, decode transparently
    // so the script-uniformity check below sees the actual Unicode chars
    // and the homoglyph guard validates the real label, not the ASCII wire.
    // The stored slug stays in its original form (we don't rewrite); we
    // only decode for the purpose of validation.
    let segForChecks = seg;
    if (/^xn--/i.test(seg)) {
      const decoded = _tryPunycodeDecode(seg);
      if (decoded !== null) segForChecks = decoded;
    }
    // Require at least one alphanumeric ASCII char OR unicode letter (CJK, emoji, accented).
    if (!/[a-zA-Z0-9]/.test(segForChecks) && !/\p{L}/u.test(segForChecks) && !/\p{Extended_Pictographic}/u.test(segForChecks)) {
      return `${fieldLabel} '${slug}' has a segment with no letters or digits (${label}). Each path segment must contain at least one alphanumeric character.`;
    }
    // Homoglyph guard: detect mixed-script segments.
    // Letters in two distinct non-Common scripts within one segment are
    // almost always a homoglyph attack (Cyrillic 'а' vs Latin 'a'). Walk
    // each letter, collect its Script property; if >1 script appears,
    // reject. Common script (digits, punctuation, emoji) doesn't count.
    const scripts = new Set();
    for (const ch of segForChecks) {
      // Only inspect letters. Numbers, hyphens, dots, emoji are neutral.
      if (!/\p{L}/u.test(ch)) continue;
      // Map char to its primary script via regex tests against named
      // Script properties. Order matters — most specific first.
      let scriptName = null;
      if (/\p{Script=Latin}/u.test(ch)) scriptName = "Latin";
      else if (/\p{Script=Cyrillic}/u.test(ch)) scriptName = "Cyrillic";
      else if (/\p{Script=Greek}/u.test(ch)) scriptName = "Greek";
      else if (/\p{Script=Han}/u.test(ch)) scriptName = "Han"; // CJK Chinese
      else if (/\p{Script=Hiragana}/u.test(ch)) scriptName = "Hiragana";
      else if (/\p{Script=Katakana}/u.test(ch)) scriptName = "Katakana";
      else if (/\p{Script=Hangul}/u.test(ch)) scriptName = "Hangul"; // Korean
      else if (/\p{Script=Arabic}/u.test(ch)) scriptName = "Arabic";
      else if (/\p{Script=Hebrew}/u.test(ch)) scriptName = "Hebrew";
      else if (/\p{Script=Thai}/u.test(ch)) scriptName = "Thai";
      else if (/\p{Script=Devanagari}/u.test(ch)) scriptName = "Devanagari";
      else scriptName = "Other";
      // Treat Hiragana+Katakana+Han as compatible (Japanese mixes them).
      if (scriptName === "Hiragana" || scriptName === "Katakana" || scriptName === "Han") {
        scripts.add("CJK");
      } else {
        scripts.add(scriptName);
      }
    }
    if (scripts.size > 1) {
      return `${fieldLabel} '${slug}' has a segment mixing multiple writing systems (${label}: ${[...scripts].join(" + ")}). Mixed-script slugs are usually homoglyph phishing attacks (e.g. Cyrillic 'а' visually impersonating Latin 'a'). Use a single script per segment.`;
    }
    return null;
  };
  if (slug.includes("/")) {
    if (!allowSlash) {
      return `${fieldLabel} '${slug}' contains a slash, which is not allowed for this resource (categories and plans must be single-segment slugs). Use hyphens instead.`;
    }
    // Slash IS allowed (web pages, posts) — validate path structure: no
    // leading slash, no trailing slash, no empty segments (double slash).
    if (slug.startsWith("/")) {
      return `${fieldLabel} '${slug}' starts with a slash. Slugs cannot have a leading slash — write 'parent/child' not '/parent/child'.`;
    }
    if (slug.endsWith("/")) {
      return `${fieldLabel} '${slug}' ends with a slash. Slugs cannot have a trailing slash — write 'parent/child' not 'parent/child/'.`;
    }
    if (slug.includes("//")) {
      return `${fieldLabel} '${slug}' contains a double slash. Each path segment must be non-empty — write 'parent/child' not 'parent//child'.`;
    }
    // Per-segment checks: dot-segment guard + structural rules.
    const segments = slug.split("/");
    // Path-depth cap. BD's deepest legitimate hierarchy is country/state/
    // city/category/subcategory/post (~6 segments); 10 leaves headroom for
    // unusual taxonomies and rejects DoS-shape paths (router recursive
    // segment lookup blowup).
    if (segments.length > SLUG_MAX_SEGMENTS) {
      return `${fieldLabel} '${slug}' has ${segments.length} path segments (max ${SLUG_MAX_SEGMENTS}). Deep paths slow the BD router and rarely reflect real hierarchies. Flatten the structure.`;
    }
    // Reserved-route guard — only the FIRST segment shadows a built-in
    // route. Case-insensitive to match BD's router (which is itself case-
    // insensitive on path matching).
    if (SLUG_RESERVED_FIRST_SEGMENTS.has(segments[0].toLowerCase())) {
      return `${fieldLabel} '${slug}' starts with the reserved BD route '${segments[0]}'. This shadows a built-in BD route (admin panel, account, checkout, api, photos) and breaks page routing. Pick a different first segment.`;
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg === "." || seg === "..") {
        return `${fieldLabel} '${slug}' contains a '${seg}' path segment. Dot-segments are not allowed — BD URLs use plain alphanumeric/hyphen segments.`;
      }
      // Caller-bug literal guard — `null`/`undefined`/`nan` as a whole
      // segment is almost always upstream `String(<bad value>)` coercion,
      // not real intent. Hyphenated forms like `null-experience` pass.
      if (SLUG_CALLER_BUG_LITERALS.has(seg.toLowerCase())) {
        return `${fieldLabel} '${slug}' has a segment that is the literal string '${seg}'. This usually means an upstream caller passed null/undefined/NaN and JS coerced it to a string. Pass a real slug instead.`;
      }
      const segErr = checkSegment(seg, `segment ${i + 1}`);
      if (segErr) return segErr;
    }
  } else {
    // Single-segment slug: dot-segment guard + structural rules + reserved.
    if (slug === "." || slug === "..") {
      return `${fieldLabel} '${slug}' is a dot-segment. Use plain alphanumeric/hyphen slugs.`;
    }
    if (SLUG_RESERVED_FIRST_SEGMENTS.has(slug.toLowerCase())) {
      return `${fieldLabel} '${slug}' is a reserved BD route. This shadows a built-in BD route (admin panel, account, checkout, api, photos) and breaks page routing. Pick a different name.`;
    }
    if (SLUG_CALLER_BUG_LITERALS.has(slug.toLowerCase())) {
      return `${fieldLabel} '${slug}' is the literal string '${slug}'. This usually means an upstream caller passed null/undefined/NaN and JS coerced it to a string. Pass a real slug instead.`;
    }
    const segErr = checkSegment(slug, "whole slug");
    if (segErr) return segErr;
  }
  return null;
}

// profile_search_results segment-binding validator. BD's dynamic router
// resolves /seo_type=profile_search_results URLs only when each slug segment
// maps to a real BD record at a position-valid hierarchy slot
// (country/state/city/top/sub, strict order, any subset valid as long as
// relative order is preserved). Without this guard the wrapper accepts
// arbitrary slugs and BD silent-404s the public URL — agent gets `success`
// but the page renders no member results. Walk segments left-to-right;
// each segment must match a slot at-or-after the previously locked floor.
// Falls open with a soft warning on transient probe failure (same fail-open
// pattern as slug-uniqueness probes — block real rejects, not flakes).
async function _validateProfileSearchResultsSegments(config, args, effectiveSeoType) {
  const seoType = String((effectiveSeoType !== undefined ? effectiveSeoType : args.seo_type) || "").toLowerCase();
  if (seoType !== "profile_search_results") return null;
  if (typeof args.filename !== "string" || args.filename === "") return null;

  const segments = args.filename.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // Pre-fetch countries once (no country_filename column — derive slug from name)
  let countries = null;
  let countryProbeFailed = false;
  const tryCountry = async (seg) => {
    if (countries === null && !countryProbeFailed) {
      try {
        const r = await makeRequest(config, "GET", "/api/v2/list_countries/get", { limit: 250 }, null);
        countries = (r && r.body && Array.isArray(r.body.message))
          ? r.body.message.map((c) => String(c.country_name || "").toLowerCase().replace(/\s+/g, "-"))
          : [];
      } catch {
        countryProbeFailed = true;
        countries = [];
      }
    }
    return countries.includes(seg.toLowerCase());
  };

  const slots = ["country", "state", "city", "top", "sub"];
  let floor = 0;
  const validated = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let matched = -1;
    let segProbeFailures = 0;
    let segProbeAttempts = 0;
    for (let s = floor; s < slots.length; s++) {
      let hit = false;
      let probeFailed = false;
      segProbeAttempts++;
      try {
        if (slots[s] === "country") {
          hit = await tryCountry(seg);
          if (countryProbeFailed) probeFailed = true;
        } else {
          let table, field;
          if (slots[s] === "state")     { table = "location_states";   field = "state_filename"; }
          else if (slots[s] === "city") { table = "location_cities";   field = "city_filename"; }
          else if (slots[s] === "top")  { table = "list_professions";  field = "filename"; }
          else if (slots[s] === "sub")  { table = "list_services";     field = "filename"; }
          const rows = await _slugProbeTable(config, table, field, seg, 1);
          if (rows === null) probeFailed = true;
          else hit = rows.length > 0;
        }
      } catch {
        probeFailed = true;
      }
      if (probeFailed) segProbeFailures++;
      if (hit) { matched = s; break; }
    }
    if (matched < 0) {
      // Fall open only if EVERY probe attempt for THIS segment failed
      // transiently (BD outage / per-key permission gating). Per-segment
      // counters — accumulating across segments would mask real rejects.
      if (segProbeAttempts > 0 && segProbeFailures === segProbeAttempts) {
        return { ok: true, segment_warning: `profile_search_results segment validation could not run on '${args.filename}' — BD probes failed transiently. Page write allowed; verify the slug renders publicly post-write.` };
      }
      return {
        error: `Slug '${args.filename}' isn't a valid profile_search_results page — segment ${i + 1} ('${seg}') doesn't map to any country/state/city/top-category/sub-category at this position (slug segments must match live BD lookups and follow the order country/state/city/top/sub). Surface this choice to the user before retrying: (a) keep the URL by changing seo_type to 'content' so this becomes a regular content page (different rendering — no member search results); or (b) keep search-results behavior by picking a slug that maps to real categories/locations. Do not pick on the user's behalf.`,
      };
    }
    validated.push({ slot: slots[matched], value: seg });
    floor = matched + 1;
  }
  return { ok: true, segments_validated: validated };
}

/** Look up rows in one BD table whose `field` equals the slug. */
async function _slugProbeTable(config, table, field, slug, limit) {
  try {
    // BD-table → REST-endpoint translation (e.g. users_data → user). See
    // TABLE_TO_ENDPOINT for the source of truth. Without this, the probe
    // hits a non-existent path, falls into transient-failure handling,
    // and lets cross-namespace collisions through silently.
    const endpoint = _tableEndpoint(table);
    const result = await makeRequest(
      config,
      "GET",
      `/api/v2/${endpoint}/get`,
      { property: field, property_value: String(slug), property_operator: "=", limit: limit || 5 },
      null
    );
    // BD's empty-result quirk: a property-filtered /get with zero matches
    // returns HTTP 400 with `{status: "error", message: "<table> not found"}`.
    // That's NOT a probe failure — it's a confirmed "no rows." Treat as [].
    // Genuine probe failures (5xx, network, parse fail, unrelated 4xx) still
    // return null so the caller can fall open with a warning.
    if (result && result.status === 400 &&
        result.body && result.body.status === "error" &&
        typeof result.body.message === "string" &&
        / not found$/.test(result.body.message)) {
      return [];
    }
    if (result && result.status >= 400) return null;
    const rows = result && result.body && Array.isArray(result.body.message) ? result.body.message : [];
    // Client-side filter mirrors BD's case-insensitive + whitespace-trimmed
    // matching. Without normalization here, a row BD returned (because BD's
    // own filter case-insensitively matched it) could be incorrectly
    // discarded by us, leading to false-negative collision detection.
    const target = _normalizeSlug(slug);
    return rows.filter((r) => r && _normalizeSlug(r[field]) === target);
  } catch {
    return null; // signals probe-failure to caller
  }
}

/**
 * Reserve a slug for the given tool call.
 * Returns one of:
 *   { ok: true, slug: <final>, adjusted?: { from, to, reason } }
 *   { ok: false, error: <message> }
 *   null (tool isn't slug-managed; caller proceeds normally)
 */
async function reserveSiteUrlSlug(config, toolName, args) {
  const cfg = SLUG_TOOL_CONFIG[toolName];
  if (!cfg || !args || typeof args !== "object") return null;
  const proposed = args[cfg.slugField];
  // Field absent — agent didn't pass it. No-op (let BD do whatever it does).
  if (proposed === undefined || proposed === null) return null;
  // Type check: must be a string. Without this, an array silently coerces
  // to "a,b" and a number to "12345" — both store wrong data without warning.
  if (typeof proposed !== "string") {
    return { ok: false, error: `${cfg.slugField} must be a string (got ${Array.isArray(proposed) ? "array" : typeof proposed}). Pass the slug as a plain string (e.g. "my-page").` };
  }
  // Empty string — only valid for resources where allowEmpty=true (membership
  // plans). For everything else (web pages, categories, posts) the slug is
  // required and an empty string is a hard reject.
  if (proposed === "") {
    if (cfg.allowEmpty) return null;
    return { ok: false, error: `${cfg.slugField} is required and cannot be empty for ${toolName}.` };
  }

  // Format validation: reject whitespace/invisible/URL-reserved chars,
  // 4-byte chars, and bad slash placement before any network work.
  const formatErr = _validateSlugFormat(proposed, cfg.slugField, cfg.allowSlash);
  if (formatErr) return { ok: false, error: formatErr };

  const ownId = cfg.ownIdField && args[cfg.ownIdField] !== undefined && args[cfg.ownIdField] !== null
    ? String(args[cfg.ownIdField])
    : null;

  // Track probe failures so we can surface them on the response. A failed
  // probe is treated as "no collision detected on that table" so we don't
  // block writes on transient BD errors — but the agent should know we
  // couldn't fully verify, so they can re-check post-write if needed.
  const probeFailures = [];
  // Build collision-detection function based on scope.
  const isCollision = async (slug) => {
    if (cfg.scope === "site") {
      // Probe all 5 site-namespace tables. SERIAL not parallel — BD's PHP-FPM
      // / LiteSpeed setup drops 4 of 5 simultaneous requests from the same
      // client (verified live: parallel probes consistently surface
      // _slug_probe_warning across 4 tables; serial probes succeed). The
      // ~800ms total latency only applies to slug-bearing writes (12 tools)
      // and is the price of the cross-namespace collision safety net
      // actually running. limit=25 not 5 — handles the historical case
      // where BD has multiple same-slug rows in one table; with limit=5 +
      // ownId-self-exclusion we could miss a collision on row 6+.
      const probes = [];
      for (const t of SITE_NAMESPACE_TABLES) {
        const rows = await _slugProbeTable(config, t.table, t.field, slug, 25);
        probes.push({ ...t, rows });
      }
      // Find first non-self conflict.
      for (const p of probes) {
        if (p.rows === null) {
          probeFailures.push(p.table);
          continue; // probe failed; non-fatal but recorded
        }
        for (const row of p.rows) {
          // Self-exclusion: only on update, only same table + same id.
          if (ownId && p.table === cfg.ownTable && String(row[p.ownIdField]) === ownId) continue;
          // profile_search_results override pattern: web pages with seo_type=
          // profile_search_results are intentionally meant to shadow a
          // category's auto-generated search-results URL (e.g. a richer
          // pillar page at /strength-training that overrides the auto-page
          // for service_id=3). For this specific seo_type, a slug match in
          // list_services / list_professions is the *intended* relationship,
          // not a collision. Real collisions (another web page, a member,
          // a plan) still reject. Other seo_types still reject category
          // overlaps.
          if (
            (toolName === "createWebPage" || toolName === "updateWebPage") &&
            String(args.seo_type || "").toLowerCase() === "profile_search_results" &&
            (p.table === "list_services" || p.table === "list_professions")
          ) {
            continue;
          }
          // Inverse override pattern: when renaming/creating a category and
          // the colliding row is a profile_search_results web page in
          // list_seo, that's the intentional pairing (page + category share
          // slug so BD's router resolves to the page and the page queries
          // the category's members). Real list_seo collisions (other
          // seo_types) still reject. Mirrors the create/update WebPage
          // exception above the other direction.
          if (
            (toolName === "createSubCategory" || toolName === "updateSubCategory" ||
             toolName === "createTopCategory" || toolName === "updateTopCategory") &&
            p.table === "list_seo" &&
            String(row.seo_type || "").toLowerCase() === "profile_search_results"
          ) {
            continue;
          }
          return { table: p.table, label: p.label, id: row[p.ownIdField], idField: p.ownIdField };
        }
      }
      return null;
    }
    if (cfg.scope === "post-type") {
      const postType = args[cfg.postTypeField];
      if (postType === undefined || postType === null || postType === "") return null;
      const rows = await _slugProbeTable(config, cfg.ownTable, cfg.slugField, slug, 25);
      if (rows === null) {
        probeFailures.push(cfg.ownTable);
        return null;
      }
      for (const row of rows) {
        if (ownId && String(row[cfg.ownIdField]) === ownId) continue;
        if (String(row.data_id) !== String(postType)) continue; // different post type — different namespace
        return { table: cfg.ownTable, label: "post (same post-type)", id: row[cfg.ownIdField], idField: cfg.ownIdField };
      }
      return null;
    }
    return null;
  };

  // Map BD table → the update-tool that owns it. Used so cross-namespace
  // collision errors suggest the RIGHT update tool (not just the one that
  // matches the caller's resource type). Was a real bug: createWebPage
  // colliding with a top category said "use updateWebPage on profession_id=X"
  // when it should say "use updateTopCategory(profession_id=X)".
  const TABLE_TO_UPDATE_TOOL = {
    list_seo: "updateWebPage",
    list_professions: "updateTopCategory",
    list_services: "updateSubCategory",
    subscription_types: "updateMembershipPlan",
    users_data: "updateUser",
    data_posts: "updateSingleImagePost",
    users_portfolio_groups: "updateMultiImagePost",
  };

  // Build a probe-failure annotation only when EVERY namespace probe failed.
  // Per-site permission gating means partial failures are expected noise.
  const buildProbeFailureNote = () => {
    const uniq = new Set(probeFailures).size;
    return (uniq > 0 && uniq === SITE_NAMESPACE_TABLES.length)
      ? ` (probe-failure: couldn't verify uniqueness — all ${SITE_NAMESPACE_TABLES.length} namespace probes failed; re-check post-write)`
      : "";
  };

  // Derive corresponding update-tool name for create-error suggestions.
  // Used as a fallback when collision.table isn't in TABLE_TO_UPDATE_TOOL —
  // e.g. SITE_NAMESPACE_TABLES grows but the static map doesn't keep pace.
  // Without the fallback the error message embeds literal "undefined".
  const correspondingUpdateTool = toolName.startsWith("create")
    ? toolName.replace(/^create/, "update")
    : toolName;

  // Single check (most paths) OR loop with auto-suffix (categories).
  const baseSlug = String(proposed);
  if (!cfg.autoSuffix) {
    const collision = await isCollision(baseSlug);
    if (collision) {
      // Suggest the update-tool that OWNS the colliding record's table —
      // not the caller's resource type. createWebPage colliding with a
      // top category should suggest updateTopCategory, not updateWebPage.
      const updateTool = TABLE_TO_UPDATE_TOOL[collision.table] || correspondingUpdateTool;
      const action = toolName.startsWith("create")
        ? `Pick a different ${cfg.slugField}, or use ${updateTool} on the existing record (${collision.idField}=${collision.id}).`
        : `Pick a different ${cfg.slugField} for this record, or rename/delete the conflicting one first.`;
      return {
        ok: false,
        error: `${cfg.slugField} '${baseSlug}' already exists as ${collision.label} (${collision.idField}=${collision.id}). ${action} Duplicate URLs break BD's router and are not permitted.${buildProbeFailureNote()}`,
      };
    }
    // Only surface the warning when EVERY probe failed (genuine outage).
    // Per-site API-key permission gating means individual probe failures are
    // expected baseline noise, not "transient" — surfacing them every call
    // trains agents to ignore the warning when it actually matters.
    const totalProbes = SITE_NAMESPACE_TABLES.length;
    const uniqueFailures = new Set(probeFailures).size;
    if (uniqueFailures > 0 && uniqueFailures === totalProbes) {
      return { ok: true, slug: baseSlug, probe_warning: `Slug uniqueness could not be verified — all ${totalProbes} namespace probes failed (BD outage or auth issue). Re-check post-write if uniqueness is critical.` };
    }
    return { ok: true, slug: baseSlug };
  }

  // Auto-suffix path (categories): try base, then -1, -2, ... up to MAX.
  let attempt = 0;
  let candidate = baseSlug;
  while (attempt <= SLUG_AUTO_SUFFIX_MAX) {
    const collision = await isCollision(candidate);
    if (!collision) {
      args[cfg.slugField] = candidate; // mutate so the forwarded request uses the resolved slug
      const result = { ok: true, slug: candidate };
      if (attempt > 0) {
        result.adjusted = {
          from: baseSlug,
          to: candidate,
          suffix_n: attempt,
          reason: `${cfg.slugField} '${baseSlug}' was taken in the site URL namespace; auto-suffixed to '${candidate}'.`,
        };
        // Quiet for -1..-3 (silent suffix), surface for -4+ (unusual).
        if (attempt < SLUG_AUTO_SUFFIX_QUIET_THRESHOLD) delete result.adjusted;
      }
      const uniqueFails = new Set(probeFailures).size;
      if (uniqueFails > 0 && uniqueFails === SITE_NAMESPACE_TABLES.length) {
        result.probe_warning = `Slug uniqueness could not be verified — all ${SITE_NAMESPACE_TABLES.length} namespace probes failed (BD outage or auth issue). Re-check post-write if uniqueness is critical.`;
      }
      return result;
    }
    attempt++;
    candidate = `${baseSlug}-${attempt}`;
  }
  return {
    ok: false,
    error: `${cfg.slugField} '${baseSlug}' and all suffix variants up to '${baseSlug}-${SLUG_AUTO_SUFFIX_MAX}' are taken in the site URL namespace. Pick a meaningfully different name.${buildProbeFailureNote()}`,
  };
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

function makeRequest(config, method, urlPath, queryParams, bodyParams) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, config.apiUrl);

    // Add query params. Arrays expand as repeated keys — BD's multi-condition
    // filter wants `property[]=X&property[]=Y` (via callers passing `key="property[]"`
    // with an array value), which URLSearchParams produces correctly via append().
    if (queryParams) {
      for (const [key, val] of Object.entries(queryParams)) {
        if (val === undefined || val === null || val === "") continue;
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item === undefined || item === null || item === "") continue;
            fullUrl.searchParams.append(key, String(item));
          }
        } else {
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
      // Redact sensitive body keys — debug mode only. Production requests
      // are NEVER logged (the `if (config.debug)` guard above). This list
      // exists so `--debug` output doesn't accidentally dump credentials
      // into stderr / log files during local troubleshooting.
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
    // 30s matches BD's PHP `max_execution_time` (see CLAUDE.md server config).
    // Any BD API response will either arrive or the server-side will have
    // already killed the script — longer timeouts would just leak sockets.
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

  // Map from `--client` flag value → { key, label }.
  // `print` and `other` both resolve to key "other" (same setup-generation
  // code path — we don't know how to auto-configure their IDE, so we just
  // print the snippet). The distinct labels are UX clarity: `--client=print`
  // was chosen by a user who wants *just* the snippet and will paste it
  // themselves; `--client=other` is the catch-all for IDEs we haven't
  // specifically added support for. Both print the same thing under the
  // hood; only the label in the banner differs. Not a bug.
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
      instructions: INSTRUCTIONS,
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    let args = request.params.arguments;

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
        // custom_208 = heading_font (optional override). null means "if the
        // site hasn't set a distinct heading font, fall back to custom_3 (the
        // body font)" — the fallback is applied in the getBrandKit response
        // construction below at `heading_font: pick("custom_208", ...)`.
        // Most sites leave heading + body the same, so null is the common case.
        custom_208: null,
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
      const isPostTypeReadTool = POST_TYPE_READ_TOOLS.has(name);
      const isWebPageReadTool = WEB_PAGE_READ_TOOLS.has(name);
      const isPlanReadTool = PLAN_READ_TOOLS.has(name);
      const isEmailTemplateReadTool = EMAIL_TEMPLATE_READ_TOOLS.has(name);
      const isReviewReadTool = REVIEW_READ_TOOLS.has(name);
      const leanFlagList = isUserReadTool
        ? USER_LEAN_INCLUDE_FLAGS
        : isPostReadTool
          ? POST_LEAN_INCLUDE_FLAGS
          : isCategoryReadTool
            ? CATEGORY_LEAN_INCLUDE_FLAGS
            : isPostTypeReadTool
              ? POST_TYPE_LEAN_INCLUDE_FLAGS
              : isWebPageReadTool
                ? WEB_PAGE_LEAN_INCLUDE_FLAGS
                : isPlanReadTool
                  ? PLAN_LEAN_INCLUDE_FLAGS
                  : isEmailTemplateReadTool
                    ? EMAIL_TEMPLATE_LEAN_INCLUDE_FLAGS
                    : isReviewReadTool
                      ? REVIEW_LEAN_INCLUDE_FLAGS
                      : null;
      if (leanFlagList) {
        for (const flag of leanFlagList) {
          if (args && flag in args) {
            includeFlags[flag] = args[flag];
            delete args[flag];
          }
        }
      }

      // TRANSPORT STABILITY GUARD — auto-throttle heavy reads.
      //
      // When ANY include_* flag is true, each row balloons (users: ~5-10KB
      // with subscription/services/photos/transactions schemas; web pages:
      // 14-41KB with content+code blobs). At limit=50 a single response can
      // exceed 300KB-2MB, which the MCP transport (stdio buffer, Streamable
      // HTTP, SSE) intermittently truncates without a clean error — agents
      // see silent timeouts. Cap progressively and add a `_throttled` warning.
      // Adjustment, not rejection: agent always gets results; the warning
      // teaches them to paginate or drop heavy includes.
      //
      // Throttle tiers:
      //   USER_READ_TOOLS + any include_* flag                → cap limit at 25
      //   listWebPages + any include_* flag                   → cap limit at 25
      //   listWebPages + include_content AND include_code     → cap limit at 10 (worst case — both heavy buckets)
      let _throttleWarning = null;
      if (args && typeof args === "object") {
        const heavyActive = Object.values(includeFlags).some((v) => v === true || v === "1" || v === 1);
        const requested = Number(args.limit);
        if (isUserReadTool && heavyActive && Number.isFinite(requested) && requested > 25) {
          _throttleWarning = `limit reduced from ${requested} to 25 because heavy include_* flag is set. To get more rows: (1) paginate with next_page, (2) drop include_* for a lean enumeration first then call getUser per-record for the few you need enriched, or (3) call without include_* and re-query specific user_ids individually.`;
          args.limit = 25;
          console.error(`[throttle] ${name}: ${_throttleWarning}`);
        } else if (name === "listWebPages" && heavyActive && Number.isFinite(requested)) {
          const bothHeavy = (includeFlags.include_content === true || includeFlags.include_content === "1" || includeFlags.include_content === 1) &&
                            (includeFlags.include_code === true || includeFlags.include_code === "1" || includeFlags.include_code === 1);
          const cap = bothHeavy ? 10 : 25;
          if (requested > cap) {
            _throttleWarning = `limit reduced from ${requested} to ${cap} because ${bothHeavy ? "BOTH include_content AND include_code are set (heaviest combo — pages can be 30-40KB each)" : "a heavy include_* flag is set"}. To get more rows: (1) paginate with next_page, (2) drop include_* for a lean enumeration first then call getWebPage per-record for the few you need enriched, or (3) split the read — separate calls with include_content=true and include_code=true.`;
            args.limit = cap;
            console.error(`[throttle] ${name}: ${_throttleWarning}`);
          }
        }
      }

      // searchUsers — force structured-array output. BD's default is an HTML
      // markup blob agents can't parse; force `array` so the wrapper always
      // gets records. Spec already removed the html option from the input
      // schema; this is defense-in-depth. BD-mandatory plumbing — do NOT
      // surface as a response echo.
      if (name === "searchUsers" && args && typeof args === "object") {
        args.output_type = "array";
      }

      // SAFETY GUARD: users_meta writes must pass compound identity.
      // Protects against cross-table destruction/corruption - the same `database_id`
      // belongs to UNRELATED rows on different parent tables. Acting on meta_id or
      // database_id alone risks mutating/deleting/corrupting an unrelated table.
      //
      // createUserMeta is also guarded here as defense-in-depth. The tool is
      // currently hidden from the agent tool surface (see HIDDEN_TOOLS), so
      // this branch is dead code today. If it's ever re-exposed, the guard still
      // fires. Rationale for keeping both layers: removing from HIDDEN_TOOLS should
      // require a second change to remove the guard too - two steps = two chances
      // to notice it's a destructive decision.
      //
      // Hardening details:
      //   - Case-insensitive tool name match
      //   - Safely handles undefined/non-object args (no TypeError)
      //   - Rejects numeric/string zero for meta_id + database_id (BD AUTO_INCREMENT starts at 1)
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
              text: `${name} SAFETY GUARD: users_meta writes require compound identity (${isCreate ? "database + database_id" : "meta_id + database + database_id"}). ${parts.join(". ")}.\n\nWHY: users_meta rows share database_id values across unrelated tables. A numeric database_id may simultaneously be a WebPage's seo_id, a member's user_id, a post's post_id, AND a plan's subscription_id - all rows with the same ID on different tables. Acting without the full compound identity risks destroying (delete) or corrupting (update/create) unrelated resource metadata on the WRONG parent table.\n\nSAFE PATTERN: always pass the full compound identity on every users_meta write. For orphan-cleanup after a parent delete, list by database_id then CLIENT-SIDE filter to rows where database matches the intended parent table, then delete each matching meta_id with all three fields.\n\nSee top-level users_meta IDENTITY RULE.`
            }],
            isError: true,
          };
        }
        // Cross-table identity verification: pre-fetch the meta_id and confirm
        // the (database, database_id) the agent passed actually matches the
        // row. Without this, BD's update/delete with a wrong identity pair
        // hangs the connection until the 4-minute MCP transport timeout
        // (BD does a multi-condition UPDATE that finds zero rows and stalls).
        // Skip on createUserMeta (no meta_id yet) and skip the verify call's
        // own probe failures (treat as soft — let BD reject if it must).
        if (!isCreate) {
          try {
            const verify = await makeRequest(
              config,
              "GET",
              `/api/v2/users_meta/get/${encodeURIComponent(String(a.meta_id))}`,
              null,
              null
            );
            // BD returns `message` as an array containing one row; unwrap it.
            const msg = verify && verify.body && verify.body.message;
            const row = Array.isArray(msg) ? msg[0] : msg;
            const realDb = row && (row.database != null ? String(row.database) : null);
            const realPid = row && (row.database_id != null ? String(row.database_id) : null);
            const sentDb = String(a.database);
            const sentPid = String(a.database_id);
            if (realDb !== null && realPid !== null && (realDb !== sentDb || realPid !== sentPid)) {
              return {
                content: [{
                  type: "text",
                  text: `${name} CROSS-TABLE GUARD: meta_id=${a.meta_id} actually belongs to (database="${realDb}", database_id=${realPid}), not (database="${sentDb}", database_id=${sentPid}) you passed. Refusing to forward — BD's response on cross-table mismatch is a 4-minute hang. Use listUserMeta with database="${sentDb}" and database_id=${sentPid} to find the correct meta_id for your target, OR pass database="${realDb}" and database_id=${realPid} if you intended this row.`
                }],
                isError: true,
              };
            }
          } catch {
            // Verify call failed (transient) — proceed and let BD handle it.
          }
        }
      }

      // SAFETY GUARD (parallel to Worker's validateUsersMetaRead): listUserMeta
      // queries must include at least 2 of (database, database_id, key), counting
      // both first-class params and `property`/`property_value`-encoded equivalents.
      // Single-filter queries return cross-table noise (same numeric database_id
      // belongs to unrelated rows on different parent tables). getUserMeta is
      // exempt — `meta_id` in the path already provides identity.
      if (name === "listUserMeta") {
        const a = (args && typeof args === "object") ? args : {};
        const hit = new Set();
        for (const f of ["database", "database_id", "key"]) {
          if (a[f] !== undefined && a[f] !== null && String(a[f]).trim() !== "") hit.add(f);
        }
        if (typeof a.property === "string" && ["database", "database_id", "key"].includes(a.property) &&
            a.property_value !== undefined && String(a.property_value).trim() !== "") {
          hit.add(a.property);
        }
        if (hit.size < 2) {
          return {
            content: [{
              type: "text",
              text: `listUserMeta SAFETY GUARD: queries must include at least 2 of: database, database_id, key. You sent: ${hit.size === 0 ? "none" : [...hit].join(", ")}. WHY: one alone returns cross-table noise (same numeric database_id belongs to unrelated rows on different parent tables). Targeted pairs: (database + database_id) = all EAV fields for one parent; (database + key) = one field across parents; (database_id + key) = almost always one row.`
            }],
            isError: true,
          };
        }
        // Mixed-style filter guard: first-class identity params (database/
        // database_id/key) PLUS a non-identity property/property_value filter
        // on the same call returns empty silently — BD's REST endpoint can't
        // merge both styles, drops the non-identity filter, and the agent
        // can't tell whether the empty result is genuine or a parse failure.
        const hasFirstClass = hit.size > 0;
        const hasNonIdentityProperty =
          typeof a.property === "string" &&
          a.property_value !== undefined && String(a.property_value).trim() !== "" &&
          !["database", "database_id", "key"].includes(a.property);
        if (hasFirstClass && hasNonIdentityProperty) {
          return {
            content: [{
              type: "text",
              text: `listUserMeta MIXED-STYLE GUARD: don't combine first-class params (database/database_id/key) with a property/property_value filter on a different field. BD silently drops one and returns misleading empty results. Pick one style: use first-class identity to scope to a parent row, then filter the response client-side, OR use property[]/property_value[] arrays to express multi-condition filters explicitly.`
            }],
            isError: true,
          };
        }
      }

      // Build URL path with path params substituted
      let urlPath = toolDef.path;
      const queryParams = {};
      const bodyParams = {};

      // listUserMeta/getUserMeta first-class filter translation.
      // Agents pass database/database_id/key as friendly top-level params (the
      // tool schema exposes them explicitly). BD's REST API only honors these
      // as multi-condition filters via property[]/property_value[]/property_operator[]
      // array syntax — plain ?database=X is silently ignored and returns
      // cross-table noise. Translate here before building the query.
      const isUsersMetaRead = name === "listUserMeta" || name === "getUserMeta";
      let metaFilterPairs = null;
      if (isUsersMetaRead && args) {
        const workingArgs = { ...args };
        const pairs = [];
        const seenKeys = new Set();
        for (const k of ["database", "database_id", "key"]) {
          if (workingArgs[k] !== undefined && workingArgs[k] !== null && workingArgs[k] !== "") {
            pairs.push([k, workingArgs[k]]);
            seenKeys.add(k);
            delete workingArgs[k];
          }
        }
        // Also consume property-style filters if they target one of the
        // identity fields. Agents sometimes pass database via property/
        // property_value instead of the first-class arg; without this the
        // guard sees 2 hits (counting both forms) but only one gets
        // translated to the array-syntax filter, and BD silently drops
        // the property-style form, returning cross-table noise.
        if (
          typeof workingArgs.property === "string" &&
          ["database", "database_id", "key"].includes(workingArgs.property) &&
          !seenKeys.has(workingArgs.property) &&
          workingArgs.property_value !== undefined &&
          workingArgs.property_value !== null &&
          String(workingArgs.property_value).trim() !== ""
        ) {
          pairs.push([workingArgs.property, workingArgs.property_value]);
          seenKeys.add(workingArgs.property);
          delete workingArgs.property;
          delete workingArgs.property_value;
          delete workingArgs.property_operator;
        }
        if (pairs.length > 0) {
          metaFilterPairs = pairs;
          args = workingArgs;
        }
      }

      // Sanitize agent-scaffolding tokens from content-field values before
      // they reach BD. Belt-and-suspenders with the docs rule (which tells
      // agents not to emit them in the first place). Applies to every tool
      // call — EAV fields below also flow through so hero_section_content
      // etc. are covered.
      sanitizeScaffoldingInArgs(args);
      stripWidgetWrapperTagsInArgs(args);
      sanitizeImageUrlsInArgs(name, args);
      applyImgRoundedToBodyFields(args);
      const heroEnumErr = validateHeroEnumsInArgs(name, args);
      if (heroEnumErr) {
        return {
          content: [{ type: "text", text: heroEnumErr }],
          isError: true,
        };
      }
      // Free-form RGB color fields: must be `rgb(R, G, B)` literally —
      // hex/rgba/named colors break BD's hero template CSS interpolation.
      const rgbErr = validateRgbColorsInArgs(name, args);
      if (rgbErr) {
        return {
          content: [{ type: "text", text: rgbErr }],
          isError: true,
        };
      }
      // widget_name format guard: alphanumeric + space + hyphen only.
      // Special chars in widget names break [widget=Name] shortcode resolution.
      const widgetNameErr = validateWidgetNameInArgs(name, args);
      if (widgetNameErr) {
        return {
          content: [{ type: "text", text: widgetNameErr }],
          isError: true,
        };
      }
      // Path-param ID validator: reject seo_id=-1 / user_id=0 etc. before
      // forwarding to BD (BD treats these as "ignore filter, dump table").
      const pathIdErr = validatePathParamIds(toolDef.path, args);
      if (pathIdErr) {
        return {
          content: [{ type: "text", text: pathIdErr }],
          isError: true,
        };
      }

      // 14-digit datetime field validator: BD silently truncates wrong-format
      // values to fit the column, corrupting timestamps. Reject upfront.
      const dtErr = validateDatetime14InArgs(args);
      if (dtErr) {
        return {
          content: [{ type: "text", text: dtErr }],
          isError: true,
        };
      }

      // Money / price field validator: non-negative, max 2 decimals across
      // all known BD price columns (lead_price, monthly/yearly/initial_amount).
      const moneyErr = validateMoneyInArgs(args);
      if (moneyErr) {
        return {
          content: [{ type: "text", text: moneyErr }],
          isError: true,
        };
      }

      // 0/1 boolean-int validator: 47 BD fields declare enum:[0,1] but BD
      // accepts arbitrary integers verbatim, breaking front-end branching.
      const boolErr = validateBooleanIntInArgs(args);
      if (boolErr) {
        return {
          content: [{ type: "text", text: boolErr }],
          isError: true,
        };
      }

      // Filter-value SQL-injection-shape guard: BD's filter parser silently
      // drops dangerous-shape values and returns the FULL unfiltered table
      // (same data-leak class as path-param id=-1). Reject upfront.
      const filterErr = validateFilterValuesInArgs(args);
      if (filterErr) {
        return {
          content: [{ type: "text", text: filterErr }],
          isError: true,
        };
      }

      // Filter-operator enum guard: BD silently substitutes unsupported
      // operators (`!=`, `<>`, `IN`, `NOT IN`) with `=`, returning wrong
      // result sets with no warning. Same false-success class as above.
      const opErr = validateFilterOperatorInArgs(args);
      if (opErr) {
        return {
          content: [{ type: "text", text: opErr }],
          isError: true,
        };
      }

      // Force `status=1` on createMultiImagePostPhoto. BD only ever uses
      // status=1 for users_portfolio rows (album/gallery photos); other values
      // don't render. Same pattern as content_active=1 above. BD-mandatory
      // plumbing — do NOT surface as a response echo.
      if (name === "createMultiImagePostPhoto" && args && typeof args === "object") {
        args.status = 1;
      }

      // Force content_active=1 on createWebPage / updateWebPage.
      // BD's content_active has only one valid value (1 = live); 0 doesn't
      // exist server-side. Removed from the input schema so agents don't see
      // or think about it. Always overwrite — never `??=` or only-if-unset.
      // This is BD-mandatory plumbing, not agent-decision territory; do NOT
      // surface as a response echo (it's noise, not signal).
      //
      // date_updated for web pages is wrapper-owned via TIMESTAMP_TABLE_RULES
      // (site-tz, both create+update). Agents never pass it.
      if ((name === "createWebPage" || name === "updateWebPage") && args && typeof args === "object") {
        args.content_active = 1;
        args.master_id = 0; // unconditional overwrite — list_seo_template only
      }

      // Slug uniqueness guard — universal helper. BD does NOT enforce unique
      // slugs server-side on most resources, and the public router treats
      // web pages, top categories, sub categories, and plan public URLs as
      // a single namespace (cross-table collisions break routing). Plan
      // checkout URLs and post slugs have their own scoped pools.
      //
      // The helper below handles all three scope shapes via a single
      // function `reserveSiteUrlSlug` defined elsewhere in this file. Per
      // call site:
      //   - reject (most cases)  → return error response
      //   - auto-suffix (categories) → mutate args, optionally annotate
      //                                with `_slug_adjusted` if suffix>=4
      const slugGuard = await reserveSiteUrlSlug(config, name, args);
      if (slugGuard && !slugGuard.ok) {
        return { content: [{ type: "text", text: slugGuard.error }], isError: true };
      }
      let _slugAdjusted = null;
      let _slugProbeWarning = null;
      let _segmentsValidated = null;
      let _segmentWarning = null;
      if (slugGuard && slugGuard.adjusted) _slugAdjusted = slugGuard.adjusted;
      if (slugGuard && slugGuard.probe_warning) _slugProbeWarning = slugGuard.probe_warning;

      // profile_search_results segment-binding guard + hero bundle autofill +
      // data_category page guard. All three need the current `list_seo` row on
      // updateWebPage (for effective seo_type, current hero state, current
      // linked_post_* state). One fetch, three consumers.
      let _heroBundleAutofilled = null;
      let _dataCategoryAutofilled = null;
      let _dataCategoryPair = null;
      if ((name === "createWebPage" || name === "updateWebPage") && args && typeof args === "object") {
        let effectiveSeoType = args.seo_type;
        let currentRecord = null;
        if (name === "updateWebPage" && args.seo_id !== undefined && args.seo_id !== null) {
          try {
            const cur = await makeRequest(config, "GET", `/api/v2/list_seo/get/${encodeURIComponent(String(args.seo_id))}`, null, null);
            const row = cur && cur.body && (Array.isArray(cur.body.message) ? cur.body.message[0] : cur.body.message);
            if (row && typeof row === "object") {
              currentRecord = row;
              if (effectiveSeoType === undefined) effectiveSeoType = row.seo_type;
            }
          } catch { /* fetch failed; validators fall open via existing paths */ }
        }
        const segGuard = await _validateProfileSearchResultsSegments(config, args, effectiveSeoType);
        if (segGuard && segGuard.error) {
          return { content: [{ type: "text", text: segGuard.error }], isError: true };
        }
        if (segGuard && segGuard.segments_validated) _segmentsValidated = segGuard.segments_validated;
        if (segGuard && segGuard.segment_warning) _segmentWarning = segGuard.segment_warning;

        const heroResult = applyHeroBundleAutofill(name, args, currentRecord);
        if (heroResult && heroResult.error) {
          return { content: [{ type: "text", text: heroResult.error }], isError: true };
        }
        if (heroResult && heroResult.autofilled) _heroBundleAutofilled = heroResult.autofilled;

        const dataCatResult = await applyDataCategoryGuard(config.domain, config.apiKey, name, args, currentRecord);
        if (dataCatResult && dataCatResult.error) {
          return { content: [{ type: "text", text: dataCatResult.error }], isError: true };
        }
        if (dataCatResult && dataCatResult.autofilled) _dataCategoryAutofilled = dataCatResult.autofilled;
        if (dataCatResult && dataCatResult.pair_validated) _dataCategoryPair = dataCatResult.pair_validated;
      }
      // Defensive: if any old client still sends the removed bypass flag.
      if (args && typeof args === "object" && "force_duplicate_filename" in args) delete args.force_duplicate_filename;

      // Category rename/delete bound-page guard. A `seo_type=profile_search_results`
      // web page binds to a category by exact filename match on ANY path segment
      // — bare slugs (`/ballet`) AND multi-tier hierarchies (`/dance-schools/ballet`,
      // `/california/los-angeles/ballet`) all use BD's router to find the matching
      // category. Pull all profile_search_results pages once, segment-match the
      // old category filename against each. seo_type=content pages at the same
      // path don't bind — they're just static pages, no router→category lookup.
      if (
        (name === "updateSubCategory" || name === "updateTopCategory" ||
         name === "deleteSubCategory" || name === "deleteTopCategory") &&
        args && typeof args === "object"
      ) {
        const isTop = name === "updateTopCategory" || name === "deleteTopCategory";
        const idField = isTop ? "profession_id" : "service_id";
        const idVal = args[idField];
        if (idVal !== undefined && idVal !== null && idVal !== "") {
          const isDelete = name.startsWith("delete");
          const isFilenameChange = !isDelete && typeof args.filename === "string" && args.filename !== "";
          if (isDelete || isFilenameChange) {
            try {
              const endpoint = isTop ? "list_professions" : "list_services";
              const catResp = await makeRequest(config, "GET", `/api/v2/${endpoint}/get/${encodeURIComponent(String(idVal))}`, null, null);
              const catMsg = catResp && catResp.body && catResp.body.message;
              const catRow = Array.isArray(catMsg) ? catMsg[0] : catMsg;
              const oldFilename = catRow && catRow.filename;
              if (typeof oldFilename === "string" && oldFilename !== "" &&
                  (isDelete || oldFilename !== args.filename)) {
                const pageResp = await makeRequest(config, "GET", "/api/v2/list_seo/get",
                  { property: "seo_type", property_value: "profile_search_results", property_operator: "=", limit: 100 },
                  null
                );
                const pageRows = pageResp && pageResp.body && Array.isArray(pageResp.body.message) ? pageResp.body.message : [];
                const boundPage = pageRows.find((r) => {
                  if (!r || typeof r.filename !== "string") return false;
                  return r.filename.split("/").includes(oldFilename);
                });
                if (boundPage) {
                  const action = isDelete ? "delete" : "rename";
                  const recovery = isDelete
                    ? `Delete or repurpose the bound page first (deleteWebPage seo_id=${boundPage.seo_id}, OR updateWebPage seo_id=${boundPage.seo_id} seo_type=content), then retry this delete.`
                    : `Rename the bound page first (updateWebPage seo_id=${boundPage.seo_id} filename=<new-slug-with-'${args.filename}'-as-the-matching-segment>), or change its seo_type, then retry this rename. Consider createRedirect from '${boundPage.filename}' to the new page slug for SEO continuity.`;
                  return {
                    content: [{ type: "text", text: `${name} BOUND-PAGE GUARD: cannot ${action} category (${idField}=${idVal}, filename='${oldFilename}') — web page seo_id=${boundPage.seo_id} (filename='${boundPage.filename}', seo_type=profile_search_results) has '${oldFilename}' as a path segment and binds to this category. ${action === "delete" ? "Deleting" : "Renaming"} this category would orphan that page (BD router resolves the URL but the page can't query the missing category, renders empty). ${recovery}` }],
                    isError: true,
                  };
                }
              }
            } catch {
              // Probe failure is transient — let BD handle it.
            }
          }
        }
      }

      // createMemberSubCategoryLink (rel_services) — FK + duplicate-pair guard.
      // Without this, BD silently creates orphan rows pointing at nonexistent
      // user_id or service_id, AND allows duplicate (user_id, service_id)
      // pairs which double-count members in any "show this user's services"
      // query. Both pre-checks run in parallel for one round-trip's latency.
      if (name === "createMemberSubCategoryLink" && args && typeof args === "object" &&
          args.user_id !== undefined && args.user_id !== null && args.user_id !== "" &&
          args.service_id !== undefined && args.service_id !== null && args.service_id !== "") {
        const userIdStr = String(args.user_id);
        const serviceIdStr = String(args.service_id);
        try {
          const [userResp, svcResp, pairResp] = await Promise.all([
            // BD's public-API path for users_data is `/api/v2/user/*` (the
            // table is `users_data` but the endpoint is `user`). Same for
            // list_services → `/api/v2/list_services/*` (those match).
            makeRequest(config, "GET", `/api/v2/user/get/${encodeURIComponent(userIdStr)}`, null, null),
            makeRequest(config, "GET", `/api/v2/list_services/get/${encodeURIComponent(serviceIdStr)}`, null, null),
            makeRequest(config, "GET", "/api/v2/rel_services/get", { property: "user_id", property_value: userIdStr, property_operator: "=", limit: 100 }, null),
          ]);
          // BD returns `message` as an array on get-by-id; unwrap to first row.
          const userMsg = userResp && userResp.body && userResp.body.message;
          const userRow = Array.isArray(userMsg) ? userMsg[0] : userMsg;
          const userOk = userResp && userResp.body && userResp.body.status === "success" && userRow && userRow.user_id;
          const svcMsg = svcResp && svcResp.body && svcResp.body.message;
          const svcRow = Array.isArray(svcMsg) ? svcMsg[0] : svcMsg;
          const svcOk = svcResp && svcResp.body && svcResp.body.status === "success" && svcRow && svcRow.service_id;
          if (!userOk) {
            return { content: [{ type: "text", text: `createMemberSubCategoryLink FK GUARD: user_id=${userIdStr} does not exist. Verify via getUser before linking.` }], isError: true };
          }
          if (!svcOk) {
            return { content: [{ type: "text", text: `createMemberSubCategoryLink FK GUARD: service_id=${serviceIdStr} does not exist. Verify via getSubCategory before linking.` }], isError: true };
          }
          // Duplicate-pair check
          const links = pairResp && pairResp.body && Array.isArray(pairResp.body.message) ? pairResp.body.message : [];
          const dup = links.find(r => r && String(r.service_id) === serviceIdStr);
          if (dup) {
            return { content: [{ type: "text", text: `createMemberSubCategoryLink DUPLICATE GUARD: (user_id=${userIdStr}, service_id=${serviceIdStr}) is already linked (rel_id=${dup.rel_id}). Duplicates double-count the member in service queries — use updateMemberSubCategoryLink to modify the existing row instead.` }], isError: true };
          }
        } catch {
          // Pre-check probe failed (transient). Let BD handle it; surface a
          // soft warning on the response so the agent can re-verify.
        }
      }

      // Breadcrumb is a derived display field — BD generates it from
      // parent/child filename relationships at render time. Manually setting
      // it on createWebPage/updateWebPage stores a stale literal that
      // diverges from the live structure as soon as parents/children move.
      if ((name === "createWebPage" || name === "updateWebPage")
          && args && typeof args === "object"
          && args.breadcrumb !== undefined && args.breadcrumb !== null && String(args.breadcrumb).trim() !== "") {
        return {
          content: [{ type: "text", text: `${name} BREADCRUMB GUARD: breadcrumb is a derived display field — BD generates it from the parent/child filename hierarchy at render time. Manually-set values go stale the moment the page tree changes. Omit this field; the rendered breadcrumb stays accurate automatically.` }],
          isError: true,
        };
      }

      // Homepage uniqueness guard: BD enforces "one home per site" via
      // router precedence, not schema. Two records with `seo_type=home` are
      // physically allowed; whichever the router resolves first becomes
      // the homepage and the other is permanently shadowed. Pre-check on
      // any write that sets `seo_type=home` and reject if a different
      // seo_id already holds that role. Same pattern as filename uniqueness.
      if ((name === "createWebPage" || name === "updateWebPage")
          && args && typeof args === "object"
          && String(args.seo_type || "").toLowerCase() === "home") {
        try {
          const existing = await makeRequest(
            config,
            "GET",
            "/api/v2/list_seo/get",
            { property: "seo_type", property_value: "home", property_operator: "=", limit: 5 },
            null
          );
          const rows = existing && existing.body && Array.isArray(existing.body.message) ? existing.body.message : [];
          const incomingSeoId = args.seo_id !== undefined && args.seo_id !== null ? String(args.seo_id) : null;
          // For createWebPage there's no incoming seo_id, so any existing
          // home-row blocks. For updateWebPage, only block if the existing
          // home is on a DIFFERENT seo_id than the one being updated.
          const conflict = rows.find((r) => {
            if (!r || !r.seo_id) return false;
            if (name === "createWebPage") return true;
            return incomingSeoId !== null && String(r.seo_id) !== incomingSeoId;
          });
          if (conflict) {
            const action = name === "createWebPage" ? "create another" : "convert this page to";
            return {
              content: [{ type: "text", text: `${name} HOMEPAGE GUARD: cannot ${action} seo_type=home — seo_id=${conflict.seo_id} (filename='${conflict.filename || ""}') already holds that role. BD's router resolves only one homepage per site; a second home-row would be permanently shadowed. To modify the homepage, call updateWebPage on seo_id=${conflict.seo_id}. To make this a regular page, use seo_type=content instead.` }],
              isError: true,
            };
          }
        } catch {
          // Pre-check probe failed (transient). Let BD handle it.
        }
      }

      // Thin-content soft warning: createWebPage with NO title, h1, meta_desc,
      // or content (and no override) leaves a publicly-live blank page that
      // Google may index as thin content. Don't reject — there are legit
      // placeholder/draft flows. Just attach a `_thin_content_warning` to the
      // response body so the agent and human user notice. Only fires for
      // seo_type=content (homepage / search-results / data_category have
      // their own template-driven content).
      let _thinContentWarning = null;
      if (name === "createWebPage" && args && typeof args === "object" && args.seo_type === "content") {
        const has = (k) => args[k] !== undefined && args[k] !== null && String(args[k]).trim() !== "";
        if (!has("title") && !has("h1") && !has("meta_desc") && !has("content")) {
          _thinContentWarning = `Page created with no title, h1, meta_desc, or content — and is publicly live. Risk: Google indexes a blank page. Fix: updateWebPage to add at least one of those fields now, or deleteWebPage if the create was premature.`;
        }
      }

      // Hero double-render soft warning: when the hero section is on (1 or 2)
      // it already renders an H1 (the page's `h1` field). An additional
      // `<h1>` inside the body `content` paints a second H1 on the same page,
      // which fails most accessibility audits and dilutes SEO. H2s aren't
      // flagged — multiple H2s are valid on a page with a single H1.
      let _heroH1Warning = null;
      if ((name === "createWebPage" || name === "updateWebPage") && args && typeof args === "object") {
        const heroOn = args.enable_hero_section === 1 || args.enable_hero_section === 2 ||
                       args.enable_hero_section === "1" || args.enable_hero_section === "2";
        const body = typeof args.content === "string" ? args.content : "";
        if (heroOn && /<h1\b/i.test(body)) {
          _heroH1Warning = `Hero section is enabled AND content body contains <h1>. The hero already renders an H1 from the page's h1 field — your body H1 paints a second H1 on the same page (accessibility fail, SEO dilution). Either remove the body H1 or disable the hero.`;
        }
      }

      // EAV split: peel hero/EAV fields off updateWebPage args before the
      // parent update. Flushed via users_meta after the parent succeeds.
      const { direct: eavDirect, eav: eavQueued, route: eavRoute } = splitEavParams(name, args || {});
      if (eavRoute) args = eavDirect;

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

      // System-timestamp wire-injection: tools listed in SYSTEM_TIMESTAMP_FIELDS
      // get their wrapper-owned timestamps written to bodyParams in site-local
      // time. Only runs on writes (GET has no body) and only when a registry
      // entry exists. The tz fetch is cached per-baseUrl (10 min TTL).
      if (toolDef.method !== "GET" && SYSTEM_TIMESTAMP_FIELDS[name]) {
        const tz = await getSiteTimezoneCached(config.apiUrl, config.apiKey);
        autoDefaultSystemTimestamps(name, bodyParams, tz);
      }

      // Apply the translated users_meta filter pairs as array-syntax
      // query params. Done after the normal loop so the arrays are
      // definitive (no collision with any pre-existing property[]).
      if (metaFilterPairs) {
        queryParams["property[]"] = metaFilterPairs.map(([k]) => k);
        queryParams["property_value[]"] = metaFilterPairs.map(([, v]) => v);
        queryParams["property_operator[]"] = metaFilterPairs.map(() => "=");
      }

      const result = await makeRequest(config, toolDef.method, urlPath, queryParams, bodyParams);

      // EAV follow-up: parent update succeeded AND we had EAV fields queued.
      // Resolve parent PK (agent always supplies it on updateWebPage) and
      // flush each queued EAV field via users_meta upsert.
      if (
        eavRoute &&
        Object.keys(eavQueued).length > 0 &&
        result.body &&
        typeof result.body === "object" &&
        result.body.status === "success"
      ) {
        const parentId =
          (eavDirect[eavRoute.parentPK] !== undefined ? eavDirect[eavRoute.parentPK] : undefined) ||
          (result.body.message && typeof result.body.message === "object"
            ? result.body.message[eavRoute.parentPK]
            : undefined);
        if (parentId) {
          const eavResults = await writeEavFields(config, eavRoute, parentId, eavQueued);
          result.body.eav_results = eavResults;
        }
      }

      // Rewrite BD's misleading "<table> not found" 404s class-wide. BD
      // returns this string for both single-record misses (real 404) and
      // empty filtered lists (where the query worked, just matched 0 rows).
      // Agents misread it as a system-level "the table is missing" failure.
      // Distinguish + rephrase:
      //   - get*  → keep status:error, rephrase to "No <table> record with
      //     <pk>=N" so it's clear the record is missing, not the table.
      //   - list*/search* → empty filter result is success, not error.
      //     Normalize to status:success, message:[], total:0.
      if (
        result.body &&
        typeof result.body === "object" &&
        result.body.status === "error" &&
        typeof result.body.message === "string" &&
        / not found$/.test(result.body.message)
      ) {
        const isList = typeof name === "string" && (name.startsWith("list") || name.startsWith("search"));
        const isGet = typeof name === "string" && name.startsWith("get");
        if (isList) {
          result.body.status = "success";
          result.body.message = [];
          result.body.total = result.body.total || 0;
          result.body.current_page = result.body.current_page || 1;
          result.body.total_pages = result.body.total_pages || 0;
        } else if (isGet) {
          // Find the path-param value the agent sent so the error names it.
          const pkMatch = (toolDef.path || "").match(/\{([^}]+)\}/);
          const pkName = pkMatch ? pkMatch[1] : null;
          const pkVal = pkName && args && args[pkName] !== undefined ? args[pkName] : "?";
          const tableMatch = result.body.message.match(/^(.+) not found$/);
          const table = tableMatch ? tableMatch[1] : "record";
          result.body.message = pkName
            ? `No ${table} record with ${pkName}=${pkVal}.`
            : `No ${table} record found.`;
        }
      }

      // Strip BD's pagination metadata leak from single-record get* responses.
      // BD's REST returns total/current_page/total_pages/next_page on every
      // /get/{id} call — meaningless on a single-record fetch. Silent noise that
      // misleads agents into thinking they need to paginate. Strip on get* tools
      // only; leave intact on list*/search* where the metadata is real.
      if (result.body && typeof result.body === "object" && typeof name === "string" && name.startsWith("get")) {
        delete result.body.total;
        delete result.body.current_page;
        delete result.body.total_pages;
        delete result.body.next_page;
        delete result.body.prev_page;
      }

      // Apply lean-response shaping. Reads honor include_* flags; writes
      // are always lean (create/update echoes trimmed to a small keep-set).
      if (result.body) {
        if (isUserReadTool) result.body = applyUserLean(result.body, includeFlags);
        else if (isPostReadTool) result.body = applyPostLean(result.body, includeFlags);
        else if (isCategoryReadTool) result.body = applyCategoryLean(result.body, includeFlags);
        else if (isPostTypeReadTool) result.body = applyPostTypeLean(result.body, includeFlags);
        else if (isWebPageReadTool) result.body = applyWebPageLean(result.body, includeFlags);
        else if (isPlanReadTool) result.body = applyPlanLean(result.body, includeFlags);
        else if (isEmailTemplateReadTool) result.body = applyEmailTemplateLean(result.body, includeFlags);
        else if (isReviewReadTool) result.body = applyReviewLean(result.body, includeFlags);
        else if (WRITE_KEEP_SETS[name]) result.body = applyWriteLean(name, result.body);
      }

      // Attach throttle warning if we lowered the limit. Visible to the agent
      // so it can paginate or drop heavy includes on the next call.
      if (_throttleWarning && result.body && typeof result.body === "object") {
        result.body._throttled = _throttleWarning;
      }
      // Attach thin-content warning on createWebPage if no SEO/title fields
      // were set (page goes live but Google may index as thin content).
      if (_thinContentWarning && result.body && typeof result.body === "object") {
        result.body._thin_content_warning = _thinContentWarning;
      }
      if (_heroH1Warning && result.body && typeof result.body === "object") {
        result.body._hero_h1_warning = _heroH1Warning;
      }
      // Attach slug-adjusted notice when category auto-suffix went deep
      // enough to suggest something unusual (>=4). Silent on -1, -2, -3.
      if (_slugAdjusted && result.body && typeof result.body === "object") {
        result.body._slug_adjusted = _slugAdjusted;
      }
      // Probe-failure warning: we couldn't fully verify uniqueness due to a
      // transient BD error on one of the namespace tables. Write was allowed
      // through (don't block legitimate work on a flake) but agent should
      // know to verify post-write if uniqueness matters for their use case.
      if (_slugProbeWarning && result.body && typeof result.body === "object") {
        result.body._slug_probe_warning = _slugProbeWarning;
      }
      // profile_search_results segment-binding feedback — agent confirmation
      // that each slug segment mapped to a real BD record (or transient warning).
      if (_segmentsValidated && result.body && typeof result.body === "object") {
        result.body._segments_validated = _segmentsValidated;
      }
      if (_segmentWarning && result.body && typeof result.body === "object") {
        result.body._segment_warning = _segmentWarning;
      }
      // Hero readability bundle autofill — agent feedback listing which
      // bundle fields the wrapper filled with canonical defaults on a
      // hero off→on transition. User-supplied values are not listed here.
      if (_heroBundleAutofilled && result.body && typeof result.body === "object") {
        result.body._hero_bundle_autofilled = _heroBundleAutofilled;
      }
      // data_category page guard feedback. Echoes the validated pair and
      // any wrapper-autofilled defaults (currently only linked_post_category
      // → "post_main_page" on omitted-on-create / no-prior-meta switch).
      if (_dataCategoryAutofilled && result.body && typeof result.body === "object") {
        result.body._data_category_autofilled = _dataCategoryAutofilled;
      }
      if (_dataCategoryPair && result.body && typeof result.body === "object") {
        result.body._data_category_pair = _dataCategoryPair;
      }

      // Auto-refresh site cache after successful cache-gated writes.
      // Lenient: annotation-only on failure; never fails the parent response.
      if (
        name in AUTO_REFRESH_SCOPE &&
        result.body &&
        typeof result.body === "object" &&
        result.body.status === "success"
      ) {
        const refresh = await autoRefreshCache(config, AUTO_REFRESH_SCOPE[name]);
        result.body.auto_cache_refreshed = refresh.ok;
        if (!refresh.ok) {
          result.body.auto_cache_refresh_error = refresh.message;
        }
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
      // 5000ms drain window on SIGTERM/SIGINT. Enough for most BD calls to
      // complete cleanly (BD median response is <500ms). Hard abort after
      // 5s so the user's MCP client doesn't hang waiting for us to exit.
      // Matches the grace period most init systems give before SIGKILL.
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
