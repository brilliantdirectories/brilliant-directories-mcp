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
  "comments_header",
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
  updateUser: ["user_id","first_name","last_name","company","email","filename","active","status","subscription_id","profession_id"],

  // Single-image posts
  createSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image"],
  updateSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image"],

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
  createWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","revision_timestamp"],
  updateWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","revision_timestamp"],

  // Widgets — full echo includes widget_data/widget_style/widget_javascript
  // which can be 200KB+ on large widgets (e.g. Admin - Froala Editor Scripts
  // is 204KB of widget_data alone). Strip the three heavy code fields and
  // echo only identity + classification + timestamps + shortcode.
  createWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  updateWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  createMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
  updateMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
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
  // PostType code templates (all 9 — widget-equivalent trust)
  "category_header", "search_results_div", "category_footer",
  "profile_header", "profile_results_layout", "profile_footer",
  "search_results_layout", "comments_code", "comments_header",
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

// Image-URL sanitizer — strips `?query` suffixes before forwarding to BD.
// Real bug 2026-04-23: agent passed `post_image=...jpeg?w=1600` → BD's
// auto_image_import baked the query into the stored filename → 404 at CDN.
// Field descriptions now say "bare URL only", but agents drift. This is the
// runtime belt (docs are the suspenders). Also trims whitespace in CSV lists
// (multi-image albums) — BD doesn't trim, stray spaces silently fail imports.
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
// (paddings, font sizes) source-of-truth: BD admin form `<select>` options
// (verified live 2026-04-25). Mirrored in Worker's `src/index.ts`.
const HERO_PADDING_STEPS = Array.from({ length: 21 }, (_, i) => String(i * 10)); // 0..200 step 10
const H1_FONT_SIZE_STEPS = Array.from({ length: 51 }, (_, i) => String(30 + i)); // 30..80 step 1
const H2_FONT_SIZE_STEPS = Array.from({ length: 41 }, (_, i) => String(20 + i)); // 20..60 step 1
const HERO_CONTENT_FONT_SIZE_STEPS = Array.from({ length: 21 }, (_, i) => String(10 + i)); // 10..30 step 1
const HERO_ENUM_FIELDS = {
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

// `sanitizeHeroCtaEnumsInArgs` was removed in v6.40.26. Earlier versions
// silently coerced invalid hero_link_color (#ffffff → "primary") and
// hero_link_size (numeric → "btn-lg"), which produced a false-success
// failure mode: validator passed because the value was already coerced,
// agent received status:success, but their actual intent was discarded.
// Reject-don't-coerce — the validator below now rejects bad enum values
// loudly so the agent gets a clear actionable error, never a silent change.
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
  { table: "list_seo",          field: "filename",              ownIdField: "seo_id",          label: "web page" },
  { table: "list_professions",  field: "filename",              ownIdField: "profession_id",   label: "top category" },
  { table: "list_services",     field: "filename",              ownIdField: "service_id",      label: "sub category" },
  { table: "subscription_types", field: "subscription_filename", ownIdField: "subscription_id", label: "membership plan" },
];
const SLUG_AUTO_SUFFIX_MAX = 20;
const SLUG_AUTO_SUFFIX_QUIET_THRESHOLD = 4; // suffixes 1-3 are silent; 4+ surfaces _slug_adjusted

// Per-tool routing. Static map = no pattern-matching surprises if BD adds tools.
//   slugField:    which arg holds the slug
//   scope:        'site' | 'plans-checkout' | 'post-type'
//   ownTable:     the resource's own table (excluded from collision scan on update)
//   ownIdField:   the primary-key arg name (for update self-exclusion)
//   autoSuffix:   true = categories (auto -1, -2, ...); false = everything else (reject)
//   postTypeField: required when scope='post-type' (the data_id arg)
const SLUG_TOOL_CONFIG = {
  createWebPage:        { slugField: "filename",              scope: "site",            ownTable: "list_seo",          ownIdField: null,           autoSuffix: false },
  updateWebPage:        { slugField: "filename",              scope: "site",            ownTable: "list_seo",          ownIdField: "seo_id",       autoSuffix: false },
  createTopCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_professions",  ownIdField: null,           autoSuffix: true  },
  updateTopCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_professions",  ownIdField: "profession_id", autoSuffix: true  },
  createSubCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_services",     ownIdField: null,           autoSuffix: true  },
  updateSubCategory:    { slugField: "filename",              scope: "site",            ownTable: "list_services",     ownIdField: "service_id",   autoSuffix: true  },
  createMembershipPlan: { slugField: "subscription_filename", scope: "site",            ownTable: "subscription_types", ownIdField: null,           autoSuffix: false },
  updateMembershipPlan: { slugField: "subscription_filename", scope: "site",            ownTable: "subscription_types", ownIdField: "subscription_id", autoSuffix: false },
  // post slugs are scoped per-post-type; pass the post-type's data_id alongside the slug
  updateSingleImagePost: { slugField: "post_filename",  scope: "post-type", ownTable: "data_posts",                ownIdField: "post_id",  postTypeField: "data_id", autoSuffix: false },
  updateMultiImagePost:  { slugField: "group_filename", scope: "post-type", ownTable: "users_portfolio_groups",    ownIdField: "group_id", postTypeField: "data_id", autoSuffix: false },
};

