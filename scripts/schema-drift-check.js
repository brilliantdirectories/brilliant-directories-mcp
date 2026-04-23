#!/usr/bin/env node
// =============================================================================
// Schema drift check — pre-publish hygiene for the BD MCP server
// =============================================================================
//
// Purpose:
//   Compare openapi/bd-api.json against hardcoded field lists in both MCP
//   deployments (hosted Worker + npm package). Report fields that BD's spec
//   knows about but our lean-shapers / safety-guards / EAV routers don't —
//   which means we'd silently let fields slip through (agent sees bloat,
//   or EAV fields silently drop, or write-echo omits new identifiers).
//
// Run from gh-mirror2/ root:
//   node scripts/schema-drift-check.js
//
// Exit codes:
//   0  — no drift detected (or only ignorable shift)
//   1  — drift detected; review output + update constants before publishing
//   2  — script error (spec file missing, parse failure, etc.)
//
// Required as a pre-publish step (see feedback_publish_protocol.md). Never
// ship a version bump without running this and reconciling any warnings.
//
// -----------------------------------------------------------------------------
// What gets checked
// -----------------------------------------------------------------------------
//
// For each lean-shaper family (User, Post, Category, PostType, WebPage, Plan):
//   Compare the spec's fields on the read-operation responses vs. our
//   ALWAYS_STRIP, SEO_BUNDLE, CODE_BUNDLE, ALWAYS_KEEP, CONFIG_FIELDS,
//   DISPLAY_FLAG_FIELDS constants. Any spec field not in ANY of our
//   known-field sets is a candidate for "we forgot to categorize it."
//
// For WRITE_KEEP_SETS:
//   For each write operation (create*, update*) with a keep-set, compare
//   our kept fields against the spec's response shape. Fields present in
//   the spec but not in our keep-set = agent can't see them on write success.
//
// For EAV_ROUTES.updateWebPage.eavFields:
//   Compare our hero-field list against fields present in updateWebPage's
//   request-body schema but NOT in BD's list_seo table core fields. New
//   hero fields in BD → agent silently drops them on updateWebPage.
//
// For HIDDEN_TOOLS:
//   Verify every hidden operationId still exists in the spec (we don't
//   want to hide a tool that BD already removed).
//
// For tool-family sets (USER_READ_TOOLS etc.):
//   Verify every listed operationId still exists + flag new read ops BD
//   added that might deserve a lean shaper.
//
// -----------------------------------------------------------------------------
// Why this script exists
// -----------------------------------------------------------------------------
//
// BD's OpenAPI spec is the single source of truth for the tool catalog.
// But the BD-specific business logic (lean shapers, write-echo keep sets,
// EAV routing) is hand-maintained in two files:
//   - bd-cursor-config/brilliant-directories-mcp-hosted/src/index.ts
//   - gh-mirror2/mcp/index.js
//
// Both files list explicit field names. When BD adds a new field to (say)
// `users_data`, both files need updating — or the new field silently
// either (a) bloats every listUsers response (if not in a strip list),
// (b) gets lost in write-echoes (if not in WRITE_KEEP_SETS), or (c) drops
// silently on updateWebPage (if it's a hero field not in EAV_ROUTES).
//
// This script catches all three categories before they ship.
// =============================================================================

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Load the spec
// ---------------------------------------------------------------------------

const SPEC_PATH = path.join(__dirname, "..", "openapi", "bd-api.json");
let spec;
try {
  spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
} catch (err) {
  console.error(`FATAL: could not read ${SPEC_PATH}: ${err.message}`);
  process.exit(2);
}

// Build a quick map: operationId → {method, path, op}
const OPS = {};
for (const [urlPath, methods] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(methods)) {
    if (op && typeof op === "object" && op.operationId) {
      OPS[op.operationId] = { method: method.toUpperCase(), path: urlPath, op };
    }
  }
}

// ---------------------------------------------------------------------------
// Define what the hosted Worker + npm package know about.
// These MUST stay in sync with the constants in src/index.ts and mcp/index.js.
// When those files change, update this block too.
// ---------------------------------------------------------------------------

const HIDDEN_TOOLS = new Set(["createUserMeta"]);

