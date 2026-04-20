# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.10.1] - 2026-04-20

### Fixed — Post-v6.10.0 audit: 5 drift risks closed

Sanity-check audit of v6.10.0 form directives surfaced 2 HIGH-severity drift risks and 3 MEDIUM under-specifications. All closed in this release. No schema-breaking changes; doc-only.

- **HIGH — `field_order` numeric example misled agents on busy forms.** v6.10.0 gave `98/99/100` as example `field_order` values for the ReCaptcha/HoneyPot/Button tail. Agent adding the tail to a form that already has `field_order=120` could copy the example and put the "tail" in the middle of the form. Now replaced with a rule: call `listFormFields` first, find current max `field_order`, use `max+1 / max+2 / max+3`. On a brand-new form `1/2/3` works. Never add fields AFTER Button. Applied in createFormField description, createForm top-level recipe step 6, and the MCP instructions paragraph.
- **HIGH — `form_target` missing-on-redirect failure mode was silent.** BD accepts a `createForm` call with `form_action_type=redirect` and no `form_target` — doesn't 400, doesn't warn. The form then renders with an empty redirect and submissions go nowhere. Documented in both the `form_target` property description and the top-level recipe step 5: "not schema-enforced, agent MUST remember — BD accepts the create without it and the form silently goes nowhere on submit."
- **MEDIUM — "Exactly ONE Button per form" now merged with the tail-pattern rule.** Previous createFormField text said "exactly ONE Button per form. Adding multiple Buttons causes UI confusion" as a standalone note. Now merged into the tail-pattern section: "`field_type=Button` — the submit button — exactly ONE Button per form, and it must be last." No more ambiguity between "at most one Button" and "Button must be last."
- **MEDIUM — ReCaptcha / HoneyPot configuration scope made explicit.** Previous text said "no configuration needed beyond `field_type`" but left agents wondering about `field_required`, `field_placeholder`, and view-flags. Now explicit: "OMIT `field_required`, `field_placeholder`, and view-flags (`field_display_view` / `field_input_view` / `field_email_view`) — BD handles these fields specially server-side." Applied in createFormField + MCP instructions + createForm recipe step 6.
- **MEDIUM — MCP instructions paragraph's "ascending field_order; these are the last three" strengthened.** Old wording could be misread as "any three with higher order than siblings." Now says "the three HIGHEST-ORDERED fields on the form — no other field can have `field_order` equal to or greater than theirs." Also repeats the `max+1/max+2/max+3` rule and the never-add-fields-after-Button rule.

### Audit items that passed as-is
- `form_url` %20-encoding guidance (v6.10.0 already had explicit "do not decode" rule).
- `form_email_on` agent-vs-admin-UI default distinction (v6.10.0 already explicit).
- `updateForm` flip-to-public warning with `listFormFields` audit step (v6.10.0 already covered).
- Cross-surface consistency: all 4 surfaces (createForm, updateForm, createFormField, MCP instructions) carry the same values, same order, same conditionals with no contradictions.

## [6.10.0] - 2026-04-20

### Added — Form creation recipe: agents now have everything needed to build submittable forms

Without the rules below, AI-created BD forms silently fail on submit. BD's admin UI enforces most of these via defaults and hidden form-save widget wiring; the API path bypasses that scaffolding, and agents need explicit guidance to avoid building broken forms. This release adds:

**Four exact-value fields an agent must set on every `createForm` call:**
- `form_url` = `/api/widget/json/post/Bootstrap%20Theme%20-%20Function%20-%20Save%20Form` — the BD Save Form widget endpoint; without this, the rendered HTML form's `action=` attribute is wrong and submits don't wire up. URL-encoded `%20` must stay encoded.
- `table_index` = `ID` — primary-key column on the submissions table; without it, BD can't look up or update individual submission records.
- `form_action_type` = `widget` (default) / `notification` / `redirect` / `""` (empty = internal only). Post-submit behavior: success pop-up / success banner / redirect-to-URL / none. Agents default to `widget` unless user specifies.
- `form_email_on` = `0` (agent default OFF) / `1`. Admin UI defaults to ON; API agent default is OFF so AI-generated forms don't flood admin inboxes.

**One conditional field:**
- `form_target` = destination URL. **Required when `form_action_type=redirect`, ignored otherwise.**

**Three required fields at the END of every submittable form's field list** (via `createFormField`, highest `field_order` values, last 3 positions, in this exact order):
1. `field_type=ReCaptcha`
2. `field_type=HoneyPot`
3. `field_type=Button`

When the parent form's `form_action_type` is `widget`/`notification`/`redirect`, BD errors on submit if this tail pattern is missing or out of order. ReCaptcha and HoneyPot need no configuration beyond `field_type` — BD handles them server-side.

**Updates shipped:**
- `createForm` schema: added `form_action_type`, `form_target`, `form_url`, `table_index` properties with exact-value defaults and descriptions. `form_email_on` description now calls out the agent-default-OFF rule. Top-level description rewritten with the 6-step recipe numbered and called out.
- `updateForm` schema: same properties added (with "leave alone unless repairing a broken form" guidance for `form_url` / `table_index`). Description now warns that flipping `form_action_type` to a public-facing value on an existing form requires auditing the tail pattern first — `listFormFields` before `updateForm` when the action type is changing.
- `createFormField` description: replaced the generic "exactly one Button per form" note with the full tail-pattern rule + concrete `field_order` values + ReCaptcha/HoneyPot "no configuration needed beyond `field_type`" clarification.
- MCP instructions: one new top-level paragraph summarizing the full recipe so cold agents internalize it at first load, not after trial and error.

No schema-breaking changes; all new properties are optional additions. Existing callers passing only the prior required set continue to work; they just get forms that silently fail on submit unless they were already passing the correct values by convention. Agents reading the new description/recipe will produce working forms on first try.

### Context
Rules sourced from the BD admin form-builder UI — specifically the hidden "Save Action URL" and "Unique field identifier" advanced settings, plus the success-action dropdown, plus observation that every working BD form ships with ReCaptcha + HoneyPot + Button as its last three fields. Verified against an existing working form (`ebook_optin`) on the live test site.

## [6.9.9] - 2026-04-20

### Added — Asset-routing quick-reference at top of createWebPage / updateWebPage descriptions

An agent audit flagged that the WebPage asset-routing rules (which code type goes in which field) were only discoverable by reading the full description end-to-end and cross-referencing per-field descriptions. Fine for an agent that loads the full schema; fragile for an agent that reads the description top-down and makes decisions as it goes.

**Added**: a 6-bullet quick-reference at the TOP of both createWebPage and updateWebPage descriptions, right after "Required:". Agents now see the complete asset-routing matrix in the first ~30 lines of the description instead of having to scan ~200 lines of body copy:

- Body HTML → `content` (Froala; strips `<style>` and `<script>`)
- CSS rules → `content_css` (no `<style>` wrapper)
- JavaScript → `content_footer_html` (yes, include `<script>` tags)
- `<head>` deps → `content_head`
- Hero banner → `enable_hero_section` + `hero_*` (EAV-stored on update)
- Page-access gate → `content_footer` (misleading name, not HTML; enum `""` / `members_only` / `digital_products`)

**Also fixed**: a leftover "5 master defaults" reference in the createWebPage / updateWebPage sidebar-workflow section (missed in v6.9.2's global fix). Now correctly reads "6 master defaults" per the verified admin-UI HTML.

### Context — why agents were drifting
An agent session reported not seeing the `content_css` / `content_footer_html` / `content_head` fields at all. **Those fields ARE exposed (since v6.9.6) and `content_footer` IS correctly typed as the page-access gate (since v6.9.7).** Root cause of the report: the MCP client's loaded schema was a cached pre-v6.9.6 version. MCP hosts only re-load server schemas on full app restart; running agents against a running MCP host session will continue to see whatever schema was loaded at server startup, even after `npm update` / `npx` cache refresh on the underlying package. **Fix on the user side**: fully quit and reopen the AI host app (Claude Desktop, Cursor, etc.) after any MCP package update. No code change needed — the README Claude Desktop section already documents this; just noting it here for CHANGELOG readers diagnosing similar "drift" reports.

### Still not addressed
- `mcp/index.js` top-level instructions routing paragraph is already correct as of v6.9.7 — not touched.
- No multi-site README section yet — tracked for a later pass.

## [6.9.8] - 2026-04-20

### Changed — Setup-by-Platform reorder + 4-platform polish pass

Reordered the per-platform setup sections to match actual user-ask frequency (most-common first, live-verified AI apps on top, OpenAPI/Actions alternative for ChatGPT next, IDE-integrated apps after). Cursor moved from top to position #6 — still fully documented with the `<details>` fallback, just no longer leading.

**New order:**
1. Claude Desktop
2. Claude Code
3. ChatGPT (GPT Actions)
4. Windsurf
5. Cline (VS Code extension)
6. Cursor
7. n8n
8. Make / Zapier
9. curl / any HTTP client

**ChatGPT section — expanded.** Previous version was 4 terse steps with no context on why ChatGPT setup is different from every other platform. Now starts with a ⚠️ callout: ChatGPT doesn't support local MCP servers; the setup path is a **Custom GPT with Actions** calling our REST API via OpenAPI. Requires ChatGPT Plus / Team / Enterprise (Custom GPTs aren't on the free tier). Full step-by-step: go to Explore GPTs → Create → Actions → Import from URL (our spec) → API Key / Custom / `X-Api-Key` header auth. Trailing "What won't work" note so users don't try the default ChatGPT assistant or free tier and wonder why it's not working.

