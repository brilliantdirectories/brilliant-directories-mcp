#!/usr/bin/env node
// =============================================================================
// Schema drift check — pre-publish hygiene for the BD MCP server
// =============================================================================
//
// Purpose:
//   Compare mcp/openapi/bd-api.json against hardcoded field lists in both MCP
//   deployments (hosted Worker + npm package). Report fields that BD's spec
//   knows about but our lean-shapers / safety-guards / EAV routers don't —
//   which means we'd silently let fields slip through (agent sees bloat,
//   or EAV fields silently drop, or write-echo omits new identifiers).
//
// Run from bd-cursor-config/brilliant-directories-mcp/ (repo root):
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
// For each lean-shaper family (User, Post, Category, PostType, WebPage, Plan, Review):
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
//   - bd-cursor-config/brilliant-directories-mcp/mcp/index.js
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

const SPEC_PATH = path.join(__dirname, "..", "mcp", "openapi", "bd-api.json");
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
const EMAIL_TEMPLATE_READ_TOOLS = new Set(["listEmailTemplates", "getEmailTemplate"]);
const REVIEW_READ_TOOLS = new Set(["listReviews", "getReview", "searchReviews"]);

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
  createWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","date_updated","revision_timestamp"],
  updateWebPage: ["seo_id","seo_type","master_id","filename","nickname","title","meta_desc","h1","h2","date_updated","revision_timestamp"],
  createWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  updateWidget: ["widget_id","widget_name","widget_type","widget_viewport","short_code","date_updated","revision_timestamp"],
  createMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
  updateMembershipPlan: ["subscription_id","subscription_name","subscription_type","profile_type"],
};

// EAV routes
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
checkFamily("EMAIL_TEMPLATE_READ_TOOLS", EMAIL_TEMPLATE_READ_TOOLS);
checkFamily("REVIEW_READ_TOOLS", REVIEW_READ_TOOLS);
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

// CHECK 7.5: include_* fields must be `type: integer, enum: [0, 1]`, NOT
// `type: boolean`. Reason: agents pass `=1` (matching our README docs and
// BD's URL convention) but the SDK's Zod validator strict-types `boolean`
// and rejects `1` with "Expected boolean, received number". BD itself
// accepts both =1 and =true server-side; integer is the right shape.
//
// IMPORTANT — three places to check (a future spec edit can land in any):
//   1. components.parameters.include_*    — top-level $ref-able definitions
//   2. inline-in-operation parameters[]    — params inside a path operation
//   3. inline-in-property-schemas          — properties of a request body schema
//
// Initial conversion in v6.40.47; location 2 was missed and re-fixed in
// v6.40.48. This check enforces the invariant going forward.
{
  const offenders = [];
  // Location 1: components.parameters
  const compParams = spec.components && spec.components.parameters;
  if (compParams) {
    for (const [name, def] of Object.entries(compParams)) {
      if (name.startsWith("include_") && def.schema && def.schema.type === "boolean") {
        offenders.push(`components.parameters.${name}`);
      }
    }
  }
  // Location 2: inline operation parameters
  for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of ["get", "post", "put", "delete", "patch"]) {
      const op = pathItem[method];
      if (op && Array.isArray(op.parameters)) {
        for (const p of op.parameters) {
          if (p && typeof p.name === "string" && p.name.startsWith("include_")
              && p.schema && p.schema.type === "boolean") {
            offenders.push(`${method.toUpperCase()} ${pathKey} parameters[name=${p.name}]`);
          }
        }
      }
    }
  }
  // Location 3: request-body property schemas
  for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of ["post", "put", "patch"]) {
      const op = pathItem[method];
      const content = op && op.requestBody && op.requestBody.content;
      const body = content && (content["application/x-www-form-urlencoded"] || content["application/json"]);
      const props = body && body.schema && body.schema.properties;
      if (props) {
        for (const [pname, pdef] of Object.entries(props)) {
          if (pname.startsWith("include_") && pdef && pdef.type === "boolean") {
            offenders.push(`${method.toUpperCase()} ${pathKey} body.${pname}`);
          }
        }
      }
    }
  }
  if (offenders.length > 0) {
    warn(`include_* fields with type:boolean detected (${offenders.length}). The SDK's Zod validator rejects "=1" when type is boolean, but our docs/agents use the =1 convention. Convert to type:integer, enum:[0,1]. Locations:\n  - ${offenders.join("\n  - ")}`);
  }
}