// Read-tool families: operationIds that each lean shaper handles.
const USER_READ_TOOLS = new Set(["listUsers", "getUser", "searchUsers"]);
const POST_READ_TOOLS = new Set([
  "listSingleImagePosts", "getSingleImagePost", "searchSingleImagePosts",
  "listMultiImagePosts", "getMultiImagePost", "searchMultiImagePosts",
]);
const CATEGORY_READ_TOOLS = new Set([
  "listTopCategories", "getTopCategory", "listSubCategories", "getSubCategory",
]);
const POST_TYPE_READ_TOOLS = new Set(["listPostTypes", "getPostType"]);
const WEB_PAGE_READ_TOOLS = new Set(["listWebPages", "getWebPage"]);
const PLAN_READ_TOOLS = new Set(["listMembershipPlans", "getMembershipPlan"]);

// BD column-name note — if any future CHECK validates PLAN membership
// display flags, be aware `show_sofware` (missing "t") is spelled that way
// deliberately. Matches BD's actual DB column name. BD shipped the typo
// years ago and has never migrated. Do NOT "fix" this if you see it in
// spec fields; the real column won't resolve if corrected. Same warning
// lives in `mcp/index.js` near `PLAN_DISPLAY_FLAG_FIELDS`.

// (Removed 2026-04-23: the per-family `*_KNOWN_FIELDS` aggregator sets
// and their source constants — USER_LEAN_*, POST_LEAN_*, POST_TYPE_*,
// WEB_PAGE_*, PLAN_*, CATEGORY_SCHEMA_BUNDLE. They defined the "expected
// response fields" envelope per family but were never consumed by any
// CHECK in this script. A cold-AI audit flagged them as dead code. The
// intent was a CHECK 9 "unknown field in spec response" validator that
// never shipped; if that check is ever built, re-introduce the sets
// INSIDE the new check so they're only added when consumed. Don't
// resurrect them speculatively.)

// Write-response lean echo
const WRITE_KEEP_SETS = {
  createUser: ["user_id","first_name","last_name","company","email","filename","active","status","subscription_id","profession_id"],
  updateUser: ["user_id","first_name","last_name","company","email","filename","active","status","subscription_id","profession_id"],
  createSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image"],
  updateSingleImagePost: ["post_id","post_title","post_filename","post_type","user_id","post_status","data_id","data_type","system_name","data_name","post_image"],
  createMultiImagePost: ["group_id","group_name","group_filename","user_id","group_status","data_id","data_type","system_name","data_name","revision_timestamp"],
  updateMultiImagePost: ["group_id","group_name","group_filename","user_id","group_status","data_id","data_type","system_name","data_name","revision_timestamp"],
  // createPostType removed — not in spec (post types created via admin UI only)
  updatePostType: ["data_id","data_type","system_name","data_name","data_filename","form_name","revision_timestamp"],
  createTopCategory: ["profession_id","name","filename","revision_timestamp"],
  updateTopCategory: ["profession_id","name","filename","revision_timestamp"],
  createSubCategory: ["service_id","name","filename","profession_id","master_id","revision_timestamp"],
  updateSubCategory: ["service_id","name","filename","profession_id","master_id","revision_timestamp"],
  createWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","revision_timestamp"],
  updateWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","revision_timestamp"],
  createWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  updateWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
};