**Windsurf section — minor polish.** Added a one-line intro clarifying "Windsurf's AI pane is called Cascade" (previous version used the term without introducing it). Command Palette shortcut kept; "fully quit" note added with Mac/Windows specifics.

**Cline section — minor polish.** Tightened step wording. Behavior and steps unchanged.

**Cursor section — moved + kept fully documented.** Full GUI walkthrough + the collapsed `<details>` file-method fallback (hidden folder navigation for Mac/Linux/Windows, plain-text file creation, fully-quit instructions) preserved as-is. Only change: dropped the "(recommended path)" heading tag since it's no longer in the top slot.

### Rationale
The previous order (Cursor first) reflected the internal dev environment, not user demand. Live-walkthrough data with a first-time user showed Claude Desktop is the most common first-install target, with Claude Code second (CLI users), ChatGPT third (biggest non-MCP audience), and IDE-integrated apps (Windsurf / Cline / Cursor) clustered after.

### Not changed
- Config block (anchor + jump links intact)
- 30-Second Quickstart and prerequisites (unchanged from v6.9.5)
- Claude Desktop full disambiguation + merge-with-comma walkthrough (unchanged from v6.9.5)

### Still to come (not in this release)
- Multi-site setup section ("your partner's pattern" — running multiple MCP instances for comparisons across BD sites)
- "Each AI app has its own config" clarification after the quickstart
- Per-platform screenshots (if we ever go with images)

## [6.9.7] - 2026-04-20

### Fixed — `content_footer` is the page-access gate, not footer HTML (v6.9.6 correction)

v6.9.6 shipped `content_footer` documented as "additional HTML below the main content." **Wrong.** Per BD platform-side clarification: `content_footer` is a misnamed relic column that BD repurposed as the **page-access gate** (Public / Members-Only / Digital Products Buyers). Writing HTML into it does nothing useful and may silently gate pages based on how BD parses the value. Corrected:

- **`content_footer`** — now correctly documented as the page-access gate. Schema enum updated: `"" | "members_only" | "digital_products"`.
  - `""` (empty, default) — Public For Everyone
  - `"members_only"` — Only Allow Members (logged-in members only; non-members hit a login/signup wall)
  - `"digital_products"` — Only Allow Digital Products Buyers
  - ⚠️ "MISLEADING NAME" callout front-loaded in the description. Finer-grained member-tier and plan-based gating rules BD exposes separately — not covered in this release; will document when the full gate logic is specced out.
- **`content_footer_html`** — tightened. Now explicitly says "JavaScript and scripts only" — NOT "JS + footer dependencies" (v6.9.6 phrasing implied HTML content was welcome). Also flags "Not for extra body HTML" so agents don't dump body HTML here thinking it renders below `content`.
- **`content_css`** — tightened. Now blunt: "Paste raw CSS rules directly — do NOT wrap in `<style>` tags." Previous version said "no `<style>` wrapper" but the imperative phrasing is clearer.
- **MCP instructions WebPage asset-routing paragraph** — updated to match. The full routing matrix now correctly reads: `content` (HTML body, Froala) / `content_css` (raw CSS) / `content_footer_html` (JS/scripts only) / `content_head` (head deps) / `content_footer` (MISLEADING — access gate, not HTML).

### No new fields this release
All changes are doc corrections on fields already in the schema. No schema-breaking changes.

### Context
v6.9.6 introduced `content_css` / `content_footer_html` / `content_head` with correct semantics — only the `content_footer` description was wrong. This release corrects that one field + tightens the two adjacent ones that were close but not imperative enough.

## [6.9.6] - 2026-04-20

### Added — WebPage asset routing: `content_css`, `content_footer_html`, `content_head`

Live-verified on a real BD page: every WebPage record carries four asset-routing fields that are NOT just "additional HTML" slots — they each have a specific purpose, and the main `content` field is a Froala rich text editor that STRIPS anything that isn't clean HTML. Agents were effectively routing all assets (CSS, JS, head deps) into `content`, which either got silently stripped or broke the Froala editor. Now every field has a dedicated description and a top-level MCP-instructions paragraph so agents route code to the right place on first try.

**Field descriptions on createWebPage + updateWebPage:**
- **`content`** — rewritten. Explicitly calls out that this is a Froala rich-text editor: HTML only, no `<style>` or `<script>` tags (stripped by Froala), also strips `<form>`, `<input>`, `<select>`, `<textarea>`, `contenteditable`. Routes CSS/JS/head deps to their dedicated fields. Supports `[widget=Name]` / `[form=Name]` shortcodes and `%%%template_tokens%%%`.
- **`content_css`** (NEW) — raw CSS rules only, no `<style>` wrapper. Renders in page `<head>`. Scope every selector to a unique page-specific class; never bare `body` / `h1` / `p`; never target reserved platform classes `.container` / `.froala-table` / `.image-placeholder`.
- **`content_footer_html`** (NEW) — page-scoped JS + footer dependencies. Rendered before closing `</body>`. Wrap JS in `<script>` tags here (unlike `content`, this field accepts them). jQuery already global on BD sites. IIFE-wrap + unique-class scope to prevent leakage.
- **`content_head`** (NEW) — page-scoped `<head>` dependencies. For `<link>` stylesheets, `<meta>` tags, structured data JSON-LD, verification tags, head-required third-party scripts (rare — prefer `content_footer_html` for most JS).
- **`content_footer`** — clarified. Plain HTML fragment below the main body, distinct from `content_footer_html` which is the scripts/JS field.

**MCP instructions — new WebPage asset routing paragraph.** Tight summary agents see at startup. Covers the 4-field routing matrix + the Froala strip rules + the "PHP is data, not server-side template" rule + a redirect to widgets when the user needs server-side logic.

Source for this release: BD's internal AI Companion handler (`bd-core-files/admin/ai_companion/handler.php`), the canonical source for what the admin-UI AI sends agents editing the same fields. We mirrored that context into our MCP so API-driven agents have the same rules the admin-UI agent already operates under.

### Still to come (not in this release)
- Cursor, Claude Code, VS Code, Windsurf, Continue per-platform walkthroughs brought up to Claude Desktop's level of detail
- Multi-site setup section
- Platform reorder (Claude first, then ChatGPT, then Cursor)

## [6.9.5] - 2026-04-20

### Changed — README brevity pass: surgical, not wordy

Tightened the entire README setup surface without losing a single instruction. Goal: keep non-dev readers from glazing over, while still answering every click-by-click question a boomer would have. No info lost; just cut storytelling, redundant "here's why this matters" meta-commentary, and doubled-up explanations. Doc-only.

**What got tightened (approximate character reduction shown):**
- 30-Second Quickstart: ~55% shorter. Terminal-open steps collapsed to one-liner per OS. "Paste shortcut," "Fully quit," "Working?" each became a short inline callout instead of a multi-sentence paragraph. OS-specific `Terminal.app`/`PowerShell`/`Ctrl+Alt+T` kept surgically.
- Prerequisites → Advanced Endpoints ALL ON callout: ~60% shorter. Five-step numbered list collapsed to a single arrow-separated click path (`Developer Hub → key → Actions → Permissions → Advanced Endpoints → ALL ON → Save Permissions`). "Why" sentence kept as a single terse trailing line.
- Claude Desktop warnings (Connectors vs Developer, "new chat isn't enough"): ~65% shorter. Dropped the storytelling ("if you tried X and saw Y"), kept the imperative actions (what to skip, what to use, how to fully quit per OS).
- Claude Desktop merge-with-comma walkthrough: ~35% shorter. Scenarios A and B kept as distinct branches, but the "don't try to rewrite," "two rules," and "notice only two things changed" explanations trimmed to one sentence each. Before/after JSON examples unchanged — they're the whole point.
- Claude Desktop verify + troubleshoot: ~50% shorter. Kept the hammer-icon check and error-status paths; dropped the paragraph framing.
- Cursor file-method `<details>` fallback: ~45% shorter across both Mac/Linux and Windows walkthroughs. Merged "what is a home folder" + "what is `~`" + "what is a hidden dot-folder" preambles into a single "Cursor reads from `mcp.json` in a hidden `.cursor` folder in your home directory" sentence. Click-by-click steps kept surgical (each step still specifies the exact keystroke or click), just without the accompanying color commentary.

No schema/code changes. Pure content compression on the README.

### Still to come (not in this release)
- Platform reorder: Claude Desktop first, Claude Code, ChatGPT, Cursor, rest
- Multi-site setup section
- "Each AI app has its own config" clarification after the quickstart
- Brevity pass for the remaining per-platform sections (Claude Code, Windsurf, Cline, ChatGPT, n8n, Make/Zapier, curl) — likely lighter touch, those are already reasonably terse