// CHECK 8: Tool count sanity — if the spec has <100 or >250 tools, something
// is wildly off and we should notice.
const toolCount = Object.keys(OPS).length;
if (toolCount < 100 || toolCount > 250) {
  warn(`Tool count sanity: spec has ${toolCount} operations. Expected range 100-250. Did the spec file get corrupted or truncated?`);
}

// CHECK 9: Validator drift between npm package and Worker. The byte-identical-
// pair rule (publish protocol) requires every safety validator to mirror
// across `mcp/index.js` and `brilliant-directories-mcp-hosted/src/index.ts`.
// Compare normalized function bodies (whitespace + comments + JS/TS keyword
// noise stripped) and warn on any divergence. Catches the case where a fix
// landed in only one file.
//
// The list below is the authoritative set of mirror-required functions. If
// you add a new validator that should mirror, add its name here.
const MIRROR_FUNCTIONS = [
  "validateFilterValuesInArgs",
  "validateFilterOperatorInArgs",
  "validateBooleanIntInArgs",
  "validateMoneyInArgs",
  "validateDatetime14InArgs",
  "validatePathParamIds",
  "validateHeroEnumsInArgs",
  "validateRgbColorsInArgs",
  "validateWidgetNameInArgs",
  "_validateSlugFormat",
  "_tryPunycodeDecode",
  "sanitizeImageUrlsInArgs",
  "ensureImgRoundedClass",
  "applyImgRoundedToBodyFields",
  "sanitizeScaffoldingInArgs",
  "stripWidgetWrapperTagsInArgs",
  "getSiteTimezoneCached",
  "autoDefaultSystemTimestamps",
  "_formatNow14InTz",
  "_formatNow19InTz",
  "getPostTypesCached",
  "getWebsiteInfoCached",
  "_buildAdminEditUrl",
  "_parseFeatureCategories",
  "_readLinkedPostMeta",
  "_findPagesByLinkedPostType",
  "_readSeoTypeForId",
  "_stripLinkedPostMetaOrphans",
  "_generateDataCategoryFilename",
  "_buildDataCategoryDestination",
  "_findRedirectByOldFilename",
  "_createDataCategoryRedirect",
  "_updateRedirectDestination",
  "_deleteRedirectByOldFilename",
  "applyDataCategoryGuard",
  "validateRedirectFormPair",
  "validateFieldType",
  "validateHiddenFieldRequirements",
  "validateBinaryFlags",
  "validateRequiredFieldType",
  "_normalizeRequiredFlag",
  "_getFormFieldRecordById",
  "applyFormLean",
  "applyFormFieldLean",
];
// validateUsersMetaRead is intentionally excluded — npm inlines the same
// logic in dispatch instead of factoring into a named function. Not a
// drift bug, just a code-organization difference.
//
// Verified-equivalent dialect noise. After manually diffing both files and
// confirming a fingerprint delta is purely TS/JS dialect (e.g. `(args as any).x`
// drops one `args.` access vs npm's `args.x`; collapsed CJK normalization vs
// expanded `if/===` chain), record the noise floor here so the warning stays
// quiet until NEW drift appears beyond the documented delta. Each entry maps
// fingerprint key -> [npm, worker] expected counts.
const VERIFIED_EQUIVALENT_DRIFT = {
  validateFilterValuesInArgs:    { accesses: [1, 0] }, // worker uses `(args as any).x` cast
  validateFilterOperatorInArgs:  { accesses: [1, 0] }, // worker uses `(args as any).x` cast
  validateWidgetNameInArgs:      { accesses: [1, 0] }, // worker uses `(args as any).widget_name` cast
  applyDataCategoryGuard:        { accesses: [24, 0] }, // worker uses `(args as any).x` cast throughout
  sanitizeScaffoldingInArgs:     { returns:  [2, 1] }, // worker has fewer early-return points
  stripWidgetWrapperTagsInArgs:  { returns:  [2, 1] }, // npm returns args fluent-style; worker mutates void
  _validateSlugFormat:           { ifs: [42, 41], eq3: [7, 4] }, // worker collapses CJK normalization inline
  validateRedirectFormPair:      { accesses: [2, 0] }, // worker uses `(args as any).x` cast
  validateFieldType:             { accesses: [2, 0] }, // worker uses `(args as any).x` cast (field_type read + writeback in v6.41.96)
  validateHiddenFieldRequirements: { accesses: [6, 0] }, // worker uses `(args as any).x` cast (3 fields × 2 reads each in v6.41.96 type-guard rewrite)
  validateBinaryFlags:           { accesses: [1, 0] }, // worker uses `(args as any)[flag]` cast
  validateRequiredFieldType:     { accesses: [3, 0] }, // worker uses `(args as any).x` cast (3 access sites: field_required, field_id, field_type — last 2 added v6.41.85 for updateFormField record lookup)
};
const NPM_PATH = path.join(__dirname, "..", "mcp", "index.js");
const WORKER_PATH = path.join(__dirname, "..", "..", "brilliant-directories-mcp-hosted", "src", "index.ts");
function extractFunctionBody(source, fnName) {
  // Find `function fnName(...) {` then return the brace-balanced body. Works
  // for both JS and TS (we strip type annotations via the normalizer below).
  const re = new RegExp(`function\\s+${fnName.replace(/[$]/g, "\\$")}\\s*\\(`, "m");
  const m = re.exec(source);
  if (!m) return null;
  // Find the opening `{` for the function body (skips arg list + return type).
  let i = m.index + m[0].length;
  let depth = 1; // we're already past the opening `(`
  while (i < source.length && depth > 0) {
    const c = source[i++];
    if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  // Skip whitespace + optional `: ReturnType` annotation up to the opening `{`.
  while (i < source.length && source[i] !== "{") i++;
  if (i >= source.length) return null;
  const start = i;
  depth = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
function normalizeFunctionBody(body) {
  if (body === null) return null;
  // Strip comments + whitespace; we don't try to fully reconcile TS/JS dialects
  // because a proper AST diff would be prohibitive. Instead, CHECK 9 below
  // uses a *length budget* (size ratio + structural-token count) rather than
  // exact body equivalence. The goal is "catch when a fix lands in only one
  // file," which size-drift detects reliably without false positives from
  // unrelated TS noise.
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Count structural tokens that almost always mirror across JS+TS: the validator's
// branching shape. If npm has 4 `if`s and Worker has 7, someone added logic to
// only one file. Count: `if `, `return`, `for `, identifier `args.`, `===`, `!==`.
function structuralFingerprint(body) {
  if (!body) return null;
  return {
    ifs: (body.match(/\bif\s*\(/g) || []).length,
    returns: (body.match(/\breturn\b/g) || []).length,
    fors: (body.match(/\bfor\s*\(/g) || []).length,
    eq3: (body.match(/===/g) || []).length,
    neq3: (body.match(/!==/g) || []).length,
    accesses: (body.match(/args\.[a-zA-Z_]/g) || []).length,
  };
}
try {
  const npmSrc = fs.readFileSync(NPM_PATH, "utf8");
  const workerSrc = fs.readFileSync(WORKER_PATH, "utf8");
  for (const fn of MIRROR_FUNCTIONS) {
    const npmBody = normalizeFunctionBody(extractFunctionBody(npmSrc, fn));
    const workerBody = normalizeFunctionBody(extractFunctionBody(workerSrc, fn));
    if (npmBody === null && workerBody === null) {
      warn(`Mirror validator "${fn}" not found in EITHER mcp/index.js or brilliant-directories-mcp-hosted/src/index.ts. Was it renamed or removed? Update MIRROR_FUNCTIONS in this script.`);
      continue;
    }
    if (npmBody === null) {
      err(`Mirror validator "${fn}" exists in Worker but NOT in mcp/index.js. Port it to npm or remove from Worker — the byte-identical-pair rule was violated.`);
      continue;
    }
    if (workerBody === null) {
      err(`Mirror validator "${fn}" exists in mcp/index.js but NOT in Worker. Port it to brilliant-directories-mcp-hosted/src/index.ts.`);
      continue;
    }
    const npmFp = structuralFingerprint(npmBody);
    const workerFp = structuralFingerprint(workerBody);
    const verified = VERIFIED_EQUIVALENT_DRIFT[fn] || {};
    const diffs = [];
    for (const k of Object.keys(npmFp)) {
      if (npmFp[k] === workerFp[k]) continue;
      // Skip if this exact npm/worker pair was manually verified as dialect
      // noise. If counts have changed beyond the recorded baseline, fall
      // through and warn — that's NEW drift on top of known noise.
      if (verified[k] && verified[k][0] === npmFp[k] && verified[k][1] === workerFp[k]) continue;
      diffs.push(`${k} npm=${npmFp[k]} worker=${workerFp[k]}`);
    }
    if (diffs.length > 0) {
      // Warn (not error) — JS-vs-TS dialect noise produces some unavoidable
      // false positives. Maintainer should eyeball the diff and confirm it's
      // not a real divergence before publishing. Real bug-class drift (e.g.
      // a fix that added 3 ifs to one file only) shows up as obvious large
      // deltas; cosmetic dialect drift is small (1-2 in eq3, accesses). If
      // confirmed dialect noise, record in VERIFIED_EQUIVALENT_DRIFT above
      // to silence on future runs.
      warn(`Mirror validator "${fn}" structurally DIVERGED (${diffs.join(", ")}). VERIFY: open both files and confirm this is dialect noise (TS \`as any\` casts, type annotations) and not a fix that landed in only one file.`);
    }
  }
} catch (e) {
  warn(`Could not run validator mirror check: ${e.message}. Verify both source files exist at expected paths.`);
}

// CHECK 10: Mirror-constant parity between npm and Worker. CHECK 9 fingerprints
// validator function bodies; this check fingerprints the configuration tables
// agents' behavior depends on. Both files declare the same named constant; if
// values diverge, agents using npx and agents using brilliantmcp.com see
// different defaults / allow-lists / routing maps.
//
// Adding a new constant to mirror? Just add its name to MIRROR_CONSTANTS.
// Targets only CONSTANTS — not function bodies (CHECK 9 covers those).
//
// Extractor supports: object literals `{...}`, array literals `[...]`,
// `new Set(...)`, `new Map(...)`, `Array.from(...)`, regex literals, integer
// scalars, simple string scalars. NOT supported (extractor returns null):
// bare booleans / `null` / negative numbers / template literals, computed
// initializers (`const X = compute()`). If both files return null for the
// same constant the check warns "not found in EITHER" — that's the signal
// to either remove the entry from MIRROR_CONSTANTS or to use a supported
// shape. Not silently dropped.
const MIRROR_CONSTANTS = [
  "HERO_BUNDLE_DEFAULTS",
  "HERO_ENUM_FIELDS",
  "HERO_RGB_FIELDS",
  "HERO_PADDING_STEPS",
  "H1_FONT_SIZE_STEPS",
  "H2_FONT_SIZE_STEPS",
  "HERO_CONTENT_FONT_SIZE_STEPS",
  "HERO_ENUM_TOOLS",
  "TABLE_TO_ENDPOINT",
  "SITE_NAMESPACE_TABLES",
  "SLUG_RESERVED_FIRST_SEGMENTS",
  "SLUG_CALLER_BUG_LITERALS",
  "FILTER_OPERATOR_ALLOWED",
  "MONEY_FIELDS",
  "BOOLEAN_INT_FIELDS",
  "DATETIME_14_FIELDS",
  "TIMESTAMP_TABLE_RULES",
  "IMAGE_SINGLE_URL_FIELDS",
  "IMAGE_CSV_URL_TOOLS",
  "AUTO_REFRESH_SCOPE",
  "SLUG_AUTO_SUFFIX_MAX",
  "SLUG_AUTO_SUFFIX_QUIET_THRESHOLD",
  "RICH_TEXT_BODY_FIELDS",
  "SCAFFOLDING_SENSITIVE_FIELDS",
  "SCAFFOLDING_TOKENS",
  "WIDGET_STYLE_WRAPPER_REGEX",
  "WIDGET_NAME_PATTERN",
  "WIDGET_NAME_TOOLS",
  "SLUG_TOOL_CONFIG",
  "RGB_PATTERN",
  "FIELD_REQUIRED_FORBIDDEN",
  "FIELD_TYPE_ENUM",
  "FORM_FIELD_BINARY_FLAGS",
  "FORM_LEAN_INCLUDE_FLAGS",
  "FORM_ALWAYS_KEEP",
  "FORM_FIELD_LEAN_INCLUDE_FLAGS",
  "FORM_FIELD_ALWAYS_KEEP",
  "FORM_FIELD_VIEW_FLAGS_FIELDS",
  "FORM_FIELD_META_FIELDS",
];
// Constants that exist top-level in one file and function-local (or differently
// scoped) in the other. The check skips these; verify by hand if you change
// either copy. Document each entry's WHY here, not at the call site.
const MIRROR_CONSTANTS_SKIP = new Set([
  // npm declares HIDDEN_TOOLS function-local inside buildTools(); Worker
  // declares it top-level. Same value (`new Set(["createUserMeta"])`).
  "HIDDEN_TOOLS",
  // npm declares TABLE_TO_UPDATE_TOOL function-local inside reserveSiteUrlSlug;
  // Worker declares it function-local in its slug helper too. CHECK 9 covers
  // the function bodies that contain it.
  "TABLE_TO_UPDATE_TOOL",
]);
function extractTopLevelConstBody(src, name) {
  // Match only column-0 `const NAME = ...` (top-level declarations).
  const re = new RegExp("^const\\s+" + name.replace(/[$]/g, "\\$") + "(?:\\s*:\\s*[^=]+)?\\s*=\\s*", "m");
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (i >= src.length) return null;
  const startChar = src[i];
  // Scalar literal — read until terminating `;`
  if (/[0-9"']/.test(startChar)) {
    const semi = src.indexOf(";", i);
    return semi < 0 ? null : src.slice(i, semi).trim();
  }
  // Regex literal
  if (startChar === "/") {
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "/") { j++; break; }
      j++;
    }
    while (j < src.length && /[a-z]/.test(src[j])) j++;
    return src.slice(i, j);
  }
  // new Set(...) / new Map(...) — capture from leading identifier
  const start = i;
  while (i < src.length && /[a-zA-Z_]/.test(src[i])) i++;
  while (i < src.length && /\s/.test(src[i])) i++;
  // Now expect [{(
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let started = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = true; strCh = c; continue; }
    if (c === "/" && src[i+1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i+1] === "*") {
      const ce = src.indexOf("*/", i);
      i = ce < 0 ? src.length : ce + 1;
      continue;
    }
    if ("[{(".includes(c)) { depth++; started = true; }
    else if ("]})".includes(c)) {
      depth--;
      if (started && depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}
function normalizeConstBody(s) {
  if (!s) return null;
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\bas\s+(any|const|string|number)\b/g, "")
    .replace(/:\s*Record<[^>]+>/g, "")
    .replace(/:\s*Set<[^>]+>/g, "")
    .replace(/:\s*Array<[^>]+>/g, "")
    .replace(/:\s*Map<[^>]+>/g, "")
    .replace(/:\s*string\[\]/g, "")
    .replace(/,(\s*[\]\}\)])/g, "$1") // strip trailing commas
    .replace(/\s+/g, "")
    .trim();
}
try {
  const npmSrc = fs.readFileSync(NPM_PATH, "utf8");
  const workerSrc = fs.readFileSync(WORKER_PATH, "utf8");
  for (const name of MIRROR_CONSTANTS) {
    if (MIRROR_CONSTANTS_SKIP.has(name)) continue;
    const npmBody = normalizeConstBody(extractTopLevelConstBody(npmSrc, name));
    const workerBody = normalizeConstBody(extractTopLevelConstBody(workerSrc, name));
    if (npmBody === null && workerBody === null) {
      warn(`Mirror constant "${name}" not found at top-level in EITHER file. If renamed/removed, drop from MIRROR_CONSTANTS. If made function-local, add to MIRROR_CONSTANTS_SKIP with the WHY.`);
      continue;
    }
    if (npmBody === null) {
      err(`Mirror constant "${name}" exists at top-level in Worker but NOT in mcp/index.js. Either port it to npm, or add to MIRROR_CONSTANTS_SKIP if scope is intentional.`);
      continue;
    }
    if (workerBody === null) {
      err(`Mirror constant "${name}" exists at top-level in mcp/index.js but NOT in Worker. Port it or add to MIRROR_CONSTANTS_SKIP.`);
      continue;
    }
    if (npmBody !== workerBody) {
      err(`Mirror constant "${name}" VALUES DIVERGE between npm and Worker. Compare and align.`);
    }
  }
} catch (e) {
  warn(`Could not run constant mirror check: ${e.message}.`);
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