// EAV routes
const EAV_ROUTES = {
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

// users_meta
const USERS_META_WRITES = new Set(["updateUserMeta", "deleteUserMeta", "createUserMeta"]);
const USERS_META_FILTER_READS = new Set(["listUserMeta"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRef(ref) {
  if (!ref || !ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let node = spec;
  for (const part of parts) {
    if (!node || typeof node !== "object") return null;
    node = node[part];
  }
  return node;
}

// Get the request-body property names for a write operation's form body.
function getRequestBodyProperties(operationId) {
  const opEntry = OPS[operationId];
  if (!opEntry) return null;
  const schema = opEntry.op.requestBody?.content?.["application/x-www-form-urlencoded"]?.schema;
  if (!schema || !schema.properties) return null;
  return Object.keys(schema.properties);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const warnings = [];
const errors = [];

function warn(msg) {
  warnings.push(msg);
}
function err(msg) {
  errors.push(msg);
}

// CHECK 1: HIDDEN_TOOLS — every hidden tool must still exist in the spec.
for (const hidden of HIDDEN_TOOLS) {
  if (!OPS[hidden]) {
    warn(`HIDDEN_TOOLS: "${hidden}" is no longer in the spec. Can be removed from HIDDEN_TOOLS.`);
  }
}

// CHECK 2: Each family's read tools must all exist.
function checkFamily(familyName, familySet) {
  for (const t of familySet) {
    if (!OPS[t]) {
      err(`${familyName}: "${t}" is no longer in the spec. Remove from ${familyName} or fix the spec.`);
    }
  }
}
checkFamily("USER_READ_TOOLS", USER_READ_TOOLS);
checkFamily("POST_READ_TOOLS", POST_READ_TOOLS);
checkFamily("CATEGORY_READ_TOOLS", CATEGORY_READ_TOOLS);
checkFamily("POST_TYPE_READ_TOOLS", POST_TYPE_READ_TOOLS);
checkFamily("WEB_PAGE_READ_TOOLS", WEB_PAGE_READ_TOOLS);
checkFamily("PLAN_READ_TOOLS", PLAN_READ_TOOLS);
checkFamily("USERS_META_WRITES", USERS_META_WRITES);
checkFamily("USERS_META_FILTER_READS", USERS_META_FILTER_READS);

// CHECK 3: WRITE_KEEP_SETS — every keep-set op must still exist.
for (const toolName of Object.keys(WRITE_KEEP_SETS)) {
  if (!OPS[toolName]) {
    err(`WRITE_KEEP_SETS: "${toolName}" is no longer in the spec. Remove or rename.`);
  }
}

// CHECK 4: EAV_ROUTES — parent tool must still exist.
for (const toolName of Object.keys(EAV_ROUTES)) {
  if (!OPS[toolName]) {
    err(`EAV_ROUTES: "${toolName}" is no longer in the spec. EAV routing for this tool is dead code.`);
  }
}

// CHECK 5: Look for new read endpoints in each family's resource that might
// need a shaper. Scan for operationIds matching the family's naming pattern.
function findUnregisteredReadTools(familyName, patterns, registeredSet) {
  const candidates = Object.keys(OPS).filter((opId) => {
    return patterns.some((pat) => opId.match(pat));
  });
  const unregistered = candidates.filter((opId) => !registeredSet.has(opId));
  if (unregistered.length > 0) {
    warn(`${familyName}: ${unregistered.length} matching read op(s) in spec NOT registered. Review: ${unregistered.join(", ")}`);
  }
}
findUnregisteredReadTools("USER_READ_TOOLS",
  [/^listUsers?$/, /^getUser$/, /^searchUsers$/],
  USER_READ_TOOLS);
// Post read-op scan: exclude metadata/photo endpoints — these operate on
// related resources (form-field schemas, photo sub-records) not the post
// record itself. They don't benefit from applyPostLean.
const POST_READ_EXCLUSIONS = new Set([
  "getSingleImagePostFields",     // form-field schema, not a post record
  "getMultiImagePostFields",       // same
  "listMultiImagePostPhotos",      // sub-record: photos belonging to a post
  "getMultiImagePostPhoto",        // single sub-record
]);
const postReadCandidates = Object.keys(OPS).filter((opId) =>
  /^(list|get|search)(Single|Multi)ImagePost/.test(opId) &&
  !POST_READ_EXCLUSIONS.has(opId) &&
  !POST_READ_TOOLS.has(opId)
);
if (postReadCandidates.length > 0) {
  warn(`POST_READ_TOOLS: ${postReadCandidates.length} matching read op(s) in spec NOT registered. Review: ${postReadCandidates.join(", ")}`);
}
// (The generic `findUnregisteredReadTools` helper works well for User-family
// reads but can't express POST_READ_EXCLUSIONS — that's why we do the POST
// scan inline above. Don't re-add a helper call here; it would either duplicate
// the inline scan or fire with no-op patterns.)

// CHECK 6: EAV drift — scan updateWebPage's request-body properties for
// hero_*/h[12]_*/disable_*/linked_* fields NOT currently in eavFields.
// These are the naming conventions we've observed BD uses for EAV-stored
// fields on list_seo.
//
// False-positive hazard: some `disable_*` / `linked_*` fields are stored
// directly on list_seo (not EAV-routed), so they match the pattern but
// should NOT be warned about. Known exclusions go below — add here when a
// new non-EAV field happens to match the pattern. This is an explicit
// opt-out instead of tightening the regex, because BD's naming isn't
// disciplined enough to rely on regex alone.
const EAV_PATTERN_EXCLUSIONS = new Set([
  // Non-EAV fields that happen to match /^disable_/ — stored on list_seo row directly.
  "disable_css_stylesheets",
  // Add more as BD ships fields that match the pattern but aren't EAV-routed.
]);
const updateWebPageProps = getRequestBodyProperties("updateWebPage");
if (updateWebPageProps) {
  const EAV_NAME_PATTERNS = [/^hero_/, /^h[12]_(font|weight)/, /^disable_/, /^linked_/];
  const knownEav = EAV_ROUTES.updateWebPage.eavFields;
  const candidates = updateWebPageProps.filter((name) =>
    EAV_NAME_PATTERNS.some((re) => re.test(name)) &&
    !knownEav.has(name) &&
    !EAV_PATTERN_EXCLUSIONS.has(name)
  );
  if (candidates.length > 0) {
    warn(`EAV_ROUTES.updateWebPage.eavFields: ${candidates.length} hero-pattern field(s) in spec NOT in eavFields. Agent's updateWebPage call would silently drop these: ${candidates.join(", ")}. If any of these are stored directly on list_seo (not EAV), add to EAV_PATTERN_EXCLUSIONS above.`);
  }
}

// CHECK 7: WRITE_KEEP_SETS freshness — for each keep-set, compare against
// the response shape if we can infer it. This is best-effort — BD's spec
// responses don't always itemize every field.
// We check that every field in our keep-set still appears in the tool's
// REQUEST BODY (since write responses mirror request shape closely).
for (const [toolName, keepFields] of Object.entries(WRITE_KEEP_SETS)) {
  const bodyProps = getRequestBodyProperties(toolName);
  if (!bodyProps) continue; // skip if spec doesn't describe the body
  const bodySet = new Set(bodyProps);
  // Fields we keep that aren't in the body = probably response-only
  // identifiers (like user_id for createUser). Don't flag.
  // Fields in body but not in our keep-set = potentially useful identifiers
  // we're dropping from echoes.
  const candidateAdds = bodyProps.filter((f) => {
    if (keepFields.includes(f)) return false;
    // Only flag likely-identifiers + status fields (heuristic).
    // Known gaps — this regex will NOT flag:
    //   - Non-_id identifiers (`filename`, `slug`, `email`) → add manually
    //     if the agent needs them echoed on write success.
    //   - Aliased FKs (`profession_id` was caught; `profession_name` wouldn't
    //     be). Keep-sets should include both human + numeric identifiers
    //     when BD accepts either.
    //   - Timestamps other than `revision_timestamp` (`date_created`,
    //     `date_updated`) → deliberately unflagged; agents rarely need them.
    // This check is deliberately conservative — false-positive warnings
    // cost review cycles; false-negatives only cost a field in one echo.
    return /(_id$|^status$|^active$|^revision_timestamp$)/.test(f);
  });
  if (candidateAdds.length > 0) {
    warn(`WRITE_KEEP_SETS.${toolName}: ${candidateAdds.length} likely-identifier field(s) in request body NOT in keep-set. Consider adding so agent sees them on write success: ${candidateAdds.join(", ")}`);
  }
}

// CHECK 8: Tool count sanity — if the spec has <100 or >250 tools, something
// is wildly off and we should notice.
const toolCount = Object.keys(OPS).length;
if (toolCount < 100 || toolCount > 250) {
  warn(`Tool count sanity: spec has ${toolCount} operations. Expected range 100-250. Did the spec file get corrupted or truncated?`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
console.log("====================================================================");
console.log("  BD MCP Schema Drift Check");
console.log("====================================================================");
console.log(`  Spec: ${SPEC_PATH}`);
console.log(`  Operations in spec: ${toolCount}`);
console.log(`  Hidden tools: ${HIDDEN_TOOLS.size}`);
console.log("");

if (errors.length === 0 && warnings.length === 0) {
  console.log("  [OK] No drift detected. Safe to publish.");
  console.log("====================================================================");
  process.exit(0);
}

if (errors.length > 0) {
  console.log(`  [ERRORS - ${errors.length}]`);
  for (const e of errors) console.log(`    ! ${e}`);
  console.log("");
}

if (warnings.length > 0) {
  console.log(`  [WARNINGS - ${warnings.length}]`);
  for (const w of warnings) console.log(`    ? ${w}`);
  console.log("");
}

console.log("  How to resolve:");
console.log("    1. For each error/warning above, open BOTH:");
console.log("       - bd-cursor-config/brilliant-directories-mcp-hosted/src/index.ts");
console.log("       - mcp/index.js");
console.log("    2. Update the matching constant in BOTH files identically");
console.log("    3. Update this script's mirror copy at the top");
console.log("    4. Re-run this script until it's clean");
console.log("    5. Deploy Worker (npx wrangler deploy) + publish npm");
console.log("");
console.log("  If a warning is a false positive (e.g., a BD field that's");
console.log("  intentionally exposed without shaping), document WHY in a");
console.log("  comment where the constant lives. For EAV pattern false-");
console.log("  positives specifically, add the field to EAV_PATTERN_EXCLUSIONS.");
console.log("====================================================================");

process.exit(errors.length > 0 ? 1 : 0);