## [6.9.4] - 2026-04-20

### Changed — README second pass: live-tested fixes from walkthrough with a new user

Spent a session watching a first-time user set up Claude Desktop end-to-end. Every confusion point they hit became a README fix. All doc-only; no code changes.

- **CRITICAL new prerequisite callout — "Enable advanced endpoint permissions, or your AI will hit 403 errors constantly."** Newly generated BD API keys have only a baseline set of endpoints enabled. Create a page, create a form, add a menu item — all fail silently until the admin toggles advanced endpoints ON. User spent debugging cycles hitting 403s on common writes before we realized the key was under-permissioned. Now called out in the "Before you start" section with exact click path: BD Admin → Developer Hub → key → Actions → Permissions → Advanced Endpoints tab → ALL ON → Save Permissions.
- **Claude Desktop — "Connectors vs Developer/Edit Config" disambiguation callout.** Claude Desktop has two totally separate MCP onboarding UIs and it's easy to hit the wrong one. Connectors is for remote servers hosted on a public HTTPS URL (like Stripe's MCP); our BD MCP runs LOCALLY via npx so it uses the Developer tab's "Edit Config" button instead. User pasted our GitHub URL into Connectors → got bounced to GitHub's OAuth authorization page. Now a prominent ⚠️ callout at the top of the Claude Desktop section explains which door is the right door and why.
- **Claude Desktop — "Start a new chat is NOT enough" callout.** Claude Desktop loads MCP servers ONCE when the entire app launches. Editing the config file and starting a new chat without fully quitting the app leaves Claude in a confusing half-state where it says "I have the connector in my config but the tools aren't loaded" — sounds like a partial success, but no tools are actually callable. User hit this exact state. The fix: fully quit the app (Windows: right-click Claude icon in system tray near clock → Quit, OR Task Manager → End task; Mac: Cmd+Q or top menu bar → Claude → Quit Claude — NOT just closing the window). Now callout'd explicitly.
- **Claude Desktop — merge-with-comma walkthrough for existing config files.** Biggest failure mode for non-dev users editing `claude_desktop_config.json`: the file often already has content (preferences, Google connectors, other MCP servers) and the new `mcpServers` block has to be merged in with a comma between top-level entries. One missing comma = silent fail, "no tools available," hours of debugging. Now explicit Scenario A (empty file → paste-over) vs Scenario B (existing content → merge-with-comma) branching, with a full before/after example showing exactly where the comma goes and what the final file looks like.
- **Claude Desktop — jsonlint.com sanity-check tip.** Added recommendation to validate the final file at jsonlint.com before restarting Claude. A validator tells you immediately which line has the typo; otherwise the only failure signal is "hammer icon doesn't appear" with no diagnostic.
- **Config block — multi-line `args` array.** Previous JSON had `args` as one long unreadable line. Now broken across lines so `--api-key ENTER_API_KEY` and `--url https://your-site.com` are each on their own line, easier to spot-edit and harder to botch.
- **Placeholder rename (ongoing from 6.9.3):** `YOUR_KEY` → `ENTER_API_KEY` (more imperative, clearer action to a first-time reader).

### Still to come (not in this release)
- Platform reorder: Claude Desktop → Claude Code → ChatGPT → Cursor → rest (placed most-common-first)
- Multi-site setup section (how to configure one MCP instance per BD site so an agent can compare across sites)
- "Each AI app has its own config" clarification after the quickstart (running the wizard once configures ONE app, not all AI apps on your computer)
- Per-platform walkthrough expansion for other platforms (Cursor, VS Code, Windsurf, Continue) to match the new Claude Desktop level of detail

## [6.9.3] - 2026-04-19

### Changed — README plain-English rewrite (first pass)

Initial round of README accessibility improvements for first-time users who aren't familiar with terminals, hidden config folders, or platform-specific UI conventions. Partial pass — more sections to follow based on live testing.

- **Config block anchor + jump links.** Added `<a id="the-config-block"></a>` at the Setup-by-Platform section. All 4 previous "paste the config block above" references now link directly to the block so readers on long scrolls can jump back to it in one click.
- **30-Second Quickstart — terminal-opening explained.** Previous version said "Open a terminal (Mac: Terminal.app · Windows: PowerShell · Linux: your shell)" with no explanation of what a terminal is or how to open it. Now includes:
  - Plain-English intro ("a text-only app for running commands")
  - Mac: `Cmd+Space` → type `Terminal` → Enter (step-by-step)
  - Windows: `Win` key → type `PowerShell` → Enter
  - Linux: `Ctrl+Alt+T` or the apps menu
  - "How to paste in the terminal" tip (paste shortcuts differ per OS)
  - New blockout explaining what "fully quit" actually means per OS (menu bar Quit on Mac vs system tray quit on Windows) — the quickstart tells users to "fully quit and reopen your AI app" but previously didn't explain what that means for a non-developer.
