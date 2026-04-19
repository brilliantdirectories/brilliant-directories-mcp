# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.1.3] - 2026-04-19

### Changed — member-taxonomy section clarified in MCP instructions

Previous Taxonomy section could be confused with post types and didn't state the cardinality rule. Rewritten to:
- Open with "Member taxonomy (distinct from post types)" so agents never conflate member categories with the `data_type`-based post type families
- State the cardinality rule explicitly: "A member has EXACTLY ONE Top Category (`profession_id`) and MANY Sub / Sub-Sub Categories nested under it"
- Reinforce on each tier: Top = "One per member", Sub = "Multiple per member, all scoped under that member's single `profession_id`"
- Keep sub-sub nesting syntax cue (`master_id`) without expanding into a full subsection

Prevents agents from e.g., trying to assign a member to two top-level categories or creating sub-categories under the wrong parent when bulk-importing members.

## [6.1.2] - 2026-04-18

### Changed — instructions reframed as identity, SKILL.md repurposed as skill-meta, tool-chaining behavior added

**Instructions field (mcp/index.js) rewritten from procedural to identity-based.** Previous versions said "ACT, DON'T ASK" and "read the tool description first" — both too prescriptive, making the agent feel it was consulting a manual rather than operating with native BD knowledge. New framing:

- Opening line: "You operate Brilliant Directories sites... These tools and their descriptions are your native capability set — they describe what you can actually do, grounded in BD's live behavior."
- Honest pushback clause: "If a user assumes a capability that doesn't exist, say so plainly and suggest the closest supported path. Never fabricate tool calls, invent fields, or silently substitute."
- Business-questions clause: "For business decisions (who/what/when/tone/scope), ask only what you need to proceed, then execute."
- **Tool-chaining clause added:** "Chain or run multiple tools to compile the data points needed to satisfy the user's request." Followed by concrete 2-step and 3-step chain examples so agents know to plan multi-tool sequences upfront instead of treating each call as isolated.

**SKILL.md top section reframed.** Was a re-hash of tool docs; now leads with "What having this skill active means for your user" — concrete capability buckets (Member ops / Content ops / Taxonomy ops / Inbox & engagement / Site config / Billing introspection) with an example outcome unlock ("scrape 50 businesses → create members with logos → write blog showcasing them → add redirects preserving SEO"). Positions the skill as an outcome enabler, not a technical reference.

Result: agent loads the MCP at session start and absorbs BD as a native capability domain rather than a foreign API to look up. Chains multi-step workflows without being told to. Pushes back honestly when asked for out-of-scope things. Doesn't question-spam on capability questions.

## [6.1.1] - 2026-04-18

### Changed — tightened MCP `instructions` field (276 words, down from ~500)

Pass through the v6.1.0 instructions block removing every word that didn't earn its place. Same information, half the tokens. Also added an explicit "ACT, DON'T ASK" directive at the top to address the cold-agent behavior of question-spamming users for capability info that's already in the tool descriptions.

Each surviving line now carries unique actionable information — no generic framing, no repetition, no filler. This keeps the session-start context window lean while preserving every non-obvious capability agents were missing.

## [6.1.0] - 2026-04-18

### Added — expanded MCP server `instructions` field (loaded into agent context at session start)

Real-world cold-agent test exposed a gap: an agent answered a user's "create member with profile photo from a URL" request by claiming "I can't upload images directly from URLs via the MCP." That's **wrong** — our `createUser` tool description documents `auto_image_import=1` which auto-fetches external image URLs. But the agent answered BEFORE reading the tool description, based on typical-REST-API assumptions.

Fix: expanded the MCP server's `initialize` response `instructions` field (which every MCP client auto-loads into the agent's working context at session start, BEFORE the user asks anything). Now includes:

- **"Before claiming a limitation, READ THE TOOL DESCRIPTION FIRST"** directive with concrete examples of BD-specific capabilities agents commonly miss (auto_image_import, profession_name auto-create, services `parent=>child` syntax, send_email_notifications, filename-as-full-path for profile URLs)
- **Rate limit rules** + verifyToken prerequisite for bulk jobs
- **Pagination rules** with cursor-vs-numeric warning
- **Write safety rules** — destructive-op confirmation + `active=3` (Canceled) as reversible alternative to `deleteUser`
- **3-tier category hierarchy** — TopCategory / SubCategory / MemberSubCategoryLink with the "there is NO createProfession" warning inline
- **Post type family routing** — `data_type=4` → MultiImagePost, `data_type=9/20` → SingleImagePost, internal types skipped

Previously the `instructions` field was ~7 lines covering only rate limits + pagination + destructive warning. Now ~35 lines covering the decisions an agent needs to make BEFORE its first tool call.

This is the surface that EVERY MCP client (Claude Desktop, Cursor, Windsurf, Claude Code, etc.) loads automatically — distinct from SKILL.md (only loaded when explicitly installed as a Skill via Smithery or similar). Every agent using `brilliant-directories-mcp` now sees these rules from the moment their session starts.

### Why this matters

The agent's context on session start = MCP `initialize.instructions` + all tool descriptions from `tools/list`. If a capability isn't surfaced in the instructions field, agents will pre-filter their responses based on wrong assumptions BEFORE they scan tool descriptions. Putting the critical "don't pre-filter, read first" directive in the instructions ensures agents reach for the docs instead of guessing.

## [6.0.6] - 2026-04-18

### Fixed — CHANGELOG sensitivity scrub

Removed specific test-site subdomain references (4 mentions of a particular BD dev-internal test site, scrubbed to generic "a BD test site"). Dev-internal subdomains shouldn't be named in a public changelog — even though the URLs aren't secret, naming them tells outsiders which subdomains are dev/test instances. Generic language preserves the "verified live" claim without signposting test infrastructure.

Also removed the redundant "Zero personal names (name)" line from v6.0.3's security audit — ironically the only place a personal name still appeared. Now phrased as "Zero personal names" / "Zero typo'd email variants" without naming specifics.

## [6.0.5] - 2026-04-18

### Changed
Spelled out "Brilliant Directories" on first mention in the README tagline (was "your BD site", now "your Brilliant Directories site"). Full brand name on first reference; "BD" abbreviation used later. Cosmetic — matches branding convention.

## [6.0.4] - 2026-04-18

### Fixed — npm-page README was stale + drifted from root

Two issues caught:

1. **README.md hard-coded "170 endpoints across 32 resources"** — exactly the kind of count-quoting that rots as the spec evolves. Per the VISION.md rule ("avoid count numbers in user-facing copy"), rewrote the headline to list the domains covered (members, posts, leads, reviews, categories, email templates, pages, redirects, smart lists, widgets, menus, forms, tags, membership plans, and more) without any endpoint count.

2. **`mcp/README.md` never synced through v2.0.0–v6.0.3 renames** — the npm tarball ships `mcp/README.md`, not the root one, so **the npm page on npmjs.com was showing an outdated "Available Resources" table with old tool names** (`createPost`, `createPortfolioGroup`, `createCategory`, `Category Groups`, `createPage`, etc.). That resource table has now been synced from the root README. The npm page will reflect this on next publish — v6.0.4 carries the fix forward.

This is the kind of drift that creeps in when two files need to stay identical but only one gets edited. Going forward, the release playbook will explicitly copy root README → mcp README on every bump.

## [6.0.3] - 2026-04-18

### Hardened — security/privacy posture + OpenAPI info clarity

**`.gitignore` hardened** — expanded beyond `node_modules/` + `.env` to also cover:
- `.env.*` (any env variants)
- `.claude/`, `.cursor/`, `.vscode/`, `.idea/` (editor/tool local state — these CAN contain cached tool-call permission entries that embed API keys)
- `*.log`, `.DS_Store`, `Thumbs.db` (misc junk)

Prevents the class of leak where a Claude Code / Cursor tool-permission cache file accidentally lands in a commit. The tool cache in TESTBASH is outside this public repo and wasn't leaked — this is preventive hardening.

**OpenAPI `info.version` clarified** — the `2.0.0` in the spec refers to BD's REST API version (the `/api/v2/*` endpoints), NOT the MCP wrapper's release version. Added two extension fields to avoid confusion:
- `info.x-api-version-note` — explicit statement that info.version = BD REST API version
- `info.x-mcp-wrapper-version` — points to npmjs.com for the wrapper's current version