/** Normalize a slug for comparison — match BD's URL router behavior.
 *  BD's `=` filter on slug columns is case-insensitive and trims whitespace,
 *  AND BD's public URL router treats `/foo`, `/Foo`, and `/FOO` as the same
 *  page (verified live 2026-04-25 — all 3 variants returned identical 376KB
 *  HTML for an existing category). So a duplicate-detection check must
 *  match case-insensitively + whitespace-trimmed; otherwise a "Restaurants"
 *  probe against existing "restaurants" would falsely report no collision
 *  and BD would create a routing-conflict duplicate. */
function _normalizeSlug(s) {
  return String(s).trim().toLowerCase();
}

/** Validate slug format — BD URL slugs must NOT contain:
 *  (a) whitespace OR zero-width / invisible characters (would silently
 *      corrupt URLs — \s catches regular whitespace + NBSP + ideographic
 *      space; the explicit class adds soft-hyphen U+00AD, ZWSP/ZWNJ/ZWJ
 *      U+200B-U+200D, format-control U+2060-U+2064, BOM U+FEFF — all
 *      invisible chars NOT covered by \s).
 *  (b) URL-reserved / structural characters (would break BD routing —
 *      slash, backslash, ?, #, &, %, <, >, ").
 *  Reject upfront with a clear actionable message before any probe work.
 *  Returns null on valid, error-string on invalid. */