- **Cursor file-method fallback — full rewrite.** Previous version: `edit ~/.cursor/mcp.json (Mac/Linux) or %USERPROFILE%\.cursor\mcp.json (Windows). Paste the config block, save, fully quit and reopen Cursor.` (Opaque to users who don't know what `~` is, what a hidden dot-folder is, or how to create one.) Now 14 explicit steps covering:
  - What `mcp.json` is, what `.cursor` is, why it's hidden
  - Mac/Linux walkthrough: Cmd+Shift+G Go-to-Folder, handling missing folder, creating `mcp.json` as plain text (TextEdit "Make Plain Text" step)
  - Windows walkthrough: Win key → File Explorer, address-bar path editing, creating folder with leading dot, enabling file extensions in View menu, creating plain text file with correct name
  - Inline "Fully quit" meaning per OS
- **Placeholder rename.** Changed all `YOUR_KEY` placeholders in config blocks and code examples to `ENTER_API_KEY` (19 instances) — more imperative verb, clearer instruction.

No schema changes. No code changes. README-only update, synced between root README.md (GitHub display) and mcp/README.md (npm package display).

## [6.9.2] - 2026-04-19

### Fixed — CRITICAL: Master Default Sidebars list is 6, not 5 (pre-existing error since v6.5.0)

Authoritative BD admin UI HTML confirms the `<optgroup label="Default Sidebars">` dropdown contains exactly 6 hardcoded master defaults, in this verbatim order:

1. `Global Website Search`
2. `Member Profile Page`
3. `Member Search Result`
4. `Personal Post Feed`
5. `Post Search Result`
6. `Post Single Page`

Our MCP server has been documenting only 5 (missing `Member Search Result`) since v6.5.0 when the Sidebars resource first shipped. v6.9.1 compounded this by explicitly telling agents to treat `Member Search Result` as a site-custom that might not exist on a given site. **Both were wrong.** `Member Search Result` is a hardcoded master default, always available on every BD site, and is the out-of-the-box default for the Member Listings post type's `category_sidebar`.

Impact of the previous error: an agent asked to restore a site's Member Listings sidebar to `Member Search Result` (a common request) would either refuse ("that's a custom, not in listSidebars on this site") or require the admin to manually create it as a custom — both wrong. Agents configuring `form_name` on WebPages for the standard member-search-results SEO pages had the same blind spot.

**All 5 locations fixed in this release:**
- `updatePostType.category_sidebar` property description — now lists all 6 masters; notes `Member Search Result` as the Member Listings default.
- `createWebPage.form_name` default for `profile_search_results` pages — rule wording now says "6 Master Default Sidebars" (value list was already correct — wording drift only).
- `updateWebPage.form_name` — same fix as createWebPage.
- `listSidebars` description — "this endpoint returns only custom sidebars; here are the 6 master defaults" — list now includes `Member Search Result`; workflow step says "check the 6 master defaults first."
- MCP instructions `Sidebars` paragraph — now lists 6 masters in the admin-UI verbatim order; also clarifies that post types' `category_sidebar` field uses the same value set as WebPages' `form_name`.

No schema-breaking changes. No code changes. Pure doc correction of a long-standing factual error.

## [6.9.1] - 2026-04-19

### Fixed — v6.9.0 sanity-check corrections

Post-ship audit surfaced three issues in the v6.9.0 post-type and Member Listings docs. All fixed:

- **CRITICAL — `category_sidebar` master-default list was wrong.** v6.9.0 mistakenly listed `Member Search Result` as a 6th Master Default Sidebar. Verified against the BD admin UI HTML — the canonical 5 Master Defaults are `Global Website Search`, `Member Profile Page`, `Personal Post Feed`, `Post Search Result`, `Post Single Page`. `Member Search Result` is a custom sidebar that many BD sites ship with (and use as the Member Listings default), but it's site-specific — it'll appear in `listSidebars` when present, not in the hardcoded master-default set. An agent writing `Member Search Result` as a sidebar value on a site that doesn't have that custom would silently render "no sidebar." `updatePostType.category_sidebar` description corrected: 5 Master Defaults listed correctly, and a note added that `Member Search Result` is commonly a site-custom sidebar to check `listSidebars` for.
- **HIGH — long-form widget-equivalent trust sentence on `updatePostType` description was missing `comments_code`.** Listed only 7 of the 8 code fields as widget-equivalent. Fixed — now lists all 8: `category_header`, `search_results_div`, `category_footer`, `profile_header`, `profile_results_layout`, `profile_footer`, `search_results_layout`, `comments_code`. Per-property descriptions and the top-level MCP instructions paragraph were already correct; this was a single-sentence straggler.
- **MEDIUM — cache-refresh-layout paragraph in MCP instructions didn't name `updatePostType`.** The v6.9.0 post-type paragraph says "ALWAYS call `refreshSiteCache` after any successful `updatePostType`" but the separate general cache-refresh-layout paragraph (which lists Menus / Widgets / Categories / MembershipPlans) didn't include `updatePostType`. An agent reading the general paragraph alone could miss the "always refresh after post-type edits" rule. Fixed — `updatePostType` added to the "Also recommended" list with the stronger "not optional" qualifier to match the post-type-specific rule.

No schema-breaking changes. No code changes. Pure doc/instruction patch.

## [6.9.0] - 2026-04-19

### Added — Member Listings post type (`data_type=10`) workflow + post-type code-field master-fallback + all-or-nothing group-save rules

BD sites have exactly one post type with `data_type=10` (`system_name=member_listings`), unique in that it has NO profile/detail page of its own — it controls only the Member Search Results page UI/UX (the member grid and its sort/filter/pagination/sidebar settings). Member profiles themselves render via BD's core member system, not via a post-type template. Until now our spec gave agents no special-case handling for this record; agents asked to "change X on member search results" would flail. This release adds the full Member Listings workflow + clarifies a subtle BD pattern that affects every post type's code-template fields.

**`updatePostType` schema — Member Listings settings now exposed**
Added 12 editable settings (previously the schema exposed only `data_id`, `category_tab`, `per_page`):
- `h1` / `h2` — search results page heading + sub-heading
- `per_page` — results per page (default 9; recommended max 500 for site speed)
- `keyword_search_filter` — `level_2` (default fields only, fast) / `level_3` (default + custom, slower)
- `enableLazyLoad` — `1` Insta-Load (default) / `0` Standard Pagination / `2` Hide
- `category_order_by` — 8 values: `alphabet-asc`/`alphabet-desc`/`userid-asc`/`userid-desc`/`last_name_asc`/`last_name_desc`/`reviews`/`random`
- `category_ignore_search_priority` — `0` respect membership plan priority (default) / `1` ignore
- `post_type_cache_system` — `0` off / `1` on; cannot be `1` when `category_order_by=random` (admin UI enforces this)
- `category_sidebar` — sidebar name (same value set as WebPages' `form_name`: 5 Master Defaults + `listSidebars` customs + empty)
- `sidebar_search_module` — widget name; common values listed but full enum not frozen (BD adds widgets in core releases)
- `sidebar_position_mobile` — `top` / `bottom` (default) / `hide` (mobile only)
- `enable_search_results_map` — `0` / `1` Yes (default)

**`updatePostType` schema — code fields now exposed**
Added the 8 HTML/PHP template fields that drive search-results + detail-page rendering across all post types:
- **Search-results triplet** (every post type, INCLUDING Member Listings): `category_header` + `search_results_div` + `category_footer`
- **Profile/detail triplet** (post types with a per-record detail page — NOT Member Listings): `profile_header` + `profile_results_layout` + `profile_footer`
- **Standalone fields** (post types with a per-record detail page — NOT Member Listings): `search_results_layout` (detail page wrapper, BD's `single.php` analogue — name is misleading), `comments_code` (auxiliary footer code rendered after `search_results_layout`, used for embeds/schema markup/pixels)

All 8 code fields accept arbitrary HTML, CSS, JavaScript, iframes, AND PHP — BD evaluates PHP server-side at render. Supports BD text-label tokens (`%%%text_label%%%`) and PHP variables (`<?php echo $user_data['full_name']; ?>`). Widget-equivalent trust level — XSS/SQLi sanitization rules do NOT apply. Rationale: anyone with API permission to edit post-type code already has full site code control; mirrors the existing widget-field exemption.

**BD master-fallback on GET — shipped BD-side 2026-04-19**
The 8 code fields begin life backed by the BD-core MASTER post-type template. Until an admin (or API call) saves a local override, the site DB stores empty string — but the site RENDERS from the master at request time. BD now returns the master value on `getPostType`/`listPostTypes` when the local override is empty, so the agent always sees the real rendered code on read, not an empty string. Without this fix, an agent asked to "edit the loop code" would have nothing to read and would either refuse or (worse) write blank-replacement code. Documented on both `getPostType` and `updatePostType` descriptions + pulled into the top-level MCP instructions paragraph so cold agents internalize it at first load.

**BD all-or-nothing save rule per group**
On WRITE, fields in the same group save atomically. If an agent changes `category_header`, they MUST also send the current `search_results_div` + `category_footer` values (from the prior GET) in the same `updatePostType` call. Omitting group-mates causes the omitted fields to drift back to master on the next render — the site appears to "lose" customizations that were in the master but not re-saved locally. Same rule for the profile triplet. Standalone fields (`search_results_layout`, `comments_code`) save independently.

**Standard code-edit workflow** (documented on `updatePostType`, `getPostType`, and in MCP instructions):
1. `getPostType(data_id)` — returns all fields including master-fallback values
2. Identify the group of the changed field
3. Build update payload: changed field + all group-mates verbatim from GET
4. `updatePostType`
5. `refreshSiteCache` — post-type edits are cached; changes won't reflect publicly until refreshed. Always call after any successful `updatePostType`, even for non-code setting edits — cheap safety.

**Member Listings discovery pattern**
The `data_id` varies per site. Agents discover via `listPostTypes` filtered `property=data_type&property_value=10&property_operator==` → cache the single returned `data_id` for the session. `listPostTypes` and `getPostType` descriptions now document this workflow.

**Structural-field guard**
Description explicitly warns against mutating `data_name`, `system_name`, `data_type`, `data_active`, `data_filename`, `form_name`, `icon`, `software_version`, `display_order` on Member Listings. `data_active` should always be `1`; disabling via API would break member search site-wide.

**MCP instructions additions**
Three new paragraphs at the top-level instructions field (loaded on every MCP startup):
- Member Listings workflow (discovery, editable-field set, off-limits fields)
- Post-type code fields (master-fallback + 4 groups + all-or-nothing save rule + cache-refresh chain)
- Post-type custom fields discovery (call `getSingleImagePostFields` / `getMultiImagePostFields` / `getPostTypeCustomFields` / `getUserFields` before writes that touch non-standard fields — per-site custom field schemas aren't in the OpenAPI spec and drift between sites)

**VISION.md maintenance**
- Removed obsolete "Phase 1 now" and "Phase 2 next" claims — both shipped through v6.8.x; now summarized as a shipped-status line with CHANGELOG pointer.
- Removed historical "Things deliberately NOT done yet" bullet list — every item (npm org, Smithery, domain verification, version strategy) resolved months ago.
- Corrected false claim that "the MCP server validates inputs against the spec before making API calls — bad requests never hit the BD server." Live v6.8.0 testing showed BD accepts out-of-enum integers silently (`active=99`, `review_status=1`, `lead_status=3`). Validation is best-effort, not guaranteed.
- Added a "Periodic QA checkpoints — BD platform behaviors to re-verify" section documenting the 7 server-side behaviors our MCP docs depend on (master-fallback on GET, all-or-nothing group save, Member Listings singleton, duplicate silent-accept, enum silent-accept, listLeadMatches empty-state, users_meta cross-table collision). Re-test each on major BD releases.

### Non-breaking
No field removed, no required changed, no behavior regressed. Agents already calling `updatePostType` with only `data_id`+`category_tab`+`per_page` continue to work unchanged — the new properties are all optional additions.

## [6.8.1] - 2026-04-19

### Added — HTTP status-code taxonomy + BD API reference article link in MCP instructions

New paragraph in the MCP instructions block:
- Full error-code set agents will encounter: `400` / `401` / `403` / `405` / `429` — previously only `401`/`403`/`429` were called out; `400` and `405` were implicit.
- **Exact 429 response body** — `{"status":"error","message":"Too many API requests per minute"}`. Literal and stable per BD's public docs. Agents can now pattern-match the string to distinguish rate-limit errors from other `status:"error"` responses.
- **API key one-shot display rule** — when a BD admin generates a key in Developer Hub, BD shows it ONCE at creation. No reveal-key button afterward, no recovery path. When a user says "I lost my API key," the correct answer is always "generate a new one" (old key optionally revocable). Prevents agents from suggesting imaginary recovery flows.
- **Citation** — https://support.brilliantdirectories.com/support/solutions/articles/12000108046 (BD's public API overview article) cited as authoritative reference for auth, rate limits, pagination, filters. Agents can point users at this URL when they ask for BD-side documentation.

No code changes. No schema changes. Pure instructions-content patch.

## [6.8.0] - 2026-04-19

### Added — blindspot pass: live-verified duplicate silent-accept, enum silent-accept, server hardening

Three-agent audit (resource-coverage, MCP server code, live stress-test against a BD test site) identified 20+ blindspots across the non-WebPage surface. This release patches every live-verified finding. **No breaking changes** — all updates are safety guidance, pre-check patterns, and server resilience.

**Live-verified behavior documented (2026-04-19):**
- **Duplicate silent-accept on natural-key fields.** BD does NOT enforce uniqueness at the DB level on `createUser.email` (when site setting `allow_duplicate_member_emails` is ON), `createTag.tag_name` (within a `group_tag_id`), or `createUserMeta.(database, database_id, key)` triple. Two rapid identical creates both succeed with different primary keys — downstream lookups then become non-deterministic. Each affected endpoint now carries a **pre-check pattern** (list-first by natural key, reuse or confirm on match) + blanket "Duplicate silent-accept" paragraph in MCP instructions covering the pattern across all resources.
- **Enum silent-accept.** BD accepts integers outside documented enums on `user.active` (observed `99`), `review.review_status` (documented `1` as invalid — stored verbatim), `lead.lead_status` (documented `3` doesn't exist — stored verbatim). Each affected field description now flags the silent-accept explicitly; new blanket rule in MCP instructions tells agents to always pass only documented values.
- **`listUserMeta` cross-table collision is NOT theoretical.** Filtering by `database_id` alone on a live test user returned 12 rows — only 3 were legit user meta; 9 were admin-session breadcrumbs from `data_categories` with the same numeric ID. The 3:1 noise ratio is now documented on `listUserMeta`. v6.7.1 IDENTITY RULE validated and reinforced.
- **`listLeadMatches` empty-state quirk.** When the `lead_matches` table has zero rows matching the filter, BD returns `{status:"error", message:"lead_matches not found", total:0}` instead of the standard `{status:"success", total:0, message:[]}`. Once matches exist, normal shape resumes. Documented on the endpoint — agents now treat the specific error message as empty-result, not failure.
- **`createReview` actually requires `review_email`.** Live server rejects with `"The review email is required"` when omitted, despite prior schema listing only `user_id` as required. Added to schema `required` array; description rewritten with the server-observed error message.
- **Homepage hero fields: stored but benign.** Prior v6.7.2 doc said "hero fields do not apply to homepage." Corrected — BD accepts and stores `enable_hero_section` + any `hero_*`/`h1_*`/`h2_*` on `seo_id=1`, but the homepage template does not render them. Doc now says "stored but benign/no-render; use the homepage widget configuration for homepage hero display."

**Spec-level corrections:**
- **`updateLead` enum conflict resolved.** Endpoint's top-level description listed `4=Closed, 5=Accepted, 6=Declined, 7=Expired, 8=Archived` while inline parameter description listed `4=Follow-Up, 5=Sold Out, 6=Closed, 7=Bad Leads, 8=Delete`. Consolidated to the admin-UI truth (verified from the BD admin lead-status select HTML): `1=Pending, 2=Matched, 4=Follow-Up, 5=Sold Out, 6=Closed, 7=Bad Leads, 8=Delete`. Applied to `createLead`, `updateLead`, `getLead` descriptions.
- **`createMembershipPlan.subscription_type` no longer schema-required.** Previously required but description admitted we didn't know the valid values. Moved out of `required`; default `"member"` applies on omit. `profile_type` (paid/free/claim) remains the authoritative plan-tier field.
- **`review_status` description on both `createReview` and `updateReview` corrected.** Value `1` is not documented but BD accepts it silently — agents now told to stick to `0`/`2`/`3`/`4` with explicit silent-accept warning.

**MCP instructions — security hardening:**
- **XSS pattern matching** — switched inline event handlers from a 4-item enumeration to `on[a-z]+=` pattern match (covers `onerror`/`onload`/`onclick`/`onmouseover` AND the other ~100 DOM handlers like `onfocus`/`ontoggle`/`onpointerdown`/`onanimationend` that were previously slipping through).
- **URL-scheme blacklist expanded** — was `javascript:` only; now `javascript:`/`data:text/html`/`data:application/`/`vbscript:`. Plain `data:image/*` still permitted.
- **CSS-injection rules** — new section blocking `expression(`/`javascript:`/`data:`/`@import`/`behavior:` inside `style=""` attributes and standalone `<style>` blocks (except in `email_body` where `<style>` is legitimate).
- **Encoded-payload handling** — new instruction to HTML-entity-decode and URL-decode values ONCE before pattern matching, so `&#60;script&#62;` and `%3Cscript%3E` don't bypass.
- **Case-insensitivity now explicit for ALL patterns**, not just `<script>`.
- **Safe-HTML allow list widened** — added `<span>`, `<div>`, `<section>`, `<article>`, `<blockquote>`, `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`, `<hr>`, `<figure>`/`<figcaption>`. Previously the list was so narrow that ordinary CMS content would false-positive.
- **Field taxonomy default** — any field not in either the plain-text or HTML-allowed list now defaults to plain-text unless its name contains `content`/`body`/`description`/`desc`/`html`/`text`. Previously left to agent judgment.
- **User-confirmed-override path** — agents may now proceed on HTML-allowed fields after explicit user confirmation (e.g. legitimate SQL tutorial containing `UNION SELECT`), with a required one-line ack in the reply. Previously only widgets had an override path.
- **Widget exemption refined** — still exempt from blocking, but agents warn (non-blocking) if `widget_javascript` contains obvious external-exfiltration shapes (`fetch(` or `XMLHttpRequest` to non-site domains).

**MCP instructions — cache-refresh advisory expanded beyond hero.** New paragraph recommends `refreshSiteCache` after menu, menu-item, widget, membership-plan, and category CRUD. Direct-column WebPage updates (title, content, meta_desc) reflect immediately — refresh optional. Safe no-op when unnecessary.

**MCP server hardening (code):**
- **`resolveRef` now throws a clear error** with the ref path and missing segment instead of crashing with opaque `TypeError: Cannot read properties of undefined`.
- **`Retry-After` header honored on 429** — previously ignored; server told agents "wait 60s" regardless of what BD asked for. Now captures the header and includes the server-requested backoff in the error message.
- **SIGTERM/SIGINT graceful drain** — previously in-flight HTTP requests were abandoned silently when the host killed the server mid-call. Now tracks in-flight requests in a module-level set; on signal, waits up to 5s for them to complete before exit (or forcibly aborts if they exceed the drain window). Prevents "did the last write hit or not?" ambiguity in bulk-job interruptions.
- **Debug-mode body redaction** — `--debug` previously logged raw request bodies, leaking `password`, `token`, `api_key`, `cookie`, `secret`, `auth` values to stderr. Now redacted before log.
- **Double-encode fix in 401/403/429 error text** — server error bodies returned as string (HTML error pages) were being `JSON.stringify`'d again, mangling them. Now emitted raw when already-string.

**Rendering fix:**
- Review status + lead status + review_status enum descriptions had `\\n` (literal backslash-n) instead of `\n` (real newline) — fixed; these enums now render as proper bulleted lists.

### Out of scope for this release (tracked)
- Per-endpoint `\\n`-rendering fixes in remaining user/post/form-field enum descriptions (~15 locations) — rendering degradation, not safety issue. Dedicated pass planned.
- Deeper cascade-cleanup docs on `deleteUser`/`deletePostType`/`deleteMembershipPlan`/`deleteTopCategory`/`deleteTag` — suspected orphan issues surfaced in audit but most not yet live-verified. `deleteUser` live test showed clean cascade (photos + meta purged), so audit's worry there was unfounded; others remain untested.
- Array-syntax multi-filter round-trip through the MCP tool schema — still requires direct request construction for `property[]=x&property[]=y`; redesigning the tool schema to accept arrays is a larger change.

## [6.7.2] - 2026-04-19

### Fixed — sanity-check pass on WebPage + users_meta rules (cross-file consistency)

Two-agent audit of the v6.5.x–v6.7.1 WebPage/users_meta rule surface found a handful of contradictions, drift, and schema/description mismatches. All WebPage- and users_meta-scoped findings addressed in this release:

- **CRITICAL — `hero_content_overlay_opacity` stale v6.6.2 quirk guidance removed.** Field description in both `createWebPage` and `updateWebPage` still told agents the API write was broken and to fall back to the admin UI. v6.7.0 already shipped the real fix (write via `updateUserMeta` with `database=list_seo`) but the stale text was never purged — creating direct contradiction with the EAV workflow five paragraphs below. Now rewritten as: "EAV-STORED FIELD — createWebPage seeds correctly, updateWebPage silently drops it. On update, route through updateUserMeta."
- **CRITICAL — `deleteWebPage` now documents orphan users_meta cleanup.** The rule (list → client-side filter to `database=list_seo` → surgical delete each with database+database_id per v6.7.1) was documented in `createWebPage`/`updateWebPage`/`createUserMeta` but missing from the `deleteWebPage` endpoint description itself — the most important place for an agent deleting a page in isolation to see it.
- **HIGH — `updateUserMeta` and `deleteUserMeta` description "Required:" prose now matches schema `required` arrays.** v6.7.1 moved `database`+`database_id` into the schema-enforced required lists, but the human-readable "Required:" line in each endpoint's description still read "meta_id, value" (update) and "meta_id" (delete) — agents reading the description instead of the schema would hit 400s mid-workflow and misdiagnose.
- **HIGH — `date_updated` now schema-required on `createWebPage` and `updateWebPage`.** v6.6.0 claimed `date_updated` was required on every write but only in prose — the schema `required` arrays still listed only `seo_type`+`filename` (create) and `seo_id` (update). MCP tool-schema derivation is schema-driven, so agents that trusted the generated tool schema would forget the field. Now schema-enforced. `updateWebPage` "Required:" prose updated to match.
- **HIGH — `docs/api-user-meta.md` drift repaired.** The Endpoints section's "Required:" lines and the hero-workflow + delete-cleanup code examples were still showing the pre-v6.7.1 single-field signatures (`deleteUserMeta(meta_id=...)`). Fixed to match the schema: all update examples now pass `database`+`database_id`; cleanup workflow now shows the client-side filter step.
- **MEDIUM — `createUserMeta` description now carries the v6.7.1 downstream-delete safety note + cache-refresh rule.** Previously `updateUserMeta` carried both, but the EAV workflow has a create branch (when a meta row doesn't exist yet) that needed the same instructions.
- **MEDIUM — updateWebPage hero safe-defaults block now flags `hero_content_overlay_opacity` as EAV-only on update.** Applying safe-defaults via `updateWebPage` alone was silently dropping the opacity value per the EAV split; now the safe-default bullet tells agents to route opacity through `updateUserMeta`.
- **MEDIUM — `getUserMeta` description now carries the identity-check rule.** Fetching a single meta row is safe, but the returned `meta_id` is often piped into a subsequent update/delete — the agent must verify `database`/`database_id` on the response before using the ID for any write.
- **LOW — WebPage enum descriptions rendering fix.** `seo_type`, `menu_layout`, and `custom_html_placement` enum descriptions in both create + update were using `\\n` (escaped backslash-n → literal `\n` character in the rendered markdown) instead of `\n` (JSON escape → real newline). Now render as proper bulleted value lists rather than run-on strings with visible `\n` markers. Six locations fixed. (Non-WebPage enums across other resources carry the same issue — out of scope for this pass, will be addressed in a dedicated rendering pass.)

No schema-breaking changes relative to v6.7.1 other than the `date_updated` addition to `createWebPage`/`updateWebPage` required arrays — agents already passing `date_updated` (per v6.6.0 docs) continue working unchanged; agents that were omitting it will now hit a clear schema-validation error instead of silently writing a record with a stale update timestamp.

## [6.7.1] - 2026-04-19

### Changed — users_meta safety hardening: `database` + `database_id` now REQUIRED on update and delete

- **Root cause:** The same `database_id` value can exist in `users_meta` pointing at completely unrelated parent tables (e.g. `database_id=123` simultaneously referring to a member in `users_data`, a page in `list_seo`, and a subscription in `subscription_types`). An agent deleting or updating by `meta_id` alone — or worse, looping over rows matched only by `database_id` — WILL silently corrupt unrelated records across the site. Live-verified during 6.7.0 testing: page 120's meta result set included 4 `database=users_data` rows (unrelated to the list_seo page 120) mixed in with the list_seo rows.
- **`updateUserMeta` schema** — `database` and `database_id` added to the `required` array (previously only `meta_id` + `value`). Description rewritten with "IDENTITY RULE — ALWAYS confirm BOTH `database` AND `database_id` before updating" section.
- **`deleteUserMeta` schema** — `database` and `database_id` added to the `required` array (previously only `meta_id`). Description rewritten with strongest warning: "HARD RULE — verify BOTH `database` AND `database_id` of the row BEFORE deleting" + safe post-parent-delete cleanup workflow.
- **`listUserMeta` description** rewritten with shared-ID collision warning and note that BD does not enforce uniqueness on `(database, database_id, key)` so duplicate rows are possible.
- **MCP instructions** — new `users_meta IDENTITY RULE` paragraph (applies to every users_meta read, update, and delete — no exceptions) placed before the WebPage EAV workflow paragraph so cold agents internalize the pair-matching rule on first load.
- **`docs/api-user-meta.md`** — prominent "HARD SAFETY RULE — always include `database` + `database_id` on update and delete" section added at the top explaining the cross-table collision, the new required fields, and the never-loop-delete-by-database_id-alone rule.

This is a breaking change for any agent or automation that was calling `updateUserMeta`/`deleteUserMeta` with only `meta_id`. The change is deliberate — the old schema was unsafe by design and allowed quiet cross-table data corruption.

## [6.7.0] - 2026-04-20

### Added — WebPage EAV-update workaround via users_meta + hero image sourcing rule

- **Documented BD's list_seo split-storage pattern:** 18 fields on the `list_seo` table are stored in `users_meta` rather than as direct columns. On CREATE, `createWebPage` seeds them correctly; on UPDATE, `updateWebPage` silently ignores them. Agents must use `updateUserMeta`/`createUserMeta` with `database=list_seo` to persist those field updates. Affected fields: `linked_post_category`, `linked_post_type`, `disable_preview_screenshot`, `disable_css_stylesheets`, `hero_content_overlay_opacity`, `hero_link_target_blank`, `hero_background_image_size`, `hero_link_size`, `hero_link_color`, `hero_content_font_size`, `hero_section_content`, `hero_column_width`, `h2_font_weight`, `h1_font_weight`, `h2_font_size`, `h1_font_size`, `hero_link_text`, `hero_link_url`.
- **Reads merge automatically** — `getWebPage`/`listWebPages` return parent + users_meta values merged at top level. No separate query needed for reads.
- **Delete cleanup rule** — `deleteWebPage` does NOT cascade-delete orphan users_meta rows. Agents must call `listUserMeta(database=list_seo, database_id=<deleted seo_id>)` and delete each matching row surgically.
- **`createUserMeta` and `updateUserMeta` descriptions rewritten** to lead with the WebPage EAV workflow (was previously generic "attach key/value to any record").
- **Hero image sourcing rule** — agents must use content-relevant Pexels photos (large variant, not "original"), never random-image placeholders like picsum.photos which change per page load and look broken to real users.
- **`docs/api-user-meta.md`** rewritten with the full EAV pattern, WebPage-specific workflow, read-merge behavior, and delete cleanup instructions.

## [6.6.2] - 2026-04-20

### Documented — hero_content_overlay_opacity API write quirk

Live-verified: `hero_content_overlay_opacity` sent via API update (any method — MCP tool or raw curl) returns stored as `"0.0"` regardless of the input value (e.g. `0.5` sent, reads back `0.0`). All other hero fields (colors, padding, image, fonts, alignment) write correctly. Field description now flags this as a known quirk and tells agents to fall back to the BD admin UI for overlay opacity until fixed platform-side.

## [6.6.1] - 2026-04-20

### Added — hero readability safe-defaults + cache refresh rule

- When an agent enables the hero (`enable_hero_section=1` or `2`) on any WebPage and the user hasn't specified color/overlay/padding values, apply these readability-safe defaults: `h1_font_color=rgb(255,255,255)`, `h2_font_color=rgb(255,255,255)`, `hero_content_overlay_color=rgb(0,0,0)`, `hero_content_overlay_opacity=0.5`, `hero_top_padding=100`, `hero_bottom_padding=100`. White text + black-50% overlay guarantees readable contrast over any background image. Universal to both `content` and `profile_search_results` page types.
- **Cache refresh now required** after any `createWebPage` or `updateWebPage` that touches `enable_hero_section` or any `hero_*`/`h1_font_*`/`h2_font_*` field — agents must call `refreshSiteCache` immediately, otherwise hero changes are stored but not rendered publicly until BD's next cache cycle.
- Rules added to both the createWebPage/updateWebPage description blocks AND the MCP instructions so cold agents apply them on first try.

## [6.6.0] - 2026-04-20

### Added — security guardrails + date_updated tracking on WebPages

- **Security & input sanitization** rule in MCP instructions (cross-cutting, every write, every resource). Agents now reject obvious injection payloads (`<script>`, `<iframe>`, inline event handlers, `javascript:` URLs, MySQL-style `; DROP TABLE` / `UNION SELECT` fragments) rather than silently writing them into BD. Distinguishes real content ("we DROP by the office") from attack shapes. Field-strictness split: plain-text fields reject ALL HTML; HTML-allowed fields reject the dangerous subset while permitting safe HTML. **Widget exception:** `widget_data`/`widget_style`/`widget_javascript` exempt (widgets legitimately need JS/CSS; anyone with API write permission already has admin access).
- **`date_updated` + `updated_by`** fields added to `createWebPage` / `updateWebPage` schemas. `date_updated` is REQUIRED on every write (`YYYYMMDDHHmmss` format) — BD does not auto-populate, so omitting leaves the admin-UI "Last Update" display blank/stale. `updated_by` optional but recommended for audit traceability.
- Required-defaults list on `profile_search_results` pages now includes `date_updated=<current timestamp>` and `updated_by=<audit label>` alongside the existing `content_active`/`custom_html_placement`/`form_name`/`menu_layout` defaults.

## [6.5.3] - 2026-04-20

### Changed — two live-test-surfaced footguns documented

- Duplicate `filename` silent-accept — BD does NOT reject creating a second `list_seo` row at an existing filename. Docs now explicitly warn that skipping the pre-create `listWebPages` existence check will silently orphan a duplicate row with undefined render-time behavior.
- Title-length truncation behavior — BD stores `title` verbatim, but Google/Bing truncate at ~55–60 chars in SERPs. Docs now tell agents to keep important words in the first 55 and pre-truncate client-side for precise control.

## [6.5.2] - 2026-04-20

### Changed — accurate 403 guidance for list_professions and list_services

Per BD dev clarification, `/api/v2/list_professions/*` and `/api/v2/list_services/*` (which back `listTopCategories`/`listSubCategories`/`getTopCategory`/`getSubCategory`/`createTopCategory`/etc.) are NOT in BD's public Swagger spec. The Developer Hub UI's "Categories (Professions)" and "Services" toggles gate DIFFERENT endpoints (`/api/v2/category/*` and `/api/v2/service/*`, which read separate legacy tables with likely-empty data). Enabling those UI toggles does NOT grant access to our endpoints.

- Rewrote `listTopCategories` permission note with the accurate root cause + fix path (admin must manually insert rows into `bd_api_key_permissions`).
- Same rewrite on `listSubCategories`.
- MCP instructions `API key permissions` paragraph expanded with this specific gap so cold agents surface the right ask to site admins on 403.
- Explicitly warned agents NOT to substitute `/api/v2/category/*` or `/api/v2/service/*` as fallbacks — different tables, inconsistent data.

## [6.5.1] - 2026-04-20

### Fixed — critical rule added: profile_search_results slugs must be real

Live stress testing found that `profile_search_results` static pages 404 on the public URL if `filename` doesn't correspond to a real BD dynamic search URL (built from actual country/state/city/top_category/sub_category slugs on the site). Arbitrary/made-up slugs return HTTP 404 even though the `list_seo` record is created successfully — BD has no dynamic page to override.

- Added explicit "CRITICAL" warning to `createWebPage`/`updateWebPage` descriptions
- Added same rule to MCP instructions so cold agents get it at session start
- Directed agents to use `seo_type=content` instead if they need a static page at an arbitrary URL

## [6.5.0] - 2026-04-20

### Added — Sidebars resource + full Member Search Results SEO page defaults

- New **Sidebars** resource (read-only: `listSidebars`, `getSidebar`). Returns site-custom sidebars only. Description hardcodes the 5 **Master Default Sidebars** that are always available on every BD site but never returned by the endpoint: `Global Website Search`, `Member Profile Page`, `Personal Post Feed`, `Post Search Result`, `Post Single Page`.
- `form_name` field description on createWebPage/updateWebPage corrected — it's a SIDEBAR name (not a contact form), documents master defaults, fallback rule, and default for `profile_search_results`.
- `menu_layout` description updated with sidebar-position meaning and `profile_search_results` default (`3` = Left Slim).
- **Member Search Results SEO workflow** expanded with required defaults on create: `form_name="Member Profile Page"`, `menu_layout=3`, `custom_html_placement=4`, `content_active=1`. Now also requires agents to AUTO-GENERATE all 5 SEO meta fields (`title`, `meta_desc`, `meta_keywords`, `facebook_title`, `facebook_desc`) targeted to the location+category combo — with char-budget guidance and varying Title vs Social Title. `facebook_image` deliberately omitted from auto-fill (needs a customer-uploaded asset).
- **Country-only slug caveat** documented — live-verified that `filename=<country>` alone 404s for `profile_search_results` pages (country slug only works as a left-parent prefix on longer slugs).
- MCP instructions: new Sidebar cross-cutting rule + expanded Member Search Results SEO rule.

## [6.4.0] - 2026-04-19

### Added — Locations resources + Member Search Results SEO workflow

- New **Cities**, **States**, **Countries** resource families (read + update only — create and delete deliberately omitted to prevent collisions with BD's auto-seeding when new members sign up from a new location).
  - `listCities`, `getCity`, `updateCity` (`/api/v2/location_cities/*`) — documents BD schema typo: city PK is `locaiton_id`, NOT `location_id`.
  - `listStates`, `getState`, `updateState` (`/api/v2/location_states/*`) — PK is `location_id` (no typo). Country-agnostic (US states + Canadian provinces + any country's regions).
  - `listCountries`, `getCountry`, `updateCountry` (`/api/v2/list_countries/*`). Note: no `country_filename` field — derive country URL slug by lowercasing `country_name` and replacing spaces with hyphens.
- New field `custom_html_placement` on `createWebPage`/`updateWebPage` — enum `0` (Inside Tab), `1` (Above Member Results), `2` (Below Member Results), `3` (Above Body Content), `4` (Below Body Content — recommended default for AI-generated SEO pages). Only meaningful on `profile_search_results` page type.
- **Member Search Results SEO workflow** paragraph added to createWebPage/updateWebPage descriptions AND to the MCP instructions field — explains the full slug construction (`country/state/city/top_cat/sub_cat` with any left-parent droppable), agent chain (resolve each segment via the relevant list endpoint), defaults, and the H1/H2 double-render trap when hero is enabled.

### Notes

- Locations are read-mostly by design in this MCP. BD auto-seeds cities/states when new members sign up from new locations. Creating cities/states via API risks duplicating auto-created rows with slightly different slugs; deleting risks orphaning every member referencing the row. `updateCity`/`updateState`/`updateCountry` are the only write operations exposed — intended for corrections (typos in filenames, reassigning state/country, toggling country `active`).

## [6.3.5] - 2026-04-19

### Changed — `content_layout` description clarified

- `content_layout` (Full Screen Page Width) field on createWebPage/updateWebPage now explains what the toggle actually unlocks: edge-to-edge sections for full-bleed backgrounds, hero-style bands, and viewport-spanning imagery. Notes that plain text/content pages don't need it — only enable when the page's HTML has sections designed to break out of the contained width.

## [6.3.4] - 2026-04-19

### Changed — README restructured for max adoption

- Clickable Table of Contents at the top, linking to every major section.
- **Setup by Platform** is now per-app with explicit GUI-first step-by-step menu paths — you no longer need to know what a terminal is unless you want to. Sourced from each platform's current (2026) documentation:
  - **Cursor**: `Cursor → Settings → Cursor Settings → Tools & MCP → New MCP Server`
  - **Claude Desktop**: `Settings → Developer tab → Edit Config` (or use Extensions browser)
  - **Claude Code**: terminal-only (no GUI)
  - **Windsurf**: `Settings → Cascade → MCP Servers → Configure`
  - **Cline (VS Code)**: Cline panel → MCP Servers icon → Configure
- Wizard (`npx brilliant-directories-mcp --setup`) repositioned as "try this first; if it fails, use the per-platform steps below" — honest about when it works vs when to fall back.
- Shared config-block-once, referenced-per-platform pattern — no more copy-paste drift between sections.
- "What you can ask" + destructive-write warning moved below Setup where it's actually read in sequence.

### Changed — README final polish

- Added destructive-write warning to the "What you can ask" section (AI can DELETE and MODIFY live data — no undo).
- Added FAQ section covering: cost, data flow, multi-site, team keys, removal/disconnect, undo semantics, staging-vs-production, key permissions.
- Fixed Filtering section: removed LIKE from the "ready" operator list; noted the expanded operator set is in QA.
- Support section now names GitHub Issues as the bug-report/feature-request channel.
- Dropped the repo-maintainer "Files" section (noise for end users).

## [6.3.2] - 2026-04-19

### Changed — README: "where do I paste this?" clarity

- Setup by Platform section now tells users WHERE to paste each command (Mac: Terminal.app · Windows: PowerShell) and what to do with JSON config blocks (which file path per app, how to create it if missing, what to do after saving).
- Per-platform restart instruction inline ("fully quit and reopen") — not just implied.
- Troubleshooting verify command now says where to paste it.

## [6.3.1] - 2026-04-19

### Changed — README idiot-proofing

- Added "Before you start" prerequisites section (Node.js install link, API key location, site URL format rule: `https://` prefix required, NO trailing slash).
- Added "fully quit and reopen" instruction for restart (Mac `Cmd+Q`, Windows right-click taskbar → Quit) — people were just closing the window.
- Added "Success looks like" vs "Failure looks like" so users know when it worked.
- Added "Updates are automatic" paragraph — `npx` pulls the latest version on each app restart.
- Added "What you can ask the AI to do" — concrete example prompts so non-technical users can see the value.
- Expanded troubleshooting to cover "AI says no tools" (needs full quit), `403 permission` (per-endpoint key config), `npx: command not found` (Node.js missing), and site-URL format errors.

## [6.3.0] - 2026-04-19

### Added

- Post schema fields for Event/Coupon/Job/Video post types: `post_location`, `lat`, `lon`, `state_sn`, `country_sn`, `post_live_date`, `post_start_date`, `post_expire_date`, `post_video`, `post_job` on `createSingleImagePost` and `updateSingleImagePost`.
- `post_category`, `post_image`, `post_tags`, `auto_geocode`, `post_meta_title`, `post_meta_description`, `post_meta_keywords` on `createSingleImagePost` / `updateSingleImagePost` schemas.
- Full hero-section field set on `createWebPage` / `updateWebPage` (23 fields including `enable_hero_section` 3-value enum, overlay color/opacity, padding, H1/H2 typography, CTA).
- `users_to_match`, `auto_match`, `send_lead_email_notification` schema properties on `createLead` (override auto-match with specific member IDs or emails).
- `filename` as an optional settable field on `createUser`/`updateUser`.
- `active=6` (Incomplete) added to the enum with description.
- `home` added to `updateWebPage.seo_type` enum for homepage round-trip.
- MCP instructions section for API-key per-endpoint permissions, pagination gotchas, response typing quirks, sensitive fields in responses, write-time echo residue, post_category admin-managed discovery, hero-doesn't-apply-to-homepage rule.

### Changed — doc accuracy corrections based on live behavior verification

- `email` uniqueness: now correctly documents dependence on the `allow_duplicate_member_emails` site setting (OFF = BD rejects duplicates, ON = duplicates accepted). Previously claimed email+password combo was always unique, which was false.
- `listing_type`: now states BD stores values verbatim without validation (normalize client-side). Previously claimed "rejected or silently coerced."
- `review_status`: canonical enum `[0, 2, 3, 4]` = Pending/Accepted/Declined/Waiting for Admin. Value 1 is not valid. Previously had mismatched enums between createReview `[0,1,2]` and updateReview `[0,2,3,4]`.
- `createRedirect.type`: no longer required (defaults to `custom`).
- `card_info`: response is the literal boolean `false` when no card on file, object when populated. Same `false`-for-empty pattern documented for `tags`, `photos_schema`, `services_schema`, `profession_schema`, `transactions`, `subscription_details`, `user_clicks_schema.clicks`.
- Filter operator caveat: only `=` is reliable right now; `LIKE` and expanded operators (`!=`, `in`, `not_in`, `not_like`, `is_null`, `is_not_null`, `between`) are in QA and shipping shortly via PR 5135.
- `"user not found"` error envelope is returned for bad filters, bad cursors, AND legitimately-empty results — documented as indistinguishable.
- `data_type` parameter on post endpoints: now says "classification family (4/9/20), read from the post type's data_type column" — replaces prior contradictory instruction to call `listDataTypes`.

### Fixed — load path

- Spec is now synced across all locations including `mcp/openapi/bd-api.json` (the path the MCP server loads first at runtime). Earlier fixes landed in the repo-root spec but this runtime-loaded copy had diverged.

## [6.2.1] - 2026-04-19

### Fixed — "pass raw HTML, no CDATA/escaping" warning on all HTML-accepting fields (from real cold-agent feedback)

A cold-agent test exposed a real failure: agent wrapped `about_me` HTML in `<![CDATA[...]]>` (reflex from XML-style APIs) and BD stored the literal wrapper as visible text instead of rendering the inner HTML. Required an `updateUser` cleanup pass to recover.

Root cause: field descriptions said "HTML allowed" but didn't explicitly forbid CDATA wrapping or entity escaping. Agents trained on XML/SOAP conventions assumed they needed to wrap/escape.

**Fix applied to all 21 HTML-accepting fields across 12 operations:**

| Op | Fields |
|---|---|
| `createUser`, `updateUser` | `about_me`, `search_description` |
| `createSingleImagePost`, `updateSingleImagePost` | `post_content`, `post_caption` |
| `createMultiImagePost`, `updateMultiImagePost` | `group_desc` |
| `createWebPage`, `updateWebPage` | `content`, `content_footer`, `hero_section_content`, `seo_text` |
| `createWidget`, `updateWidget` | `widget_data` |
| `createEmailTemplate`, `updateEmailTemplate` | `email_body` |

Each affected field description now ends with: *"Pass raw HTML — do NOT wrap in `<![CDATA[...]]>`, do NOT escape as `&lt;` / `&gt;`. BD stores the field value verbatim; any wrapper/escape gets saved as literal text."*

### Added — HTML-field rule to MCP instructions

One line added to `initialize.instructions` so agents see the rule at session start, BEFORE they ever construct a payload:

> *"HTML fields (`about_me`, `post_content`, `widget_data`, `email_body`, `content`, etc.) take raw HTML. Do NOT wrap in `<![CDATA[...]]>` and do NOT entity-escape (`&lt;`/`&gt;`) — BD stores field values verbatim, so wrappers and escapes end up as literal visible text on the rendered page."*

This is belt-and-suspenders: the rule appears both at session-start context AND inline on every affected field description. Agents can't miss it.

## [6.2.0] - 2026-04-19

### Added — `refreshSiteCache` live-tested + discovered undocumented parameters

Live-tested against studev29106 and found the response shape is RICHER than previously documented, plus discovered two optional parameters BD's support docs don't mention:

**New optional parameters discovered (both undocumented by BD publicly):**

- **`scope`** — target one cache area only instead of refreshing all 6. Valid values: `data_widgets`, `settings`, `web_pages`, `css`, `menus`, `sidebars`. Invalid values return an error response listing the valid set. Faster than a full refresh when you only need one area invalidated.
- **`full=1`** — include heavier `db_optimization` + `file_permissions` passes in addition to the 6 core areas. Slower but more thorough; use when lighter refreshes haven't resolved the issue.

**Real response shape (was documented as just `{status, message}`, actually much richer):**

```json
{
  "status": "success",
  "message": "Cache refreshed successfully",
  "areas_refreshed": ["data_widgets", "settings", "web_pages", "css", "menus", "sidebars"],
  "scope": "full",
  "full": false
}
```

The `areas_refreshed` array lets agents report to the user exactly what was cleared. With `full=1`, the array additionally includes `db_optimization` and `file_permissions`.

Tool description rewritten to include the full parameter list, real response shape with code-block example, and an explicit "Do NOT use for" section preventing cache-thrashing anti-patterns (routine post-op use, new page creation). Summary updated to "Refresh the site cache (template/theme/widget/menu/page invalidation)" so the scope is visible during tool discovery.

Bumped as MINOR version (6.1.x → 6.2.0) since this adds two new accepted schema parameters — additive, non-breaking, but meaningful enough not to hide in a patch release.

## [6.1.6] - 2026-04-19

### Changed — tightened `refreshSiteCache` tool description

Cleaned up redundancy and added explicit anti-pattern warning:
- Removed duplicate "does not register new page URLs" language (was stated twice — in opener and Parameter interactions section)
- Added **Do NOT use for:** section with two concrete anti-patterns: (a) new pages (they go live immediately via `content_active=1`, not via this endpoint), (b) routine workflow noise (do not call after every bulk op — this is a targeted fallback, not a default post-step)
- Summary renamed: "Refresh the site cache" → "Refresh the site cache (template/theme/widget changes only)" so agents see the scope in tool discovery before drilling into description

Description length: 1346 → 1110 chars. Tighter, with the scope-narrowing warning baked in.

The tool was already present and functional; this release just clarifies WHEN to reach for it so agents don't cache-thrash BD's servers after every bulk operation.

## [6.1.5] - 2026-04-19

### Added — real-time cost awareness for bulk operations

Inserted one sentence in the Rate limit block: "Each call takes ~1-3 seconds round-trip, so bulk jobs add up to real minutes — tell the user an honest estimate upfront (e.g. 500 records ≈ 10-15 minutes)."

LLMs have no innate sense of wall clock — from the agent's perspective, 500 tool calls happen in one continuous reasoning flow. Without this hint, agents tell users "I'll do this in a moment" and then the user waits 15 minutes frustrated. With it, the agent gives honest ETAs upfront and can proactively ask "proceed or stage this?" for large jobs.

Note: this does NOT change pacing behavior — synchronous MCP tool calls are already physically paced by BD's response time. The purpose is user communication (honest ETAs), not agent self-throttling.

## [6.1.4] - 2026-04-19

### Added — "no bulk endpoints" explicit, rate/pagination/write blocks explained

User-reviewed the MCP instructions and flagged that rate-limit and pagination rules lacked "why" and scope. Also correctly noted there are no bulk write endpoints — every create/update/delete is single-record. Agents might assume bulk patterns exist based on typical REST APIs and write broken batch code silently. Now addressed:

- **"No bulk write endpoints" added as its own line:** "every create/update/delete is one record at a time. Processing 500 members means 500 calls. Paced sequentially under rate limits." Agents now know bulk = a loop, not a special endpoint.
- **Rate-limit "why" added:** "BD's window resets every 60s, so shorter backoffs just burn failing calls." Explains WHY 60s specifically, not just the rule.
- **verifyToken "why" added:** "avoiding half-run imports." Explains the real consequence of skipping it.
- **Pagination scope added:** "all `list*` and `search*` endpoints only" with explicit exclusion ("Single-record `get*`, create/update/delete don't paginate"). Agents now know exactly when pagination applies.
- **Write-safety expanded:** "immediately visible on the public site" reinforces write is live; `active=3` rationale ("record stays queryable and can be reactivated") makes the reversibility benefit concrete.

Instructions word count: 445 → 531. All additions are load-bearing — agents now understand WHY each rule exists, not just the rule itself.

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