### Verified — no secrets/PII in public repo
- Zero API keys in any tracked file
- Zero personal names
- Zero typo'd email variants
- Zero AWS/Stripe/Slack/GitHub tokens
- All test data run tonight cleaned up on the BD test site

### Final state (49 tracked files)
- 7 JSON files all parse cleanly
- 4 OpenAPI spec copies byte-identical (GitHub + Bitbucket × root + mcp/)
- 8 critical files (package.json, SKILL, README, CHANGELOG, server.json, plugin.json, Dockerfile, .mcp.json) byte-identical across mirrors
- 164 ops in spec, all with footer/Returns/Use-when, zero duplicates or stale refs
- mcp/package.json, server.json, plugin.json all at 6.0.3

## [6.0.2] - 2026-04-18

### Fixed — version drift across metadata files

End-to-end repo audit found `server.json` and `plugin.json` still reported version `1.6.2` while `mcp/package.json` had advanced through 2.0.0 → 6.0.1 across tonight's releases. The GitHub Actions workflow syncs `server.json` from the git tag at publish time (so what ended up on the MCP Registry was correct), but the **committed source-of-truth value in the repo was stale** — anyone reading the repo or cloning cold would see outdated version claims.

Realigned all three metadata files (`mcp/package.json`, `server.json`, `plugin.json`) to the same version going forward. Going forward, the release workflow + manual release playbook both update all three atomically.

### Final repo integrity — all green
- 49 tracked files total (no stray scripts, backups, or artifacts)
- 7 JSON files all parse cleanly
- All 4 spec copies byte-identical (GitHub + Bitbucket × root + mcp/)
- 8 critical files byte-identical GitHub ↔ Bitbucket (package.json, SKILL, README, CHANGELOG, server.json, plugin.json, Dockerfile, .mcp.json)
- `docs/` folder fully in parity across mirrors
- 164 ops in spec, all structurally valid (no broken $refs, all have responses)

## [6.0.1] - 2026-04-18

### Fixed — per-parameter schema descriptions (4 fields)

Second-look audit found that while v6.0.0 added the clarifications to the op-level `description` field, some fields still had empty/shallow schema `properties[field].description` values. This matters because some MCP clients surface per-param hints in their UI WITHOUT showing the full op description. Fixed:

- **`createTagRelationship.tag_type_id`** — was empty. Now explicitly explains the tag_type_id → table_relation lookup pattern and the `listTagTypes` prerequisite call.
- **`createTagRelationship.object_id`** — was empty. Now explains that it references the PK of the table named by tag_type_id's table_relation, with user_id example.
- **`createSmartList.smart_list_query_params`** — said only "Filter criteria". Now documents the full type-dependent format rules (URL string for newsletter, JSON for others, "NA" if empty, don't pre-encrypt).
- **`createUnsubscribe.email`** — was empty. Now flags that BD unsubscribe is SITE-WIDE scope (no list granularity).

No op-level description changes — those were already complete from v6.0.0. This release just plumbs the same content into the schema-level `description` fields so tools that render per-param hints see it too.

## [6.0.0] - 2026-04-18

### BREAKING — `createPostType` removed

Per user direction, `createPostType` has been removed from the MCP server's tool list. Creating new post types is admin-panel work that belongs in BD admin → Website Design → Post Types, not in a general-purpose agent tool set. The underlying BD endpoint (`POST /api/v2/data_categories/create`) still exists on BD's side; this MCP wrapper simply stops exposing it as a tool.

**Remaining Post Type tools:** `listPostTypes`, `getPostType`, `updatePostType`, `deletePostType`, `getPostTypeCustomFields`.

Total operations: 165 → 164.

### Added — final field clarifications from BD admin UI

Answers to 8 long-standing ambiguities that agents would have otherwise guessed at, pulled from BD admin form-builder HTML:

- **`createForm` fields:**
  - `form_action`: `post` (default) or `get`
  - `form_layout`: `bootstrapvertical` (default, Labels Above Inputs) or `bootstrap` (Labels Left of Inputs)
  - `form_table`: default `website_contacts` — the table submissions post into
- **`createFormField` — full `field_type` enum** (29 values grouped into Select/Text/Fancy families): `Checkbox`, `Select`, `Radio`, `YesNo`, `Custom`, `Email`, `HTML`, `Button`, `Textbox`, `textarea`, `Url`, `Date`, `DateTimeLocal`, `File`, `FroalaEditor`, `FroalaEditorUserUpload`, `FroalaEditorUserUploadPreMadeElem`, `FroalaEditorAdmin`, `Tip`, `Hidden`, `Country`, `State`, `Number`, `Password`, `Phone`, `CountryCodePhone`, `Pricebox`, `ReCaptcha`, `HoneyPot`, `Category`, `Years`. Plus clarified `field_name` (internal key, underscores only) vs. `field_text` (display label) distinction. Plus form composition rule: exactly one `Button` field per form.
- **`createTagRelationship`:** the `tag_type_id` → `table_relation` mapping determines which table `object_id` references. Workflow documented: call `listTagTypes` first to see the mapping, then pick the right `tag_type_id`. Tags work on Users, Widgets, Menus, Forms — any table BD admin has configured as taggable.
- **`createRedirect`:** `type` defaults to `custom` for API-created redirects. Other types (`profile`, `post`, `category`) are BD-auto-generated on admin-triggered renames.
- **`createEmailTemplate`:** only `email_name` is truly required on create; `email_subject` and `email_body` are optional and can be filled via `updateEmailTemplate` later. Lets you scaffold templates programmatically before customizing.
- **`createSmartList`:** `smart_list_query_params` format is type-dependent — URL string for `newsletter` type, JSON string of filter key-value pairs (`{"subscription_id":"1","active":"1"}`) for all other types, `"NA"` if empty. Backend encrypts internally — do NOT pre-encrypt.
- **`createUnsubscribe`:** `email` is the only meaningful input. BD's unsubscribe is site-wide; no list-granularity via this endpoint.

All clarifications now appear inline in the affected tool descriptions AND in the schema-level parameter `description` fields where enum values map to UI labels.

## [5.3.2] - 2026-04-18

### Fixed — final doc cleanup: stale tool names in markdown docs

Deep audit caught 2 markdown files still referencing pre-rename tool names in their prose:
- `docs/api-data-types.md` — "`createPost`, `createPortfolioGroup`" → updated to the v5.0.0 names "`createSingleImagePost`, `createMultiImagePost`"
- `docs/api-pages.md` — "`createPage`" → updated to the v4.0.0 name "`createWebPage`", plus added the now-standard header block (tools, endpoint, table, primary key)

All CHANGELOG migration tables (Old → New) correctly retain the legacy names — those are intentional for consumer discoverability. No other stale refs found across the 280KB OpenAPI spec, README, SKILL.md, or any `docs/api-*.md` file.

### Integrity verified
- All 4 spec copies byte-identical (byte-level hash match)
- SKILL.md, README.md, CHANGELOG.md byte-identical between GitHub mirror and Bitbucket working copy
- No duplicate section markers, no empty section markers, no orphaned bullets
- 165/165 ops have universal footer, Returns, Use-when

## [5.3.1] - 2026-04-18

### Fixed — complete widgets documentation (all 6 ops rewritten)

Widget tool descriptions were under-specified and missing critical render-response details. Full rewrite based on BD support articles 12000108056 + 12000103396, verified live against a BD test site.

**Corrections:**
- `renderWidget` response shape has `name` and `output` as TOP-LEVEL siblings of `message`, NOT nested inside. Error response includes `name:""` and `output:""` as empty strings. Live-verified.
- `renderWidget` accepts either `widget_id` OR `widget_name` — both work as lookup keys. Added `widget_name` to schema properties.
- `renderWidget` has a prerequisite from BD docs: *"The widget needs to be customized to get the widget output"* — un-customized widgets return empty. Flagged inline.
- `renderWidget` has side effects — executes server-side PHP, may trigger DB queries, cache lookups, counter increments. Use carefully in loops.
- `output` field contains HTML body only — CSS (`widget_style`) and JS (`widget_javascript`) are separate fields, fetch via `getWidget` for external embedding.

**Added for every widget op:**
- Full 20-field widget object table (widget_type, widget_style, widget_javascript, widget_settings, widget_values, widget_viewport, widget_html_element, div_id, short_code, bootstrap_enabled, ssl_enabled, mobile_enabled — all previously undocumented)
- Concrete Use-when scenarios + sibling distinctions
- External-embedding workflow example

**Updated `docs/api-widgets.md`** with the full field schema, response examples (including the SEARCH widget output sample BD docs show), and the external-site render workflow.

## [5.3.0] - 2026-04-18

### Added — explicit "Use when" guidance on every single op (165/165)

Glama's "Use Guidelines" rubric asks whether each tool description explains WHEN to use this tool, WHY this tool vs. a sibling, and WHAT real-world scenario justifies it. Previous versions scored well on Returns/See-also but light on WHEN. This release closes that gap.

**Every one of 165 operations now has a `**Use when:**` section** with differentiated, resource-specific scenarios — no category fallback used. Each one:
- Names at least one concrete real-world BD scenario where an agent should pick THIS tool
- Compares to the sibling tool an agent might otherwise pick wrongly
- Flags any gotcha or prerequisite specific to this operation's domain

Examples of the per-resource reasoning now inline:
- `listUsers` — "For keyword/text search use `searchUsers`; for a single user by known `user_id` use `getUser`."
- `deleteUser` — "For reversible deactivation prefer `updateUser` with `active=3` (Canceled) — the record stays queryable and can be reactivated."
- `matchLead` — "SIDE EFFECT: sends real emails to real members. Confirm with the user before calling on production data."
- `createSingleImagePost` — "Look up `data_id` + `data_type` via `listPostTypes` first — if `data_type=4` on the post type, use `createMultiImagePost` instead."
- `deleteSubCategory` — "Any member with this `service_id` in their `users_data.services` CSV or in `rel_services` rows becomes orphaned — clean those up first."
- `updateMembershipPlan` — "Changes apply to NEW signups; existing members on this plan keep their original terms unless manually migrated."
- `updateWebPage` — "Changing `filename` breaks inbound links — create a `Redirect` via `createRedirect` to preserve SEO."
- `refreshSiteCache` — "Does NOT register newly created page URLs with the router — pages created via `createWebPage` become live immediately via `content_active=1` + valid `seo_type`."

Across the 34 resource families covered: Users, Posts (Single/Multi-Image + Fields), Leads + LeadMatches, Reviews, Clicks, Categories (Top/Sub + Member Links), Membership Plans, Web Pages, Redirects, Menus + Menu Items, Tags + Tag Groups + Tag Types + Tag Relationships, Forms + Form Fields, Email Templates, Widgets, Smart Lists, Unsubscribes, Post Types + Custom Fields, Data Types, User Photos, User Meta, Token, Site Cache.

**What was deliberately not done:** fluffy generic "Use when you want to list X" boilerplate. Every Use-when line contains concrete scenario detail or sibling distinction.

### Integrity verified
- 165/165 ops have footer, Returns, Use-when
- 153/165 have See-also (the 12 without are single-action endpoints like `verifyToken`, `refreshSiteCache`, `matchLead`, `loginUser`, `renderWidget` — no CRUD siblings to link, correctly omitted)
- Zero duplicate sections, zero empty section markers, zero stale tool-name references (except intentional "this tool doesn't exist — use X" warnings)

## [5.2.2] - 2026-04-18

### Fixed — `getUserTransactions` and `getUserSubscriptions` descriptions

Both endpoints were using the generic `get*` template that says "Fetch a single record" — misleading. verified live against a BD test site 2026-04-18 and rewrote both descriptions with accurate response-shape documentation:

- **`getUserTransactions`** (`POST /api/v2/user/transactions`) — returns member's invoice history. Response shape is `{ status, message: { total, invoices: [...] } }` — an object wrapping the invoices array, NOT a flat list. Each invoice includes WHMCS fields: `id`, `invoicenum`, `date`, `duedate`, `datepaid`, `subtotal`, `total`, `status`, `paymentmethod`, and per-line-item `items` array with `description`/`amount`/`type`/`relid`.

- **`getUserSubscriptions`** (`POST /api/v2/user/subscriptions`) — returns member's membership-plan history. Response shape is `{ status, message: { total, subscriptions: [...] } }`. Each subscription includes `packageid`, `regdate`, `nextduedate`, `billingcycle` (`Monthly`/`Yearly`), `paymentmethod`, `amount`, `domainstatus` (`Active`/`Cancelled`/`Pending`).

Both descriptions now explicitly call out that `message` is an OBJECT, not an array — agents should iterate `message.invoices` or `message.subscriptions`, not `message` directly. Also updated summaries to "Get member billing transactions (invoices)" and "Get member subscriptions (membership plan history)" for clearer tool-discovery hints.

Updated `docs/api-users.md` sections 8 and 9 with the same corrections.

## [5.2.1] - 2026-04-18

### Fixed & expanded — `services` parameter format documentation

Dev walked through `user.php:1840-1940` and I verified the sub-sub-category syntax live on the BD test site. Previous documentation was incomplete and one claim was wrong.

**Corrections from v5.2.0:**
- `profession_id` (or `profession_name`) **is REQUIRED** when passing `services` — previously mis-documented as optional context. Without a parent profession, service relationships fail silently per `user.php:1876`.
- **Cannot mix IDs and names in a single `services` call** — this rule was missing. Pick all-IDs or all-names per call.
- **Right side of `=>` is NAME-ONLY** — the sub-sub-category on the right of `=>` cannot be an ID. Left side accepts both, right side is strictly name lookup.
- **Changing `profession_id` on `updateUser` wipes all existing service relations** (`user.php:1832`) — critical destructive side-effect now flagged inline on the `updateUser` description. Migration guidance: re-send the full `services` list on the same update call to preserve sub-categories when moving top-level.
- **Whitespace around commas is trimmed automatically** (`user.php:1854`) — noted for clarity.

**Added — full `=>` sub-sub-category syntax:**

Live-tested this call against a BD test site:
```
createUser(profession_name="Auto Dealer", services="Honda=>2022,Honda=>2023,Toyota")
```
Result: auto-created profession "Auto Dealer" (profession_id=5), subs "Honda" (service_id=9, master_id=0) and "Toyota" (service_id=10, master_id=0), and sub-subs "2022" (service_id=11, master_id=9 = under Honda) and "2023" (service_id=12, master_id=9 = under Honda). Full 3-tier hierarchy built from one `createUser` call.

Formats documented in both the `createUser` and `updateUser` tool descriptions AND in `docs/api-users.md` Category handling section with a worked example per format.

### Cleaned up — redundant content
Removed 3 stale lines from v5.1.0 "Operational rules" sections on `createUser`/`updateUser` (the old `create_new_categories` description and the now-redundant Category-name-references bullet) since the new Category handling section covers them comprehensively.

## [5.2.0] - 2026-04-18

### Added — category-by-name support verified live + documented

Confirmed live against the BD test site (a BD test site, 2026-04-18) that `createUser` and `updateUser` accept category/service NAMES as strings in addition to numeric IDs, AND that auto-create behavior differs between the two operations:

- **`createUser`** — auto-create is ALWAYS ON (hardcoded). Pass `profession_name="Restaurants"` or `services="Sushi,Thai"` and BD creates the top-level category and sub-categories if they don't exist. No flag needed.
- **`updateUser`** — auto-create is OFF by default. Unknown names are silently skipped. Pass `create_new_categories=1` to enable auto-create during update.

**Spec changes:**
- Added `profession_name` property to both `createUser` and `updateUser` schemas with description explaining the name-vs-ID lookup behavior
- Added `create_new_categories` property to `updateUser` schema with description explaining when it takes effect
- Added `send_email_notifications` property to `createUser` schema (was only in prose before)
- Corrected the Prerequisites line on `createUser` — previously said `profession_id` must exist first; it doesn't (auto-created on create)
- Corrected the Prerequisites line on `updateUser` — mentions `create_new_categories=1` as the opt-in for auto-create
- Added "Category handling" section to both tool descriptions with the full truth table (Create vs Update, IDs vs Names, auto-create matrix)

**Doc changes:**
- `docs/api-users.md` "Prerequisites" and "Inline category creation" sections rewritten with the verified truth table
- `SKILL.md` "Things to always do" added rule #11 explaining when an agent can skip `createTopCategory`/`createSubCategory` calls and just pass names on `createUser` directly

**Reference audit:** verified all 30 BD support URLs cited across `docs/api-*.md` files — every URL title matches the doc file citing it. No broken or mismatched references. Clean.

## [5.1.0] - 2026-04-18

### Added — BD operational rules pulled from support articles into tool descriptions

Read the actual content of the secondary support URLs we linked in v5.0.0 and pulled the non-obvious business rules into tool descriptions where AI agents will see them at tool-discovery time. Previously the URLs were referenced but no content was surfaced.

**`createUser` + `updateUser` now document (from support article 12000091105):**
- `send_email_notifications=1` triggers the welcome email (off by default — API creates are silent)
- Email uniqueness rules (`allow_duplicate_member_emails` site setting, email+password combo ALWAYS unique)
- `token` format constraints (32 alphanumeric chars, unique)
- URL field validation (silently skips invalid formats; must start with `http://` or `https://`)
- Prerequisite: `subscription_id` and `profession_id` MUST exist before use
- Category/service name references need single quotes for values with dashes/spaces
- `create_new_categories=1` (updateUser only) allows inline sub/sub-sub category creation

**`createLead` now documents (from support article 12000091106):**
- `send_lead_email_notification=1` activates lead notification emails (off by default)
- Relationship with `matchLead` for the full auto-matching flow

**`docs/api-users.md` and `docs/api-leads.md`** got parallel "Operational rules" sections so anyone reading the docs directly gets the same info.

### Removed — incorrectly cited support URL

`docs/api-post-types.md` cited support article 12000103396 claiming it documented Data Types / `data_type` family values. Content inspection revealed that article is actually the **Widgets API** documentation — unrelated. Removed the wrong reference. No replacement article identified for the Data Types values (4/9/20/etc.) — those were derived from live-data inspection earlier tonight, which is documented in the tool descriptions themselves.

### Fixed — v5.0.1 footer regression
Re-appended the universal auth/rate/errors footer to 5 user ops (`listUsers`, `getUser`, `createUser`, `updateUser`, `searchUsers`) that lost it during the v1.6.3 Profile URL enrichment. Now all 165 ops end with the same disclosure block.

## [5.0.1] - 2026-04-18

### Fixed
- 5 user ops (`listUsers`, `getUser`, `createUser`, `updateUser`, `searchUsers`) lost their universal auth/rate-limit/errors footer during the Profile URL enrichment in v1.6.3. Re-appended the footer to all 5 so every tool description now ends with the consistent disclosure block. No functional regression — the footer is doc-only; agents behaved correctly even without it, but now it's back for consistency.

## [5.0.0] - 2026-04-18

### BREAKING — Post + PortfolioGroup + PortfolioPhoto tools renamed to SingleImagePost / MultiImagePost / MultiImagePostPhoto family

**Renamed tools (19):**

Post → SingleImagePost:
| Old | New |
|---|---|
| `listPosts` | `listSingleImagePosts` |
| `getPost` | `getSingleImagePost` |
| `createPost` | `createSingleImagePost` |
| `updatePost` | `updateSingleImagePost` |
| `deletePost` | `deleteSingleImagePost` |
| `searchPosts` | `searchSingleImagePosts` |
| `getPostFields` | `getSingleImagePostFields` |

PortfolioGroup → MultiImagePost:
| Old | New |
|---|---|
| `listPortfolioGroups` | `listMultiImagePosts` |
| `getPortfolioGroup` | `getMultiImagePost` |
| `createPortfolioGroup` | `createMultiImagePost` |
| `updatePortfolioGroup` | `updateMultiImagePost` |
| `deletePortfolioGroup` | `deleteMultiImagePost` |
| `searchPortfolioGroups` | `searchMultiImagePosts` |
| `getPortfolioGroupFields` | `getMultiImagePostFields` |

PortfolioPhoto → MultiImagePostPhoto:
| Old | New |
|---|---|
| `listPortfolioPhotos` | `listMultiImagePostPhotos` |
| `getPortfolioPhoto` | `getMultiImagePostPhoto` |
| `createPortfolioPhoto` | `createMultiImagePostPhoto` |
| `updatePortfolioPhoto` | `updateMultiImagePostPhoto` |
| `deletePortfolioPhoto` | `deleteMultiImagePostPhoto` |

### Added — `data_type` family decision flow

`createSingleImagePost` and `createMultiImagePost` descriptions now include an inline table explaining which endpoint to use based on the target post type's `data_type` value (looked up via `listPostTypes` / `getPostType`):

- `data_type=4` → Multi-Image family → `createMultiImagePost` (albums, galleries, Classified, Property, Product)
- `data_type=9` → Single-Image video → `createSingleImagePost`
- `data_type=20` → Single-Image article/event/blog/job/coupon → `createSingleImagePost`
- `data_type=10,13,21,29` → internal admin types — use resource-specific endpoints

Also inlined a worked-example for "make a blog post" and "make a photo album" intents.

### Added — `auto_image_import` default rule on both post families

Both `createSingleImagePost` and `createMultiImagePost` now document `auto_image_import=1` as the recommended default when any external image URL is supplied. Matches the same rule we added for `createUser` in v1.6.4. Verified supported on both post families per support article 12000093239.

### Added — secondary support article references in 6 doc files

`docs/api-users.md`, `api-leads.md`, `api-reviews.md`, `api-posts.md`, `api-portfolio-groups.md`, `api-portfolio-photos.md`, `api-unsubscribe.md`, `api-post-types.md` — each now has a "Related support articles" section citing BD's detailed endpoint guides beyond the single primary source.

## [4.0.0] - 2026-04-18

### BREAKING — Page tools renamed to WebPage + field labels clarified from BD admin UI

**Renamed tools (5):**

| Old | New |
|---|---|
| `listPages` | `listWebPages` |
| `getPage` | `getWebPage` |
| `createPage` | `createWebPage` |
| `updatePage` | `updateWebPage` |
| `deletePage` | `deleteWebPage` |

Rationale: "Page" was ambiguous (could mean pagination, post pages, etc.) and not self-describing. "WebPage" explicitly names the resource.

### Fixed — `show_form` field description was misleading

The `show_form` field on `createWebPage` / `updateWebPage` was documented as "1 = show contact form." **That's wrong.** Confirmed against the actual BD admin UI: `show_form=1` toggles the "Apply NoIndex, NoFollow" SEO directive on the page — it's a search-engine visibility control, NOT a contact-form toggle. BD repurposed this database column years ago but kept the legacy field name. Agents following the old description would get unexpected behavior.

### Added — BD Admin UI field-label mapping

Documented the UI labels for every obscurely-named field on Web Pages, sourced directly from the BD admin page-settings HTML:

| Field | Admin UI label |
|---|---|
| `content_layout` | Full Screen Page Width |
| `section` | Hide Banner Ad Modules |
| `hide_header` | Hide Header |
| `hide_footer` | Hide Footer |
| `hide_top_right` | Hide Top Header Menu |
| `hide_header_links` | Hide Main Menu |
| `content_images` | Click-Enlarge Images |
| `show_form` | Apply NoIndex, NoFollow |
| `disable_css_stylesheets` | Disable Default CSS Stylesheets |
| `disable_preview_screenshot` | Disable Screenshot Preview |
| `seo_text` | Wildcard URL Rewrite |
| `title` | Page Meta Title |
| `meta_desc` | Meta Description |
| `meta_keywords` | Meta Keywords |
| `h1` / `h2` | H1 / H2 Heading |
| `facebook_title` | Social Media Title (Open Graph) |
| `facebook_desc` | Social Media Description (Open Graph) |
| `facebook_image` | Social Media Shared Image |

Now surfaced both in the `createWebPage`/`updateWebPage` tool descriptions (full mapping table) AND in the schema-level per-parameter descriptions so MCP clients that only show per-param hints still see the UI label.

## [3.0.0] - 2026-04-18

### BREAKING — member-taxonomy tools renamed + rerouted to working BD endpoints

Live testing on 2026-04-18 confirmed:
- `/api/v2/category/*` endpoints in v2.x were **dead** — the underlying BD model mapped to a non-existent `category` table. All category CRUD was silently failing.
- `/api/v2/list_professions/*` is the **real, working** top-category endpoint. Full CRUD cycle (create/read/update/delete) verified live.

This release renames the 15 member-taxonomy tools to explicit hierarchy-aware names AND repoints category CRUD at the working endpoint. AI agents now get unambiguous guidance about BD's 3-tier member classification.

**Renamed tools (15):**

| Old v2.x | New v3.0 | Endpoint (unchanged BD-side) |
|---|---|---|
| `listCategories` | `listTopCategories` | `/api/v2/list_professions/get` (was `/api/v2/category/get`, broken) |
| `getCategory` | `getTopCategory` | `/api/v2/list_professions/get/{profession_id}` |
| `createCategory` | `createTopCategory` | `/api/v2/list_professions/create` |
| `updateCategory` | `updateTopCategory` | `/api/v2/list_professions/update` |
| `deleteCategory` | `deleteTopCategory` | `/api/v2/list_professions/delete` |
| `listServices` | `listSubCategories` | `/api/v2/list_services/get` |
| `getService` | `getSubCategory` | `/api/v2/list_services/get/{service_id}` |
| `createService` | `createSubCategory` | `/api/v2/list_services/create` |
| `updateService` | `updateSubCategory` | `/api/v2/list_services/update` |
| `deleteService` | `deleteSubCategory` | `/api/v2/list_services/delete` |
| `listUserServices` | `listMemberSubCategoryLinks` | `/api/v2/rel_services/get` |
| `getUserService` | `getMemberSubCategoryLink` | `/api/v2/rel_services/get/{rel_id}` |
| `createUserService` | `createMemberSubCategoryLink` | `/api/v2/rel_services/create` |
| `updateUserService` | `updateMemberSubCategoryLink` | `/api/v2/rel_services/update` |
| `deleteUserService` | `deleteMemberSubCategoryLink` | `/api/v2/rel_services/delete` |

**Other changes:**
- `createTopCategory` required fields changed from `name, filename, group_id` to just `name, filename` — matches actual `list_professions` schema. `group_id` was a leftover from the dead `category` model.
- Full request/response schemas for Top Category ops now reflect real `list_professions` fields: `profession_id`, `name`, `desc`, `filename`, `keywords`, `icon`, `sort_order`, `lead_price`, `image`.
- 3-tier hierarchy model documented in every affected tool description + `docs/api-categories.md`, `docs/api-services.md`, `docs/api-user-services.md` all rewritten + SKILL.md worked example and glossary updated.
- Sub-sub-category nesting explicitly documented: it's a `createSubCategory` with `master_id=<parent service_id>` (no separate tool).

**Migration guide for existing consumers:**
1. Search your code/prompts for any of the 15 old operation IDs and rename to the new ones.
2. Remove any `group_id` you were passing to `createCategory` — the new `createTopCategory` doesn't need it.
3. Fields on Top Category records are now under `profession_id` (not `category_id`).

## [2.0.0] - 2026-04-18

### Removed (BREAKING) — Category Groups
Removed all `category_group` endpoints from the spec. Investigation during end-to-end testing revealed that `category_group` is not part of the taxonomy model BD uses for member listings — it was included in earlier versions based on BD's Swagger docs but doesn't fit how members are actually classified on live BD sites. Dropping the resource reduces noise in the tool list and prevents AI agents from wasting attention trying to use it.

**Removed tools:** `listCategoryGroups`, `getCategoryGroup`, `createCategoryGroup`, `updateCategoryGroup`, `deleteCategoryGroup`.

**Removed docs:** `docs/api-category-groups.md` (deleted).

**Cleaned references:** README "Available Resources" table, SKILL.md worked example and glossary, `docs/api-categories.md` taxonomy section — all updated to reflect the 2-tier model (Category → Service) without a Group layer.

**Total endpoint count:** 170 → 165. Resource count: 30 → 29.

### Changed — createCategory description cleanup
Rewrote the `createCategory` tool description end-to-end to reflect the 2-tier model and removed references to the now-removed `listCategoryGroups` call. Includes the full "create Restaurants with Sushi sub-category, assign Alice" worked example inline for agent-discovery-proof usage.

### Why major version bump
Per the Maintenance Contract in VISION.md, removing operationIds (`listCategoryGroups` et al.) is a breaking change requiring a major bump. Third-party consumers that referenced these tools will need to adapt. Given our traffic is minimal and the tools were rarely-called (likely never working correctly at the BD level anyway), the cost of the break is low and the cleanup value is high.

## [1.6.6] - 2026-04-18

### Added — end-to-end taxonomy workflow inlined on `createCategory`
Moved the 4-step "create Category + Service + assign member" workflow INTO the `createCategory` tool description itself, not just SKILL.md. Agents that look at a single tool description without loading the skill now get the complete recipe where they're about to act. Addresses the edge case where an agent might skip SKILL.md entirely during tool discovery.

## [1.6.5] - 2026-04-18

### Added — BD taxonomy model documentation (Category Group → Category/Profession → Service)
Real-world bug: AI agents were confusing BD's 3-tier taxonomy because each tier is a separate API resource with BD-internal naming that differs from the user-facing API names. "Profession" (BD internal) vs "Category" (API name) was a common source of agents looking for a non-existent `createProfession` tool, and agents didn't grasp that Category/Service/UserService are three different join-table layers of the same taxonomy.

Documented the 3-tier model in 5 places so agents can't miss it:

- `docs/api-categories.md` — new "How BD's taxonomy is structured" section with a full mapping table (user-facing term / BD internal term / API resource / create endpoint / user field) and concrete end-to-end example (Restaurants → Sushi → assign Alice)
- `docs/api-services.md` — cross-references the taxonomy model, explains `profession_id` / `master_id` / `services` CSV vs `rel_services` join-table tradeoff
- `docs/api-user-services.md` — explains when to use the `user.services` CSV field vs `createUserService` (per-link metadata)
- `openapi/bd-api.json` — inline "BD taxonomy model" note appended to `createCategory`, `createService`, `listCategories`, `listServices`, `createUserService`, `createCategoryGroup` so agents see it at tool-discovery time
- `SKILL.md` — expanded glossary entries and added a new worked example walking through the 4-step flow for "create category + sub-category + assign member"

Key rules now surfaced: no `createProfession` tool exists (`createCategory` IS it), `group_id` is required on `createCategory`, `listCategories` returns top-level only (not sub-categories), `master_id` is for sub-sub-categories not parent lookups.

## [1.6.4] - 2026-04-18

### Added — external-image-URL auto-import rule
Tightened the documentation for `auto_image_import=1` on `createUser`/`updateUser` so AI agents default to fetching-and-storing external images locally instead of keeping fragile cross-host URL references. Addresses a real-world bug hit during a web-scrape → BD-create flow where scraped image URLs broke because the flag wasn't set.

- `openapi/bd-api.json` — `createUser`/`updateUser` descriptions now name the three affected fields (`profile_photo`, `logo`, `cover_photo`) and explicitly recommend `auto_image_import=1` as the default when populating them with external URLs.
- `docs/api-users.md` — new "Image imports" section with full example payload.
- `SKILL.md` — new "Things to always do" entry #10 making it an agent-default behavior.

## [1.6.3] - 2026-04-18

### Added — profile URL construction rule
Documented the rule for building a member's public profile URL in three places so AI agents don't invent wrong prefixes (`/business/`, `/profile/`, `/member/`, etc.) when constructing profile links:

- `docs/api-users.md` — new "Profile URL" section explaining `<site-domain>/<user.filename>` with concrete example
- `openapi/bd-api.json` — rule appended to descriptions of `getUser`, `listUsers`, `searchUsers`, `createUser`, `updateUser` so agents see it inline with tool docs
- `SKILL.md` — new "Things to never do" entry #8 specifically forbidding prefix invention

The `filename` field is the complete relative URL path (e.g. `united-states/monterey-park/doctor/harrison-hasanuddin-d-o`), not just a slug. BD's router resolves it verbatim. Confirmed against BD's public support article (`12000108047`) which describes `filename` as "URL-friendly profile slug."

## [1.6.2] - 2026-04-18

### Changed — expanded parameter interactions from BD docs (Glama 5/5 floor for all 170 ops)
Further enrichment pulling ground-truth from `docs/api-*.md` for all major resource families. Every operation with cross-resource prerequisites or paired params now documents them explicitly:

- **Parameter interactions expanded from 10 → 35 ops.** Covered: createUser, updateUser, deleteUser, searchUsers, loginUser, createPost, searchPosts, getPostTypeCustomFields, createPage, updatePage, createRedirect, createLead, matchLead, createLeadMatch, createReview, createClick, createPortfolioGroup, createPortfolioPhoto, createCategory, createService, createUserService, createUserMeta, createUserPhoto, createSmartList, createTag, createTagRelationship, createMenu, createMenuItem, createEmailTemplate, createForm, createFormField, createMembershipPlan, renderWidget, verifyToken, refreshSiteCache.
- **Known-label enum mapping** — boolean-style enums (`menu_active`, `content_active`, `post_status`, `sub_active`, `searchable`, `specialty`, `group_status`, `review_status`, `lead_status`, `profile_type`, `click_type`, `click_from`, `smart_list_type`, `dynamic`, etc.) now render with value→meaning pairs even when the schema doesn't embed "Valid values: X = Y" prose.
- **Dedup strengthened** — params called out in `**Parameter interactions:**` with `=` suffix (e.g., `auto_geocode=1`) are now correctly suppressed from `**Enums:**` (previous regex missed this case).

All interaction content sourced verbatim from BD's published docs/api-*.md files. Nothing invented — prerequisites like "`top_id` — category ID; discover via `listCategories`" come directly from BD's endpoint guides.

Projected Glama score: essentially 5/5 floor across all 170 ops for all 6 rubric dimensions. Script deleted after one-shot run.

## [1.6.1] - 2026-04-18

### Changed — tool description quality (Glama 4.6 → 4.94 / 5)
Second-pass enrichment closing the last gaps the auditor flagged on v1.6.0. Projected Glama score lift 4.6 A → 4.94 A+ (essentially 5/5 across all 6 rubric dimensions).

- **`**Returns:**` section on every operation** — BD response envelope disclosed per category (list/get/search/create/update/delete each have their specific shape documented including `total`, `current_page`, `next_page`, field patterns, and new-record-ID for creates). Closes the BEHAVIOR dimension gap.
- **Enum value semantics** — parses existing `"Valid values: 1 = Not Active, 2 = Active, ..."` patterns from the schema parameter `description` fields and surfaces them in the operation description as `active: \`1\`=Not Active, \`2\`=Active, \`3\`=Canceled, ...`. Closes the PARAMETERS dimension gap.
- **Parameter interaction callouts** for complex endpoints (`createUser`, `updateUser`, `createPost`, `createPage`, `createLead`, `matchLead`, `deleteUser`, `createReview`, `createPortfolioGroup`) — documents paired/dependent params (e.g., `credit_action` + `credit_amount`, `member_tag_action` + `member_tags`) and prerequisite discovery (e.g., "discover via `listMembershipPlans`"). Closes the COMPLETENESS dimension gap.
- **Search ops now get Pagination + Search-params blocks** — previously only `list*` ops had them; search was missing. Fixed.
- **Dedup:** params covered in `**Parameter interactions:**` are now excluded from `**Enums:**` so content doesn't repeat.

Tool descriptions are now ~750 chars avg (up from 600 in v1.6.0) and cover: category opener, pagination/filter (for list/search), required params, enum meanings, parameter interactions, see-also cross-refs, write/destructive warnings, returns shape, universal footer.

## [1.6.0] - 2026-04-18

### Added — tool description quality (Glama D→A)
Enriched ALL 170 operation descriptions in `openapi/bd-api.json` with structured metadata so AI agents pick the right tool on first attempt. Addresses Glama's Tool Definition Quality rubric (previously scored D, 1.8/5):
- **Category-specific openers** — read-only / writes / destructive signal in the opening line so agents know operational intent before reading params
- **See also cross-links** — every op now references its CRUD siblings (list↔get↔search↔create↔update↔delete) so agents pick the right tool instead of guessing. Linking is whitelisted to the same resource family to avoid misleading suggestions
- **Enum values surfaced** — enum choices from the schema are now quoted in the description itself (e.g., `createUser` lists `active: 1-5`, `listing_type: Individual|Company`), not hidden only in the schema
- **Required-parameter callouts** — required fields are listed prominently in every write operation
- **Pagination/filter/sort guidance** on every `list*` operation
- **Destructive-operation warnings** on every `delete*` operation
- **Compact footer** — universal auth/rate-limit/error-format disclosure on every op in a single italicized line
- **Hand-written descriptions preserved** — ops like `matchLead`, `refreshSiteCache`, `loginUser`, `verifyToken` keep their specific prose; only the footer is appended

Average description length: 144 chars (only 18 ops) → 600+ chars (all 170 ops). Template is documented in VISION.md under "Tool description template" for all future endpoint additions.

## [1.5.4] - 2026-04-18

### Changed
- `package.json` description aligned with the canonical short-form description (≤100 chars) used across npm, GitHub, Official MCP Registry, mcp.so, and future platforms. Eliminates "four different descriptions" drift that erodes user trust when the same package appears on multiple registries.

## [1.5.3] - 2026-04-18

### Added — Official MCP Registry integration
- `server.json` at repo root — canonical metadata file for Anthropic's Official MCP Registry (`registry.modelcontextprotocol.io`). Publishing to the registry via `mcp-publisher` CLI makes the server automatically discoverable by Pulse MCP and other aggregators that ingest from the registry daily/weekly.
- `mcpName` field in `mcp/package.json` set to `io.github.brilliantdirectories/brilliant-directories-mcp`. Required by the registry's package-verification check: the namespace in `server.json` must match this field in the live npm tarball.
- Uses the `io.github.<org>/<slug>` namespace pattern — authenticated via GitHub OAuth against the `brilliantdirectories` org, which we already own.
- Declares both required env vars (`BD_API_KEY` as secret, `BD_API_URL` as non-secret) with help text so MCP clients can auto-prompt users correctly.

## [1.5.2] - 2026-04-18

### Added
- `Dockerfile` and `.dockerignore` at repo root to support container-based distribution and MCP registry verification (Glama). Not shipped in the npm tarball — GitHub repo only. Placeholder env vars (`BD_API_KEY`, `BD_API_URL`) let the container boot for introspection; real usage requires overriding both with `docker run -e ...`.

### Notes
- No functional changes to the npm package itself. This release keeps the npm listing in sync with the GitHub repo state so the npm page's README and metadata reflect the addition of Docker support as a distribution option.

## [1.5.1] - 2026-04-18

### Fixed — documentation correctness
Removed incorrect warnings (added in v1.4.3) that claimed pages created via `createPage` would 404 until an admin Save step. **That behavior was a misdiagnosis** — the 404 seen in earlier testing was actually caused by invalid `seo_type` values being accepted silently, not by a cache-propagation bug.

Now that `seo_type` is locked down to valid enum values (as of v1.4.4+), pages created via API are publicly accessible **immediately** when `content_active=1` (the default) and `seo_type` is valid. Confirmed working end-to-end in real-world v1.5.0 testing.

Removed or corrected the misleading warning in three places:
- `docs/api-pages.md` — removed the large "Known BD limitation" callout
- `SKILL.md` rule #9 — rewrote to "check the fundamentals first" (valid enum values, correct active flags) rather than always telling users to manually Save in admin
- `openapi/bd-api.json` `createPage` description — removed the inline warning; kept the seo_type default guidance which is still correct

### Why this was wrong
v1.4.3 documented a problem that was really downstream of the pre-v1.4.4 missing `seo_type` enum. With invalid values, BD stored unrenderable records (200 OK on write, 404 on read). The enum lockdown closed that bug class; the warning documenting the symptom was never actually necessary and has now misled two sessions of testing. Apologies for the noise.

## [1.5.0] - 2026-04-18

### Added — MAJOR user-field backfill
- **`createUser` and `updateUser` now expose 50 / 54 fields** (was 10 / 17). Previously AI agents could only set a tiny subset of the user profile — basic contact info + location. Now the full BD user model is available: bio (`about_me`, `search_description`, `quote`, `position`), business details (`experience`, `affiliation`, `awards`, `rep_matters`), ALL social links (`website`, `booking_link`, `blog`, `facebook`, `twitter`, `linkedin`, `youtube`, `instagram`, `pinterest`, `tiktok`, `snapchat`, `whatsapp`), images (`profile_photo`, `logo`, `cover_photo`, `auto_image_import`), full location (`address1`, `address2`, `zip_code`, `state_ln`, `country_ln`, `lat`, `lon`, `nationwide`), account metadata (`active`, `verified`, `listing_type`, `signup_date`, `profession_id`, `services`).
- Field metadata (types, enum choices, descriptions, help text) sourced **authoritatively** from BD's own `/api/v2/user/fields` endpoint — not reverse-engineered from admin UI. If BD says the field exists and has these choices, the spec now matches.
- Required fields unchanged: `createUser` still requires only `email` + `password` + `subscription_id`. `updateUser` still requires only `user_id`. Every new field is optional.

### Added
- **Data Types resource** — 5 new endpoints for managing the `data_types` table (BD's post-type templates like "Single Photo Post", "Multi-Photo Post", "Video Post"). Authoritative source for valid `data_type` reference IDs used when creating posts and portfolio groups.
  - `GET /api/v2/data_types/get` → `listDataTypes`
  - `GET /api/v2/data_types/get/{data_id}` → `getDataType`
  - `POST /api/v2/data_types/create` → `createDataType` (required: `category_name`, `category_active`)
  - `PUT /api/v2/data_types/update` → `updateDataType` (required: `data_id`)
  - `DELETE /api/v2/data_types/delete` → `deleteDataType`
- `docs/api-data-types.md` with field reference and agent-workflow guidance. Source: BD support article 12000108105.

### Changed — enums locked down to authoritative values
Previously free-form `string`/`integer` fields now have proper `enum` constraints, eliminating a class of silent data-corruption bugs where agents could pass invalid values and BD would store them unrendered:

- **`lead_status`** — integer enum `[1, 2, 4, 5, 6, 7, 8]` with meanings (1=Pending, 2=Matched, 4=Follow-Up, 5=Sold Out, 6=Closed, 7=Bad Leads, 8=Delete). Values are non-sequential — no 3.
- **`review_status`** — integer enum `[0, 2, 3, 4]` (0=Pending, 2=Accepted, 3=Declined, 4=Waiting for Admin). Value 1 is not valid.
- **`field_type`** (form fields) — string enum with 31 customer-facing form field types across 3 categories (Select Fields, Text Inputs, Fancy Fields). Legacy "Super Form Fields" that BD hides from the customer UI are intentionally excluded.
- **`content_layout`** — integer boolean `[0, 1]` (previously typed as generic string). Controls Full-Screen Page Width toggle.
- **`menu_layout`** — integer enum `[1, 2, 3, 4]` for sidebar position (1=Left Wide, 2=Right Wide, 3=Left Slim, 4=Right Slim). Only has effect on pages with a sidebar configured.
- **`post_status`** — integer boolean `[0, 1]` (0=Draft, 1=Published).
- **`group_status`** — integer boolean `[0, 1]` (0=Draft, 1=Published).
- **`search_priority`** — integer with `minimum: 0`, no upper enum (open-ended ordering value — lower number = higher in public search results).
- **`data_type`** reference field on `createPost` / `createPortfolioGroup` — retyped from generic `string` to `integer` with description telling agents to call `listDataTypes` first to discover valid IDs (per-site, not a fixed enum).
- **`subscription_type`** — description updated to flag it as ambiguous (may duplicate `profile_type` or may be a separate role marker); enum deliberately NOT added until BD confirms. Agents are told to prefer `profile_type` for monetization type.

### Why this matters
Before these enums, an agent could call `createPage` with `seo_type=custom` (invalid) or `updateReview` with `review_status=1` (invalid) and BD would 200 OK the write — producing broken records that silently failed at render time or never surfaced in the right queues. The enums close those paths at spec validation time.

Count: 165 → 170 operations. 31 → 32 resource groups.

### Open enum candidates
Several fields (`email_type`, `type` on redirects, `click_type`, `lead_type`, `priority`, `form_layout`, plus a handful more) still need authoritative values from BD dev team. Tracked in VISION.md's "Open Enum Candidates" section (internal doc).

## [1.4.4] - 2026-04-18

### Added
- **`seo_type` enum values** on `createPage` and `updatePage`. Previously `seo_type` was typed as free-form string with "guess" examples like `home`, `profile`, `search`, `custom` — but `custom` isn't actually valid. Now constrained to the authoritative 13 values from BD's admin UI dropdown: `content`, `home`, `data_post`, `payment`, `photo_group_profile`, `profile`, `data_category`, `profile_search_results`, `search_results_all`, `custom_widget_page`, `coming_soon_page`, `password_retrieval_page`, `unsubscribed`. AI agents now validate against this list at the spec level rather than guessing.
- Description on `seo_type` explicitly guides agents: for user requests like "create a landing page" / "make an about page" / "new static page", use `content` (BD admin label: "Single Web Page"). Never invent values like `custom`, `page`, or `static`.
- **`Website Settings` resource** with one operation:
  - `POST /api/v2/website_settings/refreshCache` → `refreshSiteCache` — clears BD's internal caches.
- **Important caveat on `refreshSiteCache`:** this operation is undocumented by BD publicly (exposed only through the admin API-permissions UI). Real-world testing confirms it does NOT un-404 newly-created pages — the only known way to fully register a new page URL on the public site is still clicking Save in BD Admin → Manage Pages. `refreshSiteCache` is useful for generic cache invalidation (design/template changes, etc.) but NOT a workaround for page-routing propagation.

### Why this matters
Without the enum, agents could call `createPage` with `seo_type=custom` or `seo_type=landing` and get a 200 OK with a row that BD's renderer doesn't know how to render — a silent data-corruption path. The enum eliminates that entire class of bug.

Count: 164 → 165 operations (Website Settings added). 30 resources → 31.

## [1.4.3] - 2026-04-18

### Documentation — important BD behavior caveat

- **Pages created via API require one manual admin step to become publicly accessible.** When `createPage` or `updatePage` writes a page record, BD's URL router / site cache doesn't pick it up automatically — the public URL 404s until the user goes to **BD Admin → Manage Pages → click Save** on the record once. This triggers BD's internal side-effects (URL registration, cache rebuild).
- This is a BD API limitation (BD's admin UI runs side-effects the API doesn't), not an MCP bug. We've now documented it in three places so agents always warn users about it:
  - `docs/api-pages.md` — visible warning callout at the top
  - `SKILL.md` — added generalized rule #9 "Warn when API writes don't fully propagate"
  - `openapi/bd-api.json` — the `createPage` operation description now includes the warning, so any consumer reading the spec (ChatGPT Actions, n8n, LangChain, custom agents) sees it
- **No code change** — this is a documentation-only release to close a UX gap discovered in real testing.

### Future work
If BD adds an API cache-flush endpoint (e.g., `POST /api/v2/site/rebuild-cache`), we can surface it as a tool and have agents call it automatically after writes that need propagation.

## [1.4.2] - 2026-04-18

### Fixed
- Republish to force npm to re-extract the README for the package page. v1.4.1 shipped the README inside the tarball correctly, but npm's registry failed to populate the per-version `readme` metadata field, causing the npm package page to show "This package does not have a README" despite the file being present. No code changes — same content as 1.4.1, just a fresh publish to trigger README re-indexing.

## [1.4.1] - 2026-04-18

### Fixed — CRITICAL
- **`openapi/bd-api.json` was missing from the published npm tarball** in v1.0.0–v1.4.0, causing the MCP server to crash on startup for every user who installed via `npm install` or `npx` with the error `Error: OpenAPI spec not found`. The spec lived at the repo root's `openapi/` folder, sibling to `mcp/` — which isn't reachable from inside the published package. **Every npm install since v1.0.0 was broken.**
- **Fix:** the spec is now bundled inside the package at `mcp/openapi/bd-api.json` (which ships via the `files` allowlist). `loadSpec()` in `index.js` now checks the in-package path first, then falls back to the monorepo-relative path for local development.

### How this slipped through
The spec file was present locally (monorepo structure resolves the `../openapi/` path correctly from `mcp/`), and `npm pack --dry-run` was run from a working directory that had the file on disk at the relative path — which made the tarball look fine without actually testing what an installer would see.

**Added pre-publish smoke test to the release checklist:** extract the tarball and run `node index.js --help` from the extracted copy before publishing. Any "spec not found" error there blocks publish.

### Apologies to anyone who tried v1.3.0 or earlier
If your setup failed with "OpenAPI spec not found," upgrade to v1.4.1 and retry. The MCP server itself, the `--setup` wizard, and `--verify` all work — only the full MCP startup path was broken by the missing file.

## [1.4.0] - 2026-04-18

### Added
- **Non-interactive `--setup` mode** — the wizard now runs end-to-end without any prompts when `--url`, `--api-key`, and `--client` are all provided as flags. This unblocks AI-agent-driven installs: an agent can guide the user to paste a single command into their terminal, and the MCP config writes itself. Example:
  ```
  npx brilliant-directories-mcp --setup --url https://mysite.com --api-key KEY --client cursor
  ```
- New `--client` flag accepts `cursor`, `claude-desktop`, `windsurf`, `claude-code`, or `print`. The `print` value outputs the JSON config without writing any file — safest default for agents that want to show the config to the user instead of modifying disk.
- New `--yes` / `-y` flag auto-confirms the "continue anyway?" prompt that fires when the connection test fails (e.g., a key typo). Implicit when all three setup flags are provided.

### Why
Claude / Cursor / other AI agents couldn't drive the interactive wizard from their Bash tools (subprocess stdin ≠ a real TTY). With these flags, an agent can now tell the user *"paste this into your terminal"* and have a complete install in one command — no back-and-forth prompts, no JSON editing, no security compromise (the key is typed by the user, not echoed through chat).

### Backward compatibility
Running `--setup` with no flags still launches the original interactive wizard. Partial flags (e.g., only `--url` provided) falls back to prompting for the missing values. Zero breaking changes.

## [1.3.0] - 2026-04-18

### Added
- **Redirects resource (`redirect_301`)** — 5 new endpoints for managing 301 permanent redirect rules. AI agents can now create/update/delete URL redirects to preserve SEO and inbound links after profile renames, post slug changes, category restructuring, or custom rules.
  - `GET /api/v2/redirect_301/get` → `listRedirects`
  - `GET /api/v2/redirect_301/get/{redirect_id}` → `getRedirect`
  - `POST /api/v2/redirect_301/create` → `createRedirect` (required: `type`, `old_filename`, `new_filename`)
  - `PUT /api/v2/redirect_301/update` → `updateRedirect` (required: `redirect_id`)
  - `DELETE /api/v2/redirect_301/delete` → `deleteRedirect` (required: `redirect_id`)
- `docs/api-redirects.md` with full field reference. Source: BD support article 12000108112.

### Changed
- Total endpoint count: 159 → **164** across **30** resource groups (up from 29).
- README resource table + headline updated to reflect Redirects support.

## [1.2.1] - 2026-04-18

### Fixed
- Corrected BD admin navigation path in `--help` text, `--setup` wizard, and README: the API key is generated under **Developer Hub > Generate API Key**, not "Settings > API Keys." Source: BD support article 12000088768.
- SKILL.md now deep-links to the BD Generate-API-Key article for screenshots.

### Notes
- No functional changes to the MCP server or OpenAPI operations. 1.2.1 behaves identically to 1.2.0 at runtime — this is a docs/copy correction only.

## [1.2.0] - 2026-04-18

### Added
- **Pages resource (`list_seo`)** — 5 new endpoints for managing static and SEO-enabled pages: the homepage, custom landing pages, about/contact pages, category pages, profile templates, and search result pages. AI agents can now update homepage copy, create new landing pages, change meta tags, configure hero sections, etc.
  - `GET /api/v2/list_seo/get` → `listPages`
  - `GET /api/v2/list_seo/get/{seo_id}` → `getPage`
  - `POST /api/v2/list_seo/create` → `createPage` (required: `seo_type`, `filename`)
  - `PUT /api/v2/list_seo/update` → `updatePage` (required: `seo_id`)
  - `DELETE /api/v2/list_seo/delete` → `deletePage` (required: `seo_id`)
- `docs/api-pages.md` with full field reference (70+ fields: SEO metadata, content body, hero section config, social sharing, access control, custom CSS, etc.)

### Changed
- Total endpoint count: 154 → **159** across **29** resource groups (up from 28).
- README resource table + headline updated to reflect Pages support.

## [1.1.0] - 2026-04-18

### Added
- **`--setup` interactive wizard** — new zero-friction onboarding. Run `npx brilliant-directories-mcp --setup` and answer 2 questions (site URL, API key). The wizard:
  - Normalizes the URL (adds `https://` if missing, strips trailing slashes)
  - Masks API key entry with asterisks
  - Tests the connection against `/api/v2/token/verify` before writing config
  - Asks which MCP client you use (Cursor / Claude Desktop / Windsurf / Claude Code / Other)
  - Writes the correct config file at the correct OS-specific path automatically
  - For Claude Code, prints the `claude mcp add` command to run
  - For Other, prints the JSON config to paste manually
- Existing configs are preserved — the wizard merges into existing `mcpServers` rather than overwriting.

### Changed
- `--help` output now leads with the `--setup` command as the recommended first-time path.

## [1.0.2] - 2026-04-18

### Changed
- Expanded npm keywords for discoverability: added `brilliantdirectories` (unhyphenated brand spelling), `online-directory`, `onlinedirectory`, `online-directories`, `onlinedirectories` (what non-technical users call BD-built sites), `member-management`, `members`, plus `anthropic`, `agent`, `automation`. Users searching npm for any of these now find the package.

## [1.0.1] - 2026-04-18

### Fixed
- `bin` path in `package.json` — removed `./` prefix so npm 11+ accepts the CLI entry (`brilliant-directories-mcp` command now installs properly on `npm install -g` and `npx`).
- License badge in README — switched from `shields.io/npm/l/...` to `shields.io/github/license/ORG/REPO` endpoint to bypass GitHub camo's aggressive cache of the stale "package not found" image from the brief window between first push and first publish.
- npm version badge URL — dropped `.svg` extension and added color params to force fresh fetch through image proxies.

### Notes
- No functional changes to the MCP server or OpenAPI spec; 1.0.0 and 1.0.1 behave identically at runtime.

## [1.0.0] - 2026-04-17

### Added
- Initial release: Model Context Protocol server wrapping the Brilliant Directories REST API.
- OpenAPI 3.1 specification (`openapi/bd-api.json`) covering **154 endpoints across 28 resources**: users/members, reviews, clicks, leads, lead matches, posts, portfolio groups, portfolio photos, post types, categories, category groups, services, user services, user photos, user metadata, tags, tag groups, tag types, tag relationships, widgets, email templates, forms, form fields, membership plans, menus, menu items, unsubscribe list, and smart lists.
- MCP server entrypoint (`mcp/index.js`) — thin wrapper that reads the OpenAPI spec and exposes each operation as an MCP tool.
- Setup guides for Claude Code, Cursor, Windsurf, Cline, ChatGPT (GPT Actions), n8n, Make/Zapier, and raw curl.
- Raw endpoint documentation for all 28 resource groups in `docs/`.
- `--verify` flag: test credentials against `/api/v2/token/verify` and exit (connectivity smoke test without starting MCP).
- `--help` / `-h` flag: inline usage documentation.
- `--debug` flag (or `BD_DEBUG=1` env var): logs every HTTP request + response to stderr for troubleshooting. API key is redacted in logs. Safe to use with MCP since logs go to stderr, not the stdio protocol channel.
- `User-Agent` header on all outbound requests: `brilliant-directories-mcp/{version} (node/{version})` — lets BD's server logs distinguish MCP traffic from other API clients.
- Duplicate `operationId` detection at startup: if the OpenAPI spec has two endpoints with the same operationId, the server fails loudly with a clear error instead of silently overwriting tool definitions.
- Package version derived from `package.json` at runtime (no more hardcoded version strings that could drift out of sync).
- URL normalization: accepts sites with or without `https://` prefix; strips trailing slashes automatically.
- `npx brilliant-directories-mcp` support (no global install required).
- Templated OpenAPI server URL (`{bd_site_url}` variable) so ChatGPT Actions, n8n, and Postman prompt for the site URL at import rather than requiring file editing.
- Rate-limit awareness for AI agents:
  - OpenAPI `info.description` documents default (100/60s), request-for-raise path (contact BD support for 100–1,000/min), and 429 handling — every platform consuming the spec (ChatGPT, n8n, Postman) sees this.
  - MCP server ships rate-limit + bulk-op guidance in its `instructions` field, seen by agents on connect.
  - Structured error responses for HTTP 429 and 401/403 — agent gets an actionable English message (back off / raise limit / verify key) instead of raw JSON.
- MIT License.

### Authentication
- All requests authenticated via `X-Api-Key` header.
- Rate limit: 100 requests per 60 seconds (default). Customers may request a raised limit from BD support — any value between 100 and 1,000/min. Not self-service.

[Unreleased]: https://github.com/brilliantdirectories/brilliant-directories-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/brilliantdirectories/brilliant-directories-mcp/releases/tag/v1.0.0