function _validateSlugFormat(slug, fieldLabel) {
  if (typeof slug !== "string") return null; // non-strings skipped earlier
  if (/[\s­​-‏⁠-⁤﻿]/.test(slug)) {
    return `${fieldLabel} '${slug}' contains whitespace or invisible characters, which are not allowed in BD URLs. Use hyphens instead (e.g. 'my-page' not 'my page').`;
  }
  if (/[\/\\?#&%<>"]/.test(slug)) {
    return `${fieldLabel} '${slug}' contains URL-reserved characters (one of /\\?#&%<>"), which are not allowed in BD URLs. Use only letters, digits, hyphens, underscores, and dots.`;
  }
  return null;
}

/** Look up rows in one BD table whose `field` equals the slug. */
async function _slugProbeTable(config, table, field, slug, limit) {
  try {
    const result = await makeRequest(
      config,
      "GET",
      `/api/v2/${table}/get`,
      { property: field, property_value: String(slug), property_operator: "=", limit: limit || 5 },
      null
    );
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
  if (proposed === undefined || proposed === null || proposed === "") return null;

  // Format validation: reject whitespace before any network work.
  const formatErr = _validateSlugFormat(String(proposed), cfg.slugField);
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
      // Probe all 4 site-namespace tables in parallel.
      // limit=25 not 5 — handles the (rare but possible) historical case
      // where BD already has multiple same-slug rows in one table; with
      // limit=5 + ownId-self-exclusion we could miss a real collision on
      // row 6+. 25 is BD's recommended page size and exhausts realistic
      // collision patterns without paginating.
      const probes = await Promise.all(SITE_NAMESPACE_TABLES.map((t) =>
        _slugProbeTable(config, t.table, t.field, slug, 25).then((rows) => ({ ...t, rows }))
      ));
      // Find first non-self conflict.
      for (const p of probes) {
        if (p.rows === null) {
          probeFailures.push(p.table);
          continue; // probe failed; non-fatal but recorded
        }
        for (const row of p.rows) {
          // Self-exclusion: only on update, only same table + same id.
          if (ownId && p.table === cfg.ownTable && String(row[p.ownIdField]) === ownId) continue;
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

  // Derive the corresponding update-tool name for create-error suggestions.
  // Used to be a buggy `update${cfg.label ? "" : ""}*` literal — replaced
  // with a real op name so agents get an actionable suggestion.
  const correspondingUpdateTool = toolName.startsWith("create")
    ? toolName.replace(/^create/, "update")
    : toolName;

  // Build a probe-failure annotation if any tables couldn't be checked.
  const buildProbeFailureNote = () => probeFailures.length === 0
    ? ""
    : ` (probe-failure: couldn't verify uniqueness in ${probeFailures.join(", ")} due to a transient BD error — re-check post-write if this matters)`;

  // Single check (most paths) OR loop with auto-suffix (categories).
  const baseSlug = String(proposed);
  if (!cfg.autoSuffix) {
    const collision = await isCollision(baseSlug);
    if (collision) {
      const action = toolName.startsWith("create")
        ? `Pick a different ${cfg.slugField}, or use ${correspondingUpdateTool} on the existing record (${collision.idField}=${collision.id}).`
        : `Pick a different ${cfg.slugField} for this record, or rename/delete the conflicting one first.`;
      return {
        ok: false,
        error: `${cfg.slugField} '${baseSlug}' already exists as ${collision.label} (${collision.idField}=${collision.id}). ${action} Duplicate URLs break BD's router and are not permitted.${buildProbeFailureNote()}`,
      };
    }
    if (probeFailures.length > 0) {
      // No collision found, but we couldn't fully verify. Allow write, surface a soft warning.
      return { ok: true, slug: baseSlug, probe_warning: `Slug uniqueness could not be fully verified (transient BD error on ${probeFailures.join(", ")}). Re-check post-write if uniqueness is critical.` };
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
      if (probeFailures.length > 0) {
        result.probe_warning = `Slug uniqueness could not be fully verified (transient BD error on ${probeFailures.join(", ")}). Re-check post-write if uniqueness is critical.`;
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

      // searchUsers — force structured-array output. BD's default is HTML
      // markup which our shaper can't process; agents would receive a multi-KB
      // HTML blob instead of records. Strip any output_type the agent passed
      // and force array. Defense-in-depth — spec already removed the html
      // option from the input schema.
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
        for (const k of ["database", "database_id", "key"]) {
          if (workingArgs[k] !== undefined && workingArgs[k] !== null && workingArgs[k] !== "") {
            pairs.push([k, workingArgs[k]]);
            delete workingArgs[k];
          }
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
      sanitizeImageUrlsInArgs(name, args);
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
      // Path-param ID validator: reject seo_id=-1 / user_id=0 etc. before
      // forwarding to BD (BD treats these as "ignore filter, dump table").
      const pathIdErr = validatePathParamIds(toolDef.path, args);
      if (pathIdErr) {
        return {
          content: [{ type: "text", text: pathIdErr }],
          isError: true,
        };
      }

      // Auto-force content_active=1 on createWebPage / updateWebPage.
      // BD's content_active has only one valid value (1 = live); 0 doesn't
      // exist server-side. Always overwrite — even if an agent or old client
      // passes a different value, we coerce to 1 so the write always lands.
      // Removed from the input schema in v6.40.30 so agents don't see/think
      // about the field at all.
      //
      // NOTE: date_updated auto-defaulting was attempted in v6.40.30 (UTC)
      // and reverted in v6.40.31 — UTC produces wrong "Last Update" display
      // for non-UTC sites. Doing it correctly requires resolving the site's
      // timezone via getSiteInfo and is now scoped as a separate project
      // alongside other system-internal timestamps across all BD resources.
      // See KNOWN-SERVER-BUGS.md "TODO — Wrapper-managed system timestamps"
      // section. Until that ships, agents pass `date_updated` themselves
      // (corpus already requires it).
      if ((name === "createWebPage" || name === "updateWebPage") && args && typeof args === "object") {
        args.content_active = 1; // unconditional overwrite — never use ??= or only-if-unset patterns here
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
      if (slugGuard && slugGuard.adjusted) _slugAdjusted = slugGuard.adjusted;
      if (slugGuard && slugGuard.probe_warning) _slugProbeWarning = slugGuard.probe_warning;
      // Defensive: if any old client still sends the removed bypass flag.
      if (args && typeof args === "object" && "force_duplicate_filename" in args) delete args.force_duplicate_filename;

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

      // Rewrite BD's misleading "list_seo not found" 404 into something
      // agents can act on. BD returns this string for both single-record
      // misses and empty filtered lists, which agents misread as "the
      // list_seo TABLE is missing" (a system-level failure) and abort
      // retries. Distinguish + rephrase:
      //   - getWebPage with a non-existent seo_id → "No list_seo record
      //     with seo_id=N" (still error; clear that the record is the
      //     thing missing, not the table).
      //   - listWebPages with a filter that matches nothing → status
      //     "success" with empty message array + total=0 (success because
      //     the query worked correctly, it just found nothing).
      if (result.body && typeof result.body === "object" && result.body.status === "error" && result.body.message === "list_seo not found") {
        if (name === "getWebPage") {
          const id = args && args.seo_id !== undefined ? args.seo_id : "?";
          result.body.message = `No list_seo record with seo_id=${id}.`;
        } else if (name === "listWebPages") {
          // Empty filter result is success, not error.
          result.body.status = "success";
          result.body.message = [];
          result.body.total = result.body.total || 0;
          result.body.current_page = result.body.current_page || 1;
          result.body.total_pages = result.body.total_pages || 0;
        }
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
