# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.40.53] - 2026-04-25

### Fixed — `users_data` filename collision check was silently failing (HIGH)

Claude's round-5 file-tests caught: `createWebPage filename="united-states/dallas/julie-hoang"` succeeded even though `user_id=29`'s public profile lives at exactly that URL. Live-reproduced and root-caused.

**Root cause:** `_slugProbeTable` builds the BD URL as `/api/v2/${table}/get`, where `table` comes from `SITE_NAMESPACE_TABLES`. v6.40.42 added `users_data` to that table list, but BD's REST API exposes the `users_data` table at `/api/v2/user/*` (singular), NOT `/api/v2/users_data/*` (which 404s). Same shape as the v6.40.46 FK-guard fix — different code path. Probe got 404, fell into the "transient failure" branch, allowed the write through, surfaced a `_slug_probe_warning`. The collision was hidden behind a soft warning instead of being a hard reject.

#### Fix

Added `TABLE_TO_ENDPOINT` translation map and `_tableEndpoint(table)` helper. Single source of truth for BD's table-vs-endpoint name mismatches:

```js
const TABLE_TO_ENDPOINT = {
  users_data: "user",
};
```

`_slugProbeTable` now calls `_tableEndpoint(table)` before building the URL. Future BD endpoint mismatches just get added to this map. No more silent probe failures from name mismatches.

### Added — corpus note clarifying table vs. endpoint names

Added to `mcp-instructions.md`:

> **Table names ≠ endpoint names in some cases.** BD's `users_data` table is exposed via `/api/v2/user/*` (singular). Use the tool names from your catalog (`getUser`, `listUsers`, etc.); do NOT construct BD URLs by hand from internal table names. The wrapper handles the table-to-endpoint translation for every internal probe; you should never need to.

This protects against agents trying to construct BD URLs by table name in any natural-language path (rare but possible — agents sometimes hand-build curl examples in user-facing prose).

### Verified live — `createWebPage` at user filename now rejects

Pre-fix: write succeeded, returned `_slug_probe_warning: "Slug uniqueness could not be fully verified..."`. Post-fix: write rejects with the cross-namespace error pointing at `user_id=29`.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `TABLE_TO_ENDPOINT` map + `_tableEndpoint` helper added. `_slugProbeTable` URL-builder updated to use translated endpoint. ~10 lines net.
- `mcp/openapi/mcp-instructions.md` — one corpus note added (~1 paragraph).

### Note for future BD-side observation tracking

Two existing-data anomalies Claude flagged from reading user records (NOT wrapper bugs):

- Literal `top-level-category` string in some user `filename` fields — BD's slug generator appears to fall back to a placeholder when no real `profession_name` is set.
- Quadruple-hyphen (`----`) in `filename_hidden` — BD's slug generator preserves the count of replaced characters instead of collapsing to a single hyphen.

Both noted for the BD dev team but no wrapper action.

## [6.40.52] - 2026-04-25

### Changed — README + SKILL.md placeholder URLs use canonical `www.` form

Most BD sites are served at `https://www.<domain>` rather than the bare-apex form. Customers copying the setup snippets verbatim were sometimes ending up with `https://customer-site.com` when the canonical hostname is `https://www.customer-site.com`, producing 404s on the BD API.

Updated:
- The "Before you start" requirements block now leads with `https://www.mysite.com` as the primary example, keeps the bare-apex form as a fallback "only if your site has no www.", and adds an explicit anti-pattern: `https://mysite.com` when the site actually serves at `www.mysite.com`.
- All 44 placeholder URL examples across both READMEs (root + `mcp/`) use `https://www.your-site.com`.
- Troubleshooting "404 Not Found" entry adds the `www.` canonical-form guidance.
- `SKILL.md` agent-facing examples updated to `https://www.mysite.com`.

No code changes. The Worker forwards the customer's `X-BD-Site-URL` header verbatim to BD — it does NOT canonicalize between `www.` and bare-apex. So a customer who passes `https://mysite.com` when BD only responds at `https://www.mysite.com` will see 404s. Docs now lead with the canonical form so first-try installs work.

## [6.40.51] - 2026-04-25

### Fixed — three more URL gaps from Claude's continued stress test (Phases 14-18)

#### NFKC normalization bypass (HIGH)

`aﬃliate` (with `ﬃ` U+FB03 Latin small ligature ffi) was accepted as distinct from `affiliate`. Two slugs that decompose to the same canonical form via Unicode NFKC are visually identical but bypass the duplicate-pair guard. Same class as the homoglyph attack but via compatibility-decomposition rather than script-mixing.

Fix: reject any slug where `slug.normalize("NFKC") !== slug`. The error message includes the canonical form so the agent can resubmit. Also catches full-width digits, ligatures, and other compatibility variants.

#### Trailing dot bypass (LOW-MED)

`about.` was accepted as distinct from `about`. Some web servers (IIS, Windows) silently strip trailing dots from URL paths, making `/about.` route to `/about` — duplicate-equivalent on those platforms.

Fix: reject any slug ending in `.`. Internal dots (`page.v2`) still pass; only trailing dots reject.

#### Cross-table tool-name suggestion mismatch (LOW)

When `createWebPage` collided with a top category, the error message said *"use updateWebPage on the existing record (profession_id=X)"* — but `profession_id` belongs to top categories, so the correct suggestion is `updateTopCategory`. Now uses a static table → update-tool map (`list_seo` → `updateWebPage`, `list_professions` → `updateTopCategory`, etc.) so cross-namespace suggestions name the right tool.

### Verified — 14 stress-test cases

NFKC: ligature `ﬃ` and full-width digits both reject; pre-composed canonical `café` passes. Trailing dot: `about.`, `a.b.c.`, `a/b.` all reject; internal dot `page.v2` passes. Plus 8 regression checks against v6.40.50 behavior.

### Investigated, no code change

- **Compound suffixing** (`slug-1-1-1`): functional, just visually noisy. Real users won't hit this; not worth complicating the auto-suffix loop.
- **6 untested call sites** (membership plans, posts, custom_checkout_url): structurally guaranteed by the shared `SLUG_TOOL_CONFIG` + `reserveSiteUrlSlug` middleware. All 12 entries route through the same validator; no per-tool wiring divergence possible.
- **TOCTOU race window**: cannot fix at wrapper layer without server-side mutex. Worker pre-check is best-effort; BD's DB has no unique constraint on slug fields. Documented as known limitation; would need BD-side fix.
- **Allow-list architectural change**: rejected. Pure `[a-zA-Z0-9._/-]` allow-list breaks CJK, emoji, accented Latin (BD supports them per user direction). Extended deny-list + structural rules + script-uniformity check + NFKC achieves the same goal while preserving unicode.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. NFKC check + trailing-dot reject added near top of `_validateSlugFormat` (~10 lines). `TABLE_TO_UPDATE_TOOL` map added in `reserveSiteUrlSlug` (~10 lines).

## [6.40.50] - 2026-04-25

### Added — close 4 advanced URL stress-test gaps

Claude's URL stress test found four more attack classes that bypassed v6.40.48. All addressed.

#### Length cap (LOW-MED)

Slugs over 200 chars total or 100 chars per segment now reject. Browsers, CDNs, and email clients commonly truncate or reject long URLs; CMS conventions cap at this length. Hard cap prevents runaway-long payloads.

#### Control + bidi-override chars (MED-HIGH)

`\p{C}` Unicode property — covers RTL override (U+202E), LTR override (U+202D), ZWSP, BOM, all C0/C1 control chars, format-control chars. RTL override is a known phishing vector: `file‮gpj.exe` displays as `fileexe.jpg` in some contexts but is actually a `.exe`. Future-proof: new Unicode releases that add bidi-control or format chars are auto-rejected without spec maintenance.

#### Homoglyph guard — script-uniformity check (MED-HIGH)

Per segment, count distinct Unicode scripts among letter chars. If >1 script appears, reject. Latin + Cyrillic mixed (`аbout` where `а` is Cyrillic U+0430 visually impersonating Latin `a`) = phishing → reject.

Pure-Latin OK, pure-Cyrillic OK, pure-Greek OK, pure-CJK (Han + Hiragana + Katakana unified) OK, pure-Hangul OK, pure-Arabic OK, pure-Hebrew OK, pure-Thai OK, pure-Devanagari OK. Digits, hyphens, dots, and emoji are script-neutral and don't trigger the rule.

This preserves the "BD supports unicode in URLs" stance while catching every confusable-pair attack without maintaining a custom mapping table.

#### Reserved BD route prefixes (MED)

First-segment match against an explicit reject set. Slugs starting with `admin`, `account`, `checkout`, `api`, or `photos` shadow built-in BD routes (admin panel, member account, checkout flow, REST API, photo gallery) and break page routing. Case-insensitive (matches BD router behavior).

Per-tool: applies to web pages, top categories, sub categories, plans, posts, and members — anywhere the slug becomes a public URL path. Users can still create slugs containing these words (`my-admin`, `administration`, `section/admin`); only the FIRST segment matching exactly triggers rejection.

### Verified — 49 stress-test cases

11 valid slugs (CJK, emoji, accented, plus, nested) all PASS. 38 attack vectors all REJECT correctly. Includes the 28 cases from v6.40.48 plus 21 new for v6.40.50: 7 length cases, 7 control/bidi, 5 homoglyph, 12 reserved-route, plus regression checks.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `_validateSlugFormat` extended ~70 lines: `SLUG_MAX_LENGTH` + `SLUG_SEGMENT_MAX_LENGTH` constants, `SLUG_RESERVED_FIRST_SEGMENTS` set, `\p{C}` control-char regex, per-segment script-uniformity scan via `\p{Script=...}` properties.

## [6.40.49] - 2026-04-25

### Fixed — `include_*=1` fix completed across all spec locations + drift-check guard

v6.40.47's `include_*` boolean→integer fix only converted 2 of the 3 locations the spec stores fields. Inline-in-operation-parameters (`paths.<route>.<method>.parameters: [...]`) was missed, leaving 10 `include_*` fields (including `listWebPages.include_content`) still typed as `boolean`. The SDK's Zod validator kept rejecting `=1` for those operations — verified live: `listWebPages include_content=1` returned `"Expected boolean, received number"` even after v6.40.47 publish + Worker redeploys.

#### What was missed

A field name like `include_content` can appear in **three structurally distinct places** in an OpenAPI 3.1 spec:

1. `components.parameters.<name>` — top-level $ref-able definitions
2. `paths.<route>.<method>.parameters: [{name: ..., schema: ...}]` — **inline operation parameters** (was missed in v6.40.47)
3. `paths.<route>.<method>.requestBody.content.<mime>.schema.properties.<name>` — request-body property schemas

A spec-wide change has to update all three. v6.40.47 hit (1) + (3) but not (2).

#### Fix

10 inline-in-operation `include_*` parameters converted from `type: boolean` to `type: integer, enum: [0, 1]`. Total spec count of `type: boolean` is now 0.

#### Guard added — `scripts/schema-drift-check.js` CHECK 7.5

New check explicitly inspects all three locations for `include_*` fields with `type: boolean` and fails the drift check before publish if any are found. Future spec edits that drop a new boolean `include_*` will trip this immediately.

### Internal

- `mcp/openapi/bd-api.json` — 10 inline operation parameters converted
- `scripts/schema-drift-check.js` — CHECK 7.5 added (~50 lines)
- `bd-cursor-config/brilliant-directories-mcp-hosted/src/index.ts` — cache-bust comment marker (`// CACHE_BUST: <timestamp>`) at end of file from forcing a fresh isolate during debugging; harmless trailing comment, no behavior change

## [6.40.48] - 2026-04-25

### Fixed — 11 slug-format gaps from Claude's URL stress test

Claude ran a focused stress test on the slug validator (round 4) and found 11 character/structural gaps the deny-list missed. All addressed.

#### Character reject set extended

Added to the reject set: `:` `'` `@` `;` `|` `[` `]` `{` `}` `=` `(` `)`

The big ones:
- **`:` enables `javascript:alert(1)` phishing-link shapes** stored as filename — wouldn't auto-execute as a route but is dangerous if rendered in admin autocomplete or any unescaped `<a href>` context.
- **`'` (apostrophe) was an asymmetric gap** vs `"` (double quote was rejected, single was not). Enabled SQLi-shape filenames like `'OR'1'='1`.
- **`@` `;` `|` `[]` `{}` `=` `()`** are RFC 3986 reserved or shell-metachar-adjacent. None appear in legitimate BD URL slugs in practice.

`@` is rejected even though it appears in Instagram/social URLs — those go in **separate** `instagram`/`twitter`/`facebook` member fields with their own validation, never in BD's `filename` slug fields. `+` deliberately remains allowed (legitimate use cases).

#### Structural rules added

Three per-segment rules (applied to whole slug for non-slash, to each segment for nested paths):
- Cannot start with `-` (anti-pattern; many CMS validators reject)
- Cannot start with `.` (dotfile shape; could shadow Apache `.htaccess`)
- Must contain at least one alphanumeric or unicode letter (rejects pure-punctuation slugs like `---`, `...`, single `-`, single `.`)

The unicode-letter check uses `\p{L}` and `\p{Extended_Pictographic}` so CJK (`中文`), accented (`café`), and emoji (`🎯`) slugs continue to pass.

### Verified — 44 stress-test cases all behave correctly

- 11 valid slugs (CJK, emoji, accented, plus, hyphens-inside, dots-inside, nested paths) → all PASS
- 13 character-reject cases → all REJECT
- 8 structural-rule cases → all REJECT (including nested with bad segment)
- 5 path-structure cases (leading/trailing/double slash, dot-segments) → all REJECT (regression check)
- 7 other regression checks → all consistent with prior behavior

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `_validateSlugFormat` extended by ~25 lines: extended reject regex, added `checkSegment` helper, applied per-segment for both single-segment and nested-path branches.

## [6.40.47] - 2026-04-25

### Fixed — three findings from background-agent stress test against v6.40.46

#### listUserMeta property-style filter silently dropped (HIGH — cross-table noise)

When agents passed a mixed filter (one identity field as first-class arg, one via `property`/`property_value`), the safety guard counted both and let the call through (correctly), but the **translation step** only consumed the first-class params. The property-style pair was forwarded as a plain `?property=database&property_value=list_seo` query, which BD's `users_meta/get` silently ignores. Result: only one filter actually applied, returning cross-table noise (e.g. `database=users_reviews` rows when the agent asked for `database=list_seo`).

Fix: translation now also consumes property-style filters when `property` targets one of the identity fields. Both forms now combine correctly into BD's array-syntax `property[]` filters.

#### include_* boolean fields rejected when passed as `1` (Zod strict typing)

OpenAPI schema declared 36 `include_*` flags as `type: boolean`. Agents naturally pass `=1` (matching BD's own `?key=1` URL convention plus the `=1` examples used throughout our docs), but the SDK's Zod validator rejected `1` with `"Expected boolean, received number"`. BD itself accepts both `=1` and `=true` server-side; the wrapper consumes via `!!flag` truthy check; only the schema layer cared.

Fix: changed all `include_*` fields from `type: boolean` to `type: integer, enum: [0, 1]`. Agents can pass `0` or `1`, matching BD's actual API convention. 36 fields updated (19 inline schemas + 17 top-level component params).

#### Slug probe-failure warning duplicated table names (LOW — cosmetic)

Auto-suffix loop on category creates calls `isCollision` once per attempt. If a probe failed on attempt 1 and again on attempt 2, the table name was pushed to `probeFailures` twice, producing warnings like `"... transient BD error on list_seo, list_seo, list_seo"`.

Fix: dedupe via `[...new Set(probeFailures)]` at every join site (3 spots).

### Investigated, no code change

- **CJK char `中` falsely rejected** (agent #4 finding): root cause was Windows console mangling `中` to `?` before curl sent the request. Worker correctly rejected the literal `?`. Verified via UTF-8 file payload that `中` filenames work correctly. No bug.
- **createMemberSubCategoryLink second-call FK fail** (agent #2 finding): could not reproduce. Identical args ran twice in immediate succession against the live Worker — both correctly returned `DUPLICATE GUARD` with the right rel_id. Likely a rate-limit transient on the agent's first probe burst.
- **Claude's "MCP hung 4 min" report** (round 2 retest): Worker verified healthy in <600ms on all reported endpoints. Cross-table guard fires correctly. Claude's session was stale, not the server.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. listUserMeta translator extended by ~14 lines, probeFailures dedup applied at 3 sites.
- `mcp/openapi/bd-api.json` — 36 include_* fields converted from `boolean` to `integer enum: [0, 1]`.

## [6.40.46] - 2026-04-25

### Fixed — two regressions from v6.40.40 / v6.40.44 found by Claude retest

#### `updateUserMeta` cross-table verify silently passing through (HIGH — replaces 4-min hang with silent corruption)

`verifyUserMetaCrossTable` was reading `body.message` directly, but BD returns `message` as a one-element array on get-by-id. So `row.database` was always `undefined`, `realDb` was `null`, and the mismatch check `(realDb !== null && ...)` always evaluated to false. The verify silently passed through and BD then accepted whatever `(database, database_id)` the agent sent — overwriting the row's identity fields. Fort Worth's `hero_alignment` row was misattributed to `(users_data, 99999)` in Claude's retest until manually restored.

Fix: unwrap the array before reading fields. `Array.isArray(msg) ? msg[0] : msg`.

#### `createMemberSubCategoryLink` FK guard rejecting all valid users (CRITICAL — endpoint was unusable)

Two compounding bugs:

1. **Wrong endpoint path** — code called `/api/v2/users_data/get/<id>` but BD's public API exposes the `users_data` table via `/api/v2/user/get/<id>` (singular `user`). The wrong path returned no data, so `userOk` was always false → "user_id does not exist" for every valid ID.
2. **Same array-unwrap bug** — `userBody.message` is an array, so even with the correct path, the success check looked at the array (always truthy if non-empty) instead of the row, and the actual row's `user_id` was never inspected.

Fix: switch path to `/api/v2/user/get/<id>`, unwrap the array, and check `row.user_id` truthiness for the existence test (same pattern for `service` via `list_services/get/<id>`).

The duplicate-pair guard misclassification Claude flagged was a downstream symptom of #1 — once the FK guard fired falsely, the duplicate-pair check never ran. Fixing the FK path also fixes the duplicate-pair branch.

### Verified live

- `curl /api/v2/user/get/1` returns valid Sample Member 1 row with `user_id: "1"` confirming the path.
- Cross-table verify and FK guard now correctly identify mismatches and report the actual failing field.

### Internal

- `mcp/index.js` and `src/index.ts` mirrored. ~10 lines net change across both fixes.

## [6.40.45] - 2026-04-25

### Changed — `--prefer-online` added to all npx config snippets

A real customer-impact bug surfaced today: when we publish a new version, customers' local npm metadata cache stays stale until it expires (5 min default, longer in practice on Windows). During that window, `npx -y brilliant-directories-mcp@latest` fails with `ETARGET No matching version found for brilliant-directories-mcp@<version>` because npm's cached registry index doesn't yet know about the new version. The customer's MCP client then disconnects with no useful error.

Fix: `--prefer-online` flag added to every `npx` invocation in setup snippets (READMEs + `.mcp.json` template + `SKILL.md`). The flag forces npm to revalidate against the registry on every launch instead of serving stale cached metadata. ~200ms startup overhead, zero ETARGET failures.

`ETARGET No matching version found` added as a Common Issues entry in the Troubleshooting section pointing at `npm cache clean --force` for customers on older config snippets.

No code changes. Customers on existing `.mcp.json` configs without `--prefer-online` continue to work; the next time their local npm cache refreshes (or they update their config to match the new snippets), they get the fix.

## [6.40.44] - 2026-04-25

### Final batch from external audit Phases 3-7

#### FK + duplicate-pair guard on createMemberSubCategoryLink (HIGH)

BD silently created orphan `rel_services` rows pointing at nonexistent `user_id` or `service_id`, AND allowed duplicate `(user_id, service_id)` pairs which double-count members in any "show this user's services" query. Pre-checks now run in parallel: `getUser`, `getSubCategory`, and `listMemberSubCategoryLinks` filtered to the user — single round-trip of latency. Reject upfront with specific errors.

#### Filter-value SQL-injection-shape guard (HIGH)

BD's filter parser silently DROPS `property_value` matching SQL-injection patterns and returns the FULL unfiltered table — same data-leak class as path-param `id=-1`. Verified live: `' OR 1=1--` returned all 26 rows on a 1-row-expected query. Guard rejects only the canonical SQL-injection patterns (`OR 1=1`, `; DROP`, `UNION SELECT`, `-- ` followed by content, `/* */` comments). Plain apostrophes (`O'Brien`, `Bob's Burgers`) pass — those are legitimate filter values, and BD's silent-drop on them produces a visible empty-result failure path the agent can recover from.

#### 0/1 boolean-int field validator

47 BD fields declare `enum: [0, 1]` in the schema but BD accepts arbitrary integers verbatim (verified live: `specialty=42` stored as-is). Front-end logic that branches on `=== 1` then silently treats 42 as truthy, and analytics counting `= 1` rows miss it. List auto-derived from spec; manually filtered against user-confirmed semantics:
- Excluded `active` (multi-value 1-6 on users)
- Excluded `status` on createMultiImagePostPhoto (now wrapper-managed, always `1`)
- Excluded `content_layout` (empty OR `1` only — spec enum tightened to `[1]`)
- Excluded `post_status` / `group_status` (BD admin UI exposes a third value `3`=Pending Approval — spec enums updated to `[0, 1, 3]`)

#### Path-traversal slug guard

`_validateSlugFormat` now rejects `.` and `..` path segments anywhere in slugs across all slug-bearing tools. BD URLs don't legitimately use dot-segments; allowing them is a security footgun (`../../etc/passwd` was previously stored verbatim).

#### Auto-force `status=1` on createMultiImagePostPhoto

BD's `users_portfolio` table only ever uses `status=1` for album/gallery photos. Wrapper now forces `status=1` unconditionally and the field is removed from the input schema — same pattern as `content_active=1` on createWebPage.

#### Spec corrections

- `post_status`, `group_status` enums: `[0, 1]` → `[0, 1, 3]` with description noting `3` = Pending Approval (rare, set when site admin requires manual moderation).
- `content_layout` enum: `[0, 1]` → `[1]` only. BD treats absent/empty as default; `0` was never a real value.
- `signature` (createEmailTemplate): added description noting `0` is the default and `1` should only be set when user explicitly asks to include the site signature.
- `status` field removed from createMultiImagePostPhoto input schema.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. New helpers: `validateFilterValuesInArgs`, `validateBooleanIntInArgs`. `_validateSlugFormat` extended with dot-segment rejection. `BOOLEAN_INT_FIELDS` covers 47 fields across the BD surface; future fields auto-detect via the spec walker.

## [6.40.43] - 2026-04-25

### Added — 4 missing membership-plan price fields to money validator

Membership plans have 6 billing-period prices, not 2. v6.40.42 only covered `monthly_amount` and `yearly_amount`. Added the missing four:

- `quarterly_amount` — billed every 3 months
- `semiyearly_amount` — billed every 6 months
- `biennially_amount` — billed every 2 years
- `triennially_amount` — billed every 3 years

Same validation rules apply: finite number, `>= 0`, max 2 decimals. Now covers the full plan-billing surface area an admin can configure.

### Internal

- `mcp/index.js` and `src/index.ts` — `MONEY_FIELDS` extended to 8 entries.

## [6.40.42] - 2026-04-25

### Added — user profile filename in slug uniqueness guard + universal money validator

#### Member profile `filename` joined the site URL namespace

Member profile pages live at site-wide URLs (`/state/city/category/member-slug`). The `filename` field on createUser/updateUser was previously unguarded — agents who passed it (or BD itself when auto-generating) could collide with web pages, categories, plans, or other members. Two changes:

- `users_data` added to `SITE_NAMESPACE_TABLES` so probes from web page / category / plan creates also catch member-profile collisions.
- `createUser` and `updateUser` added to `SLUG_TOOL_CONFIG` with `allowSlash:true` (path-style slugs supported), `allowEmpty:true` (BD auto-generates if absent — agents rarely pass it).

Self-exclusion on update works the same way as web pages: a user renaming to their own current filename doesn't conflict with themselves.

#### Universal money/price validator

Replaces the inline `lead_price >= 0` check from v6.40.41 with a class-level validator covering 4 known money fields: `lead_price`, `monthly_amount`, `yearly_amount`, `initial_amount`. Future BD price fields just get appended to the `MONEY_FIELDS` set.

Rules:
- Must be a finite number (rejects strings like `"abc"` and objects).
- Must be `>= 0` (BD billing engine has undefined behavior on negatives).
- Must have at most 2 decimal places. BD stores prices as cents — extra decimals get silently truncated, breaking downstream rounding (e.g. `50.999` would round inconsistently across BD's billing pipeline).

31 money cases + 14 user-slug cases verified (45/45 passing).

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `validateMoneyInArgs` + `MONEY_FIELDS` added near `validateDatetime14InArgs`. SLUG_TOOL_CONFIG and SITE_NAMESPACE_TABLES extended.

## [6.40.41] - 2026-04-25

### Fixed — three more findings from external audit Phase 3

#### Datetime field truncation (HIGH — silent data corruption)

BD's datetime columns (`date_updated`, `signup_date`, `last_login`, etc.) are 14-char varchars expecting `YYYYMMDDHHmmss`. BD does NOT validate format server-side — it silently truncates anything longer to fit the column. An agent passing ISO `"2026-04-25 10:00:00"` got `"2026-04-25 10:"` stored, breaking admin-UI sort and cache invalidation. The agent receives `status:success` and has no signal anything went wrong.

Fix: `validateDatetime14InArgs` runs against any of 9 known datetime fields (`date_updated`, `date_added`, `date_created`, `date`, `signup_date`, `last_login`, `post_live_date`, `post_start_date`, `post_expire_date`). Format must match `^\d{14}$`; anything else is rejected upfront with the bad value echoed. 20 edge cases verified.

#### Empty-filter result normalized class-wide (MEDIUM)

The "list_seo not found" → empty array fix from earlier only covered `getWebPage` / `listWebPages`. BD returns the same misleading `status:error, message:"<table> not found"` for empty filter results on every list endpoint and every single-record miss across the catalog. Agents misread it as a system-level table-missing failure and abort retries.

Fix generalized: any list*/search* tool returning `<anything> not found` is normalized to `status:success, message:[], total:0`. Any get* tool returning the same is rephrased to `No <table> record with <pk>=N` so it's clear the record is missing, not the table.

#### Negative lead_price (MEDIUM)

`updateTopCategory` / `updateSubCategory` / `createMembershipPlan` etc. accepted negative `lead_price` values silently. BD's billing engine wasn't designed for negative prices; behavior is undefined. Now rejected upfront with `lead_price must be >= 0`.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `validateDatetime14InArgs` + `lead_price` check wired into the dispatch path between path-param ID validation and content_active auto-force. Empty-filter handler generalized via `name.startsWith("list"|"search"|"get")`.

## [6.40.40] - 2026-04-25

### Fixed — cross-table users_meta hang + doc drift sweep from external audit

External Claude audit produced ~14 findings. Triage:
- 4 already covered by v6.40.34-v6.40.39 (slug uniqueness on web pages, top categories, sub categories, plans + cross-resource namespace check) — no action.
- 1 server-side BD bug parked in KNOWN-SERVER-BUGS.md (`revision_timestamp` stale on EAV writes).
- 1 high-impact wrapper bug fixed (cross-table identity hang).
- 7 doc-drift issues addressed surgically.

#### updateUserMeta / deleteUserMeta cross-table identity verification (HIGH)

Before this release: the wrapper required the agent to PASS `(database, database_id)` alongside `meta_id`, but didn't verify the pair MATCHED the row. When agents passed a wrong pair (stale data, copy-paste error), BD's response on the multi-condition UPDATE/DELETE hung the connection until the 4-minute MCP transport timeout. From the agent's perspective: silent stall, then disconnect. No useful error.

Fix: pre-fetch `users_meta/get/<meta_id>` and compare the row's actual `(database, database_id)` to what the agent passed. On mismatch, reject upfront with a specific error naming both pairs and pointing the agent at `listUserMeta` for the correct lookup. Both files mirrored. Skipped on `createUserMeta` (no `meta_id` yet) and on transient probe failures (let BD handle them).

#### Doc drift fixes (in `mcp/openapi/bd-api.json`)

- **`breadcrumb` field** (createWebPage + updateWebPage): replaced "OMIT — do not set unless user explicitly requests it" with stronger "OMIT — BD auto-generates the breadcrumb trail. Never set this yourself; a manual value overrides BD's generated trail and breaks the page." Per user direction: never set, no exceptions.

- **`seo_type` enum on update**: added explicit "`home` appears in the enum only so existing-record round-trips pass validation; never convert another page TO `home` (only one homepage per site)" — closes the ambiguity Claude flagged.

- **`updateWebPage.filename`**: was a bare "URL slug (e.g. home, about-us)". Now documents the cross-resource rename uniqueness guard the wrapper enforces (across web pages, top categories, sub categories, and plan public URLs).

- **`content_images` phantom field**: removed the dangling reference from updateWebPage prose. The field isn't declared in the schema; the prose mention misled agents into thinking it was a settable parameter.

- **`org_template` and `page_render_widget`**: replaced terse "Template/layout ID" / "Widget ID to render as page content" descriptions with explicit OMIT directives explaining there's no public lookup endpoint and arbitrary values break rendering.

- **`h1_font_size`, `h2_font_size`, `hero_content_font_size` defaults**: removed misleading "Default 30/56/10" claims (BD's effective default varies by `seo_type`). For `hero_content_font_size`, added a UX hint that 10 renders very small.

### Internal

- `mcp/index.js` — `verifyUserMetaCrossTable` logic added inline in the dispatch path (~25 lines).
- `src/index.ts` — same logic mirrored as a standalone async function `verifyUserMetaCrossTable`, called between the existing identity check and the read check.
- `mcp/openapi/bd-api.json` — 8 description-string updates, no schema changes.

## [6.40.39] - 2026-04-25

### Fixed — three more slug-helper holes from stress testing

Stress-tested v6.40.38 with 45 attack vectors. Three real bugs found.

#### 1. Slash-position validation (HIGH — bad URLs slipped through)

v6.40.38 only checked whether a slash was present, not its placement. So `"/parent"` (leading), `"parent/"` (trailing), and `"parent//child"` (empty segment / double slash) all passed for web pages and posts. All produce broken BD URLs. Added structural checks: when slash IS allowed, it cannot be at the start, end, or appear consecutively.

#### 2. Non-string types silently coerced (HIGH — wrong data stored)

`createWebPage filename=["a","b"]` would silently coerce to the string `"a,b"` via `String(proposed)` at the call site, then proceed to probe and create. Same for numbers (`12345` → `"12345"`), booleans (`true` → `"true"`), and objects (`{x:1}` → `"[object Object]"`). All produce wrong data in BD without any warning to the agent.

Fixed at the call site: `typeof proposed !== "string"` now hard-rejects with a clear type error before any coercion happens. The validator's input is still typed as string for clarity.

#### 3. Reconsidered: emoji + 4-byte unicode are deliberately allowed

I initially flagged emoji (`page-🎯`) as a 4-byte UTF-8 char that BD's `utf8` (3-byte) database can't store and rejected them. **Reverted** — BD does support emoji in URLs (verified by user). The validator now allows the full unicode range; only invisible chars and structural characters are blocked.

### Verified — 45 edge cases

Slash placement: `/`, `/parent`, `parent/`, `a//b`, `a///b`, `/blog/post`, `gallery/` all reject with specific error messages. Non-string types: array, number, bool, object all reject. Valid nested paths: `parent/child`, `a/b/c`, `blog-2024/article-1`, `中文/page` all pass. Emoji: `page-🎯-test`, `🚀`, `premium-⭐` all pass. Unicode: CJK, Cyrillic, Arabic all pass.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. ~30 lines net change. Slash structural validation added inside the `slug.includes("/")` branch; non-string check added at call site in `reserveSiteUrlSlug`.

## [6.40.38] - 2026-04-25

### Changed — per-tool slash policy + per-tool empty-string policy

v6.40.37 blocked forward slash in slugs universally. That's wrong: BD legitimately supports nested-path slugs on web pages (`parent/child`) and posts (`posttypeslug/post`), but not on categories or membership plans. v6.40.37 also short-circuited empty strings as no-op, which silently let agents submit empty slugs on resources where the slug is required.

#### What changed

`SLUG_TOOL_CONFIG` gained two per-tool flags:

- **`allowSlash`** — `true` for createWebPage, updateWebPage, updateSingleImagePost, updateMultiImagePost (nested-path slugs supported). `false` for categories and plans (single-segment only).
- **`allowEmpty`** — `true` for createMembershipPlan, updateMembershipPlan only (BD allows plans without a public URL). `false` for everything else (slug is required).

`_validateSlugFormat` now takes `allowSlash` and conditionally allows `/`. Backslash and other URL-reserved chars (`?`, `#`, `&`, `%`, `<`, `>`, `"`) remain universally blocked.

`reserveSiteUrlSlug` now distinguishes:
- `proposed === undefined/null` → no-op (agent didn't pass the field).
- `proposed === ""` → reject if `allowEmpty:false`, no-op if `allowEmpty:true`.
- Non-empty string → format validate with per-tool `allowSlash`, then probe.

#### Verified — 26 edge cases

Web pages and posts: `parent/child`, `deep/nested/path`, `blog-posts/my-post` → all pass. Categories and plans: same slashed inputs → all reject with clear "slash not allowed for this resource" message. Empty string: web pages/categories/posts → all reject "is required and cannot be empty"; plans → pass. Backslash → still rejected universally as URL-reserved.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. Two new fields on `SLUG_TOOL_CONFIG` entries; `_validateSlugFormat` signature gained `allowSlash` parameter; `reserveSiteUrlSlug` updated empty-handling. ~25 lines net change.

## [6.40.37] - 2026-04-25

### Fixed — slug format validator missed zero-width chars and URL-reserved chars

Third audit pass on the slug helper. v6.40.36 only blocked `\s`-class whitespace, but `\s` does NOT cover several invisible-character classes that would silently corrupt URLs, and the validator didn't block URL-reserved chars at all. Tested 29 edge cases; expanded the validator to cover both holes.

#### What was missing

- **Zero-width chars `\s` doesn't catch:** ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D, format-control U+2060–U+2064, BOM U+FEFF, soft-hyphen U+00AD. An agent pasting from a doc that contains any of these would have produced a URL that visually matches existing content but isn't caught as a duplicate.
- **URL-reserved characters:** `/ \ ? # & % < > "`. An agent passing `filename="path/to/page"` would have created a multi-segment URL; `filename="page?x=1"` would have appended a query string. Both break BD routing.

#### Fix

Extended `_validateSlugFormat` with two character-class checks:

1. Whitespace + invisible-character class: `[\s­​-‏⁠-⁤﻿]` covers `\s` (regular whitespace, NBSP, ideographic space, etc.) PLUS the zero-width / format-control / BOM gap.
2. URL-reserved class: `[\/\\?#&%<>"]`.

Both reject upfront with actionable error messages before any network work.

#### Verified — 29 edge cases all behave correctly

Whitespace variants (regular space, leading/trailing, tabs, newlines, NBSP, ideographic space) → all reject. Invisible chars (ZWSP, ZWNJ, ZWJ, BOM, soft-hyphen) → all reject. URL-reserved (`/`, `\`, `?`, `#`, `&`, `%`, `<`, `>`, `"`) → all reject. Valid slugs (`hello-world`, `Hello_World`, `page-2024`, `my.page`, `café-menu`) → all pass.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. ~10 lines net change. Test suite at `c:\tmp\slug-test.js` covers all 29 cases (not committed; one-shot audit harness).

## [6.40.36] - 2026-04-25

### Fixed — two more blind spots in slug-uniqueness helper, found in second audit pass

After v6.40.35 a second critical-audit pass on the slug helper turned up two more real bugs:

#### 1. Case-sensitive client-side filter could miss collisions (HIGH — silent allow)

BD's URL router is **case-INSENSITIVE** (verified live: `/personal-trainer`, `/Personal-Trainer`, `/PERSONAL-TRAINER` all serve the same page). BD's filter operator is also case-insensitive on the server side. But our defensive client-side filter used strict `String(r[field]) === String(slug)` — meaning if an agent proposed `Personal-Trainer` and BD's case-insensitive filter returned the existing `personal-trainer` row, our strict-equal check would reject the match and falsely report "no collision". Result: silent allow of a duplicate URL with different casing.

Fix: added `_normalizeSlug(s) = String(s).trim().toLowerCase()` mirroring BD router behavior, and updated `_slugProbeTable` to compare via `_normalizeSlug(r[field]) === target`. The probe stays defensive (catches BD's silent-drop-on-unknown-property bug) but now correctly handles case variants.

#### 2. Whitespace in slugs accepted, breaking URLs (MEDIUM — corrupt data)

BD does NOT auto-slugify on create — it stores the filename verbatim. An agent passing `filename="my page"` would get a literal space stored, producing a broken URL. The helper would do a probe and might allow it through (if no other row had that exact value).

Fix: added `_validateSlugFormat(slug, fieldLabel)` that rejects any whitespace upfront before any network work, with a clear actionable error: `filename 'my page' contains whitespace, which is not allowed in BD URLs. Use hyphens instead (e.g. 'my-page' not 'my page').` Wired into `reserveSiteUrlSlug` as the first check.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. `_normalizeSlug` and `_validateSlugFormat` added; `_slugProbeTable` updated to use normalized comparison; `reserveSiteUrlSlug` calls format validator first. ~15 lines net.

## [6.40.35] - 2026-04-25

### Fixed — three blind spots in v6.40.34 slug-uniqueness helper, found in self-audit

Right after shipping v6.40.34 I did a critical-audit pass on the new helper. Three real issues:

#### 1. Buggy `update*` literal in create-error suggestion (HIGH — agent-facing)

The error message had a leftover bug from refactoring: `use update${cfg.label ? "" : ""}* on the existing record` — `cfg.label` doesn't exist as a property, so the result was always literal `update*` (with a star). Agents reading the rejection saw a non-existent tool name and had to figure out the real one (`updateWebPage`, `updateTopCategory`, etc.) themselves.

Fix: derive the corresponding update-tool name from the create-tool name (`createWebPage` → `updateWebPage`, `createTopCategory` → `updateTopCategory`, etc.) and include the conflict's `idField=id` so the suggestion is directly actionable: `use updateWebPage on the existing record (seo_id=4)`.

Smoke-tested: `createWebPage filename=about` (existing seo_id=4) now returns `Pick a different filename, or use updateWebPage on the existing record (seo_id=4).`

#### 2. Probe limit too low for site-wide scan (MEDIUM — silent miss)

Probe `limit=5` per table. With BD allowing duplicate slugs historically (no server-side uniqueness), a table could legitimately have 6+ rows with the same slug. If the agent's `ownId` happened to match all 5 returned rows on update, we'd miss the real conflict on row 6+. Statistically rare but real. Bumped to `limit=25` (BD's recommended page size) which exhausts realistic patterns.

#### 3. Probe failures silently treated as "no collision" (MEDIUM — silent allow on flake)

If the BD probe call itself fails (transient network/timeout), the helper would silently treat the table as "no rows match" and let the write through. Deliberate trade-off (don't block legitimate writes on a flake) — but the agent had no signal we couldn't fully verify.

Fix: track probe failures, and if any occurred AND the write was allowed through, attach `_slug_probe_warning` to the response naming which tables failed and recommending post-write verification. Same pattern as `_throttled` and `_thin_content_warning`.

If a probe failure occurs AND we DID detect a collision (other tables responded), the rejection message includes the same probe-failure note inline so the agent gets full context.

### Internal

- `mcp/index.js` and `src/index.ts` — both files mirrored. ~30 lines added across the helper and dispatch path. Smoke-tested live: error message shows `updateWebPage` not `update*`; auto-suffix loop correctly probes own table when colliding with own resource.

### Known limitations (NOT fixed in this release — deliberately)

- Race condition between probe and create. Another caller can grab the slug between our probe and BD's create. Not solvable without server-side locking. BD already auto-suffixes natively for some resources; for the cross-table reject case, the worst outcome is an agent sees a successful probe but BD rejects the write — surfaced via BD's own response.
- Auto-suffix loop is sequential. With `-1` through `-19` taken, we make up to 76 sequential subrequests. Pathological case; not optimizing without evidence of real-world impact.

## [6.40.34] - 2026-04-25

### Added — universal slug uniqueness guard (DRY helper, 10 call sites)

BD's public router uses ONE site-wide URL namespace shared by web pages, top categories, sub categories, and plan public URLs. Plan checkout URLs and post slugs have their own scoped pools. BD does NOT enforce uniqueness in any of these pools server-side; agents have historically had to do advisory pre-checks themselves (which they often forget). v6.40.22/24 fixed it for web pages only — leaving 8 other slug-bearing ops unguarded.

Replaced the webpage-specific guard with a universal helper `reserveSiteUrlSlug(toolName, args)`:
- Static config table (`SLUG_TOOL_CONFIG`) maps each of 10 ops to its scope, slug field, ownership info, and policy. No pattern-matching surprises.
- Three scopes: `site` (4 tables probed in parallel — list_seo, list_professions, list_services, subscription_types), `post-type` (single table, filtered by data_id), and the implicit plan-checkout case (handled via separate field `custom_checkout_url` — deferred for now since it's EAV-routed).
- Two policies: `autoSuffix:true` for categories (auto -1, -2, ... up to 20), `autoSuffix:false` for everything else (hard reject with proposal).
- Self-exclusion on update ops: a row's existing slug doesn't conflict with itself when renamed to itself.
- `_slug_adjusted` warning attached to response when category auto-suffix lands at -4 or higher (silent on -1, -2, -3 — match BD admin UX). Surfaces unusual cases (4+ resources fighting for the same name) without spamming the bulk-import path.

Coverage:
- `createWebPage` / `updateWebPage` (filename, site-wide, reject)
- `createTopCategory` / `updateTopCategory` (filename, site-wide, auto-suffix)
- `createSubCategory` / `updateSubCategory` (filename, site-wide, auto-suffix)
- `createMembershipPlan` / `updateMembershipPlan` (subscription_filename, site-wide, reject)
- `updateSingleImagePost` (post_filename, per-post-type, reject)
- `updateMultiImagePost` (group_filename, per-post-type, reject)

Smoke-tested live: web page collision against existing top category `personal-trainer` rejected with cross-table error; top category collision against existing web page `about` (seo_id=4) auto-suffixed silently to `about-1`; unique slug created normally. No false positives.

### Internal

- `mcp/index.js` and `src/index.ts` — `reserveSiteUrlSlug` helper added (~120 lines). Replaces the v6.40.22/24 webpage-only guard at the dispatch path. Both files mirrored byte-for-byte. Ported pattern from `validateHeroEnumsInArgs` (static config table + per-resource policy).

### Deferred (not yet wrapper-managed)

- Plan `custom_checkout_url` uniqueness (separate plans-only pool). The field is EAV-routed via the existing `splitEavParams` machinery; the slug pre-check would need to probe `users_meta` with database=subscription_types, key=custom_checkout_url. Spec already documents this as agent-advisory. Pick up when revisiting the deferred system-timestamp project.

## [6.40.33] - 2026-04-25

### Changed — tighten the missing-tool corpus paragraph

v6.40.32 added a 6-line paragraph explaining how an agent should respond when a tool isn't loaded. Two issues caught immediately:

1. I said the user must "restart your AI client" after enabling new endpoints — wrong. BD's API key permission changes take effect immediately; no client restart needed.
2. The paragraph was too long for what it conveys.

Trimmed from ~120 words to ~45. Load-bearing info preserved: example tool names so the agent recognizes the symptom, the BD-side diagnosis (key permission scope), the fix path (Developer Hub → key → Permissions → enable), no-restart note, and the don't-work-around guard. Removed the ~25 endpoints / Easy vs Advanced Endpoints framing — agent doesn't need the architecture lesson, just the fix.

### Internal

- `mcp/openapi/mcp-instructions.md` — single-paragraph rewrite. ~75 words removed.

## [6.40.32] - 2026-04-25

### Changed — corpus now explains the "missing tool" symptom (closes Bug #8 framing)

Stress-test Bug #8 was originally framed as "Posts/PostTypes tools not exposed in this session." Investigation showed it isn't a session-cache issue or a server bug — it's BD's API key permission scoping. BD ships keys with ~25 "Easy" endpoints enabled by default; everything else (Forms, Menus, Widgets, Posts, Post Types, Tags, Membership Plans, etc.) lives behind an "Advanced Endpoints" toggle in BD Admin → Developer Hub → API Permissions. If a customer hasn't toggled those on, the agent's loaded tool set is genuinely missing those tools — not a bug, configuration.

Added one paragraph to `mcp-instructions.md` (right after the "never fabricate tool calls" line) explaining the symptom and the fix-path the agent should tell the user. Targeted at the agent: when you expect `listSingleImagePosts` or `createForm` and don't see it loaded, that's the user's API key permission scope, tell them where to enable it.

Note: `README.md` and `SKILL.md` already documented this for the human/setup audience; this is the corpus-level twin so the AGENT can self-diagnose mid-conversation instead of stalling.

### Internal

- `mcp/openapi/mcp-instructions.md` — single paragraph added at the top of the corpus, above the destructive-actions rules. ~6 lines.

## [6.40.31] - 2026-04-25

### Reverted — `date_updated` auto-defaulting (v6.40.30 was UTC-only, wrong)

v6.40.30 added an auto-defaulter for `date_updated` on `createWebPage` / `updateWebPage` that used UTC. That's wrong for any site outside UTC — BD's admin-UI "Last Update" display would show times shifted from local. The correct implementation needs to resolve the site's timezone via `getSiteInfo.timezone` (returns IANA strings like `America/Los_Angeles`) and format the timestamp in that zone.

Reverted the UTC defaulter. Agents pass `date_updated` themselves again (matches behavior pre-v6.40.30; corpus already documents it as required). `content_active=1` auto-force from v6.40.30 stays — that one had no timezone dimension.

### Deferred — full system-timestamp wrapper-management project

Triaging the right scope for "auto-default every system-internal timestamp across every BD resource" turned up ~25 resource families that need individual probing (which datetime field is system-internal vs business-meaning). Doing it off the cuff during stress-test triage would risk mis-categorizing fields and silently corrupting timestamps.

Parked as a dedicated project in `KNOWN-SERVER-BUGS.md` under "TODO — Wrapper-managed system timestamps". The plan there names the pattern, the resource families to probe, the per-family work, and the smoke-test discipline. Pick up cleanly when stress-testing closes.

### Internal

- `mcp/index.js` and `src/index.ts` — `date_updated` defaulter block removed; comment block added pointing at the deferred project. `content_active=1` auto-force preserved.
- `KNOWN-SERVER-BUGS.md` — new "TODO — Wrapper-managed system timestamps" section at the bottom with the deferred plan.

## [6.40.30] - 2026-04-25

### Changed — `content_active` is now wrapper-managed; removed from agent surface

User pointed out: `content_active=1` is mandatory on every BD page create/update and there is no other valid value. Exposing it as an agent-tunable input was pure noise — the agent had to remember to pass it (some forgot, producing broken records), and the only "tuning" was a value that's already a constant.

**Now wrapper-managed:**
- `content_active` field declaration removed from `createWebPage` and `updateWebPage` input schemas (no longer visible to agents)
- Wrapper unconditionally overwrites `args.content_active = 1` on every create/update before forwarding to BD — even if an agent or old client passes a different value, we coerce to 1 so the write always lands
- All agent-facing prose mentions of `content_active=1` as a "required default" stripped from spec descriptions and `mcp-instructions.md`
- The lean-by-default field-list in `listWebPages` description still mentions `content_active` because it IS in the read response — that's accurate and load-bearing for agents reading existing pages

**Behavior is strictly improved or equivalent for all customer paths:**
- Customers passing `content_active=1` → wrapper overwrites with same value, no behavior change
- Customers passing `content_active=0` (the impossible value the old spec falsely advertised) → wrapper corrects to 1, write succeeds (was previously rejected by BD or stored garbage)
- Customers omitting it → wrapper adds 1, write succeeds (was previously inconsistent — some BD versions defaulted, others didn't)

Smoke-tested live: `createWebPage` with no `content_active` arg → seo_id=38 created, GET returned `content_active='1'`. Confirms auto-injection works end-to-end.

### Internal

- `mcp/openapi/bd-api.json` — removed `content_active` field from createWebPage + updateWebPage input schemas; stripped 4 agent-facing prose mentions of `content_active=1` as a required default; updated 2 mentions of `arbitrary slugs return HTTP 404 even with content_active=1` → `even when the page record is created successfully` (more accurate framing).
- `mcp/openapi/mcp-instructions.md` — removed the `content_active=1` line from the profile_search_results required-defaults list (line 510).
- `mcp/index.js` and `src/index.ts` — added unconditional `args.content_active = 1` overwrite at the top of the createWebPage/updateWebPage dispatch path. Comments explicitly call out the unconditional-overwrite intent so future maintainers don't accidentally change to `??=` or "only-if-unset" patterns.

## [6.40.29] - 2026-04-25

### Fixed — `content_active=0` doesn't exist in BD; multiple stale references removed

User flagged that `content_active=0` is not a real value — only `content_active=1` exists. The wrapper and spec had been suggesting `content_active=0` as a "hide page" alternative in three places, all wrong:

- `_thin_content_warning` runtime message: said "pass `content_active=0` to keep it hidden until populated"
- `createWebPage` description: same suggestion in prose
- `updateWebPage` description: listed "Visibility: `content_active` (1=live, 0=hidden)" under common edits
- `deleteWebPage` description: suggested "use `updateWebPage` with `content_active=0` for hide-without-delete"
- `content_active` field declaration itself: declared `enum: [0, 1]` with description "1 = active, 0 = hidden"

Replaced all five with correct guidance:
- Thin-content warning: `Fix: updateWebPage to add at least one of those fields now, or deleteWebPage if the create was premature.`
- `content_active` field: `enum: [1]`, description "Always `1` (page is live). BD does not support hiding a page via this flag — to remove a page use `deleteWebPage`."
- `deleteWebPage`: dropped the "hide without delete" suggestion entirely.
- `updateWebPage`: removed the visibility line from common edits.

### Fixed — path-param ID validator now calls out decimals explicitly

Validator already rejects decimals via `Number.isInteger()`, but the agent-facing error message only said "must be a positive integer" which agents could misread. Tightened to: "must be a positive whole integer (>=1, no decimals). Got: X. Negative IDs, 0, and decimals all trigger BD's table-dump bug — wrapper rejects to prevent data leak."

### Changed — thin-content warning prose tightened

Old (32 words): "createWebPage created a page with no title, h1, meta_desc, or content. content_active defaults to 1 — the page is publicly live and Google may index it as thin content. Provide at least one of those fields, or pass content_active=0 to keep it hidden until populated."

New (28 words, with correct Fix path): "Page created with no title, h1, meta_desc, or content — and is publicly live. Risk: Google indexes a blank page. Fix: updateWebPage to add at least one of those fields now, or deleteWebPage if the create was premature."

### Internal

- `mcp/index.js` and `src/index.ts` — three runtime messages updated, both files mirrored.
- `mcp/openapi/bd-api.json` — five spec touchpoints fixed (createWebPage / updateWebPage / deleteWebPage descriptions + `content_active` field declaration on both create + update).

## [6.40.28] - 2026-04-25

### Fixed — `eav_results` now reports `action: "no_change"` for empty-string updates that BD silently no-ops

Claude's third Test 6 retest found a remaining false-success: passing `hero_link_size=""` (a legitimate enum value meaning "Normal" size) returned `eav_results.action: "updated"` but the stored value didn't change. Live curl probe confirmed this is BD's behavior, not ours — BD's `users_meta/update` endpoint silently ignores empty-string `value` params, treating them as "no change to value." Our wrapper was reporting BD's HTTP 200 as `updated` regardless.

Fix: in `writeEavFields`, after looking up the existing meta row, capture its current `value`. If the agent's target value is empty AND the existing value is non-empty, BD will silently no-op the update. Detect this BEFORE the write and report honestly:

```json
"eav_results": [
  {
    "key": "hero_link_size",
    "action": "no_change",
    "status": "success",
    "message": "BD silently no-ops empty-string updates on users_meta — existing value \"btn-lg\" preserved. To reset to default, use deleteUserMeta on this meta_id.",
    "meta_id": "37411"
  }
]
```

The "to reset to default" hint gives the agent a clear next step: `deleteUserMeta(meta_id)` removes the row entirely, BD falls back to its built-in default (which IS empty for these fields). Considered auto-deleting on empty-string write, but that changes DB shape (row absent vs. row with empty value) which may have side effects elsewhere — `no_change` + agent-explicit `deleteUserMeta` is safer and more honest.

When the EAV row doesn't exist yet (`!metaId`), empty-string still works — `createUserMeta` writes the empty value successfully (BD's create endpoint accepts empty, only the update endpoint silently ignores it). No special handling needed in the create branch.

### Internal

- `mcp/index.js` and `src/index.ts` — `writeEavFields` now captures `existingValue` from the lookup and adds the no-op detection branch before the update fetch. Both files mirrored byte-for-byte. Smoke-tested live: `hero_link_size=""` against an existing `btn-xl` value reports `action: "no_change"` with the explanation message; setting `hero_link_size="btn-lg"` still reports `action: "updated"` correctly.

## [6.40.27] - 2026-04-25

### Fixed — empty-string false-success on hero enum fields

Claude's stress retest of v6.40.26 found one remaining false-success edge case: passing `hero_alignment=""` (or any non-link-size hero enum field) returned `status:success` with `eav_results.action:"updated"` but the stored value was unchanged. Same false-success class as the v6.40.26 fix, just with empty string as the bad value.

Root cause: validator had a special-case `if (v === "" && !allowed.includes("")) continue;` that skipped empty-string checks entirely, letting them slip through to the wrapper's EAV write path which BD then no-op'd.

The line was wrong. Removed it. Empty strings are now treated like any other invalid value — rejected with the standard "must be one of: ..." error message — UNLESS the field's enum legitimately includes `""` (e.g. `hero_link_size: ""` means "Normal" size).

Smoke-tested live:
- `hero_alignment=""` → rejected (empty not in `[left, center, right]`)
- `hero_link_size=""` → accepted (empty IS in `["", btn-lg, btn-xl]`, means Normal)
- `h1_font_color=""` → accepted (RGB validator skips empty by design — empty means "no value")

### Internal

- `mcp/index.js` and `src/index.ts` — single line removed from `validateHeroEnumsInArgs`. Both files mirrored byte-for-byte.

### Why not coerce empty → default?

Considered defaulting `hero_alignment=""` → `"left"`. Rejected for the same reason v6.40.26 removed `sanitizeHeroCtaEnumsInArgs`: silent coercion produces false-success (agent thinks they configured something specific, got the default). Reject-don't-coerce is the consistent rule across all hero validators.

## [6.40.26] - 2026-04-25

### Fixed — `hero_link_color`/`hero_link_size` false-success silent-coerce + RGB validator added for free-form color fields

Two related fixes from Claude's stress retest of Bug #6 (v6.40.22). The original v6.40.10/v6.40.22 work added a `sanitizeHeroCtaEnumsInArgs` helper that "helpfully" coerced obvious mistakes (`#ffffff` → `primary`, `"16"` → `btn-lg`) BEFORE the enum validator ran. That created a false-success failure mode worse than the original bug:

- Agent sends `hero_link_color="#ffffff"`
- Sanitizer coerces to `"primary"` silently
- Validator passes (sees `"primary"`, valid)
- Wrapper writes `"primary"` to users_meta
- Response: `status:success`, `eav_results.action:updated`
- Agent thinks they configured white; actually got the site default. No signal.

**Reject-don't-coerce.** Removed `sanitizeHeroCtaEnumsInArgs` entirely. The validator now sees the agent's actual value and rejects it cleanly with the allowed-set message — agent gets a clear actionable error instead of a silent change. Confirmed live: `hero_link_color="#ffffff"` and `hero_link_size="16"` now reject with the same surgical messages as the other 13 enum fields.

### Added — RGB-format validator for free-form color fields

`h1_font_color`, `h2_font_color`, `hero_content_font_color`, `hero_content_overlay_color` are not enums — they accept arbitrary RGB strings. BUT BD's hero templates only render `rgb(R, G, B)` format. Hex (`#ffffff`), named colors (`white`), and rgba (`rgba(0,0,0,0.5)`) all break the CSS interpolation BD uses. Spec descriptions said "RGB format ONLY" but no validator enforced it.

New `validateRgbColorsInArgs` rejects anything that isn't `rgb(R, G, B)` with channels in [0, 255]. Whitespace inside the parens is permitted (`rgb(0,0,0)` and `rgb(0, 0, 0)` both accepted — CSS treats them as equivalent and BD's templates render both correctly). Out-of-range channels (e.g. `rgb(300,0,0)`) caught with a specific channel-error message.

### Internal

- `mcp/index.js` and `src/index.ts` — removed `sanitizeHeroCtaEnumsInArgs` and its call site; removed dangling `HERO_LINK_COLOR_VALUES` and `HERO_LINK_SIZE_VALUES` Sets that no longer had readers. Added `validateRgbColorsInArgs` + `HERO_RGB_FIELDS` Set + `RGB_PATTERN` regex. Both files mirrored byte-for-byte. Smoke-tested 8 cases live: hex/named/rgba reject, both `rgb(0,0,0)` and `rgb(0, 0, 0)` accept, channel >255 rejects with specific message.

## [6.40.25] - 2026-04-25

### Changed — finish EAV doc-drift sweep (v6.40.23 was incomplete)

v6.40.23 updated the corpus instructions and `hero_content_overlay_opacity` field description to reflect EAV auto-routing, but missed three other places that still carried the old "silently drops, manually route" guidance. Claude's stress retest caught the inconsistency:

- `updateWebPage` description still had the big multi-paragraph EAV workflow block ("EAV-stored fields - `updateWebPage` silently drops these 18+ fields on UPDATE...") with the per-field workflow steps
- `updateUserMeta` description still said "Critical BD pattern: updating WebPage fields that `updateWebPage` silently skips"
- `createUserMeta` description still had a parallel "Critical BD pattern: UPDATING WebPage EAV fields that `updateWebPage` doesn't persist" section
- `hero_section_content` field description (both create + update copies) still said "EAV-stored - createWebPage seeds correctly, updateWebPage silently drops. On update, write via updateUserMeta with database=list_seo"

Net effect of the drift: agent reading the spec got contradictory guidance — one field said "pass directly", another said "manually route", and the parent tool description told them to always do the manual route. Some agents would default to the manual path shown most prominently in the parent tool description, generating 2-3 unnecessary `updateUserMeta` calls per update.

All four locations now updated to match the actual auto-routing behavior. Plus a new "if a field doesn't persist after `updateWebPage`, file it as a wrapper bug rather than working around with manual `updateUserMeta`" hint added to the `updateWebPage` description — gives agents the unknown-unknowns recovery path Claude suggested.

### Internal

- `mcp/openapi/bd-api.json` — `updateWebPage` description: replaced ~10-line EAV workflow block with 3-line auto-routing note + wrapper-bug fallback hint. `updateUserMeta` and `createUserMeta` descriptions: replaced "Critical BD pattern" workaround sections with one-line redirects to `createWebPage` / `updateWebPage`. `hero_section_content` field description: rewritten to match `hero_content_overlay_opacity`'s wording.
- No code changes — pure docs sweep.

## [6.40.24] - 2026-04-25

### Changed — duplicate URLs are now never permitted via MCP (no bypass)

v6.40.22 added a duplicate-filename pre-check to `createWebPage` with a `force_duplicate_filename=true` bypass for "rare legitimate cases." Live testing exposed two real problems:

1. **The bypass field was never declared in the input schema**, so passing `force_duplicate_filename=true` was rejected by the SDK before the wrapper could honor it. Documented escape hatch was unreachable — the rejection error message advertised a flag that didn't work.
2. **Duplicate URLs are never legitimate.** BD's router resolves `filename` to one record non-deterministically. Even the "intentional shadow page" / "internal fork" use cases I imagined earlier produce broken state, not useful behavior. There is no scenario where two pages at the same URL render correctly.

Removed the bypass entirely. Tightened the rule: **MCP never permits duplicate URLs.** If a user genuinely needs two records with similar paths, they must pick distinct slugs.

Also extended the guard to `updateWebPage` — Claude flagged the gap: an agent renaming an existing page's `filename` to one already taken would create the same duplicate-URL problem from the update side. The update guard correctly ignores the row's own current filename (you can't conflict with yourself) and only rejects if a DIFFERENT seo_id holds the proposed slug.

### Internal

- `mcp/openapi/bd-api.json` — removed `force_duplicate_filename` field declaration. Updated `filename` field description to call out the uniqueness rule. Updated `createWebPage` description's filename-uniqueness paragraph: removed bypass mention, added "no exceptions" framing.
- `mcp/index.js` and `src/index.ts` — removed bypass logic; extended guard to cover `updateWebPage`. Defensive strip of any deprecated `force_duplicate_filename` flag still in place (backward-compat for old clients). Both files mirrored byte-for-byte. Smoke-tested 4 cases live: create-dup → reject, create-with-deprecated-bypass → reject, update-self-rename → accept, update-rename-to-taken-slug → reject.

## [6.40.23] - 2026-04-25

### Changed — UX polish trifecta from Claude's stress-test report

Three quality-of-life fixes. None are bugs — agents technically work today — but each one closes a quiet failure mode that wastes agent turns or produces silent SEO leakage.

#### 1. Rewrite "list_seo not found" 404 → context-aware message (Bug 2)

BD returns the literal string `"list_seo not found"` for both single-record GET misses AND empty filtered list results. Agents misread it as "the `list_seo` TABLE is missing" (a system-level failure) and abort retries. Wrapper now post-processes:
- `getWebPage` 404 → `"No list_seo record with seo_id=N."` (still error; clear that the record is missing, not the table)
- `listWebPages` empty filter → `status: "success", message: [], total: 0` (success because the query worked correctly, it just found nothing — agents should iterate, not retry)

Verified live: `getWebPage seo_id=99999` and `listWebPages property=seo_type property_value=data_category` both produce the new clear responses.

#### 2. Thin-content soft warning on `createWebPage` (Bug 3)

`createWebPage` with `seo_type=content` and no `title`, `h1`, `meta_desc`, or `content` creates a publicly-live blank page that Google may index as thin content. Don't reject — there are legitimate placeholder/draft flows. Soft warn: response includes `_thin_content_warning` field listing the missing fields. Agent + human user both see it. Suggestion in the message: provide at least one SEO field, or pass `content_active=0` to keep the page hidden until populated.

#### 3. Corpus prose update — EAV is auto-routed (Bug 5)

`mcp/openapi/mcp-instructions.md`: replaced the multi-paragraph "WebPage users_meta field-update workaround (CRITICAL)" stale section with a 5-line accurate description. The MCP wrapper has been auto-routing EAV-stored fields through `users_meta` for some time — agents reading the old prose were writing 2-3 unnecessary defensive `updateUserMeta` calls. New prose: just call `updateWebPage` with whatever fields you want; the response's `eav_results` array confirms which EAV fields were written.

Also updated `createWebPage`'s spec description: removed the stale "EAV path silently drops on UPDATE" workflow paragraph; replaced with a short pointer that EAV fields are auto-routed and the response includes `eav_results`. `hero_content_overlay_opacity` field description tightened the same way.

### Internal

- `mcp/index.js` and `src/index.ts` — added 404 rewrite + thin-content warning. Both files mirrored byte-for-byte. Smoke-tested live.
- `mcp/openapi/mcp-instructions.md` — collapsed 25-line stale EAV section into 5 accurate lines.
- `mcp/openapi/bd-api.json` — `createWebPage` description trimmed of stale EAV workaround paragraph; `hero_content_overlay_opacity` field description tightened (both create + update copies).

## [6.40.22] - 2026-04-25

### Added — extend hero enum validator + duplicate-filename guard + listWebPages throttle

Three preemptive hardening fixes from Claude's stress-test report. All apply to both npm + Worker, both verified locally before publish.

#### 1. Hero enum validator extended from 2 → 15 fields (Bug 6)

v6.40.10 only validated `hero_link_color` and `hero_link_size`. Stress tests confirmed BD persists invalid values verbatim across all hero/h1/h2 enum-typed fields and renders them as broken CSS or layout. Now validates all 15:

| Field | Valid set |
|---|---|
| `hero_link_color` | primary / info / success / warning / danger / default / secondary |
| `hero_link_size` | "" / btn-lg / btn-xl |
| `hero_link_target_blank` | 0 / 1 |
| `hero_alignment` | left / center / right |
| `hero_column_width` | 3..12 (Bootstrap col-md-N) |
| `hero_background_image_size` | mobile-ready / standard |
| `hero_hide_banner_ad` | 0 / 1 |
| `hero_content_overlay_opacity` | 0.0..0.9, 1 |
| `hero_top_padding`, `hero_bottom_padding` | 0..200 step 10 (BD admin dropdown) |
| `h1_font_size` | 30..80 step 1 (BD admin dropdown) |
| `h2_font_size` | 20..60 step 1 |
| `hero_content_font_size` | 10..30 step 1 |
| `h1_font_weight`, `h2_font_weight` | 300 / 400 / 600 / 800 (Google Font weights loaded) |

NOT touched (free-form, customizable): `h1_font_color`, `h2_font_color`, `hero_content_font_color`, `hero_content_overlay_color`, `hero_image`, `hero_link_text`, `hero_link_url`, `hero_section_content`, `hero_link_url`. Hex/rgb colors and custom URLs work as expected.

#### 2. `createWebPage` filename uniqueness pre-check (Bug 4)

BD doesn't enforce unique `filename` on `list_seo` — two creates with the same slug both succeed and the public URL renders one of them non-deterministically (silent destructive). Wrapper now auto-pre-checks `listWebPages property=filename property_value=<slug> property_operator==` before forwarding `createWebPage` to BD. If a row exists, rejects with seo_id of the existing record so the agent can `updateWebPage` instead. Bypass with explicit `force_duplicate_filename=true` for the rare legitimate case (intentional shadow page, internal fork).

#### 3. `listWebPages` heavy-include throttle (Bug 1)

Mirrors v6.40.13's user-tool throttle pattern. `listWebPages` rows can be 14-41KB each with `include_content=true` and/or `include_code=true`. At limit=50+ that's a 1-2MB response that the MCP transport intermittently truncates without a clean error.

Tiered cap:
- ANY `include_*` flag → cap 25
- BOTH `include_content` AND `include_code` → cap 10 (worst case)

Adjustment, not rejection — agent always gets results; `_throttled` warning attached to the response teaches them to paginate or split the read.

### Internal

- `mcp/index.js` and `src/index.ts` — `HERO_ENUM_FIELDS` table generalized to drive the validator (one loop, 15 fields). Padding / font-size ranges generated programmatically. Filename pre-check added inline in tool dispatch. Throttle tier extended. Both files mirrored byte-for-byte. Smoke-tested locally on 4 enum-reject cases + 1 throttle case before publish.

## [6.40.21] - 2026-04-25

### Added — `validatePathParamIds` rejects `id <= 0` on every numeric-PK GET (CRITICAL — data leak fix)

**Bug class — confirmed live:** `getWebPage seo_id=-1` and `seo_id=0` against `/api/v2/list_seo/get/{id}` returned the ENTIRE webpages table (341 KB, all 25 records on a small site). Likely root cause is BD's route handler treating `WHERE id <= 0` as "no filter" and falling through to an unfiltered SELECT. Same pattern almost certainly affects every numeric-PK GET (34 endpoints: `getUser user_id`, `getCity locaiton_id`, `getReview review_id`, etc.).

**Privacy/security impact:** any authenticated caller can dump full tables by passing `-1` or `0` as the path-param ID. Not auth-bypass (auth still required), but any valid key gets table dumps when the operation should return one record.

**Fix shipped:** `validatePathParamIds` in npm + Worker rejects path-param IDs that are not positive integers BEFORE forwarding to BD. Catches:
- Negative IDs (`-1`)
- Zero (`0`)
- Floats (`1.5`)
- Non-numeric strings (`"abc"`)
- `null`, `undefined`, empty string

Structural rule (any path token ending in `_id` or the bare `id`) = automatically covers current AND future endpoints. No per-endpoint allowlist to maintain.

Defense-in-depth: when BD fixes their route handler, our wrapper guard stays. Catches future regressions.

### Internal

- `mcp/index.js` and `src/index.ts` — `validatePathParamIds` helper + wired into the tool-call pipeline right after `validateHeroEnumsInArgs`. Both files mirror byte-for-byte. Smoke-tested locally on 5 cases (-1, 0, 1.5, "abc", 1) — all 4 invalid rejected with clear error, valid case passes through cleanly.
- `KNOWN-SERVER-BUGS.md` — added entry #0 (top of list, CRITICAL severity) so the BD dev team sees this as the highest-priority fix to make server-side. Wrapper guard documented as the workaround.

## [6.40.20] - 2026-04-24

### Changed — break the Advanced bullet's Node prereq onto its own line

The Setup-by-Platform overview bullet for "Advanced config block" mashed the description, the Node prerequisite, AND the use-case into a single 60-word run-on sentence. Boomers skim — the Node install pointer got buried mid-paragraph. Split into two: short description on the bullet line, then a separate indented paragraph for the Node prereq + install steps. Same content, separated visually so the install requirement can't be missed.

### Internal

- `README.md` (+ mirror at `mcp/README.md`) — single bullet split into bullet + indented sub-paragraph. No new content.

## [6.40.19] - 2026-04-24

### Changed — README title + harmonize Node install instructions to match nodejs.org's current UI

Two updates in one release:

1. **Title rebranded.** `Brilliant Directories API — Universal AI Integration` → `Official Brilliant Directories MCP Server — Setup Guide`. The "Universal AI Integration" tagline survives as a one-line subtitle for SEO. The new title front-loads "Official" (trust signal for non-technical users landing via Google search) and is more accurate ("MCP Server" beats "API"; "Setup Guide" beats marketing copy).

2. **Node install instructions match nodejs.org's current UI AND emphasize the install step.** nodejs.org redesigned their homepage — there's no longer a "green LTS button" on the front page; the homepage CTA is now `Get Node.js®`, which leads to a download page where users pick `Windows Installer (.msi)` or `macOS Installer`. Plus a separate boomer-trap surfaced: "download" without "install" leaves users with a `.msi` file in Downloads they never run. Every reference now explicitly walks: download → click installer → DOUBLE-CLICK to run installer. All 11 references to "green LTS button" updated to the new flow. Boomers told to find a button that doesn't exist would bounce; the new wording matches what they actually see and stops at the right end-state.

### Internal

- `README.md` (+ mirror at `mcp/README.md`) — title + tagline rewritten; 11 Node install references harmonized to a single accurate phrasing.

## [6.40.18] - 2026-04-24

### Changed — final sweep: stamp Node.js prereq at every remaining Advanced reference

Continued audit after v6.40.17 found three more Advanced/npx-spawning blocks without the install warning: Claude Code CLI Advanced path, Claude-extension-inside-Cursor Notepad method, and Cursor Directory one-click installer. All three could leave a non-technical user staring at "no MCP servers" with no helpful pointer. All three now stamped.

Final tally: every Advanced or npx-spawning block in the README — 6 locations — has the inline Node.js install pointer.

### Internal

- `README.md` (+ mirror at `mcp/README.md`) — three additional locations updated. No new headings or structural changes.

## [6.40.17] - 2026-04-24

### Changed — repeat the Node.js prerequisite at every Advanced block

v6.40.16 hardened the main Advanced section but left four other Advanced references in the README without the install pointer (the "Setup by Platform" overview bullet, plus the per-platform Claude Desktop / Cursor / Cline blocks). Users skim — they jump to their platform section and miss the prerequisite at the top.

Now every place "Advanced" appears with config code has an inline reminder to install Node from nodejs.org and reboot before pasting. Same one-line warning, four locations. Catches users who land on the README from a search result mid-page or who copy-paste the platform-specific config without reading from the top.

### Internal

- `README.md` (+ mirror at `mcp/README.md`) — single-line reminder added in 4 places (1 overview bullet, 3 platform-specific Advanced blocks).

## [6.40.16] - 2026-04-24

### Changed — Windows setup docs hardened after non-technical user struggled with Advanced path

A non-technical Windows user spent hours stuck between two unrelated failures: hosted config rejected by the Microsoft Store version of Claude Desktop (sandboxed, returns "not valid MCP server configurations"), then local/Advanced config failed because Node.js wasn't actually installed. Both failures looked identical to the user — Claude Desktop just shows "no MCP servers." Three doc gaps surfaced:

1. **Advanced section assumed users would notice the "(requires Node.js install)" parenthetical** and act on it. They don't. Now restructured into explicit STEP 1 (install Node + reboot + verify with `node --version`), STEP 2 (paste config), STEP 3 (fully quit via tray icon, not X).
2. **No Microsoft Store warning** for Claude Desktop on Windows. The MS Store sandbox quietly rejects the Easy/hosted config. Added a one-line warning under Claude Desktop pointing Windows users to the direct .exe at `claude.ai/download`.
3. **Troubleshooting section's `npx: command not found` line didn't cover the Windows-specific `spawn npx ENOENT` error message** users actually see in logs. Added the Windows error text + the reboot step. Also added a new troubleshooting line for the "not valid MCP server configurations" error pointing to the .exe install fix.

### Internal

- `README.md` (+ mirror at `mcp/README.md` for npm tarball) — three additions, all in existing sections, no new top-level structure. Boomer-friendly tone preserved.

## [6.40.15] - 2026-04-24

### Changed — close the `seo_type=content` escape hatch on category SEO pages

Customer reported an agent creating a SEO page for `/strength-training` (a real sub-category URL) as `seo_type=content` instead of `profile_search_results`, missing all the search-results page defaults (form_name, menu_layout, custom_html_placement, hero recipe). Two contributing wording gaps:

1. The routing rule said "route to createWebPage with seo_type=profile_search_results" but didn't say "MUST" or call out `seo_type=content` as the wrong path.
2. A separate caveat falsely implied bare category slugs (no location prefix) didn't render — giving the agent permission to fall back to `seo_type=content`. They DO render on installs that route bare slugs.

**Tightened both lines surgically. No new bullets, no new sections.** Routing rule is now imperative and names the failure mode (`Never seo_type=content`). Slug-validity caveat now correctly states bare category slugs work alongside full hierarchies.

### Internal

- `mcp/openapi/mcp-instructions.md` — two single-line edits at the existing rules. ~30 words delta.

## [6.40.14] - 2026-04-24

### Changed — `_throttled` warning names a third recovery path

Customer-facing warning on auto-throttled `searchUsers` / `listUsers` calls now lists three recovery options instead of two: paginate via `next_page`, drop `include_*` flags for a lean enumeration then `getUser` per-record, or call without `include_*` and re-query specific `user_ids` individually. Agents recover faster from messages that name the next action.

### Internal

- `mcp/index.js` and `src/index.ts` — single-line message change. No behavior change.

## [6.40.13] - 2026-04-24

### Added — auto-throttle on heavy USER reads + force JSON output on `searchUsers`

Customer reported `searchUsers q="strength training" include_services=true limit=50` returning a silent transport timeout in Claude Code (no error, no response, just cutoff). Investigation found two root causes:

1. **`searchUsers` returns HTML by default**, not structured JSON. The OpenAPI spec said default was `array`, but BD's actual behavior returns rendered search-results HTML (`<hr><div class="grid-container">...`). Our lean-shaper expects an array; on HTML it silently no-ops, agent receives a multi-KB blob.
2. **Heavy include flags balloon row size**. With `include_services=1`, a single user record is ~6KB. At `limit=50` that's ~300KB, which the MCP transport (stdio buffer, Streamable HTTP framing, SSE) intermittently truncates without a clean error.

**Fix is two layers, both leaning toward stability over rejection:**

- **Force `output_type=array` on every `searchUsers` call** in both transports. Removed `output_type` from the input schema entirely so agents can't even pass `html` accidentally. Defense-in-depth — spec strip + runtime force.
- **Auto-throttle: when ANY `include_*` flag is true on `searchUsers` / `listUsers` / `getUser` and `limit > 25`, lower it to 25 silently and attach a `_throttled` warning to the response.** Adjustment, not rejection — agent always gets results; warning teaches it to paginate or drop heavy includes.

Sharpened the `include_*` field descriptions on `searchUsers` to mention the auto-cap.

### Internal

- `mcp/openapi/bd-api.json` — removed `output_type` field from `searchUsers` input schema; appended "Heavy — when set, `limit` is auto-capped at 25 for transport stability." to `include_subscription`, `include_services`, `include_transactions`, `include_photos`, `include_about`.
- `mcp/index.js` and `src/index.ts` — added the throttle guard + `output_type=array` injection right after include-flag extraction. Both files mirrored byte-for-byte. Smoke-tested locally before publish.

## [6.40.11] - 2026-04-23

### Changed — tighten corpus rule against `max-width` / `margin: auto` in `content_css`

Agents kept injecting custom container classes (e.g. `.tx-container { max-width:1080px; margin:0 auto }`) in `content_css`, double-constraining BD's layout and rendering SEO copy as a narrow strip. Previous rule was escapable by renaming the selector away from `.container`.

Replaced the rule with a closed-ended imperative: never set `max-width` or `margin: auto` in `content_css` on any selector. If a full-width page needs a contained section, use `<div class="container">` in `content` — the system global.

### Internal

- `mcp/openapi/mcp-instructions.md` — single-line rule swap. No code changes.

## [6.40.10] - 2026-04-23

### Added — runtime enum validation for hero CTA button `hero_link_color` + `hero_link_size`

Agents were passing hex colors (`#ffffff`) into `hero_link_color` and font-size numbers (`16`) into `hero_link_size`. BD concatenates these verbatim into Bootstrap classes (`btn-#ffffff`, ` 16`) and does NOT validate server-side — so the broken classes render live on the public page. Customer found a hero CTA with `class="bold btn btn-#ffffff 16"` in production.

Added runtime guard `validateHeroEnumsInArgs()` in both npm (`mcp/index.js`) and Worker (`src/index.ts`) that rejects invalid values on `createWebPage` / `updateWebPage` BEFORE the request reaches BD. Clear error naming the allowed set: `primary, info, success, warning, danger, default, secondary` for color and `"" (Normal), btn-lg (Large), btn-xl (Extra Large)` for size.

Also hardened the OpenAPI field descriptions with imperative "MUST be exactly one of..." wording and an explicit note that invalid values produce broken CSS classes (BD does not validate server-side).

### Internal

- `mcp/index.js` and `src/index.ts` — `HERO_LINK_COLOR_VALUES` + `HERO_LINK_SIZE_VALUES` sets, `validateHeroEnumsInArgs` helper, wired into the tool-call pipeline right after `sanitizeImageUrlsInArgs`. Both use `return string | null` pattern matching `validateUsersMetaRead`. Byte-for-byte mirrored.
- `mcp/openapi/bd-api.json` — `hero_link_color` and `hero_link_size` field descriptions rewritten on both createWebPage + updateWebPage.

## [6.40.9] - 2026-04-23

### Changed — harden `breadcrumb` field against agent overrides

Agents were writing literal breadcrumb strings (e.g. `"Personal trainers · Seal Beach"`) on `createWebPage` / `updateWebPage` despite the corpus rule telling them not to. Root cause: the field description itself was just `"Breadcrumb label"` — permissive, no guardrail at the moment of composing the value. Corpus-level rules get skimmed and forgotten 400 lines into a page-build workflow; field descriptions are read inline.

Replaced the field description on both `createWebPage.breadcrumb` and `updateWebPage.breadcrumb` with an imperative guardrail: `OMIT — do not set unless user explicitly requests it. BD auto-generates the breadcrumb trail; manual override locks it to a static string that breaks when page context changes.`

Removed the now-redundant corpus rule from `mcp-instructions.md` (single source of truth, reduces bloat).

### Internal

- `mcp/openapi/bd-api.json` — both `breadcrumb` field descriptions updated.
- `mcp/openapi/mcp-instructions.md` — removed line 420 breadcrumb guardrail (now on the field itself).

## [6.40.8] - 2026-04-23

### Fixed — npm package crash "Assignment to constant variable" on listUserMeta / getUserMeta (any tool calling the friendly-param filter translator)

Customer in FB group reported `updateMembershipPlan` and `listUserMeta` both returning `Error calling <tool>: Assignment to constant variable.` Root cause: in `mcp/index.js`, the CallTool handler destructured `const { name, arguments: args } = request.params;` at the top of the handler, then `args = workingArgs;` later on for listUserMeta/getUserMeta friendly-param translation. Reassigning a `const` throws at runtime — but only when the translation branch actually executed (which is why some tools worked and others crashed).

Fixed by declaring `args` with `let` (split from the `name` destructuring). Hosted Worker was not affected — it declares `args` fresh inside the tool callback.

### Internal

- Code fix in `mcp/index.js` only. Worker unchanged. No spec/corpus changes.

## [6.40.7] - 2026-04-23

### Changed — hero_content_font_size 16 → 18

Bumped the mandatory hero body-paragraph size from 16px to 18px for better subheader readability on hero overlays.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.40.6] - 2026-04-23

### Changed — hero safe-defaults rule hardened to atomic/mandatory language + breadcrumb guardrail

**Why:** Field-test 2026-04-23 showed Cursor enabling a hero but omitting `hero_content_font_color` and `hero_content_font_size` from its write, even though both were listed in the safe-defaults bullet set. Cursor's self-audit: "I treated them as optional unless you asked for a specific look... oversight on my side for your house standard, not forbidden by the tools." The rule wording let an agent interpret the list as a menu rather than an atomic recipe.

Rewrote the hero readability rule to be explicitly atomic:

- Heading changed from `Hero section readability safe-defaults. Apply on TRANSITION only` to `Hero section readability safe-defaults — ALL 8 fields MANDATORY on every hero transition.`
- Added a "treat as a single atomic recipe, not a menu" clause with the exact reasoning that the BD field-level defaults are not acceptable fallbacks.
- Inline auto-hero recipe in the SEO content rule now says `ALL 9 mandatory safe-defaults in the same call (atomic recipe, not a menu)`.

Also added a new rule: `breadcrumb` field must NEVER be set on `createWebPage` / `updateWebPage` unless the user explicitly requests a custom breadcrumb. BD auto-generates from category/location context; setting a static string locks the page to it and desyncs when context changes.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.40.5] - 2026-04-23

### Changed — hero_content_font_size default 14 → 16

Bumped the hero body-paragraph safe-default from 14px to 16px. 14px under a hero overlay reads small on most viewport widths; 16px matches the standard browser body-text baseline and gives the subheader paragraph proper visual weight against the hero headline.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.40.4] - 2026-04-23

### Changed — hero readability safe-defaults extended (body paragraph + font size)

Screenshot from production showed the hero's subheader body paragraph rendering dark-on-dark (unreadable) because `hero_content_font_color` wasn't in the safe-defaults list — the rule only covered h1/h2. Added two more defaults to the `enable_hero_section` transition rule:

- `hero_content_font_color="rgb(255,255,255)"` — the body-paragraph color under the headline. Default BD value is dark; combined with the black-0.5-opacity overlay we set, it was unreadable.
- `hero_content_font_size="14"` — explicit BD-default 14px. Without an explicit value, the hero can inherit an oversized or too-tiny size from theme and break the hero's visual balance.

Both rule locations updated (the `Hero section readability safe-defaults` block AND the `createWebPage` auto-hero recipe in the SEO content rule).

`hero_content_font_color` is already in EAV_ROUTES on all three mirrors (Worker, npm, drift-check script) — no drift fix needed, just corpus language to make sure agents set it.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.40.3] - 2026-04-23

### Changed — LANDSCAPE rule extended to inline body images

Closed a gap in the corpus orientation rule. Previously "LANDSCAPE only" listed only feature/hero/cover images + multi-image album photos — inline `<img>` in `post_content` / `group_desc` body HTML were orientation-unspecified. An agent could rationalize placing a portrait image inside a 350px-wide floated container, which breaks text wrap in the article layout.

Two concise edits to `mcp-instructions.md`:
- Post-body formatting rule now explicitly says inline body images must be LANDSCAPE.
- Orientation bullet in the Image URL rule lists inline body images alongside feature/hero/cover/album photos.

Also replaced "Square is acceptable only for profile_photo / logo" with "profile_photo / logo are headshots/icons — orientation rule doesn't apply" to eliminate the "square" wording agents were misreading as "vertical" in field-test outputs.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min) since it fetches corpus live. No Worker redeploy needed.

## [6.40.2] - 2026-04-23

### Fixed — belt-and-suspenders defense against query-string image URLs

Real production bug 2026-04-23: agent called `updateSingleImagePost` with `post_image=https://images.pexels.com/photos/2294363/pexels-photo-2294363.jpeg?w=1600` → BD's `auto_image_import` baked the query string into the stored filename as `pphoto-63.jpeg?w=1600` → 404 at CDN when rendered. Fixed at two layers:

**Layer 1 — hardened field descriptions (docs / suspenders):** Rewrote all 12 image-URL field descriptions with the full rule inline, so agents see it at call time without having to cross-reference the 76KB corpus. Coverage:

- `post_image` (create/updateSingleImagePost, create/updateMultiImagePost) — LANDSCAPE only, never portrait/vertical, bare URL, must end in `.jpg`/`.jpeg`/`.png`/`.webp`, query-string failure mode documented.
- `hero_image` (create/updateWebPage) — same rule, with correct nuance that WebPage hero hotlinks (no auto_image_import) but BD's form-urlencoded parser truncates query strings on storage.
- `cover_photo` (create/updateUser) — LANDSCAPE, bare URL, extension list.
- `profile_photo` + `logo` (create/updateUser) — replaced legacy "URL should begin with http://" prose with bare URL + extension list. Dropped orientation rule (headshots/icons are naturally square-ish — now phrased explicitly to avoid confusion with "vertical").

Also removed "square acceptable" phrasing — field tests showed agents sometimes misread "square" as "vertical" and still picked portrait images. Replaced with imperative "LANDSCAPE only — never portrait/vertical" on feature/hero/cover fields.

**Layer 2 — runtime sanitizer (code / belt):** Added `sanitizeImageUrlsInArgs()` to BOTH transports (Worker `src/index.ts` + npm `mcp/index.js`). Scoped allowlist of 6 single-URL fields (`post_image` on single-image posts, `hero_image`, `cover_photo`, `logo`, `profile_photo`, `original_image_url`) plus `post_image` as CSV for `createMultiImagePost`/`updateMultiImagePost`. Strips everything from `?` onward and trims whitespace per URL (CSV case). Logs a `console.warn`/`console.error` when it strips, so Cloudflare Logs / stdio logs show when an agent drifted.

**Surgical scope verified live:**
- inline body images in `post_content` preserve their `?w=700` retina variant untouched (Froala stores verbatim)
- `facebook_image` (OG/social) deliberately NOT sanitized — FB/Twitter/LinkedIn crawlers hotlink that URL verbatim, so CDN variant query strings are legitimate there
- Full reasoning + "don't add these fields" list captured in inline comments above the sanitizer in both transports, so future maintainers don't over-reach the allowlist and silently break customer content

### Sub-agent audit (12/12 PASS)

Independent review confirmed all 12 field descriptions are drift-proof: bare URL rule explicit, extension list explicit, orientation correct per field type, auto_image_import guidance correct, no softener language ("avoid"/"prefer"/"try to") agents can rationalize around.

### Internal

- Tool schemas unchanged. Only description strings + one new sanitizer function per transport. Worker deployed (Version ID `c0c5f1cb-ac96-462e-8dab-b9ff836b1a45`); picks up description changes on next raw-GitHub cache TTL (~5 min).

## [6.40.1] - 2026-04-23

### Maintenance — internal docs aligned with single-spec-location (follow-up to v6.40.0)

Post-v6.40.0 sub-agent audit (4 parallel scans across npm-package, scripts, Worker, VISION, CLAUDE.md, and `.claude/settings.json`) surfaced residual stale language in:

- `brilliant-directories-mcp-VISION.md` — "sync duplicate files" Step 2 block, byte-identical `mcp/openapi/*` pair references, checklist items telling a maintainer to `cp openapi/ → mcp/openapi/`. All rewritten to reflect the single canonical location.
- Publish-protocol memory — ownership-matrix row and path references updated from `openapi/*` → `mcp/openapi/*`.

No user-facing change. No tool schema change. Purely internal-doc hygiene to eliminate the last drift-language pockets.

### Internal

- Docs-only. Worker picks up nothing (no spec/instructions change). Tarball README has no diff.

## [6.40.0] - 2026-04-23

### Changed — OpenAPI spec and instructions consolidated to a single canonical location

Eliminated the historical duplicate of the OpenAPI spec and the agent-directives corpus. The canonical path is now `mcp/openapi/bd-api.json` and `mcp/openapi/mcp-instructions.md`. The previous repo-root `openapi/` folder has been deleted.

Both transports read from the same single location:
- Worker (`brilliantmcp.com`) fetches from `raw.githubusercontent.com/.../main/mcp/openapi/bd-api.json` (URL updated in `src/index.ts`, Worker redeployed).
- npm package reads from the in-package `mcp/openapi/` path it has always shipped.

Consequences:
- Step 2 of the publish protocol (byte-identical sync of the spec/instructions pairs) is retired. Only the README still has a mirror because npm's `files` whitelist can't reach the repo-root README.
- The long-standing drift risk between the two copies (discovered in v6.39.0 to have accumulated ~5 releases of silent drift on the npm side) is now structurally impossible.
- Scripts (`schema-drift-check.js`, `extract-instructions.js`, `verify-instructions-match.js`) updated to read from the new path.
- Internal docs (VISION.md, USE-GITHUB-HANDOFF.md, CONTRIBUTING.md, SKILL.md, KNOWN-SERVER-BUGS.md, `.claude/settings.json` allowlist entry) all swept for path references.
- Public raw-GitHub URLs referenced in README (n8n import example, OpenAPI import instructions) and SKILL.md metadata updated to the new path.

No functional change for end users on any transport. No tool schemas changed. No descriptions changed. Spec + instructions content is byte-identical to v6.39.0.

### Internal

- Worker redeployed with new fetch URL before the old path was deleted; stale-fallback + identical content at both paths guaranteed zero disruption during the transition.

## [6.39.0] - 2026-04-23

### Changed — global filter operators rule, verified-live edition

Discovery session hammered 14 operators × 10 list endpoints on a real BD instance. Net result is a rewritten operators section in `mcp-instructions.md` built on live-test truth rather than documentation claims:

**Newly confirmed working** (documented for the first time in the corpus):
- `not_like` — inverse of `LIKE`, same shape
- `is_null` / `is_not_null` — with the critical shape requirement `property_value=` must be present as an empty parameter (without it, BD silent-drops to unfiltered dataset)
- `between` — CSV only (`property_value=lo,hi`); array-syntax errors

**Newly confirmed broken** (documented as DO-NOT-USE):
- `<`, `<=`, `<>` — all silently act as `=` across every endpoint tested. Workarounds: `between lo,hi` for numeric upper-bound ranges, `!=` instead of `<>`. `<>` specifically inverts intent (`active <> 3` returns ONLY `active=3` rows) — highest severity, flagged to BD dev team.
- Word-form aliases `lt`, `gt`, `lte`, `gte` — silently fall back to `=`. Symbols (`>`, `>=`) are canonical.

**Newly confirmed architectural facts:**
- `property_operator` is honored ONLY on `/get` (list) endpoints.
- `/search` (POST) silently ignores `property`/`property_operator` — keyword-only.
- `/update` and `/delete` reject filter-only calls — no bulk-where mutation path exists.

Corpus rewrite is surgical: same paragraph slot, clearer shape, no wasted words. Every claim is live-verified. Broken operators are explicitly called out with workarounds so agents never reach for them.

### Added — internal `KNOWN-SERVER-BUGS.md` (gitignored)

Tracks server-side BD bugs the corpus works around so future maintainers know what to revisit when BD team ships fixes. Gitignored from public GitHub. Delete the file entirely once all listed bugs are resolved. Referenced from CLAUDE.md alongside the existing `USE-GITHUB-HANDOFF.md` pattern.

### Internal

- Docs+gitignore change. Worker picks up corpus on next raw-GitHub cache TTL (~5 min). Tool schemas unchanged.

## [6.38.14] - 2026-04-23

### Fixed — `post_filename` missing from `updateSingleImagePost` schema

Real spec bug caught by Cursor field test: the slug rule in the corpus assumed `post_filename` was writable on `updateSingleImagePost`, but the field was never actually added to the OpenAPI schema properties. MCP clients silently dropped the field before forwarding to BD — calls returned `success` but the slug stayed frozen.

Added `post_filename` to `updateSingleImagePost` request schema properties (positioned after `post_title` for logical grouping). Matches what `updateMultiImagePost.group_filename` has had since v6.38.10. Description points to the corpus URL slug rule for when to suggest a slug+redirect.

### Internal

- Docs+schema change. Worker picks up on next raw-GitHub cache TTL (~5 min). MCP clients need to reconnect to get the new tool schema.

## [6.38.13] - 2026-04-23

### Added — Public URL composition global rule

Observed drift (Cursor test round 3): agent correctly read `post_filename` path from the record but hallucinated the site origin (`dash.strategicdirectoryprofits.com` — a domain that never appeared anywhere in the conversation). The rule to call `getSiteInfo` was present in the Site grounding paragraph but passive and easy to skip in mid-flow.

Added a short standalone utility rule right after Site grounding:

> **Public URL composition.** Always `{getSiteInfo.full_url}/{path_field}` where `path_field` is `post_filename` / `group_filename` / `filename` from the record. Never guess the origin. If `full_url` isn't cached, call `getSiteInfo` first. About to write a literal domain not from `full_url`? Re-call `getSiteInfo` — that's a hallucination signal.

Applies to every public URL the agent reports (posts, albums, member profiles, WebPages, categories). Hallucination-trap phrasing is deliberate: if the agent catches itself about to write a literal domain that didn't come from a cached `full_url`, stop and re-call.

### Changed — Pexels search URL clarification

Further disambiguated the Pexels orientation filter rule: dropped the "or API param" phrasing that sent agents hunting for `PEXELS_API_KEY` env vars. Now explicit that the filter belongs on the **public search page** (`pexels.com/search/...`) with no API key or auth required.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.12] - 2026-04-23

### Changed — corpus disambiguations (orientation filter + slug verify)

Two tight wording fixes, no tool schema changes:

- **Pexels orientation filter** now explicit that `?orientation=landscape` belongs on `pexels.com/search/...` (the search page) — NEVER on the final `images.pexels.com/photos/...jpeg` URL sent to BD (imported fields stay bare per bullet 1 of the image URL rule).
- **Slug rename rule** now requires an explicit post-write verification via `get*`: if BD returns `success` but the slug is unchanged, the MCP client is on a stale tool schema that dropped the field — reconnect the client, don't create a redirect pointing at a 404. (Generalized the stale-schema recovery hint previously scoped to multi-image append.)

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.11] - 2026-04-23

### Changed — hardened landscape enforcement with actionable Pexels filter guidance

Second observed Cursor drift: despite "LANDSCAPE required" being stated in 5 places across tool descriptions and corpus, agents still picked portrait feature images because the rule was passive (describes requirement) rather than active (describes how to comply).

Added one actionable sentence to the corpus orientation bullet: "On Pexels, filter your search with `?orientation=landscape` (search URL param or API param). Do not pick from unfiltered thumbnails — thumbnails crop to squares and hide portrait-only originals. If in doubt on a specific URL, skip it and pick another."

Roots the agent's behavior in a concrete step: filter the source at search time, don't trust thumbnails. Tool-description warnings unchanged (already correct; didn't need duplication).

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.10] - 2026-04-23

### Added — URL slug rename rule (posts + albums)

Verified via live BD API: `post_filename` and `group_filename` ARE writable on update, and the old slug returns 404 after change (no auto-redirect). Added a corpus rule for post/album title renames:

- Slugify the new title and compare to the current slug. If <50% token overlap, suggest two follow-up actions: update the slug to match the new title, and `createRedirect old_filename=<old> new_filename=<new>` to preserve inbound links.
- Suggest only — never auto-apply. User approves or rejects.
- Stay silent on typo fixes / title tweaks that keep the same keywords (high token overlap = old slug still reads right).
- Before `createRedirect`, filter `listRedirects` for an existing row with the same `old_filename`; if one exists, update it instead of creating a duplicate. BD already blocks `old==new`.
- Rule excludes WebPage slugs — those are locked to page type.

Tool descriptions on `updateSingleImagePost` and `updateMultiImagePost` now pointer-reference the corpus rule (one sentence each, not duplicating the full rule). Net docs-size reduction despite adding the rule.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.9] - 2026-04-23

### Added — rename does NOT update URL slug (both single-image + multi-image)

Verified via live BD API testing: `post_title` rename on `updateSingleImagePost` does NOT regenerate `post_filename` (the URL slug); `group_name` rename on `updateMultiImagePost` does NOT regenerate `group_filename`. Both stay on the original slug after rename — only `updateUser` regenerates `filename` when category/city inputs change.

Added surgical warnings to both `updateMultiImagePost` and `updateSingleImagePost` tool descriptions: "Report `post_filename` / `group_filename` from the record when giving the user a URL — do not compose it from the new title." Prevents agents from reporting stale-slug URLs to users.

### Added — schema-drift recovery hint (corpus)

Added one sentence to the Multi-image albums corpus paragraph: if `updateMultiImagePost` append returns success but no new child row appears within ~10s, the MCP client is likely on a stale tool schema missing `post_image` — reconnect the client. Field is supported server-side. Caught via Cursor field test where IDE cached pre-v6.38.8 tool list.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.8] - 2026-04-23

### Added — multi-image album workflow hardening

Rewrote `createMultiImagePost` / `updateMultiImagePost` / `updateMultiImagePostPhoto` / `deleteMultiImagePost` / `createMultiImagePostPhoto` tool descriptions and added a new "Multi-image albums — one-shot rule" paragraph to `mcp-instructions.md`. Captures three behaviors verified via live BD API testing:

- **`updateMultiImagePost` accepts undocumented `post_image` + `auto_image_import=1`** — APPENDS new photo rows to an existing album (does not replace). This is the correct fix path when a create-time import silently fails; no need to delete and recreate the whole album. `post_image` property explicitly added to the `updateMultiImagePost` schema.
- **`createMultiImagePostPhoto` does NOT import externals**, and the parent's `auto_image_import` does NOT cascade to child creates. Child endpoint is only suitable for URLs already hosted on the BD site.
- **`updateMultiImagePostPhoto` cannot re-import** a failed image — it only writes `title`/`order`.

### Added — post-create verification rule

Every `post_image` write (create or update append) needs follow-up `listMultiImagePostPhotos` verification. Success = non-empty `file` + `image_imported=2`; silent-failure = empty `file` + `image_imported=0`. Fix path: `deleteMultiImagePostPhoto` the bad row, then `updateMultiImagePost` to append a replacement.

**Critical clarification (caught via Cursor field-test):** verify via `listMultiImagePostPhotos`, NOT via `getMultiImagePost.post_image`. The parent's `post_image` field is a transient write-through, not a mirror of child rows — checking it will produce false-negative conclusions about whether the append worked.

### Added — LANDSCAPE orientation hardened on feature images

`post_image` field descriptions on `createSingleImagePost`, `updateSingleImagePost`, `createMultiImagePost`, and `updateMultiImagePost` now lead with "**LANDSCAPE required** (not portrait)". Corpus image URL rule updated to scope landscape-only to feature/hero contexts (`post_image`, `hero_image`, `cover_photo`, multi-image album photos) and carve out square for `profile_photo` / `logo`.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.7] - 2026-04-23

### Changed — inline Froala body image variant `?w=1280` → `?w=700`

Matches 2x the 350px display width for retina sharpness without oversampling. ~3x smaller file than the previous `?w=1280` (~80KB vs ~250KB per inline image) with no visible quality loss.

Docs-only; Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.6] - 2026-04-23

### Fixed — image URL rule split + Froala image classes

One canonical image-URL rule in `mcp-instructions.md`, three bullets:
- **Imported fields** (`post_image`, `hero_image`, `logo`, `profile_photo`, `cover_photo`) — bare URL, no `?` query string (BD's filename generator breaks on it — verified live on post 58 where query string produced literal `pphoto-58.jpeg?auto=compress...` filename and 404'd).
- **Inline `<img>` in Froala body** (`post_content`, `group_desc`) — hotlinked; Pexels medium variant `?w=1280` for page-load weight.
- **All fields:** landscape or square only; `.jpg` or `.png` only.

Froala float classes now include `img-rounded`: `fr-dib fr-fil img-rounded` (left) / `fr-dib fr-fir img-rounded` (right).

Scrubbed stale `?auto=compress&cs=tinysrgb&w=1800` references from `createWebPage` + `updateWebPage` hero-image bullets — they now point at the canonical rule.

### Internal

- Docs-only. Worker picks up on next raw-GitHub cache TTL (~5 min).

## [6.38.5] - 2026-04-23

### Added — Froala post-body formatting rule (`post_content`, `group_desc`)

New corpus rule in `mcp-instructions.md` covering image-heavy post body writes:
- Structure discipline: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>` by default.
- Froala image floats: `class="fr-dib fr-fil"` (left) / `fr-dib fr-fir` (right) with inline `style="width: 350px;"` on the `<img>`. Froala keeps inline `style` on body-field images (unlike WebPage `content`).
- Image orientation: landscape or square only; never portrait.
- Source: Pexels for stock — same sourcing hierarchy as hero images.
- `createSingleImagePost` default: Pexels landscape `post_image` + `auto_image_import=1` unless user opts out. Update is best-effort — don't overwrite an existing image the user didn't mention.
- `about_me` (User): same structure rule; skip images unless the user explicitly asks.

### Changed — field descriptions for 7 Froala body/image fields

Short pointers added/fixed on `createSingleImagePost.post_content`, `createSingleImagePost.post_image`, `updateSingleImagePost.post_content`, `createMultiImagePost.group_desc`, `updateMultiImagePost.group_desc`, `createUser.about_me`, `updateUser.about_me`. Three of these previously had the copy-paste stub "Description of the tag group. HTML allowed." — now accurate + point at the corpus rule.

### Internal

- Docs-only; no code change. Worker picks up the new corpus automatically via its 5-min raw-GitHub cache TTL (no redeploy). npm users get it on next `@latest` install.

## [6.38.4] - 2026-04-23

### Added — lean write-echo for MembershipPlan

`createMembershipPlan` and `updateMembershipPlan` now trim BD's ~170-field `subscription_types` response down to 4 identity/classification fields: `subscription_id`, `subscription_name`, `subscription_type`, `profile_type`. Matches the lean-echo pattern already shipped for User / Post / WebPage / Widget / Category / PostType.

### Changed — MembershipPlan URL field descriptions tightened

`subscription_filename` and `custom_checkout_url` param descriptions on both create/update rewritten from ~500-chars each to ~400/450-chars — same uniqueness rule, less prose.

### Internal

- `WRITE_KEEP_SETS` gained `createMembershipPlan` + `updateMembershipPlan` entries in all 3 drift-locked files (`mcp/index.js`, `src/index.ts`, `schema-drift-check.js`).
- Worker `SERVER_INFO` 3.1.3 → 3.1.4.

## [6.38.3] - 2026-04-23

### Added — MembershipPlan URL uniqueness fields

`createMembershipPlan` and `updateMembershipPlan` now accept two optional URL-slug fields:

- **`subscription_filename`** — plan's public search/browse page URL. Must be site-wide unique vs other plans' `subscription_filename`, top categories (`list_professions.filename`), sub-categories (`list_services.filename`), and WebPages (`list_seo.filename`). Pre-check each with a filtered `list*` call before writing.
- **`custom_checkout_url`** — plan's custom checkout URL. Stored in `users_meta` (`database=subscription_types, key=custom_checkout_url`). Must be unique across all plans' checkout URLs. Pre-check via `listUserMeta(database="subscription_types", key="custom_checkout_url")` + client-filter by value.

Both fields are optional; safe to leave blank. Collisions cause site URL routing conflicts.

### Added — EAV routing extended to `updateMembershipPlan`

`EAV_ROUTES.updateMembershipPlan` maps `custom_checkout_url` → `users_meta(database=subscription_types, database_id=subscription_id)`. Agent just passes the field to `updateMembershipPlan`; wrapper handles the EAV upsert (create if missing, update if exists — same pattern as WebPage hero fields). On CREATE, BD auto-seeds the row (verified live) — no wrapper routing needed there.

### Internal

- `EAV_ROUTES` map entry added in `mcp/index.js`, Worker `src/index.ts`, and `scripts/schema-drift-check.js` (three-file drift rule).
- Worker `SERVER_INFO` 3.1.2 → 3.1.3.

## [6.38.2] - 2026-04-23

### Added — server-side scaffolding sanitizer (belt + suspenders with docs rule)

Agents sometimes leak reasoning scaffolding into content-field values — CDATA wrappers, `<parameter>`/`<invoke>`/`<function_calls>` markup, whole-value entity-escaped HTML. BD stores every byte verbatim; leaked scaffolding renders as literal visible text on the live site, breaking layouts (page-wide for `content_css`, site-wide for `widget_style`).

**Both transports now strip these tokens server-side** from an enumerated set of ~23 content-field names before forwarding to BD. Strips ANY occurrence (not just outer wrappers) because the tokens have no legitimate place in BD content. Entity-escape unwraps only when the WHOLE value is entity-escaped (leaves mixed markup alone).

**Sanitized fields:** WebPage `content` / `content_css` / `content_head` / `content_footer_html` / `hero_section_content`; Widget `widget_data` / `widget_style` / `widget_javascript`; PostType 9 code-template fields; User `about_me`; Post `post_content` / `post_caption` / `group_desc`.

### Changed — docs rule tightened

`mcp-instructions.md` scaffolding rule rewritten (~10 lines → 3 lines) with absolute phrasing ("never anywhere, not just wrappers"). `createWebPage` / `updateWebPage` descriptions use a matching one-line pointer. Server-side strip is named in the docs so agents see the belt + suspenders model.

### Internal

- New `stripAgentScaffolding(value)` + `sanitizeScaffoldingInArgs(args)` helpers on both transports.
- Wired in before EAV split (so EAV-routed content fields like `hero_section_content` flow through sanitization too).
- 12 unit tests pass in isolation on the npm helper (wrapper strip, entity-unwrap, no-op on plain content, non-sensitive fields untouched).
- Worker `SERVER_INFO.version` bumped 3.1.1 → 3.1.2.

## [6.38.1] - 2026-04-23

### Fixed — EAV upsert parity between transports + hero safe-default

**EAV upsert now works on npm (was Worker-only).** `mcp/index.js` gained the `EAV_ROUTES` / `splitEavParams` / `writeEavFields` helpers that already shipped on the Worker in v3.1.1. `updateWebPage` with hero fields on a page originally created without hero now correctly creates the missing `users_meta` rows instead of silently dropping them. Both transports behave identically for this workflow now.

**`hero_column_width="8"` added to the hero safe-defaults** list in `createWebPage`, `updateWebPage`, and `mcp-instructions.md`. Matches BD admin-UI default (70% text-column width).

### Internal

- Stale "npm has no EAV routing" comment in `mcp/index.js` header updated to reflect parity.

## [6.38.0] - 2026-04-23

### Added — auto cache refresh expanded to Widgets + PostTypes

Extends the 6.37.2 auto-refresh pattern. After every successful write, these tools now server-side fire `refreshCache` before returning to the agent:

| Tool | Scope |
|---|---|
| `createWebPage` / `updateWebPage` | `scope=web_pages` (unchanged from 6.37.2) |
| `createWidget` / `updateWidget` | `scope=data_widgets` (new) |
| `updatePostType` | full refresh (new; no targeted scope exists) |

Response shape unchanged — each successful write carries `auto_cache_refreshed: true` (or `false` + `auto_cache_refresh_error` on refresh failure, write still succeeded).

### Changed — agent-facing cache-refresh guidance

`mcp-instructions.md` cache block replaced with a single concise paragraph: names the auto-refresh tool list, explains the `true`/`false` callback contract (`false` → retry `refreshSiteCache` once), and lists the remaining resources that still need a manual refresh after a batch edit (Menus, MembershipPlans, Categories). Stale post-type "always call `refreshSiteCache`" sentences removed.

Tool descriptions for `createWidget`, `updateWidget`, `updatePostType` gained the standard "Cache refresh is automatic" line and updated Returns shape.

### Internal

- `WEBPAGE_AUTO_REFRESH_OPS` Set → `AUTO_REFRESH_SCOPE` map (tool → scope string; empty = full refresh).
- `autoRefreshCache()` on both transports now takes a `scope` parameter.
- Worker `SERVER_INFO.version` bumped 3.0.8 → 3.1.0 (minor — new auto-refresh scopes).

## [6.37.2] - 2026-04-23

### Added — automatic cache refresh on WebPage writes

`createWebPage` and `updateWebPage` now auto-fire `refreshCache(scope=web_pages)` server-side on success. Agents no longer need to remember the post-step; the cache flush happens before the tool response returns. Response bodies gained two new fields:

- `auto_cache_refreshed: true|false` — whether the automatic refresh succeeded
- `auto_cache_refresh_error` (only when `false`) — the failure reason

**Lenient failure mode:** a refresh failure does NOT fail the parent create/update. The record was written; the cache flush is best-effort. On `false`, the agent can retry `refreshSiteCache` manually.

**Performance:** adds ~5s to every WebPage write (that's the cost of BD's cache flush). Single writes now take ~6s total instead of ~1s. Bulk workflows pay the cost per-call but don't cumulatively time out (each tool call is its own Worker invocation with its own 25s budget).

**Timeout protection:** Worker path wraps the refresh in an AbortController with a 15s timeout so a rare BD hang can't kill the whole Worker invocation. Timeout → `auto_cache_refreshed: false, auto_cache_refresh_error: "refresh timed out after 15s"`. npm path uses `makeRequest`'s existing 30s timeout.

### Changed — documentation

- `createWebPage` + `updateWebPage` tool descriptions replaced the "Required post-step: call `refreshSiteCache`" warning with the new "automatic" messaging and documented the new response fields.
- `mcp-instructions.md` cache-refresh section reorganized: `createWebPage`/`updateWebPage` listed under "automatic", `updatePostType` listed under "REQUIRED manual call", others under "recommended manual call". Removed the stale "refresh is optional for direct-column WebPage updates" sentence.

### Internal

- New `autoRefreshCache()` helper on both transports (parallel implementations).
- Worker `SERVER_INFO.version` bumped 3.0.7 → 3.0.8.

## [6.37.1] - 2026-04-23

### Fixed — users_meta filter reads were effectively broken

`listUserMeta` and `getUserMeta` now expose `database`, `database_id`, and `key` as first-class query parameters. Previously the tool schema only offered a generic `property`/`property_value` pair, which collided with the Worker's safety guard (requires 2 of 3 conditions on every read) — every call returned a guard error. Equally bad: even if a caller got past the schema via direct REST, plain `?database=list_seo` was silently ignored by BD (which only honors multi-condition filters via `property[]`/`property_value[]`/`property_operator[]` array syntax) — so "valid" lookups were returning cross-table noise.

**What changed:**
- Tool schema: three new query params on both endpoints.
- Runtime translation: both transports (npm `mcp/index.js` + Worker `src/index.ts`) now convert the friendly params into BD's array-syntax filter before forwarding. Plus, the query-string builders correctly expand array values with `.append()` instead of comma-joining via `.set()`.
- Safety guard in the Worker already accepted these first-class fields (it just couldn't see them because they weren't in the schema). No guard changes needed.

**Impact for agents:**
```
listUserMeta(database="list_seo", database_id=167)   →  all EAV rows for WebPage 167
listUserMeta(database="users_data", key="hero_bio")  →  that field across all members
getUserMeta(meta_id=123, database="list_seo", database_id=167)  →  triple-verified read
```

The existing `property`/`property_value` flow still works as a fallback. **Don't mix the two styles in a single call** — pick one per call so filter resolution stays unambiguous.

### Internal

- npm `makeRequest` and Worker `callTool` both now handle array-valued query params correctly (`.append()` per item).

## [6.37.0] - 2026-04-23

### Added — Reviews lean shaper + list/search tool clarity

**Reviews lean-by-default (new).** `listReviews`, `getReview`, and `searchReviews` now truncate `review_description` to the first 500 chars + `…` on default responses. Truncated rows are tagged `review_description_truncated: true` so agents can re-fetch with the full text when needed. Opt back in per call with `include_full_text=1`.

- Unbounded `review_description` field can balloon to megabytes at `limit=100` on moderation-queue reads; lean default keeps payloads predictable.
- Reviews is the 7th lean-shaper family (User / Post / Category / PostType / WebPage / Plan / Review). Uniquely uses a body-truncate pattern rather than keep-list because the record has no nested buckets to drop — just one unbounded text field.

### Changed — list vs search tool descriptions

- **`searchUsers`**: "Use when" rule now names three real call-sites — (1) mirroring the public member-search experience in external apps, (2) SEO coverage audits ("what's publicly findable for this keyword/category/location combo?"), (3) keyword/partial-name lookup. Tightened `output_type=html` bullet to identify it as BD's public-site search-results markup (embed-ready). Contrast with `listUsers` sharpened — `listUsers` is for admin-only filters (join date, subscription status, meta fields) this endpoint doesn't support.
- **`searchReviews`**: decision rule sharpened against `listReviews` — keyword-in-body vs structured column filtering. Notes that BD matches against the full body server-side even when our lean default truncates the returned preview.
- **`searchSingleImagePosts` / `searchMultiImagePosts`**: same sharpening pattern; multi-image description now names the actual `data_type=4` post types (photo album, classified, property, product) so agents know which surface is in scope.

### Internal

- `scripts/schema-drift-check.js` gained a `REVIEW_READ_TOOLS` family check; exits 0 on current spec.

## [6.36.0] - 2026-04-23

### Docs — targeted README factual + UX polish

Follow-up pass after 2-agent README audit (cold customer UX lens + technical accuracy lens).

**Factual fixes:**
- **Tag Types row corrected** — claimed `list, get, create, update, delete` but BD only exposes `listTagTypes` + `getTagType`. Now `list, get` only so users don't try non-existent endpoints.
- **Users row gained `fields`** — `getUserFields` was missing from the resource table row, inconsistent with the Single-Image/Multi-Image rows that do list `*Fields` operations.
- **`refreshCache` → `refreshSiteCache`** in Website Settings row (real operationId).
- **403 error literal aligned** — README had three different wordings of the same error. Standardized on `403 API Key does not have permission to access this endpoint` (verified against `mcp-instructions.md`, which is what BD actually returns).
- **`-y` flag added** to the Claude Code Advanced `npx` call — without it, the `npx` spawn can prompt on first install and hang the MCP startup.
- **curl example URL-encoding fixed** — `address=Los Angeles` → `address=Los+Angeles` (was sending literal space; BD would 400 or silently truncate).

**UX fixes:**
- **Opener sentence added** — "This guide walks you through connecting your AI of choice... Most setups take under 5 minutes." Gives a non-technical reader a bridge between the feature-list and the ⚠️ REQUIREMENTS callout.
- **Windows Quit instructions inlined** at Claude Desktop Step 4 — the "fully quit = system-tray right-click Quit" guidance was buried 500+ lines deep in Troubleshooting; now surfaces where non-technical Windows users actually need it.
- **Filter operators section simplified** — removed the user-facing operator table (`=`, `!=`, `>=` etc.). 95% of users ask the AI naturally and never type these URLs by hand; operators are now documented only in SKILL.md + the MCP tool descriptions (the surfaces AI agents actually read). One-line README blurb points curl/Postman/Zapier users at those sources.

### Added — crawler blocks on Worker

The `brilliantmcp.com` endpoint is machine-to-machine (MCP protocol), not a website meant to be indexed. Added two belt-and-suspenders crawler blocks:

1. **`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`** on every response (added to `SECURITY_HEADERS`). Tells Google, Bing, GPTBot, ClaudeBot, Perplexity crawlers, archive.org, etc. to skip the domain entirely. Zero effect on MCP clients (they don't evaluate this header).
2. **`GET /robots.txt`** serving `User-agent: *\nDisallow: /\n`. Crawlers check this before any URL; same goal, different mechanism.

Does NOT affect Claude Desktop / Cursor / n8n / MCP Inspector etc. at runtime — they speak MCP, they don't crawl, they never read robots.txt. Purely prevents the info-JSON at `GET /` from surfacing in web search results or LLM training data.

### Docs — VISION.md full refresh

- **Full-tree diagram rewritten** to include `brilliant-directories-mcp-hosted/` (was completely missing — cold-AI audit #4 caught it), `scripts/` folder with all 4 scripts, `openapi/mcp-instructions.md` corpus file, `chatGPT-Config/` re-flagged as RETIRED.
- **ChatGPT Custom GPT proxy section rewritten** — was self-contradicting (claimed routes retired AND that they "continue to work"). Now coherent single source: fully retired 2026-04-23, folder kept for archaeological reference only.
- **Current-state header bumped** `v6.34.0, Worker v3.0.4` → `v6.36.0, Worker v3.0.5`.
- **Key Files table** fixed stale "On hold" label on chatGPT-Config → "RETIRED" (matches tree + memory).
- **Release-checklist item updated** — stale "update tool count" line (violated our own no-counts rule) replaced with bump-version-stamps + update-tree-diagram + don't-record-counts guidance.

### Docs — publish protocol strengthened

- **Ownership matrix** gained a new row: "Update VISION.md tree diagram if files added/renamed/deleted" (Claude's responsibility).
- **Step 1 footer** now documents the exact triggers for a tree update (file added / renamed / deleted / role changed) and cites the past failure (cold-AI audit #4 found `-hosted/` folder missing from tree) so future agents don't repeat.

### Worker

`SERVER_INFO.version` bumped `3.0.4` → `3.0.5` per patch-level policy (observable behavior additions: new response header, new `/robots.txt` handler). No client-facing behavior change.

## [6.35.0] - 2026-04-23

### Docs — comprehensive README polish pass

Round of user-driven README fixes + cold-AI audit follow-ups. README-only release (npm tarball updated so `npm view` / package-page readers see the current doc).

**Changes:**

- **🚨 API PERMISSIONS section promoted** above "Two ways to connect" — catches the most common first-user trap ("my AI can list members but can't create a page") before the install path. Added a dedicated tip on unchecking `delete` actions if you want to prevent the AI from destructive operations while keeping read / create / update.
- **Claude Desktop cosmetic-banner warning moved** from the top-of-README requirements block → the Claude Desktop setup section (where it actually matters). Less noise for users on other platforms.
- **BD API key requirement** split across three lines (heading, steps, walkthrough link) so the Full-Walkthrough link isn't buried in a single-block sentence.
- **Merged redundant Quickstart + Setup-by-Platform Easy blocks** — previously the same config block appeared twice with slight variation, now one canonical block at the top of Setup-by-Platform.
- **Split Claude Desktop menu path** — "Menu bar → Settings → Developer tab → Edit Config" was one cramped line; now three sub-lines with blank spaces for readability.
- **Standardized server-name everywhere** from mixed `bd-api` / `brilliant-directories` to **`brilliant-directories`** (matches the npm package name and repo name; more obvious for readers scanning their config). 17 call sites updated.
- **Claude Code Easy path added** — previously the section claimed "No Easy path for Claude Code yet" (outdated). Claude Code CLI fully supports `claude mcp add --transport http <name> <url> --header "X-Key: value"` per the current Anthropic docs. Section now shows both Easy and Advanced paths, same as every other client.
- **Decluttered the Claude-extension-vs-Cursor-native config table** — was cramming Windows + Mac/Linux paths into one cell with `<br>` tags. Rewrote as two clean subsections with one path per line.
- **n8n compatibility row corrected** — was ⚠️ "Broken upstream, use HTTP Request instead" but n8n's MCP Client Tool actually works fine via SSE transport against our `/sse` path. Row now ✅ "Works via SSE" with a pointer to the n8n section for exact field values.
- **Universal MCP Client Reference table** gained an explicit "n8n is the exception — uses SSE + `/sse` path" note so readers don't apply the Streamable HTTP guidance to n8n and hit the upstream bug.
- **Filter Operators section updated to current reality** — previously said most operators were "in QA and rolling out shortly." They shipped. Now documents what works NOW (`=`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `not_in`, `LIKE`) and what's confirmed broken (`between`, `is_null`, `is_not_null`, empty-string `=""`) with client-side fallback guidance.
- **Codex CLI plan list corrected** — OpenAI renamed "Team" → "Business" in 2024. Updated to the current list: "Plus / Pro / Business / Edu / Enterprise".
- **Custom GPT line de-counted** — "Custom GPT Actions cap at 30 ops (our MCP has 170+)" violated the project's "no hardcoded counts in agent-visible text" rule. Replaced "170+" with "many more than 30" (count still drift-proof, point still clear).
- **UI name drift corrected** — Authentication table said "Admin → Developer Tools → API Keys", contradicting the 7+ other references to "Developer Hub → Generate API Key". Standardized on Developer Hub everywhere.
- **Broken TOC + Compatibility Table anchors fixed** (late v6.34.0 follow-through verification): `#using-claude-cli-inside-cursor` → `#using-the-claude-extension-inside-cursor`, `#claude-code-cli` → `#claude-code`, `#cline` → `#cline-vs-code-extension`, `#chatgpt` → `#openai-chatgpt--codex`. TOC `#authentication` merge split into 6 individual entries matching the 6 actual headings.

## [6.34.0] - 2026-04-23

### Fixed — broken anchor links in README MCP Client Compatibility table

Three in-table anchor links pointed at slugs that didn't match actual heading slugs:
- `#claude-code-cli` → real slug is `#claude-code`
- `#cline` → real slug is `#cline-vs-code-extension`
- `#chatgpt` → real slug is `#openai-chatgpt--codex`

Plus the Table of Contents had one broken anchor: `#using-claude-cli-inside-cursor` → real slug `#using-the-claude-extension-inside-cursor` (heading changed from "CLI" to "extension" in a prior release, TOC didn't follow). Fixed all four so every TOC / Compatibility Table link resolves.

### Fixed — TOC entry merged 6 sections into one anchor

TOC had a single entry "Authentication, Rate Limits, Pagination, Filtering, Sorting, Resources" pointing at `#authentication`, but the sections are separately-headered. Split into 6 individual TOC entries, one per section. Also corrected "Resources" → "Available Resources" (the actual heading text).

### Fixed — Worker CORS advertised `authorization` header but Worker ignored it

`access-control-allow-headers` listed `authorization`, but `extractAuth()` only reads `X-Api-Key` + `X-BD-Site-URL`. Browser clients doing a CORS preflight would think Bearer-token auth was available, then get HTTP 401 "Missing X-Api-Key" at request time — confusing debug experience. Removed `authorization` from the allow-list with a comment noting that if Bearer auth is ever added, BOTH the CORS allow-list AND `extractAuth` need to change together.

### Fixed — Worker `toolCount` in GET / info endpoint was hardcoded to `173`

The root info endpoint returned `toolCount: 173` from a hardcoded fallback. This violated the project's "spec is source of truth" principle — if BD added a new endpoint to the spec, the info page would keep saying 173 while the actual tool surface grew. Now derives the count from `buildToolList(spec).length` at request time (honoring `TOOL_ALLOWLIST` + `HIDDEN_TOOLS`), matching exactly what `tools/list` would return. On spec-fetch failure, surfaces `null` instead of a wrong number. Worker `SERVER_INFO.version` bumped to `3.0.4`.

### Fixed — README hardcoded `173 tools` in 6 places

README mentioned "173 tools" / "~173-tool surface" in 6 locations. Violated the same "no counts in agent-visible text" rule documented in VISION. Counts drift every minor release. Replaced with "every BD tool" / "every BD operation" / "the full BD tool surface". Exact count always derivable from `openapi/bd-api.json`.

### Fixed — VISION current-state header + tool-count inconsistency

- Current-state header bumped from `v6.32.0, Worker v3.0.1` to `v6.34.0, Worker v3.0.4` to match the latest shipped release.
- Three places in VISION said "173 tools" while one said "~174 tools" — even the count itself was inconsistent. Replaced all four with "every operation in `openapi/bd-api.json`" / "every BD tool" phrasings that don't rot.

### Fixed — SKILL.md installation recap deprecated Easy path

The "Installation recap for the user" section led with `npx ... --setup` wizard (Advanced path) as the primary instruction. README has led with Easy (hosted) since v6.30.0; SKILL.md was stale. Rewrote to lead with Easy (hosted Worker + 2 headers), Advanced (setup wizard) as secondary option, keeping both in the recap for completeness.

### Maintenance — date-disambiguation note added to architecture memory

Three separate cold-AI audit passes flagged "2026-04-22 vs 2026-04-23 date drift" — a false positive each time. The two dates refer to different events: everything about the SDK rewrite, domain purchase, and migrations happened on 2026-04-22; the `mcp.brilliantdirectories.com` retirement happened on 2026-04-23. Added an explicit disambiguation block in `project_mcp_do_architecture.md` so future audit passes stop re-flagging this.

### Worker

`SERVER_INFO.version` bumped `3.0.3` → `3.0.4` per the patch-level policy (observable behavior change: `toolCount` now derived from spec instead of hardcoded; CORS `authorization` header removed).

## [6.33.0] - 2026-04-23

### Fixed — MAINTENANCE HYGIENE header in `mcp/index.js` named fictional constants

The header block listed `USER_KEEP / POST_KEEP / CATEGORY_KEEP / POSTTYPE_KEEP / WEBPAGE_KEEP / PLAN_KEEP` as medium-risk mirrors — but none of those identifiers exist in the file. Real names are `USER_LEAN_ALWAYS_STRIP`, `USER_LEAN_SEO_BUNDLE`, `PLAN_ALWAYS_KEEP`, `PLAN_CONFIG_FIELDS`, `PLAN_DISPLAY_FLAG_FIELDS`, `POST_TYPE_CODE_BUNDLE`, `WEB_PAGE_CODE_BUNDLE`, `CATEGORY_SCHEMA_BUNDLE`, etc. A cold-AI maintainer searching for `USER_KEEP` found nothing. Now lists every real constant by its actual name, grouped by family. Same header also incorrectly listed `POST_READ_EXCLUSIONS` as a local mirror — that constant only exists in `scripts/schema-drift-check.js`. Corrected with a cross-reference note.

### Fixed — `BD_API_KEY_REGEX` comments contradicted its actual regex

Regex uses `/i` flag (case-insensitive), but two separate comment locations in `src/index.ts` said "32 lowercase hex chars". Aligned the comments to "32 hex characters (case-insensitive; BD issues lowercase)" — the regex is defensive for copy-paste case-normalization; BD's server lookup is also case-insensitive.

### Added — `SLOTS_WITH_DEFAULTS` now called out as a known drift-risk

The `getBrandKit` synthetic tool hand-maintains 20 `custom_N` slots with default values (`mcp/index.js`). This is a fourth mirror tier alongside the documented lean keep-lists and `WRITE_KEEP_SETS` — but drift-check does NOT currently validate it. If BD adds a new `custom_209` for a brand color or font, `getBrandKit` silently won't expose it. Known gap documented in MAINTENANCE HYGIENE tier table; no automated check added this release (would require spec-agnostic scan of `website_design_settings`).

### Added — `HIDDEN_TOOLS` expansion policy (Worker)

When another tool needs hiding, cold-AI maintainer now has an explicit 5-step checklist: add to Set, mirror in npm, reference drift-check's CHECK 1, add CHANGELOG entry with one-line reason, remove public README/SKILL references if present.

### Added — `SECURITY_HEADERS` scope clarification

Previously comment said "every public endpoint." Corrected: the HSTS / nosniff / Referrer-Policy headers ARE wrapped on GET /, OPTIONS, 401 auth errors, 404 not-found — but NOT on `agents/mcp` SDK-dispatched transport responses (serveSSE / serve). Zero practical impact because MCP clients don't evaluate these headers, but the comment was overstating coverage.

### Added — lean-shaper mutation contract documented

`applyWriteLean` (and the 6 applyXxxLean read shapers) mutate `body` in place AND return the same reference. The tool-call pipeline relies on mutation and discards the return value. Noted explicitly so a future maintainer doesn't "clean up" by making them return fresh objects (which would silently break the pipeline).

### Added — `jsonSchemaToZodShape` default-to-string footgun noted

Any unknown `type:` value in the OpenAPI spec (e.g. `"object"`, typos, nested schemas without a top-level type) silently becomes `z.string()`. If a future spec author adds a nested object schema, agents will pass real objects and Zod will reject with a cryptic "expected string" error. Documented with the fix recipe (add `case "object":` branch) inline.

### Added — `parentPK` fallback rationale in EAV write path

The tool-call handler resolves parent PK via `args[pk] || bdBody.message[pk]`. For the only EAV route today (updateWebPage), the first branch always hits. The fallback is future-proofing for `createWebPage` — when the agent doesn't know the new PK, BD assigns it and we'd read it from the create response. Documented so future maintainers don't delete as dead code.

### Added — SSE session-ID trust model articulated

Skipping auth on `POST /sse/message` was previously documented only as "auth was validated at GET /sse; don't change this or n8n breaks." Now includes the full trust model: cryptographically-random 64-char hex sessionId + TLS + short-lived + no cold-start persistence = hijack-via-stolen-sessionId is a non-threat. Explicit guidance on when this would need to change.

### Added — `eav_results` response contract documented (Worker)

`writeEavFields` returns an array of per-field result objects that the handler attaches as `bdBody.eav_results`. This field is NOT in the OpenAPI spec and has no TypeScript type. Full JSDoc contract (shape of each result, how agents should inspect, when the field is missing) added above `writeEavFields`.

### Added — `zod: ^3.25.76` caret-range rationale (asymmetry with agents)

Previous comments singled out `agents: ^0.1.0` as a caret-range risk without explaining why zod's caret was OK. Documented: zod 3.x is stable (semver-stable semantics despite pre-1.0 name), agents is explicitly 0.x pre-1.0 (ships breaking changes in minors), `@modelcontextprotocol/sdk` is exact-pinned by our policy despite being stable.

### Added — `applyCategoryLean` pattern divergence note (npm)

`applyCategoryLean` uses an early-return all-or-nothing pattern instead of the multi-axis include-object pattern in applyUserLean / applyPostLean / applyPlanLean. Documented why: categories have only ONE optional bundle, so early-return is simpler + equivalent. Note covers the refactor trigger ("if category_* include flags multiply, migrate to include-object pattern").

### Added — `show_sofware` typo warning mirrored in drift-check

v6.32.0 CHANGELOG claimed the "BD column-name typo, don't fix" warning was added to both `mcp/index.js` and `scripts/schema-drift-check.js`. It was only in the former (the drift-check mirror was lost when dead `*_KNOWN_FIELDS` sets were deleted). Added a standalone comment in the drift-check script so the CHANGELOG's earlier claim is now true.

### Removed — version-number markers in code comments

Stripped `// v6.15.0`, `// v6.16.0`, `// v6.17.0`, `// v6.19.0`, `// v6.20.0` markers from section headers and inline comments in `mcp/index.js`. These violated the `feedback_no_versions_in_agent_text.md` rule (version strings go in CHANGELOG only). Where a version reference was load-bearing, replaced with "search CHANGELOG.md for X" or the referenced concept name. Worker's single v6.32.0 reference kept because it documents a deferral decision (appropriate context).

### Worker

`SERVER_INFO.version` bumped from `3.0.2` → `3.0.3` per the patch-level policy (observable behavior addition: new comments on existing paths). Worker code behavior unchanged except for the enhanced security-headers comment; stale-fallback logging, TTL, init-retry all from v6.32.0 unchanged.

## [6.32.0] - 2026-04-23

### Fixed — Worker bug: `_initPromise` now clears on failure

If `_doInit()` rejects (e.g. GitHub raw is temporarily unreachable AND there's no stale cache to fall back on), the rejected promise previously stayed cached in `_initPromise` for the lifetime of that Durable Object isolate — every subsequent request on the same DO would re-await the same rejection, creating a silently-wedged session. Now wrapped in `.catch()` that clears `_initPromise` and re-throws, so transient GitHub outages self-heal on the next request. Worker `SERVER_INFO.version` bumped to 3.0.2.

### Fixed — silent stale-fallback in `loadSpec` / `loadInstructions` (Worker)

When GitHub returns non-2xx, the Worker quietly served cached spec/instructions with zero log output, giving maintainers no signal during a "spec edits aren't propagating" debug session. Now emits `console.warn("[loadSpec] stale-fallback: ...")` with HTTP status + cache age. Shows up in Cloudflare Dashboard Logs for real-time debugging.

### Fixed — `loadInstructions` now has TTL (Worker)

Previously cached indefinitely, which contradicted the documented "5 min propagation" story for spec edits. Now uses `SPEC_CACHE_TTL_MS` + stale-fallback, symmetric with `loadSpec`. Instruction-corpus edits (`openapi/mcp-instructions.md`) will now propagate within 5 min on next DO init trigger, matching the spec.

### Fixed — npm package: `INSTRUCTIONS` fallback comment was copy-pasted from Worker

Said "the Worker still functions" in the fallback-to-empty-string branch. Corrected to "this npm package still functions" — tool definitions still work if `openapi/mcp-instructions.md` is missing from the tarball, only the agent-directives block is lost.

### Added — OBSERVABILITY section in Worker header

New in-file section explaining where `console.log`/`console.warn` output goes (Cloudflare Workers Logs tab + `wrangler tail`), log retention (~3 days on free plan), what's logged deliberately (boot telemetry, per-call abuse visibility, stale-fallback signals), and what's deliberately NOT logged (request bodies, API keys, BD response payloads). Gives cold-AI maintainers a clear mental model of the observability surface.

### Added — inline bump policies + scope notes in Worker

- `SERVER_INFO.version`: inline MAJOR/MINOR/PATCH policy (added last release, expanded this release).
- `EAV_ROUTES`: scope note — only `updateWebPage` has EAV today; other write ops handle EAV transparently BD-side; don't speculatively add new routes.
- `WRITE_KEEP_SETS`: "intentionally incomplete" note — don't add speculatively; observe BD's actual response first.
- `compatibility_date` in `wrangler.toml`: when-to-bump guidance (never opportunistically; only on Cloudflare deprecation announcement or SDK requirement).
- `workers_dev = true` in `wrangler.toml`: explicit "publicly reachable, NOT covered by WAF rate-limit rule" security note.
- Zod integer/number laxness (Worker `jsonSchemaToZodShape`): documented the `25.5` edge case.
- `server.tool()` deprecation hint: expanded comment on why migration to `server.registerTool()` is deferred (hint-level, options-object signature adds ~173 lines of boilerplate, SDK is pinned so the hint is frozen).

### Added — inline comments for magic/named constants (npm + drift)

- `PACKAGE_VERSION` "unknown" fallback rationale (npm `index.js`).
- `IN_FLIGHT_REQUESTS` single-threaded assumption (npm `index.js`).
- `SENSITIVE_KEYS` debug-only scope, already clear but bolded (npm `index.js`).
- `AUTHOR_SUMMARY_FIELDS` per-field rationale (already in place, confirmed adequate).
- `custom_208` null-fallback for heading font in `getBrandKit` (already in place).
- `CLIENT_MAP` `print` vs `other` distinction (same key, different label — UX intent).
- `show_sofware` BD DB-column-name typo: "don't fix this" warning in both `index.js` and `schema-drift-check.js`.
- Drift CHECK 7 heuristic's known false-negative patterns documented inline.
- `applyWriteLean` nested-response-shape limitation documented.

### Removed — dead `*_KNOWN_FIELDS` sets in `schema-drift-check.js`

Five aggregator sets (`USER_KNOWN_FIELDS`, `POST_KNOWN_FIELDS`, `POST_TYPE_KNOWN_FIELDS`, `WEB_PAGE_KNOWN_FIELDS`, `PLAN_KNOWN_FIELDS`) were defined but never consumed by any CHECK in the drift script. A cold-AI audit flagged them — the original intent was a CHECK 9 "unknown field in spec response" validator that never shipped. Removed along with the 8 source constants they aggregated and the misleading console.log epilogue that told users to add false-positive fields to the now-deleted sets. ~100 lines of dead code gone. Drift check still exits 0 clean.

### Added — MAINTENANCE HYGIENE header in `mcp/index.js`

Previously v6.30.0's CHANGELOG claimed this section was added to both the Worker and npm. It was only in the Worker. v6.31.0 actually landed it in npm. This release confirms the claim.

### Docs — VISION.md + memory consistency pass

- VISION §"Current state" header updated from v6.27.0 to v6.32.0 / v3.0.1 (since-updated to v3.0.2 this release).
- All 3 URLs (primary / backup / retired) now listed explicitly in VISION §"Universal HTTP MCP server" so operators reading VISION alone can find the workers.dev backup URL.
- `x-bd-domain` vs `X-BD-Site-URL` header-name warning promoted from inline comment to its own bullet with both required headers bolded and the wrong typo explicitly called out with ❌.
- `SERVER_INFO.version` bump policy cross-referenced from `project_mcp_do_architecture.md` memory with a full table (don't just tell the operator to go read a code comment).
- TRAP 2 memory entry updated to document the v6.32.0 clear-on-failure fix.

## [6.31.0] - 2026-04-23

### Added — MAINTENANCE HYGIENE header section in `mcp/index.js`

Previously the v6.30.0 CHANGELOG claimed this section existed in both the Worker and the npm package, but it was only in the Worker. Now actually added to `mcp/index.js` too, with the same HIGH / MEDIUM / LOW drift-risk tier table and the three-file-fix-list pointer. This gives cold-AI maintainers the same orientation when they land in the npm package as when they land in the Worker.

### Fixed — `schema-drift-check.js` EAV false-positive guard

The EAV-drift check (CHECK 6) scans `updateWebPage` request-body properties for `hero_*` / `h[12]_*` / `disable_*` / `linked_*` names that aren't in `eavFields`. Some fields matching the pattern are stored directly on `list_seo` (not EAV-routed) — those were causing false-positive warnings. Added a `EAV_PATTERN_EXCLUSIONS` opt-out set with `disable_css_stylesheets` as the first entry. Documented how to add more when BD ships a new non-EAV field that matches the pattern.

### Removed — dead `findUnregisteredReadTools` call in drift check

The post-read check was restructured to a manual inline scan (so it could express `POST_READ_EXCLUSIONS`) but left a no-op generic-helper call behind. Removed and replaced with a comment explaining why there's no generic helper call here.

### Maintenance — doc comments on magic constants

Based on a cold-AI audit that found several "why this value?" gaps, added rationale comments to constants in both the Worker and npm package. Covers: `SPEC_CACHE_TTL_MS` (5 min rationale + extracted `SPEC_EDGE_CACHE_TTL_S` derived constant to prevent memory/edge cache drift), the 25s outbound fetch timeout, `limit: 100` in `writeEavFields`, npm `makeRequest` 30s timeout (matches BD's `max_execution_time`), 5s shutdown drain, `SENSITIVE_KEYS` redaction scope, `AUTHOR_SUMMARY_FIELDS` per-field rationale, `custom_208` heading-font fallback, the `buildTools` skip-list, `compatibility_date = "2025-03-10"`, `nodejs_compat` flag, `new_sqlite_classes` (McpAgent SDK requirement), and `agents: ^0.1.0` caret-range pinning discipline.

### Added — inline EAV-field addition checklist + `SERVER_INFO.version` bump policy (Worker)

Two inline doc blocks in `src/index.ts`:
- Above `EAV_ROUTES`: 5-step checklist for "BD added a new hero_* field to updateWebPage, what do I do?" — drift-check, fix in 2 places, re-verify, ship, false-positive exception path.
- Above `SERVER_INFO`: MAJOR / MINOR / PATCH bump policy + reminder that it's deliberately NOT synced to npm SemVer.

## [6.30.0] - 2026-04-23

### Changed — `mcp.brilliantdirectories.com` legacy URL retired

The legacy custom-domain binding `mcp.brilliantdirectories.com` was unbound from the Worker. That URL no longer resolves (`getaddrinfo ENOTFOUND`). The single canonical URL for the hosted BD MCP endpoint is now `https://brilliantmcp.com`.

**What this means for customers:** if you have an existing AI-client config pointing at `mcp.brilliantdirectories.com`, update the URL to `brilliantmcp.com`. Everything else (headers, tools, behavior) is unchanged — just swap the hostname.

**Why retire instead of fork the URL to both:** the `brilliantdirectories.com` parent zone has security rules (Bot Fight Mode, geo-blocks) that protected the marketing site but silently rejected n8n's handshake. Keeping both URLs alive would mean permanently maintaining a "this one works for some clients, not others" split. `brilliantmcp.com` works for 100% of MCP clients (Claude Desktop, Cursor, Claude Code, MCP Inspector, n8n) — one URL, one answer.

### Docs — `README.md`, `mcp/README.md`, `SKILL.md` updated

All public-facing setup docs now point exclusively at `https://brilliantmcp.com`. The "why a dedicated domain" callout simplified: it's no longer "primary vs legacy fallback" framing — it's "the single canonical URL, here's why we use a dedicated zone."

## [6.29.0] - 2026-04-22

### Added — schema-drift detector script

New `scripts/schema-drift-check.js` — a production-quality drift detector that compares `openapi/bd-api.json` against the hardcoded constants mirrored inside `mcp/index.js` (npm) and `bd-cursor-config/brilliant-directories-mcp-hosted/src/index.ts` (Worker). Runs in ~1 second, exits 0 on clean, 1 on drift, 2 on script error. Eight distinct checks:

- `HIDDEN_TOOLS` — every entry exists as an operation in the spec
- Family membership — per-family lean keep-sets only list real operations
- `WRITE_KEEP_SETS` — every entry exists in the spec
- EAV route existence — `EAV_ROUTES` entries exist in the spec
- Unregistered read tools — spec has a `listX`/`getX` op but no lean-shaper registered
- EAV drift — `users_meta` field names matching `hero_*` / `h[12]_*` / `disable_*` / `linked_*` patterns that aren't routed via EAV
- Body-property identifier existence — `WRITE_KEEP_SETS` keys resolve to real request-body identifiers
- Tool count sanity — spec has ~173 tools as expected

First run on 2026-04-22 found three real drifts, all fixed in this release.

### Fixed — `WRITE_KEEP_SETS` drift (Worker + npm)

- Removed `createPostType` entry — that tool was deleted from the spec in a prior release; the stale key was a no-op but triggered the drift check.
- Added `subscription_id` + `profession_id` to the User write-echo keep-set. Without these, create/update User responses were echoing old values on membership-plan / category transitions, which callers relied on to confirm the write persisted.

### Fixed — `EAV_ROUTES` drift (Worker)

Added nine `users_meta` hero fields that BD shipped to the spec but the Worker's EAV routing table had missed. Without routing, writes to these fields went into the wrong storage path and silently dropped on read.

### Maintenance — drift-risk tiers documented in code

`src/index.ts` (Worker) and `mcp/index.js` (npm) now include a "MAINTENANCE HYGIENE" header section labelling every hardcoded constant by drift-risk tier (🔴 HIGH / 🟡 MEDIUM / 🟢 LOW). Pairs with `scripts/schema-drift-check.js` so a cold AI or dev-team member can see what to re-check when the spec evolves.

### Changed — public README URL: `brilliantmcp.com` is primary

References across `README.md` and `mcp/README.md` updated from `mcp.brilliantdirectories.com` to `brilliantmcp.com`. The primary remote-MCP URL is now `https://brilliantmcp.com` — a dedicated clean zone without the Bot Fight Mode / geo-blocks that protect the main `brilliantdirectories.com` zone. Legacy URL `mcp.brilliantdirectories.com` remains bound as a fallback so existing customer configs don't break. n8n specifically required the clean-zone URL to connect; other clients work against either.

## [6.27.0] - 2026-04-22

### Changed — agent instructions extracted to a shared file (source of truth)

The ~67KB top-level `instructions` array was inlined into `mcp/index.js` as a 700-line template-literal block. It's now extracted to `openapi/mcp-instructions.md` — a plain markdown-ish text file — and both transports read from it:

- **npm package** (`mcp/index.js`) reads it at module load via `fs.readFileSync(path.join(__dirname, "openapi", "mcp-instructions.md"))`.
- **Cloudflare Worker** (Universal HTTP MCP server at `mcp.brilliantdirectories.com`) fetches it at runtime via `https://raw.githubusercontent.com/.../main/openapi/mcp-instructions.md` with a 5-min TTL cache and stale-fallback on GitHub hiccups.

**Why:** the Worker previously had NO instructions — just the tool catalog. Remote-MCP clients (Cursor remote, Claude Desktop remote, MCP Inspector) got tool descriptions but missed the cross-cutting directives (users_meta safety, lean-by-default, operator reference, image sourcing priority, CDATA self-strip, etc). This change gives both transports the full corpus. Edit the markdown file once, ship to both.

**Byte-identical verified:** the extracted file produces the exact same string the old inline array did. Zero behavior change for existing stdio clients. Regression script: `scripts/verify-instructions-match.js`.

Two new helper scripts in `scripts/`:
- `extract-instructions.js` — one-shot extraction (already run; idempotent)
- `swap-instructions.js` — one-shot refactor (already run; idempotent)
- `verify-instructions-match.js` — regression gate, re-runnable

`mcp/index.js` went from 2,325 → 1,621 lines. The shipped npm tarball size is unchanged (instructions just moved, not added).

### Added — Universal HTTP MCP Worker now serves `instructions` via `initialize`

The Cloudflare Worker at `https://mcp.brilliantdirectories.com` now populates the `instructions` field in its MCP `initialize` response with the shared-file content. MCP-aware clients (Claude Desktop, Cursor, MCP Inspector) load these as session directives. Clients that don't honor `instructions` still work — they get tool descriptions only (same as before this release).

## [6.26.0] - 2026-04-21

### Added — confirmed filter operators now documented in instruction block

BD deployed broader operator support than we were relying on. Live-tested across users, posts, leads, and ran an edge-case sweep — results substantially better than prior docs claimed.

**Now confirmed working** on every `list*` tool (BD's `/{resource}/get` list-style endpoints):

- `=` (was already in)
- `!=` — returns rows NOT matching the value
- `>=` (and by extension `>`, `<`, `<=` using same pattern)
- `in` — OR-on-values for one field, comma-separated; unmatched values silently skipped
- `not_in` — inverse of `in`
- `LIKE` — with `%` wildcards or without. Previously returned "user not found" on populated columns; that regression is gone.
- **Multi-condition AND via array syntax** — `property[]=A&property_value[]=X&property_operator[]==&property[]=B&property_value[]=Y&property_operator[]==` — all conditions must match. Use this for compound lookups like "Jasons in LA" or join-table pre-checks (lead_matches pair, tag relationship triple).
- Zero-sentinel `=0` on integer FK fields — returns rows where the FK is unset.

**Not supported or broken (BD returns HTTP 400 or silent-drops):**

- `between` — HTTP 400 across every resource tested. Use `>=` + `<=` combined via multi-AND for ranges.
- `is_null` / `is_not_null` — silently drops on some endpoints (returns full unfiltered dataset — dangerous agent trap). Do not use.
- `property_value=""` with `=` — HTTP 400. For finding empty-string fields, paginate and filter client-side.

**No native OR across different fields.** `in` is OR-on-values for a single field. For `A=X OR B=Y` across two different fields, two calls + client-side merge.

### Changed — retired "CLIENT-SIDE intersect" workaround in 3 places

The workaround for unsupported multi-condition filters is now unnecessary since server-side AND via array syntax works. Updated:

- Top-level filter rule — removed "multi-condition not honored" claim
- Create-side duplicate pre-check (pair/composite uniqueness) — now uses server-side multi-AND in one call instead of server-filter + client-intersect
- users_meta orphan cleanup after parent delete — now filters server-side by both `database` and `database_id` together

## [6.25.1] - 2026-04-21

### Fixed — `mcp/README.md` out-of-sync with root `README.md`

The npm package ships `mcp/README.md` as its displayed README on npmjs.com. That copy had drifted from the canonical root `README.md`: older "Before you start" heading (no ⚠️), less-prominent permissions callout (no 🚨), and hardcoded tool-counts (violates the "no versions/counts in agent-facing text" rule).

Overwrote `mcp/README.md` with the current root `README.md` so npm users and GitHub visitors see the same content. Going forward both files must stay in lockstep — any edit to one is an edit to the other.

## [6.25.0] - 2026-04-21

### Added — widgets now lean-echo on create/update (WRITE_KEEP_SETS)

`createWidget` / `updateWidget` were not in the write-response lean-shaper list. On a site with large template widgets (Admin - Froala Editor Scripts is ~204KB of `widget_data`), every write echoed the full ~220KB record back for no reason — agents only need "did it land, what's its identity?" Added both to `WRITE_KEEP_SETS`.

**Keep-set (7):** `widget_id`, `widget_name`, `widget_type`, `widget_viewport`, `short_code`, `date_updated`, `revision_timestamp`.

Stripped on write echo: `widget_data`, `widget_style`, `widget_javascript` plus admin-form residue.

**Measured impact:** `updateWidget` on widget_id=31 drops from ~219KB down to ~0.4KB. ~99.8% reduction, largest single-op win in the lean-shaping series.

### Added — 4xx auto-recovery directive

New paragraph in server instructions: on 401/403, agents call `verifyToken` once to distinguish revoked-key (regenerate in Developer Hub) from endpoint-permission-off (enable the specific endpoint on the key). Do NOT call `verifyToken` on 400 (payload), 404 (missing record), 429 (rate limit), or 5xx (server). Max one verify per failure — no retry loops. Gives users precise next steps instead of generic "it failed."

### Added — smoke test with `prepublishOnly` hook

New file: `mcp/__tests__/smoke.js`. Spawns the MCP over stdio, calls 8 lean-shaped `list*` endpoints, asserts row key counts stay under site-calibrated ceilings and that heavy fields (`content`, `password`, `services_schema`, `post_content`, `group_desc`, plan config fields, post-type code templates) never leak into baseline responses.

Wired into `mcp/package.json` as `prepublishOnly` — `npm publish` auto-runs it and aborts publish on failure. Catches the exact class of regression the v6.24.0 MembershipPlans shaper-inversion bug was (9 keys → 168 keys would fail the assertion loudly).

Requires `BD_API_KEY` + `BD_API_URL` env vars on the publish machine. Runs in ~7s.

### Verified — 200KB widget byte-exact round-trip

Live-tested widget_id=31 (Admin - Froala Editor Scripts, 204,267 chars of HTML/PHP/JS, 3,609 `\r\n` pairs). Appended a 34-char marker, PUT to `/api/v2/data_widgets/update`, GET-back, sha256 compared.

- **Payload up:** 276KB urlencoded
- **Round-trip time:** ~3.9s PUT + ~2.6s GET
- **Integrity:** byte-exact match (sha256 identical), CRLF preserved, no stripping/truncation/charset mangling
- **Revert:** clean, sha256 returned to original

Confirms BD's `post_max_size=100M` + MCP forwarding layer handle 4k-line widgets with no special handling.

### Verified — emoji + 4-byte UTF-8 round-trip

Live-tested `updateUser` with `quote="Emoji test: 😀🚀❤️ / BMP: ✓★— / end"`. All three 4-byte emoji (U+1F600, U+1F680, U+2764 U+FE0F) plus BMP symbols stored byte-exact. No stripping, substitution, or entity-escape. No "no emoji" rule added to instructions — emoji work as of the test date on user-data tables.

### Hardened — CDATA / wrapper self-check on HTML-field writes

Existing rule banned `<![CDATA[...]]>` wrappers but agents kept wrapping. Added an explicit self-check instruction mirroring the existing `<parameter>` / `<invoke>` self-strip rule: if the final string starts with `<![CDATA[`, `<parameter`, or `<invoke>`, or ends with `]]>`, `</parameter>`, or entity-escaped HTML (`&lt;`/`&gt;`), strip before sending. Live symptom that triggered this: an `about_me` value saved as `"<![CDATA[<h3>Spotlight...</h3>..."` — rendered with literal `<![CDATA[` on the public page.

### Hardened — image sourcing priority (subject's site > Pexels > banned)

Replaced the single-paragraph "Pexels preferred" rule with an explicit 3-tier priority:

1. User-supplied URL
2. **The subject's own website** (for writes about a named real entity — Juilliard, Harvard, a specific business)
3. Pexels stock (fallback, only for generic/topic writes)

Named ban on Wikimedia / Wikipedia image URLs (`upload.wikimedia.org`, `commons.wikimedia.org`, `*.wikipedia.org/wiki/File:*`, `/thumb/` variants) — they enforce hotlink protection and serve error placeholders on live BD pages despite working in a browser. Live symptom that triggered this: agent used `https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/The_Juilliard_School_at_Lincoln_Center.jpg/1024px-...` for a Juilliard spotlight; Wikimedia returned a Foundation error image instead of the photo.

Also applied the sourcing rule to non-hero image fields (member `logo`/`profile_photo`/`cover_photo`, post `post_image`) — prior text was hero-only.

## [6.24.1] - 2026-04-21

### Fixed — MembershipPlans lean-shape was inverted; now a proper keep-list

Live audit surfaced that the prior shaper for `listMembershipPlans` / `getMembershipPlan` was a strip-list, not a keep-list. BD's `subscription_types` table has ~170 columns; the prior shaper only stripped the ~50 fields it knew about, letting ~120 fields leak through by default. Measured result: `list limit=5` returned ~27KB instead of the documented ~2.3KB.

Rewrote `applyPlanLean` as a keep-list, matching the pattern used by the write-response shapers. Behavior now matches documentation:

- **Always-kept (9):** `subscription_id`, `subscription_name`, `subscription_type`, `profile_type`, `monthly_amount`, `yearly_amount`, `initial_amount`, `lead_price`, `searchable`
- **`include_plan_config=1`** restores the 36-field config bundle.
- **`include_plan_display_flags=1`** restores the 13-field profile-visibility toggle bundle.
- Everything else is dropped regardless of whether BD knows about it or adds new columns later.

Admin-form residue (`form`, `save`, `save_`, `method`, `form_security_token`, `myid`, `result`, `noheader`, `rr8`, `id`) is no longer explicitly stripped — none of it is in the keep-list, so all of it drops automatically.

**Measured impact on launch60031:** `listMembershipPlans limit=5` drops from ~27KB (168 keys/row) to ~1.8KB (9 keys/row). ~93% reduction, matching the originally-documented target.

### Changed — `refreshSiteCache` now mandatory on CREATE + UPDATE WebPage (not just update)

Prior rule said refresh was only needed for updates. Turns out creates also need it — new pages are cache-gated at the router level, not just the render level. Without a post-create refresh, visitors may not reach the new URL at all, or may reach it but see stale scaffolding.

Three places updated identically: `refreshSiteCache` tool description (flipped the "do NOT use for new pages" line to a "required after every create AND every update" line), `createWebPage` description (now opens with the required post-step), `updateWebPage` description (same).

## [6.24.0] - 2026-04-21

### Added — `getSiteInfo` tool for session grounding

Wraps the new BD endpoint `/api/v2/site_info/get`. Read-only, no params, ~1KB response. Returns the site's identity + locale context + branding-asset URLs in one call: `website_name`, `website_phone`, `full_url`, `profession`, `industry`, `primary_country`, `language`, `timezone`, `date_format`, `distance_format`, `website_currency`, currency-formatting fields, and `brand_images_relative` + `brand_images_absolute` objects (8 asset slots each — logo, mascot, background, favicon, default_profile_image, default_logo_image, verified_member_image, watermark).

**Site-level `profession` and `industry` are NOT a member's `profession_id`.** They describe the archetype of member the directory lists and the market it serves — site settings, not per-member taxonomy. Directive makes this explicit to prevent conflation.

**Session-grounding directive** added to the top-level instructions block: agents should call `getSiteInfo` once on the first BD task of a conversation and cache for the session. `default_profile_image` from the response is the signal for detecting placeholder member photos.

### Added — lean-by-default on `listMembershipPlans` / `getMembershipPlan`

Plans had ~5-6KB per row with ~60 fields of mostly display toggles, photo/style/service limits, form names, sidebar slots, email-template references, upgrade chains, and admin-form residue. Most agents just need the plan IDs + names + pricing to pick one when creating a member.

**Always-kept (9):** `subscription_id`, `subscription_name`, `subscription_type`, `profile_type`, `monthly_amount`, `yearly_amount`, `initial_amount`, `lead_price`, `searchable`

**Stripped by default, opt-in flags (2):**

- `include_plan_config=1` — restores config bundle: active/searchable toggles, limits, forms, sidebars, email templates, upgrade chain, payment defaults, page headers/footers, display ads, index/follow rules, etc.
- `include_plan_display_flags=1` — restores profile-visibility toggles (`show_about`, `show_experience`, `show_education`, `show_background`, `show_affiliations`, `show_publications`, `show_awards`, `show_slogan`, `show_sofware`, `show_phone`, `seal_link`, `website_link`, `social_link`).

Also always-stripped: admin-form residue (`form`, `save`, `save_`, `method`, `form_security_token`, `myid`, `result`, `noheader`, etc.).

### Fixed — `include_profession` / `include_services` doc truth

Live probe confirmed `profession_schema: false` / `services_schema: false` on reads is not a bug — it's BD's honest signal for "FK doesn't resolve to a real record" (stale pointer, deleted category, or zero-value). Verified: user with `profession_id=1` returns `false` because only profession_ids `3` and `8` exist on that site; user with `profession_id=8` returns the full schema object. Doc updated to describe the resolution semantics honestly.

### Behavior parity

Same shape + dispatcher pattern as all prior lean-shapers (Users, Posts, Categories, Post Types, Web Pages). Write-response lean-shaping (from prior release) unchanged. Tool count: +1 (new `getSiteInfo`). Zero breaking changes.

## [6.23.0] - 2026-04-21

### Added — ultra-lean write-response shaping across 7 families

BD's `create*` / `update*` endpoints echo the full updated/created record in the response. That echo was the same fat shape as a fully-included read — on Users ~10KB, on populated Post Types 30-150KB, on content-heavy WebPages 10-30KB. Agents don't need any of that to confirm a write landed: primary key + identity fields are enough. Across a 5-member profile-photo import, live measurement showed ~125KB of response body spent where ~2KB would have sufficed.

Write responses are now **always lean**. Every `create*` / `update*` across users, posts (single + multi), post types, top + sub categories, and web pages returns a minimal keep-set: PK + identity (name / filename / title) + status. No nested schemas, no HTML body, no code templates, no embedded user object.

**`include_*` flags do NOT apply to write responses** — they only work on `get*` / `list*` / `search*`. If a caller needs the full record after a write, they call the matching `get*` with whatever `include_*` flags they actually want. The write echo is explicitly for "confirm and describe what changed" — not for full-record retrieval.

**Keep-sets per family:**

- **Users:** `user_id`, `first_name`, `last_name`, `company`, `email`, `filename`, `active`, `status`
- **Single-image posts:** `post_id`, `post_title`, `post_filename`, `post_type`, `user_id`, `post_status`, `data_id`, `data_type`, `system_name`, `data_name`, `post_image`
- **Multi-image posts:** `group_id`, `group_name`, `group_filename`, `user_id`, `group_status`, `data_id`, `data_type`, `system_name`, `data_name`, `revision_timestamp`
- **Post types:** `data_id`, `data_type`, `system_name`, `data_name`, `data_filename`, `form_name`, `revision_timestamp`
- **Top categories:** `profession_id`, `name`, `filename`, `revision_timestamp`
- **Sub categories:** `service_id`, `name`, `filename`, `profession_id`, `master_id`, `revision_timestamp`
- **Web pages:** `seo_id`, `seo_type`, `master_id`, `filename`, `nickname`, `title`, `meta_desc`, `h1`, `h2`, `revision_timestamp`

### Not touched

- **Read tools** (`get*` / `list*` / `search*`): unchanged. Existing lean-by-default + `include_*` opt-ins continue to work identically.
- **Error responses** (`{status:"error", message:"..."}`): passed through unchanged. Agents see BD's full error text including any actionable diagnostic.
- **Delete responses**: already minimal (`"record was deleted"` string). Not reshaped.
- **Tool surface**: unchanged (173 tools, identical names/schemas/enums/requireds). No breaking changes.

### Live-measured size impact (sample records on launch60031)

| Family | Before (full echo) | After (lean echo) | Savings |
|---|---:|---:|---:|
| Users | ~9,600 B | ~235 B | ~97% |
| Single-image posts | ~6,400 B | ~400 B | ~94% |
| Multi-image posts | ~7,700 B | ~400 B | ~95% |
| Post types (populated) | 30-150 KB | ~250 B | ~99% |
| Top categories | ~585 B | ~130 B | ~78% |
| Sub categories | ~330 B | ~180 B | ~45% (scales on populated rows) |
| Web pages (populated) | 10-30 KB | ~430 B | ~86-99% |

On a realistic bulk workflow (e.g. importing 50 members with profile images), this alone reclaims ~500 KB of context that was silently wasted on the write-echo path.

## [6.22.2] - 2026-04-21

### Changed — README polish

- Renamed "Before you start — 3 things you need" → "⚠️ REQUIREMENTS — Before you start." Draws the eye on the key precondition block.
- Reordered the 3 items: (1) Node.js → (2) BD site URL → (3) BD API key. URL comes before key since users often know their URL; the key step now links to the BD walkthrough at https://support.brilliantdirectories.com/support/solutions/articles/12000088768.
- Promoted the Advanced Endpoints permissions warning out of a nested blockquote into a prominent "🚨 PERMISSIONS — DO NOT SKIP THIS" callout. This is the single most common reason new integrations hit 403s on writes; it was buried before.
- Updated cross-reference anchors (`#before-you-start--3-things-you-need` → `#requirements--before-you-start`) in the ChatGPT Custom GPT and Cursor Directory sections.
- Removed specific tool-count numbers ("175", "~175") in the ChatGPT docs; replaced with "100+" so the docs don't need a bump every time operations grow.

Docs-only; no code/behavior change.

## [6.22.1] - 2026-04-21

### Changed — soften tone of the external-data-fetch rule

Reworded the opening of the data-fetch permission directive on `createUser` / `updateUser` from "Web scraping is permitted" → "Fetching publicly available business data is permitted." More accurate to what the workflow actually does (pulling business info from public websites the business publishes themselves), avoids agents adding preachy-refusal friction around the word "scraping," and keeps the spirit of the original.

No behavioral change; wording only.

## [6.22.0] - 2026-04-21

### Added — web-scraping permission rule on `createUser` / `updateUser`

Explicit, up-front permission for agents to scrape external listings for directory imports and data enrichment. Rule is scoped to the two operations that consume it (`createUser` and `updateUser` descriptions) — keeps the top-level instructions block lean.

**Image-fetch priority when scraping a listing:**

1. Logo image from the site's header/nav → `logo` field (businesses).
2. Headshot from Home, About, or Team page → `profile_photo` field (individuals).
3. Follow the site's social links → profile image there.

Pass the URL with `auto_image_import=1` so BD downloads and rehosts locally (avoids hotlinking).

**Not-found handling:** if no confident match, create/update without an image and report "no confirmed image found." Never substitute a stock photo or guess. Skip an entire record and find an alternate only when the user explicitly required images.

## [6.21.2] - 2026-04-21

### Changed — simplify hero gap-fix rule to page-type-scoped, nothing else

The `.hero_section_container + div.clearfix-lg {display:none}` CSS rule is now scoped by page type only: add on `seo_type=content` pages with hero; never on any other page type. Dropped the prior nuance about "first content section has a background color" — that was adding cognitive overhead without improving accuracy.

Stress-test with a blind agent on v6.21.1 got this inverted (included the rule on `profile_search_results`, omitted on `content`). Tighter wording should fix the ambiguity.

Three places updated identically: top-level instructions block, `createWebPage` description, `updateWebPage` description.

## [6.21.1] - 2026-04-21

### Fixed — scoped the hero-gap-fix CSS rule to `content` pages only

The `.hero_section_container + div.clearfix-lg {display:none}` snippet that closes BD's 40px white gap between a hero and a colored first-section was previously advised as "safe to include whenever hero is enabled." On `profile_search_results` and `data_category` pages that's wrong — the clearfix provides necessary spacing between the hero and the live search-results block; hiding it makes results butt-join the hero with no breathing room.

Rule corrected in three places:

- Top-level MCP instructions block (hero-defaults section)
- `createWebPage` OpenAPI description (hero sub-section)
- `updateWebPage` OpenAPI description (hero-edit sub-section)

All three now explicitly say: the gap-fix rule applies to `seo_type=content` pages only; NOT on `profile_search_results` / `data_category`.

## [6.21.0] - 2026-04-21

### Added — destructive-as-last-resort rule

Universal directive applying to every resource family: `delete*` ops, cascade-wiping field changes (`profession_id` change on `updateUser`, `images_action=remove_*`, `credit_action=deduct/override`), bulk schema edits — all require EXPLICIT user request. Agents must not choose the destructive path because it "feels cleaner." "Fix these pages" / "make them better" / "improve" are update requests, not delete-and-recreate requests.

Three-part rule embedded in the top-level instructions block:

1. Never silent-destructive. When a record exists but is wrong, the fix is `update*`, not `delete*` + `create*`.
2. If the user requests destruction explicitly, warn before firing. Quote what will be destroyed, tell the user it cannot be undone via the API, get explicit go-ahead.
3. If `update*` genuinely cannot reach the target state (wrong `data_type` on a post BD won't change; structural change the resource doesn't support), explain why to the user, propose delete+recreate, get confirmation, warn about undoability, then execute.

### Added — hero required as default on `profile_search_results` pages

These SEO-override pages underperform as thin-content on Google. End-users typically don't know to ask for a hero. Codifying it as a default makes the pattern reliable.

New required-default line on `createWebPage` / `updateWebPage` for `seo_type=profile_search_results` (unless user overrides):

- `enable_hero_section=1` + content-relevant Pexels `hero_image` + the 6 readability safe-defaults from the existing hero rule (`rgb(255,255,255)` H1/H2, `rgb(0,0,0)` overlay at 0.5, 100/100 padding). All color fields RGB only; source image per the Pexels workflow; call `refreshSiteCache` after write (hero is cache-gated).

User can opt out with `enable_hero_section=0`. Added to both the top-level MCP instructions block and the `createWebPage` operation description.

### Polish

- Corrected stale "across 3 resource families" → "5 resource families" in the row-weight section (stale since post types + web pages were added).
- Scrubbed version references from a code header comment (per the "no versions in agent-visible text" rule; see CHANGELOG for history instead).
- CHANGELOG footnote cleanup: v6.20.0 entry attributed Users lean-shaping to v6.14.0; actually v6.15.0.

## [6.20.0] - 2026-04-21

### Added — lean-by-default shaping on `listWebPages` and `getWebPage`

WebPages are the fifth resource family to get lean-shaping (after users, posts, categories, post types). Heavy asset fields are now stripped by default; agents opt in when they need them.

**Always returned:** all structural + metadata fields — `seo_id`, `seo_type`, `filename`, `title`, `meta_desc`, `meta_keywords`, `h1`, `h2`, `content_active`, `content_layout`, `form_name`, `menu_layout`, `enable_hero_section`, every `hero_*` field, etc.

**Stripped by default:** `content` (body HTML), `content_css`, `content_head`, `content_footer_html`.

**Opt-in flags:**

- `include_content=1` — restores `content` body HTML.
- `include_code=1` — restores `content_css`, `content_head`, `content_footer_html`.

**Why:** on sites with heavy pages a single `list_seo` row routinely runs 10-30KB once code assets are populated. A `listWebPages limit=25` without shaping can exceed 500KB — enough to trigger context truncation on long agent workflows. Most WebPage tasks only need metadata (enumerate existing pages, check `filename` uniqueness, read hero config); asset content is only needed before `updateWebPage` edits body/CSS/JS.

**Behavior parity:** matches the pattern established for Users (v6.15.0), Posts (v6.16.0), Categories (v6.16.0), and Post Types (v6.19.0). Same `applyXLean` + `X_READ_TOOLS` + dispatcher hook shape; same instruction-block pattern in the row-weight section. No new surface area, no breaking changes.

### Code-level

- New: `applyWebPageLean(body, includeFlags)` in `mcp/index.js`
- New: `WEB_PAGE_READ_TOOLS` set (`listWebPages`, `getWebPage`)
- New: `WEB_PAGE_LEAN_INCLUDE_FLAGS` (`include_content`, `include_code`)
- New: `WEB_PAGE_CODE_BUNDLE` (the 3 stripped code fields)
- Wired into existing dispatcher lean-flag extraction and response-shaping ladder
- `openapi/bd-api.json`: added `include_content` + `include_code` params to `listWebPages` and `getWebPage`; extended operation descriptions to document the lean shape

### Not touched

Tool surface unchanged (173 tools, identical names/schemas/enums/requireds). `createWebPage`, `updateWebPage`, `deleteWebPage` write paths unchanged. `searchWebPages` does not exist as an operation — no change needed there.

## [6.19.1] - 2026-04-21

### Changed — scrub internal test-site references from public docs

Replaced references to an internal dev site (`studev29106.directoryup.com`, `launch60031.directoryup.com`) in `docs/api-users.md` and earlier `CHANGELOG.md` entries with generic placeholders (`yoursite.example.com`). No code changes; docs-only patch.

## [6.19.0] - 2026-04-21

### Removed — `createUserMeta` hidden from the agent tool surface

BD auto-seeds `users_meta` rows on parent-record create for every EAV field the parent supports. Exposing `createUserMeta` to AI agents invites misuse: writing orphan rows with wrong `database_id`, duplicating auto-seeded rows, or creating rows for keys BD doesn't recognize on that parent table. The tool is now excluded from `tools/list` via a `HIDDEN_TOOLS` set in the tool-registration loop. BD's API still has the endpoint; the MCP wrapper just doesn't register it.

Agent-facing workflow is now: `listUserMeta` -> `updateUserMeta` if a row for that key exists. If no row exists, the parent doesn't support that EAV key on this site. Agents should NOT fabricate the row.

The v6.18.x safety guard on `createUserMeta` is intentionally kept as defense-in-depth. It's dead code today (tool can't be called), but if anyone ever re-exposes it, the compound-identity guard still fires. The two layers (hide at registration + guard at dispatch) are intentional — removing the hide should require a second change to remove the guard too.

Deliberately-hidden note embedded in:
- `mcp/index.js` near `HIDDEN_TOOLS = new Set(["createUserMeta"])` — explains why and where to read more
- `openapi/bd-api.json` `createUserMeta` summary field — first thing anyone editing that spec entry sees

Instruction updates:
- idx 75 (WebPage EAV workaround): removed `createUserMeta` from the 3-step update workflow; step 3 now explains why a missing row means the field isn't provisioned
- idx 110 (duplicate silent-accept): removed `createUserMeta` from the name-based-resources list; removed the "create-if-not" special-case workflow
- idx 73 + idx 112 (users_meta identity + orphan cleanup): unchanged — still correctly reference `updateUserMeta` / `deleteUserMeta` only
- Top-level row-weight paragraph: added sentence explaining agents should only use `updateUserMeta` / `deleteUserMeta`; `createUserMeta` is intentionally not exposed

### Added — `listPostTypes` / `getPostType` lean-by-default

Post-type rows are heavy: ~3.5KB minimum on a minimally-configured post type, 15-30KB on a type with populated PHP/HTML code templates. Most agent tasks that traverse post types (discovering `data_id`, checking routing, finding the right `form_name` to pass to a create call) need only the structural/config fields, not the code templates.

Now stripped by default:

- 9 PHP/HTML code-template fields: `search_results_div`, `search_results_layout`, `profile_results_layout`, `profile_header`, `profile_footer`, `category_header`, `category_footer`, `comments_code`, `comments_header`
- `post_comment_settings` JSON-string field
- 5 review-notification email template fields: `review_admin_notification_email`, `review_member_notification_email`, `review_submitter_notification_email`, `review_approved_submitter_notification_email`, `review_member_pending_notification_email`

Strip-always (debug residue, no legit agent use): `website_id`, `myid`, `method`, `id`, `save`, `form`, `form_fields_name`, `fromcron`, `zzz_fake_field`, `customize`.

New opt-in flags on `listPostTypes` + `getPostType`:

- `include_code=1` — restores the 9 code-template fields. Required before `updatePostType` code-edits (the all-or-nothing-per-group save rule needs all group-mates verbatim).
- `include_post_comment_settings=1` — restores `post_comment_settings` JSON.
- `include_review_notifications=1` — restores the 5 review-notification email template fields.

Always kept: all structural/routing/config fields (`data_id`, `data_type`, `data_name`, `system_name`, `data_filename`, `form_name`, `data_active`, `display_order`, `profile_display_order`, `category_tab`, `profile_tab`, `category_sidebar`, `profile_sidebar`, `sidebar_search_module`, `category_order_by`, `profile_order_by`, `h1`, `h2`, `per_page`, `profile_per_page`, `caption_length`, `icon`, `feature_categories`, `always_on`, `distance_search`, `search_results`, `footer_content`, `revision_timestamp`, `category_group`, `software_version`, `enable_search_results_map`, `enable_map`, `search_priority_flag`, `enable_price_slider`, `photo_gallery_videos`, `search_results_start_view`, `category_sql`, `post_type`, `post_date`, `comments`, `is_event_feature`, `tablesExists`).

Typical reduction: ~3.5KB → ~1.5KB on minimal post types (~60%); ~15-30KB → ~1.5KB on post types with populated code templates (~90%+).

### Changed — stripped version-number references from agent-visible text

Every `v6.X.Y` reference in tool descriptions, instruction block text, and the users_meta safety-guard error message was removed. These were wasted tokens — the agent doesn't care what version it's on, and keeping version refs in-instruction means every future release either leaves stale numbers behind or needs a sweep. Stripped 168 bytes from `openapi/bd-api.json` alone. Version info stays in CHANGELOG and code comments (neither of which reaches the agent).

## [6.18.2] - 2026-04-21

### Fixed — v6.18.0 and v6.18.1 never actually published to npm

The release workflow verifies `mcp/package.json` version matches the git tag before publishing. v6.18.0 and v6.18.1 both bumped `plugin.json`, `server.json`, and `mcp/package-lock.json` but missed `mcp/package.json` itself — so the workflow hit the version-mismatch check at line 53 of `.github/workflows/release.yml` and exited without publishing either release. npm continued serving v6.17.0 throughout.

v6.18.2 bumps all 4 version-stamp files correctly and ships the accumulated v6.18.0 + v6.18.1 users_meta safety-guard work (identical code to what v6.18.1 intended to ship):

- Hard pre-flight guard on `deleteUserMeta`, `updateUserMeta`, `createUserMeta` — refuses the call at the MCP wrapper if any required compound-identity field (meta_id for update/delete, database, database_id) is missing, before BD receives the request.
- Safe handling of absent `arguments` (no TypeError).
- Rejects `meta_id=0` / `database_id=0` (BD AUTO_INCREMENT starts at 1).
- Case-insensitive tool name match.

### Lesson learned

Release workflow's version-match check is working correctly — it DID block the broken publishes. Good safety. Adding `mcp/package.json` to the version-bump checklist for future releases.

## [6.18.1] - 2026-04-21

### Fixed — users_meta safety guard hardening (subagent-audit findings)

v6.18.0 added a hard pre-flight check on `deleteUserMeta` and `updateUserMeta`. A 3-agent subagent audit found four gaps:

1. **CRITICAL — `createUserMeta` was not guarded.** An agent writing a new meta row with the wrong `(database, database_id)` could corrupt an unrelated parent table's EAV space. Same threat class as update/delete; v6.18.0 only addressed the two it explicitly named. v6.18.1 extends the guard to `createUserMeta` (requires `database` + `database_id`; `meta_id` not required since BD assigns it).

2. **CONCERNING — `args === undefined` threw a raw TypeError** when MCP delivered a tool call with absent `arguments`. Guard now safely normalizes non-object args to `{}` and returns the actionable guard message instead of a crash.

3. **CONCERNING — `meta_id=0` and `database_id=0` (numeric or string "0") passed the guard.** BD AUTO_INCREMENT IDs start at 1; zero is functionally invalid. Guard now explicitly rejects zero values and names them in the error message.

4. **MINOR — case-sensitive tool name match.** Guard now lowercases the tool name before comparison; defense-in-depth against any client normalization or spec drift.

### What this does NOT change

- Tool surface, schemas, all other v6.14.0-v6.18.0 behavior.
- Correct calls with all identity fields present: zero behavior change, zero latency change.

## [6.18.0] - 2026-04-21

### Changed — `deleteUserMeta` + `updateUserMeta` compound-identity hard-guard

v6.14.0 documented the users_meta IDENTITY RULE in the top-level instructions and marked `meta_id` + `database` + `database_id` as required in the OpenAPI schema. The wrapper, however, did NOT enforce the rule server-side — it forwarded whatever args the agent passed directly to BD. An agent that forgot the rule could call `deleteUserMeta meta_id=X` alone and BD would still accept and execute the delete, risking cross-table row destruction since numeric database_id values are shared across unrelated parent tables.

v6.18.0 adds a hard pre-flight check in the MCP dispatcher. If `deleteUserMeta` or `updateUserMeta` is called with any of the three identity fields missing (meta_id, database, database_id), the call is refused before it reaches BD with a clear error explaining the compound-identity rule and the safe pattern.

This is prose-rule-to-code-enforcement — a defense-in-depth layer on the single highest-risk operation in the MCP. Zero behavior change for correct calls. Incorrect calls fail fast with a clear remediation message instead of silently destroying unrelated data.

### What this catches (and what it doesn't)

Catches: calls missing `database`, missing `database_id`, missing `meta_id`, or any combination. All rejected at the wrapper with an actionable error.

Does NOT catch: calls where all three fields are present but `database` + `database_id` point at a row that isn't actually the parent the agent intended (e.g. passing `database=list_seo database_id=147` when the agent meant `users_data` row 147). That's a semantic error beyond what a wrapper can detect; agents must still think about which parent they're cleaning up. But the class of "forgot the compound identity entirely" errors — the most dangerous one — is eliminated.

### Not changed

Tool surface, other tool schemas, all other v6.14.0-v6.17.0 behavior, cross-client compatibility, per-call latency.

## [6.17.0] - 2026-04-21

### Changed — Post-type routing fields now always included on post reads; `include_post_type` flag removed

v6.16.0 stripped the full nested `data_category` post-type config on post reads and made it opt-in via `include_post_type=1`. In practice, agents routing through post responses almost always need a few minimum post-type identity fields (which post type is this? what's its slug? what's the form name?) — the rest of `data_category` (sidebars, code fields, search modules, timestamps, h1/h2, caption_length, etc.) is admin configuration an agent reading a post never needs inline.

v6.17.0 replaces the opt-in with a curated default: post rows now always include these 6 post-type fields at the top level:

- `data_id` (already top-level from BD)
- `data_type` (already top-level from BD)
- `system_name` — promoted from nested `data_category`
- `data_name` — promoted from nested `data_category`
- `data_filename` — promoted from nested `data_category`
- `form_name` — promoted from nested `data_category`

The nested `data_category` object is stripped entirely. No opt-in flag. Agents needing full post-type config (sidebars, code fields, search module names, category tabs, h1/h2) call `getPostType` with the `data_id` the lean row already provides.

**Flag removed:** `include_post_type` is gone from the OpenAPI shared components and from all 6 post read endpoints. Agents passing `include_post_type=1` on v6.17.0 will see the flag silently ignored — no error, since the 6 most-useful fields from `data_category` are now default-returned anyway.

### What this does NOT change

- Tool surface, operationIds, required fields, enum values, cross-client compatibility, per-call latency.
- Post write endpoints: unchanged.
- Other v6.16.0 flags (`include_content`, `include_post_seo`, `include_author_full`, `include_clicks`, `include_photos`): unchanged and fully functional.

### Impact

- Post rows gain 4 bytes × field-name-length fields (~120 bytes total) but lose the flag-discoverability cost of a config-object that agents rarely need.
- Agents no longer need a second `getPostType` call just to learn a post's `system_name` or `data_filename` for URL routing.
- Smaller instruction footprint (one fewer flag to document).

## [6.16.0] - 2026-04-21

### Added — Lean-by-default extended to posts + categories, `include_about` added on users

Phase 2 of the lean-response pattern. Same `include_*` opt-in design as v6.15.0, now covering 13 additional read endpoints across posts and categories. All behavioral rules preserved; every stripped field remains reachable via its opt-in flag.

**Posts (6 endpoints: `listSingleImagePosts`, `getSingleImagePost`, `searchSingleImagePosts`, `listMultiImagePosts`, `getMultiImagePost`, `searchMultiImagePosts`)**

Each post row currently includes a full nested `user` author object (password hash, token, session cookie, entire member profile — ~2KB), a full nested `data_category` post-type config (~1.5KB), `user_clicks_schema` with up to 10 click records (~2.5KB), and on Multi posts a nested `users_portfolio` photo array (1-5KB depending on photo count). Plus ~25 admin-form residue fields that leak from BD's admin edit flow. Total: ~8-15KB per row.

Lean default strips all of the above and replaces with:

- `author: {...}` — curated 10-field author summary: `user_id`, `first_name`, `last_name`, `company`, `email`, `phone_number`, `filename`, `image_main_file`, `subscription_id`, `active`
- `total_clicks: N` — count from the stripped clicks array
- `total_photos: N` (Multi only) — count from the stripped portfolio array
- `cover_photo_url`, `cover_thumbnail_url` (Multi only) — pulled from the first photo in the stripped array

Post flags (all default `false`):

- `include_content=1` — full HTML body (`post_content` on Single, `group_desc` on Multi)
- `include_post_seo=1` — `post_meta_title`, `post_meta_description`, `post_meta_keywords` (Single only; Multi doesn't have these)
- `include_post_type=1` — full `data_category` post-type config object (`data_id` always kept)
- `include_author_full=1` — restores full original `user` nested object (every field BD returns, including `password` hash and session `token`). Replaces the curated `author` summary.
- `include_clicks=1` — `user_clicks_schema.clicks` array
- `include_photos=1` — full `users_portfolio` array (Multi only; no-op on Single)

Post always-stripped (debug/form-flow residue): `form`, `au_location`, `noheader`, `id`, `save`, `website_id`, `form_name`, `myid`, `method`, `au_link`, `au_limit`, `au_main_info`, `au_comesf`, `au_header`, `au_hint`, `au_length`, `au_module`, `au_photo`, `au_selector`, `au_ttlimit`, `auHeaderTitle`, `sized`, `subaction`, `formname`, `logged_user`, `form_security_token`, `auto_image_import`, `list_service`.

Per-row size: ~8-15KB → ~1.5-2KB. ~85% reduction on typical posts.

**Categories (4 endpoints: `listTopCategories`, `getTopCategory`, `listSubCategories`, `getSubCategory`)**

Hierarchy linkage is ALWAYS kept so agents can traverse top → sub → sub-sub without opt-in:

- `profession_id` (top + sub)
- `master_id` (sub; `0` = direct child of Top, otherwise `=` parent service_id for sub-sub)
- `service_id` (sub only), `name`, `filename`

SEO/display metadata bundled behind `include_category_schema=1`: `desc`, `keywords`, `image`, `icon`, `sort_order`, `lead_price`, `revision_timestamp`, `tablesExists`.

Per-row size: ~600B → ~80B. ~87% reduction on category records.

**Users — one new flag**

`include_about=1` — restores the `about_me` HTML bio (multi-paragraph, 500-2000 bytes per member). Default stripped. All other v6.15.0 user flags unchanged.

### What this does NOT change

- BD API behavior, tool surface, operationIds, required fields, enum values, cross-client compatibility, per-call latency.
- `updateUser` / `updatePost` / `createPost` / other write and non-read tools: unchanged.
- Agents that need any stripped field get it via the matching flag. No capability lost.

### Why this wasn't done earlier

v6.15.0 shipped lean defaults only for users as a focused first cut. Real-world testing confirmed the pattern works, surfaced that posts carry an even larger bloat footprint (nested `user` + `data_category` + photo array + click array + 25 admin residue fields), and that categories have a smaller but meaningful SEO bundle worth scoping behind a flag.

### Implementation

- `applyPostLean(body, includeFlags)` and `applyCategoryLean(body, includeFlags)` in `mcp/index.js` mirror the v6.15.0 `applyUserLean` pattern. ~120 lines of shaping code.
- Shared helper `stripKeys(row, keys)` extracted.
- 7 new `include_*` params added to OpenAPI shared components. Referenced from 10 endpoints as query params (GET) or body fields (search POSTs).
- Dispatcher extended with `isPostReadTool` and `isCategoryReadTool` checks alongside the existing `isUserReadTool`. Flags stripped from outgoing args before calling BD so BD never sees these MCP-only params.
- Top-level instructions block extends the v6.15.0 lean-defaults paragraph to cover posts + categories.

### Measured impact

- `listMultiImagePosts limit=1` response on test site: ~10KB → ~1.5KB (~85% reduction)
- `listSingleImagePosts limit=1` on test site: ~9KB → ~1.5KB (~83% reduction)
- `listTopCategories` full sweep: ~1.2KB → ~150B (~87% reduction)
- Typical audit task hitting 50 posts + 10 categories goes from ~500KB of response traffic to ~75KB. Frees ~100K tokens per call-heavy task.

### Future phases (not in 6.16.0)

- Extend lean-by-default to leads, reviews, widgets, email templates, and other heavy list/get endpoints.
- `include_extras` bundle flag for multi-flag workflows (open question).
- Null-field / empty-string stripping — considered and deferred per domain-safety concerns (customer field relabeling makes blanket null-strip risky).

## [6.15.0] - 2026-04-21

### Added — Lean-by-default user-read responses with opt-in `include_*` flags

`listUsers` / `getUser` / `searchUsers` now strip heavy nested buckets by default and let agents opt back in per-call via 9 `include_*` flags. Per-row size drops from ~8KB (light) / 25-75KB (heavy active members with full click and transaction history) to ~2KB / ~3KB. On a `limit=25` list call that's roughly 200-750 KB → ~50 KB.

**Always returned (unchanged core data):** all top-level identity / profile / address / social columns, `user_id`, `userid`, `token`, `cookie`, `profession_id`, `subscription_id`, `revenue` rollup, `image_main_file`, `filename_hidden`, computed display fields (`full_name`, `status`, `user_location`), and two new summary numbers (`total_clicks`, `total_photos`).

**Stripped unless opted-in:**

- `include_password=1` - bcrypt `password` hash
- `include_subscription=1` - full `subscription_schema` (60+ plan fields)
- `include_clicks=1` - `user_clicks_schema.clicks` array (count stays via `total_clicks`)
- `include_photos=1` - `photos_schema` array (count stays via `total_photos`, main photo URL stays via `image_main_file`)
- `include_transactions=1` - full invoice history array (`revenue` rollup stays)
- `include_profession=1` - `profession_schema` category metadata (`profession_id` stays)
- `include_tags=1` - `tags` array
- `include_services=1` - `services_schema` sub-categories array (BD's `list_services` table is the sub-categories table)
- `include_seo_hidden=1` - SEO meta bundle: `seo_page_title_hidden`, `seo_page_description_hidden`, `seo_page_keywords_hidden`, `seo_social_page_title_hidden`, `seo_social_page_description_hidden`, `search_description`

**Stripped always (debug/form-flow residue, no legit agent use):** `save`, `form`, `formname`, `sized`, `faction`, `result`.

### What this does NOT change

- BD API behavior, tool surface, operationIds, required fields, enum values, cross-client compatibility, per-call latency.
- `updateUser` / `createUser` and all other user-adjacent tools - only the 3 user-read endpoints get the lean shaping.
- Agents that explicitly need any of the stripped fields can still get them by setting the matching flag.

### Implementation

- `applyUserLean(body, includeFlags)` helper in `mcp/index.js` runs between the BD response and the agent return. ~60 lines of shaping code, no regex, no string munging - pure property deletion on the decoded JSON.
- 9 `include_*` boolean params added as shared OpenAPI components and referenced from `listUsers`, `getUser` (as query params) and `searchUsers` (as body fields).
- The dispatcher strips `include_*` from outgoing args before calling BD, so BD never sees these MCP-only params.
- Top-level instructions block replaces the old "Row weight is heavy" paragraph with a concise lean-defaults + opt-in flag list (zero repeated prose; same token budget as before for the paragraph itself).

### Expected session impact

- Typical `listUsers limit=25` agent call: ~750 KB → ~50 KB response. Frees ~175K tokens of tool-result budget per call.
- An agent doing "audit 100 members" via lean `listUsers` pages: ~3 MB → ~200 KB of cumulative response traffic.
- No agent loses capability - the data is still reachable, just opt-in.

### Future phases (not in 6.15.0)

- Extend the same lean-by-default + `include_*` pattern to posts, leads, reviews, and other list/get endpoints that currently dump full rows. Same helper, same pattern, different resource-specific bucket maps.
- Response trimming for `updateUser` response echoes if those also return fat rows.

## [6.14.0] - 2026-04-21

### Changed — Token-efficiency pass across instructions, operations, and field descriptions

Sustained multi-phase effort to reduce session-start token cost while strengthening behavioral rules. No tool-surface changes. Every behavioral rule agents rely on is preserved or strengthened. Tool count, operationIds, required fields, and enum values are unchanged.

**Phase 2.1 — response-description cleanup (`openapi/bd-api.json`):**
Minimized 2xx response description boilerplate to a uniform `"Success"` across all operations. The response prose is not shipped to the AI via `tools/list` but inflates the source file; keeping it minimal improves repo-hygiene and future audits. Zero AI-facing change.

**Phase 1.5 — operation + field description rewrite (all 174 tools, 5 waves):**
Rewrote every tool's `summary` / `description` and every field's `description` into a directive, bullet-friendly format. Dedup'd cross-tool boilerplate (pagination, filter-property hints, users_meta compound identity, schema-is-documentation rule) into named blocks referenced by tool descriptions rather than repeated per-op. Restored specific field-level filter hints that a deduplication pass earlier dropped. Emoji-scrubbed the spec per house convention (BD DB is `utf8` 3-byte, not `utf8mb4`). Multi-byte ASCII substitution pass (em-dash → hyphen, smart-quote → ASCII) for byte savings with zero meaning change. Markdown-hygiene pass added blank lines before bullet lists so LLM tokenizers read them as structured content.

**Phase 1 — instructions block rewrite (`mcp/index.js` top-level `instructions` array, 27 paragraphs):**
Restructured the 27 heaviest / densest / safety-critical paragraphs of the session-start instructions into proper markdown: bold section leads, bulleted lists, numbered workflow steps. Each rewrite validated by 4 parallel subagent audits — strict rule preservation, adversarial agent-failure-mode hunting, 8-axis quality scoring, cross-spec consistency against the OpenAPI spec. 99 of 99 audits returned SAFE. Adversarial-audit findings were tightened in-place:

- `createUser` duplicate-email pre-check scoped to `allow_duplicate_member_emails=1` only.
- users_meta IDENTITY RULE promoted to canonical and referenced tri-scope (read/update/delete) from the orphan-cleanup paragraph, so agents landing on the cleanup rule alone still see the compound-identity warning.
- Duplicate silent-accept pair/composite filter-find merged as sub-bullet of step 1 so linear-step execution cannot skip the client-side intersect.
- Concrete "even low IDs like `1` routinely return hundreds of cross-table rows" warning restored after initial pass dropped it.
- `content_footer` enum entries now include behavioral explanations (`"members_only"` = login wall, `"digital_products"` = buyer gate) not just the enum values.
- `data_type=10` (Member Listings) split out of the admin-internal cheatsheet bucket — explicitly marked editable via `updatePostType`, consistent with the Member Listings rule elsewhere.

Paragraphs rewritten by original idx in the array: 10, 12, 35, 37, 39, 41, 43, 45, 47, 49, 51, 55, 61, 65, 69, 71, 73, 75, 77, 79, 81, 102, 110, 112, 116, 118, 122.

### What this changes for agents

- Rules render as markdown (bullets, numbered steps, bold section leads) instead of inline prose walls — LLMs tokenize them as structured content.
- Every field name, tool name, enum value wrapped in inline backticks consistently.
- Safety warnings (NEVER / CRITICAL / SURGICAL / "Do NOT") on their own visual lines instead of buried mid-paragraph.
- Rules citeable by named section ("the Count-only idiom", "the EAV field list", "the Required defaults block", "the users_meta IDENTITY RULE", "Group 1 triplet").
- Cross-paragraph dedup via named back-references instead of verbatim repetition.
- Tool descriptions and field descriptions across all 174 operations now match the same directive + bullet + inline-code house style as the instructions block.

### What this does NOT change

- Tool surface: still 173 OpenAPI operations + 1 synthetic helper = 174 tools.
- Tool schemas, operationIds, required fields, enum values: unchanged.
- Cross-client compatibility: still works on Claude, Cursor, ChatGPT Apps. No client-specific features.
- Per-call latency: unchanged (same tool count, same schemas).
- Behavioral rules: every rule agents rely on is preserved or strengthened. No rule dropped.

### Measured size impact (AI-facing, vs `backup/openapi-pre-trim-2026-04-20` baseline)

- `mcp/index.js` (instructions block): 104,102 B → 102,786 B (−1,316 B, −1.3%)
- `openapi/bd-api.json`: 634,212 B → 571,402 B (−62,810 B, −9.9%)
- `mcp/openapi/bd-api.json` (sync target): 634,212 B → 571,402 B (kept byte-identical to source)
- Combined AI-facing session-start (counting source + shipped once): 738,314 B → 674,188 B (−64,126 B, −8.7%)
- Approximate token savings per session: ~16,000 tokens

### What we did NOT ship in 6.14.0 (explicit non-goals deferred)

- Tool-surface reduction (174 → ~15 parent routers). Deferred until measured agent-confusion data. Real session-start savings (~40-55 KB) but costs every call.
- Tool-pair merges (single-image + multi-image post pairs → one `createPost`).
- Thin get/delete consolidation into generic routers.
- Tool search / `defer_loading: true` (ChatGPT-only; rejected for cross-client parity).
- JSON minification of the OpenAPI spec (hurts review, zero AI benefit — MCP reshapes at runtime).
- Aggressive trimming past the behavioral-preservation bar. If a rule served any agent-behavior purpose, it stayed.
- 20-task A/B regression audit. The 99 per-paragraph subagent audits (preservation + adversarial + quality + cross-spec) were used instead. Post-ship runtime issues will be triaged as observed.

### Validation

- 27 instructions-block rewrites × up to 4 audits each = 99 subagent audits. All SAFE.
- Each rewrite installed via surgical string-replacement in `mcp/index.js` to preserve the rest of the file byte-for-byte.
- `node --check mcp/index.js` passed after every install.
- No tool schema, operationId, enum, or required-field touched.
- `openapi/bd-api.json` and `mcp/openapi/bd-api.json` synced and byte-identical.

## [6.13.23] - 2026-04-20

### Fixed — Timestamps: treat as REQUIRED on every update (live-confirmed no auto-populate)

Ran a live write test on `updateWidget`: sent an update that omitted both timestamp fields, got back the unchanged baseline values from a month ago — confirming BD does NOT auto-populate on update. Directive now treats both fields as REQUIRED-by-convention even though the API doesn't enforce them, because the downstream cost of stale timestamps (misfiring cache invalidation, lying "recently updated" sorts, broken admin audit trails) is high.

Also noted: the MCP wrapper's tool schema doesn't list `revision_timestamp`/`date_updated` explicitly, but the dispatcher forwards unlisted body params verbatim — so agents can send them and they reach BD.

Directive now covers:
- MUST-SET rule on every `update*` call
- Verified formats for each field (revision_timestamp dashes+colons universal; date_updated is resource-dependent; date_added on users_meta is no-separators)
- Which resources expose which fields (widgets + WebPages carry both; others carry revision_timestamp only)

Doc-only.

## [6.13.22] - 2026-04-20

### Fixed — `@import` in `content_css` is NOT accepted (causes FOUC/CLS)

Agents loading Google Fonts via `@import url('https://fonts.googleapis.com/...')` inside WebPage `content_css` caused flash-of-unstyled-content and cumulative layout shift — the page paints without the font, then shifts when the imported resource loads. Prior directive (brand-kit `font_rule`) actually recommended `@import` as the switch-font path, which was wrong.

Corrected two places:

- **Top-level WebPage CSS rule** — added absolute line: "NEVER use `@import` inside `content_css`. Not accepted. Load external stylesheets and Google Fonts in `content_head` as `<link rel=\"stylesheet\" href=\"...\">` tags, then use the font-family or class in `content_css`."
- **Brand-kit `font_rule`** — flipped from "import via `@import url(...)` in the same CSS" to "load in `content_head` as a `<link>` tag."

Consistent with existing sanitization rule (line 786) which already flagged `@import` as a CSS-injection pattern to reject. Previous directive contradicted itself — now aligned.

Doc-only.

## [6.13.21] - 2026-04-20

### Fixed — Timestamp directive: full truth across all resources (100% live-verified)

v6.13.20 covered `revision_timestamp` correctly but missed nuance that live-probing surfaced. Ran 9 parallel GETs against the live demo site and mapped every timestamp field's actual format.

**Verified live (2026-04-20):**

- **`revision_timestamp`** — UNIVERSAL format across every resource that carries it: `YYYY-MM-DD HH:mm:ss` (dashes + colons). Confirmed on widgets, forms, email templates, top categories, sub-categories, post types, membership plans, users_meta, AND list_seo WebPages. Zero exceptions across 9 resources.
- **`date_updated`** — format is RESOURCE-DEPENDENT. Widgets: `YYYY-MM-DD HH:mm:ss` (dashes + colons). list_seo WebPages: `YYYYMMDDHHmmss` (NO separators). Same field name, different format.
- **`date_added`** on users_meta — `YYYYMMDDHHmmss` (no separators). Third timestamp field agents might encounter.

**Corrections to v6.13.20:**

- v6.13.20 didn't call out that `list_seo` WebPages carry BOTH fields (`revision_timestamp` AND `date_updated`) in DIFFERENT formats on the same row. Now explicit.
- v6.13.20 didn't cover widgets' dual-timestamp pattern (both `revision_timestamp` and `date_updated`, both in the dashes-and-colons format). Now explicit.
- v6.13.20 hinted `list_seo.date_updated` was in the old no-separator format based on the existing directive but never re-verified — this pass confirmed it IS still `YYYYMMDDHHmmss` on list_seo.

Rule: on every `update*` call, set the current time in whichever timestamp fields that resource exposes, using the format observed on GET. Never guess format from field name alone.

Doc-only.

## [6.13.20] - 2026-04-20

### Fixed — `revision_timestamp` must be set on every update (BD does NOT auto-populate)

Agents were updating widgets, forms, email templates, and categories without passing `revision_timestamp`, leaving stale timestamps on records. This breaks cache invalidation, "recently updated" sorts, and admin audit trails. Documented the behavior is identical to the existing `list_seo.date_updated` rule — BD's API does not auto-set the timestamp on UPDATE; the agent must do it.

Added a universal rule to the top-level `instructions` directive:

> On every `update*` call for resources with `revision_timestamp` (widgets, forms, email templates, top categories, sub-categories, post types, membership plans, users_meta), include `revision_timestamp=<current time>` in the format `YYYY-MM-DD HH:mm:ss` (e.g. `2026-04-20 19:34:51`). Different from `list_seo.date_updated` which uses `YYYYMMDDHHmmss` (no separators).

Doc-only.

## [6.13.19] - 2026-04-20

### Fixed — `@latest` consistency across install artifacts before public advertising push

Pre-advertising audit found 3 shipped artifacts with bare `brilliant-directories-mcp` (no `@latest`) — users cloning or importing these would pin to whatever version was cached on their machine, missing future directive updates:

- `.mcp.json` (repo-level config template that Cursor Directory reads) — `args` now `["-y", "brilliant-directories-mcp@latest"]`
- `SKILL.md` line 56 and line 240 — both setup-wizard snippets bumped to `@latest`

All READMEs (root + mcp/) were already `@latest` everywhere. Bare references in help text, URLs, metadata, and `npm install -g` "don't do this" examples are intentional — only install/config contexts need `@latest` for auto-update guarantees.

Doc-only.

## [6.13.18] - 2026-04-20

### Fixed — Diagrams/charts route to Widget, not SVG in `content`

Agents asked to add diagrams or charts to a WebPage generated `<svg>` inline in `content` — Froala stripped them on save and the page rendered empty. Directive listed Froala-stripped tags (`<script>`, `<style>`, `<form>`, etc.) but omitted `<svg>` and `<canvas>`, so agents didn't know the content would vanish.

Added to the WebPage asset-routing rule: **never put `<svg>` or `<canvas>` in `content`.** Correct path is a custom Widget (`createWidget`) holding the raw SVG or chart JS, embedded in the page via `[widget=Name]` shortcode. Widgets render outside Froala's sanitizer and support arbitrary HTML/SVG/JS. For lightweight visuals (comparison tables, callouts, step-lists), CSS-styled divs/tables targeted from `content_css` render cleanly.

Doc-only.

## [6.13.17] - 2026-04-20

### Fixed — Cross-resource audit hardening: category SEO (lexical trap), member SEO, WebPage inline styles

Two subagents read v6.13.16 cold and routed SEO intents. Three drift points surfaced — patched.

**1. Category `desc` field — lexical "description" trap hardened.** Previous wording was correct but didn't warn against the specific phrasing "write a description that ranks on Google" or "improve the category description so it shows up in search results" — phrases that lexically map to `desc`. Rewrote the top-level rule + all 5 `desc` field descriptions to explicitly call out the trap: *"Even if the user says the word description — this is NOT an SEO description. Route by intent, not vocabulary."*

**2. Member profile SEO — new rule.** `updateUser` has no SEO meta fields (no `meta_title`, `meta_desc`, `meta_keywords`). Agents asked "write better SEO for my members" would have stuffed SEO prose into `about_me` or `search_description` — both are body/snippet fields, not `<title>`/`<meta>`. New directive: per-member SEO is site-wide, controlled by the `seo_type=profile` WebPage template with merge tokens (`%%%full_name%%%`), not editable per-user.

**3. WebPage inline styles — directive was contradictory, flipped to single path of truth.** Previous wording said *"Inline style=..." attributes on elements inside `content` are fine for one-off styling"* — but Froala strips inline style on save. Agents shipping inline styles saw them silently dropped. Rewrote: **ALL CSS must go in `content_css`; inline style attributes are NOT supported**, no exceptions including one-offs. Give every element a class, target it from `content_css`. Single path of truth.

Doc-only.

## [6.13.16] - 2026-04-20

### Fixed — Category SEO content routes to a WebPage, not `desc`

Agents asked to "create SEO content for these categories" were writing long H1/intro/meta copy into the Sub Category / Top Category `desc` field, which most BD themes do NOT render on the public search-results page. The content persisted to what is effectively a dead field while the live search pages stayed untouched.

Added a routing rule to the top-level instructions and to all 5 `desc` field descriptions (createTopCategory, updateTopCategory, createSubCategory, updateSubCategory, shared Service schema):

> "SEO content for a category" = create a WebPage with `seo_type=profile_search_results` and the matching slug. The category's own `desc` is a short internal label, not the public SEO surface. Route H1/intro/meta/long copy to the WebPage system.

The full `profile_search_results` WebPage recipe (slug hierarchy, required defaults, auto-generated meta) was already in the directive — agents just weren't finding it from the category-update entry point. The new rule wires the intent directly to the right tool.

Doc-only.

## [6.13.15] - 2026-04-20

### Fixed — Subagent-audit findings, surgical truth updates

Ran 4 parallel audit subagents against v6.13.14 directive. Each performed a real task (paginate 118 members, find photoless members, filter operator tests, rank categories by member count) and reported where the directive misled them. Batched fixes:

- **Silent-drop sanity check** — BD returns `status: success` + full unfiltered `total` when a filter is dropped (bad operator, unknown column, derived field). Added explicit rule: compare filtered `total` vs. unfiltered — if equal, your filter was dropped. This was the single biggest trap across audits.
- **Derived fields are NOT filterable** — list now explicit on `listUsers`: `full_name`, `status`, `user_location`, `image_main_file`, `card_info`, `revenue`, `subscription_schema`, `profession_schema`, `photos_schema`, `services_schema`, `tags`, `user_clicks_schema`, `transactions`. Update-tool "schema-is-documentation" rule is for WRITES; filters need real persisted columns only.
- **Row weight warning** — `listUsers` row ≈ 7-8KB, `limit=10` ≈ 80KB per call. Directive now budgets: `limit=5` for enumerate-then-collect, `limit=10` only when full records needed, `limit=100` will blow context.
- **LIKE behavior nailed down** — LIKE with `%` wildcards returns `"user not found"` (same shape as bad column, debugging trap); LIKE without wildcards silently behaves as `=`. Recommend `searchUsers q=<keyword>` for partial text.
- **Count-only idiom named** — `limit=1` + read `total` from envelope, explicit now.
- **Envelope numerics are STRINGS** (`"total":"107"`, not `107`) — cast before arithmetic.
- **Default sort is modtime-ish, not primary-key** — pass `order_column` for deterministic order.
- **N+1 fan-out warning** — no server-side member-count sort on categories; "top N by count" on K categories = K calls. If K > 20, narrow scope with the user upfront.
- **`logo` / `profile_photo` are import-pipeline fields**, not read-signals — null on reads even when photos exist. Detection is via `image_main_file` placeholder-suffix check.
- **Null-filter paragraph** compressed from 10 lines to 3 (behavior already covered in the silent-drop rule).

Net: directive is ~20% LONGER in real truth but the false-positive traps (silent success that's actually full table, misleading LIKE, misread column signals) are now called out instead of discovered mid-task. Doc-only.

## [6.13.14] - 2026-04-20

### Added — Pagination: concrete sequential-page recipe

v6.13.13 had the rules but not the recipe. Agents new to the cursor model would sometimes reconstruct the loop correctly from the rules and sometimes not. Added a 4-step copy-paste recipe to the top-level instructions:

1. First call: `listX limit=10` → returns 10 records + `next_page` token
2. Next call: `listX page=<that token>` (no `limit` — it's baked in) → records 11-20 + new token
3. Repeat, each response hands you the next cursor
4. Stop when `current_page >= total_pages`

Example line: "118 members at limit=10 = 12 total pages = 12 calls to enumerate all members with tiny per-call payloads." Gives agents a concrete scale-reference so they can size loops and tell users up front "this will take N calls" instead of over-fetching.

Doc-only.

## [6.13.13] - 2026-04-20

### Fixed — Pagination cap IS 100 (correcting v6.13.11's false "no cap" claim)

v6.13.11 claimed BD enforced no server-side cap on `limit`. **That was wrong**, caused by a misread A/B test: on a 118-record site, my `limit=500` returned a large payload and I interpreted "big response" as "all 118 came back." Re-ran the test today grepping the actual record count: `limit=150` returned exactly **100** records plus a `next_page` cursor (`total_pages=2`), proving the server silently clamps to 100.

BD's dev team source-confirmed the same: `base64_decode` on `page`, split on `*_*`, enforce max 100. My error — the shipped directive is now corrected.

**Directive now accurately says:**

- Default `limit` = 25 if omitted
- Hard cap = 100; values above are silently clamped (you get a cursor, not all the records)
- `page` is an opaque base64 cursor — format `base64_encode("{page_num}*_*{limit}")` — never decode or construct, pass verbatim from `next_page`
- **Numeric `page=2` silently resets to page 1** (base64_decode of an integer → garbage → server falls back to page 1). Live-verified: looks like pagination is broken when you use numeric pages; you're actually looping page 1.
- **When `page` is present, `limit` is ignored** — page size is baked into the cursor. To change page size mid-traversal, start over with a fresh `limit=N` and NO `page`
- OpenAPI spec `limit` parameter: `maximum: 100` restored

**Also kept (still true per live retest):** `is_null`, `is_not_null`, and `property_value=""` with `=` are all silently ignored no-ops on listUsers. Paginate + client-filter for string-null/empty discovery (or use numeric `=0` for zero-sentinel FKs like `profession_id`).

Doc-only. Apology for the v6.13.11 regression — shipped from an assumption I should've grep-verified.

## [6.13.12] - 2026-04-20

### Fixed — Null-filter operators are no-ops + profile-photo detection uses `image_main_file`

A/B-tested every pagination and filter claim against the live API on a 118-member site before writing anything. Three verified findings added to the top-level `instructions` directive.

**Null / empty-value filters are silently ignored by the server:**

- `property_operator=is_null` on `first_name` (a NOT-null column) → returned `total=118` (full dataset). Filter dropped.
- `property_operator=is_not_null` → same: `total=118`. Filter dropped.
- `property_value=""` with `operator==` on `logo` (all-null column) → `total=118`. Empty-string ≠ null on the server.
- Control: `property=first_name&property_value=Sample&operator==` → `total=3`, correctly filtered. So `=` with a non-empty value works; the failure is specific to null/empty matching.

Agents using these operators thought they were filtering; they were actually processing the entire table. New directive: **don't bother with `is_null`/`is_not_null`/`property_value=""` — paginate with a small `limit` and filter client-side instead.**

**Exception — numeric zero-sentinel works:** `property=profession_id&property_value=0&operator==` correctly returned `total=8` (members with no top category). For any numeric FK that uses `0` to mean "unset" (profession_id, subscription_id, parent_id), `=0` filters server-side and saves the client-side loop.

**Profile-photo detection:** every one of 118 tested members returned `profile_photo: null` and `logo: null` at the top level of the user record — even members with photos visibly rendered on the site. The authoritative field is `image_main_file` (BD's resolved URL, falls back to `https://<site>/images/profile-profile-holder.png` when no photo exists). Detection rule: member has a real photo IFF `image_main_file` is present AND does NOT end with `profile-profile-holder.png`. Use this pattern for any "find members missing a profile photo" task.

**Offset pagination rumor refuted:** re-verified that numeric `page=1`, `page=2` return `"user not found"` errors. Only opaque base64 cursor tokens from the previous response's `next_page` field work for pagination. An offset-math formula `(page-1)*limit` circulating in BD support docs does NOT apply to `/api/v2/user/list`.

Doc-only. Zero schema/code/behavior changes.

## [6.13.11] - 2026-04-20

### Fixed — Pagination directive: parameter name + no server-side cap

Live-tested pagination against high-volume endpoints (`listUsers`, `listSubCategories`, `listSingleImagePosts`) and documented the ground truth in both the OpenAPI spec and the top-level MCP `instructions` array.

**What changed:**

- **Parameter name clarification** — the correct query parameter is `limit`. Passing `per_page` is silently ignored by BD's API and returns a full/default dump. Prior directive implied both might work.
- **No server-side max cap** — earlier directive said *"limit (default 25, max 100)"*. Tested: BD does NOT enforce a max on `limit`. `limit=500` really returns 500 records (836KB response on `listUsers`). The previous "max 100" claim was wrong and led agents to think they had a safety net that doesn't exist.
- **Self-limit defaults pushed harder** — agents must self-limit to protect Claude's tool-result token budget. New defaults: `limit=25` for normal browsing, `limit=10` for scan-and-filter loops, `limit=5` for sampling. Never > 50 unless explicitly asked AND `total` already verified small via `limit=1`.
- **Efficiency pre-check pattern** — for "how many X are there" questions, call `list*` with `limit=1` first. Returns `total` in a tiny payload without dumping records. Saves context on counting questions that don't need the records themselves.
- **Iterate don't inflate** — to process large datasets (1000+ members, etc.), loop the cursor with a small `limit` and filter client-side per page. Raising `limit` to fetch everything in one call overflows Claude's context and forces truncation.

**Why this matters:** users were hitting Claude token/tool limits surprisingly fast on BD sites with hundreds of members, posts, or categories — root cause was agents pulling full lists at default-or-larger `limit` values. Sharper directive + accurate param name + no-cap warning should meaningfully cut context burn on common workflows.

Doc-only. Zero schema/code/behavior changes in the MCP wrapper itself.

## [6.13.10] - 2026-04-20

### Fixed — Category `keywords` field: fuzzy-search synonyms, NOT SEO keywords

Category `keywords` fields (on Top Categories, Sub Categories, Sub-Sub Categories) had the generic prior description *"SEO keywords, comma-separated."* — which was technically wrong and was teaching agents to fill the field with long SEO meta-keyword phrases like `doctor near me, find a doctor, board certified physician`. BD uses this field internally as a **fuzzy-search synonym matcher** for on-site search (so someone typing "doc" or "physician" lands on the Doctor category page), not as an SEO signal.

Replaced with tight 40-word directive on all 6 locations where the field appears (create/update tool bodies for TopCategory and SubCategory + shared Category/Service component schemas):

> *"Fuzzy-search synonyms for on-site category matching — NOT SEO meta-keywords. Comma-separated single words (no spaces): synonyms, abbreviations, slang, common misspellings. Example for `Doctor`: `doc,physician,md,medic,gp,specialist`. ~5-10 max. Skip SEO phrases like `doctor near me` — those aren't fuzzy matchers. Optional."*

Works with the v6.13.4 CSV-no-spaces universal rule (single words, comma-only, no whitespace). Explicitly calls out the wrong pattern (`doctor near me`) so agents don't regress.

Doc-only. Zero schema/code/behavior changes.

## [6.13.9] - 2026-04-20

### Added — README: Cursor Directory one-click install as the primary path

Brilliant Directories MCP was accepted into the [Cursor Directory](https://cursor.directory/plugins/brilliant-directories). Updated the Cursor setup section in both READMEs (root `README.md` and npm-published `mcp/README.md`) to recommend the one-click directory install as the easiest path — no terminal, no config-file editing.

**New primary method:**
1. Click the Cursor Directory link → Install button
2. Cursor opens the "Install MCP Server?" prompt with fields pre-filled (Command: `npx`, Arguments: `-y brilliant-directories-mcp@latest`)
3. User fills their BD API key + URL into the RIGHT-side Environment Variable boxes only (left side stays as-is — those are the variable names the MCP reads, not where you paste credentials)
4. Optional: rename the Name field from `server` to `brilliant-directories` for clarity in Cursor's Tools list
5. Install → fully quit + reopen Cursor

**Kept as fallbacks (collapsed in a `<details>` block):**
- Cursor Settings GUI → Tools & MCP → New MCP Server (manual JSON paste)
- Direct `~/.cursor/mcp.json` file editing (Mac/Linux + Windows instructions)

Also reinforced the "left-side vs right-side" confusion point that users hit (variable names on the left, credential values on the right — only edit the right), with a concrete worked example showing real-looking values.

Doc-only. Zero schema/code/behavior changes.

## [6.13.8] - 2026-04-20

### Removed — Boilerplate noise pruning (signal-to-noise improvement)

Three-agent audit identified pure boilerplate repeated across ~175 tool descriptions with zero differentiation. Every word in a tool description competes for the agent's attention when selecting tools and parsing rules — pruning non-load-bearing repeats improves tool-selection accuracy and rule adherence without changing any behavior.

**Stripped from `openapi/bd-api.json`:**
- **171 auth/rate-limit footers** (`_Auth: \`X-Api-Key\` header. Rate limit: 100 req/60s (on 429, back off 60s). Errors: \`{...}\` with standard HTTP codes._`). Already verbatim in `info.description` — pure duplication. Kept 2 instances that carried unique operational info (brand-kit caching note, empty-result error-body gotcha).
- **45 "Writes live data" boilerplate lines** (`**Writes live data:** confirm intent with the user for bulk operations. Changes are immediately visible on the live site.`). Replaced with ONE top-level universal directive near the start of the instructions block. Kept ~10 instances that carried endpoint-specific tails ("appears on member's public profile immediately", "the widget is available immediately but does nothing until referenced by...", etc.).
- **19 generic Returns blocks** (`**Returns:** \`{ status: "success", message: {...createdRecord} }\` — includes the server-assigned ID (e.g., \`user_id\`, \`post_id\`). Use this ID for follow-up operations.`). Redundant with the response schema \`$ref\`. Kept Returns blocks that documented endpoint-specific response shapes.

**Stripped from `mcp/index.js` top-level instructions (~150 words):**
- Member Listings cheat-sheet shrunk from a 250-word in-block enumeration to a 2-line pointer directing to `updatePostType`'s tool description. `updatePostType` is always loaded when editing Member Listings; the top-level duplication was pure churn risk for future drift.
- Opener flourishes trimmed (identity filler, over-explained PATCH examples, rationale hedges that didn't affect agent behavior on edge cases).
- Removed "Plan the full sequence first, then execute" (already implied by "Chain or run multiple tools").
- Tightened the 429 message-matching parenthetical (pattern-matching is obvious).
- Tightened the field-vs-hack rule closer and hero image sourcing rationale.
- Shortened the duplicate silent-accept opener.

**Added one top-level compensating directive:**
- "Every write goes to a live production site — there is no staging mode, no sandbox, no `?dry_run=1`" — replaces what the 45 per-tool "Writes live data" restatements were conveying, stated ONCE with authority at the top where agents read it fresh.

**Impact:**
- `openapi/bd-api.json`: **635,096 → 629,172 bytes** (~6 KB shorter)
- `mcp/index.js`: ~150 words leaner in the instructions block
- Net ~235 pure-boilerplate removals across the API surface
- Zero behavior change. No directive removed — all load-bearing rules intact. Safety-critical rules (users_meta IDENTITY RULE, duplicate silent-accept, orphan cleanup, CSV-no-spaces, schema-is-documentation, PATCH semantics, field-vs-hack) all retained with their per-tool nuance.

This release targets agent quality, not feature change: higher signal-to-noise → better tool selection → fewer contradictions to re-adjudicate at runtime → less drift over time. The ratio of "unique load-bearing content" to "repeated boilerplate" in per-tool descriptions is now markedly higher.

Doc-only. Zero schema/code/behavior changes.

## [6.13.7] - 2026-04-20

### Fixed — CRITICAL: CSV-no-spaces contradiction in createUser/updateUser

`createUser` and `updateUser` descriptions contained `**Whitespace around commas is trimmed** — "a, b, c" works the same as "a,b,c"` — the direct opposite of the v6.13.4 universal CSV-no-spaces rule. An agent reading either tool in isolation would conclude spaces are safe for `services`, overriding the universal directive and producing the exact silent-corruption bug v6.13.4 was created to prevent. Replaced with language consistent with the universal rule: "Comma-only CSV — NO spaces around commas. BD splits on raw `,` and does NOT trim whitespace."

Also fixed typo `seperated` → `separated` in the `services` field description.

### Added — PATCH semantics spelled out at the top level

v6.13.0 through v6.13.6 relied on per-tool `"Fields omitted are untouched"` phrasing. Four high-traffic endpoints were missing it (`updateUser`, `updateCity`, `updateState`, `updateCountry`) and the top-level instructions never stated it at all — so an agent reading only the server-level briefing had zero PATCH signal and could default to re-sending full records.

Added to the universal schema-is-documentation directive: *"Updates use PATCH semantics — send ONLY the fields you want to change; omitted fields are untouched. Never re-send a full record just to tweak one setting. Single narrow exception: the post-type code-group all-or-nothing save rule on updatePostType."* Added `"Fields omitted are untouched (PATCH semantics)"` to the 4 missing endpoint descriptions.

### Fixed — Hero defaults scope tightened (semantic only, no logic change)

Hero readability safe-defaults rule reworded from ambiguous *"when hero is enabled"* to explicit *"on TRANSITION only — when `enable_hero_section` goes from 0/unset to 1/2"*. Adds the complement: *"do NOT re-apply defaults on updates that don't touch `enable_hero_section`"*. Prevents an agent tweaking a single hero field (e.g. `h1_font_size`) from silently overwriting custom colors/padding the user set previously. Same logic as before — just semantics that make the scope unmissable.

### Added — Field-vs-hack universal directive + FormField view-flag rules

New top-level paragraph codifies a universal pattern: when BD ships a first-class field/toggle for a thing the user asks about, USE THE FIELD — do not fake it with CSS/JS/template surgery. Names concrete cases: `content_layout=1` (WebPage full-bleed), WebPage `hide_header`/`hide_footer`/etc., Widget `widget_viewport`, EmailTemplate `unsubscribe_link=0`, MembershipPlan `sub_active=0` + `hide_*_amount` toggles, FormField view-flags.

Separately: dedicated paragraph for FormField's 5 view-flags (`field_input_view`, `field_display_view`, `field_lead_previews`, `field_email_view`, `field_table_view`) — all default ON (`1`) on create (matches BD admin UI default), set to `0` only when the user explicitly asks to hide on a specific surface. Lists the canonical "user ask → correct flag" mappings to prevent agents from CSS-hacking / email-template string-manipulation.

### Added — MembershipPlan hide_*_amount + visibility toggles as first-class schema fields

Expanded `updateMembershipPlan` schema from 6 properties to 19, adding the full set of payment-cycle visibility toggles (`hide_initial_amount`, `hide_monthly_amount`, `hide_quarterly_amount`, `hide_semiyearly_amount`, `hide_yearly_amount`, `hide_biennially_amount`, `hide_triennially_amount`) plus related visibility flags (`hide_billing_links`, `hide_parent_accounts`, `hide_reviews_rating_options`, `hide_specialties`, `hide_notifications`) with proper `enum: [0, 1]` and clear descriptions. Previously these were returned on GET but missing from the update schema, making them harder to discover even though they were writable per the universal schema-is-documentation rule.

Each description explains the key behavior: hidden payment cycles disappear from public checkout pages but remain available when an admin manually creates a subscription inside the BD admin area. Plus concise descriptions on the existing `sub_active` and `searchable` fields (previously enum-only, no description).

Doc-only + schema-expansion (`updateMembershipPlan` gains 13 explicit fields). Zero code/behavior changes.

## [6.13.6] - 2026-04-20

### Added — Full-bleed WebPage sections: `content_layout=1` directive (anti-CSS-hack)

Live-observed: an agent asked to create a WebPage with a full-bleed background section reached for CSS tricks (`margin: 0 -9999px; padding: 0 9999px`) instead of setting BD's built-in `content_layout=1` ("Full Screen Page Width") field. The hack works-ish visually but:
- Breaks horizontal scroll on some browsers
- Fights any parent with `overflow: hidden`
- Prevents future layout changes from working cleanly
- Isn't accessible (focus tracking gets weird)

BD ships a first-class page setting for this: `content_layout=1` on `createWebPage` / `updateWebPage`. The field existed and was documented per-field, but nothing in the top-level directives told agents to reach for it FIRST before writing CSS.

Added:
- **New top-level directive** in `mcp/index.js` WebPage section: "When a user wants full-bleed sections, set `content_layout=1` FIRST — don't fake it with negative-margin / 9999px-padding CSS." Includes the correct pattern: set `content_layout=1`, give each section its own background via scoped CSS in `content_css`, wrap readable text in a `<div class="container">` or page-scoped inner wrapper with `max-width` so copy stays centered while the background goes edge-to-edge.
- **Strengthened per-field description** on `content_layout` in both `createWebPage` and `updateWebPage` schemas: explicitly calls out the negative-margin / 9999px-padding hack as an anti-pattern and names the three concrete downsides.

Doc-only. Zero schema/code/behavior changes — the field already existed and worked correctly; this release just teaches agents to actually use it.

## [6.13.5] - 2026-04-20

### Fixed — `createUserMeta` description: clarify `createWebPage` seeds EAV correctly on CREATE

The `createUserMeta` description's "critical BD pattern" section explained the UPDATE-path EAV workaround but didn't explicitly remind agents that the CREATE path handles EAV seeding in a single `createWebPage` call. An agent reading just that tool's description in isolation could conclude they needed to double-call `createWebPage` + `createUserMeta` at create-time, wasting calls and potentially double-writing.

Fixed by making the create/update distinction explicit:
- **On CREATE:** `createWebPage` writes ALL fields correctly in a single call — direct columns AND users_meta rows are seeded together. No separate `createUserMeta` calls needed for the 18 EAV-backed fields at create-time.
- **On UPDATE:** `updateWebPage` only writes direct columns — the users_meta-stored fields are silently ignored. The EAV workaround via `createUserMeta` / `updateUserMeta` with `database=list_seo` is ONLY for updating these fields on an existing page, never on initial create.

Doc-only. Zero schema/code/behavior changes. The top-level instructions paragraph in `mcp/index.js` already carried the correct distinction — this release brings the `createUserMeta` tool-level description in alignment with it.

## [6.13.4] - 2026-04-20

### Added — Universal CSV-no-spaces directive (silent-corruption prevention)

Closes a real live-observed bug: BD splits comma-separated fields on the raw `,` character WITHOUT trimming whitespace. When an agent writes `"Category 1, Category 2, Category 3"` (natural English with spaces after commas), BD stores the options as `"Category 1"`, `" Category 2"` (leading space), `" Category 3"` (leading space). URL filters, `post_category` matches, dropdown renderers, and any downstream consumer looking up the clean value treat the space-prefixed variants as different strings — posts tagged with the space-prefixed value become invisible to clean-value filters.

Added as a new top-level universal directive in `mcp/index.js` instructions (paragraph 7, right after the schema-is-documentation rule):
- **Rule:** always write CSV values as `"A,B,C"`, never `"A, B, C"`.
- **Applies to:** every CSV-bearing field on every endpoint — `feature_categories`, `services`, `post_category`, `data_settings`, `triggers`, `stock_libraries`, comma-separated tag/user ID lists, etc.
- **Normalization workflow:** when a user provides spaces in natural language, normalize client-side before sending. When updating a CSV that may already contain space-prefixed values from prior writes, GET first, normalize, write back the clean version, AND update any records referencing the old space-prefixed values.
- **Exception:** spaces INSIDE an option name are fine — the rule is strictly about the separator.

### Fixed — `list_seo` EAV field list hedged (silent-drop prevention)

The 18-field EAV list in `createUserMeta`'s description (and its mirror in `mcp/index.js` top-level instructions) was enumerated as if exhaustive. That's structurally the same bug class as the Member Listings "closed set" we fixed in v6.13.3 — if BD's `list_seo` EAV layer has any other column beyond the 18 we've verified live, agents would confidently `updateWebPage` it, BD would silently drop the write, agent would report success, data would never land.

Added a hedge to both locations: the 18 are "verified live; BD's `list_seo` EAV layer may include additional columns." Reliable detection: after `updateWebPage`, re-GET and compare; if the value didn't persist, fall back to `updateUserMeta` / `createUserMeta` with `database=list_seo`. Any GET-returned `list_seo` field can be written via the EAV path.

### Fixed — `listUserMeta` "closed set" phrasing softened

Changed "Valid `database` values (closed set — pass only these; never invent a table name)" to "Commonly-seen `database` values (BD may accept other table names with users_meta rows — prefer these for known resources)." Same list of 25 values, but reframed from hard whitelist to reference — consistent with the universal schema-is-documentation rule. If the user names an unfamiliar table, the agent now knows to GET-verify rather than refuse.

Doc-only. Zero schema/code/behavior changes.

## [6.13.3] - 2026-04-20

### Fixed — Scope-mixing in Member Listings + post-type guardrails

v6.13.2 shipped the fix for the "closed set" contradiction, but the Member Listings block and the `updatePostType` description still mixed Member-Listings-only rules with universal rules ambiguously. Agents editing non-Member-Listings post types (blog, event, coupon, property, product, etc.) could reasonably mis-apply guardrails that were only meant for `data_type=10`.

**Reorganized into 4 clearly-scoped blocks** (applied symmetrically in `mcp/index.js` top-level instructions AND in `openapi/bd-api.json` `updatePostType` description):

1. **Member Listings identity + edit path + data_id caching.** Scope: Member Listings only.
2. **Cheat-sheet of common Member Listings UI/UX + search-results code fields** (15 total). Explicitly reframed as "reference, NOT a limit — every column returned on GET is writable per the universal rule." Examples of unlisted-but-writable fields (`feature_categories`, `icon`, `category_tab`) called out by name. Scope: Member Listings only.
3. **Member Listings-specific guardrails** (profile fields have no effect here — skip). Explicit scope tag: "apply ONLY to `data_type=10`, NOT to any other post type. On every OTHER post type these ARE legitimate rendering fields — write them freely there."
4. **Universal post-type safety** (structural fields `data_type`/`system_name`/`data_name`/`data_active`/`data_filename`/`form_name`/`software_version`/`display_order` — never mutate on any post type). Explicit scope tag: "applies to EVERY post type, not just Member Listings."

No information removed. The 15-field Member Listings cheat-sheet stays (real discovery value). The profile-fields-skip rule stays but is now correctly tagged as Member-Listings-only (prevents false guardrails when editing blog/event/etc.). The structural-don't-touch rule is now correctly tagged as universal.

Doc-only. Zero schema/code/behavior changes.

## [6.13.2] - 2026-04-20

### Fixed — "complete closed set" contradiction that was making agents refuse legitimate writes

**Smoking-gun bug:** v6.13.0 added a top-level directive that `update*` tool schemas are DOCUMENTATION, not whitelists. But 16 paragraphs earlier in the same instruction block, the Member Listings description used the phrase *"Editable fields on Member Listings (complete closed set)"* — and `updatePostType`'s per-tool description repeated the same *"the complete closed set"* framing. Agents read the absolute closed-set rule first and treated the later schema-is-documentation rule as a weaker override, refusing to write unlisted fields like `feature_categories` even though BD accepts them natively.

**Four-agent audit confirmed:**
- Live wire-test: MCP forwards unlisted params verbatim (both `feature_categories` AND a fabricated `zzz_fake_field` pass through; BD accepts real columns, silently drops fake ones).
- Code audit: `mcp/index.js:968-981` has an explicit `else { bodyParams[key] = val; }` branch for unlisted keys — no `ajv`/`zod`/`pick`/`whitelist` filtering anywhere.
- Process diag: Claude Desktop runs the correct 6.13.1 binary — no version mismatch.
- Doc audit: "closed set" phrasing appears at `bd-api.json:4448` + `mcp/index.js:720` — the contradiction vector.

**Three surgical edits:**

1. `mcp/index.js` — Member Listings paragraph rewritten: "**Commonly-edited** Member Listings fields" (not "complete closed set"). Explicit callout that any GET-returned column is also writable. "Omit X/Y/Z — harmless if sent, no rendering effect" replaces "Do NOT send X/Y/Z" (softer, non-contradicting).
2. `openapi/bd-api.json` `updatePostType` description — same "Commonly-edited" rewrite, with `feature_categories` named as an example of a writable unlisted column.
3. `mcp/index.js` — the "Update-tool schemas are DOCUMENTATION" directive hoisted from paragraph ~13 up to paragraph 4 (right after "Chain or run multiple tools"), before any per-tool specifics can introduce contradicting closed-set language. Reworded to explicitly disarm phrases like "commonly-edited", "editable fields", "main settings" as GUIDANCE not restrictions.

**Impact:** agents on any surface (Claude Desktop, Claude Code, Cursor native, Codex, etc.) stop refusing legitimate writes to unlisted-but-real columns. The v6.13.0 universal directive now actually lands ahead of the contradictions that were drowning it out.

Doc-only. Zero schema/code/behavior changes.

## [6.13.1] - 2026-04-20

### Added — README: Claude CLI inside Cursor setup clarification

Clarifies a confusing setup scenario for users running the Claude extension / CLI inside Cursor. Cursor's built-in `Tools & MCP` panel and Claude's MCP host are **two separate hosts** that live in the same editor window:
- Claude reads from `~/.claude.json`
- Cursor's native agent reads from `~/.cursor/mcp.json`

A user who installed via `claude mcp add bd-api ...` correctly gets BD tools in Claude-in-Cursor but sees nothing in Cursor's `Tools & MCP` panel, and can reasonably conclude their install is broken. It isn't.

New subsection added under `### Claude Code` in both the root `README.md` and the npm-published `mcp/README.md`:
- Explains the two-host model with a comparison table (which host reads which config, which panel surfaces its MCPs)
- Spells out credentials: the `--api-key` and `--url` flags in the `claude mcp add` command ARE where credentials are provided; they're stored in `~/.claude.json` and passed to BD automatically on every tool call. No separate credential step exists.
- Notes the rotation workflow (`claude mcp remove bd-api` → re-run `claude mcp add` with new values)
- Calls out that installing for Claude does NOT install for Cursor's native agent and vice versa — each host needs its own install with its own `--api-key` + `--url`

Docs-only. No spec, code, schema, or behavior changes.

## [6.13.0] - 2026-04-20

### Added — Pre-check rules extended to post titles + 3 join-table pair-uniqueness cases

Closes the remaining silent-duplicate surface on the API. v6.12.0 covered 15 name-based resources; this release adds the last 3 name-based cases plus 3 join-table pair/composite cases where BD does NOT enforce uniqueness at the DB level.

**New name-based pre-check rules (3):**

| Endpoint | Natural-key field | Consequence of duplicate |
|---|---|---|
| `createSingleImagePost` | `post_title` | URL-slug collision (BD derives `filename` from title; two posts fight for the same public URL) |
| `createMultiImagePost` | `post_title` | Same URL-slug collision for albums/galleries |
| `createFormField` | `field_name` scoped to `form_name` | Duplicate HTML `name` attribute on form submit — BD stores only one input, drops the other (unpredictable which) |

**New pair-uniqueness pre-check rules (3):** join-table cases where BD does NOT enforce pair/composite uniqueness at the DB level. Pattern uses array-syntax multi-filter (`property[]=...&property_value[]=...&property_operator[]==` per field, AND-combined) to filter-find on the full pair/triple.

| Endpoint | Pair/Triple | Consequence of duplicate |
|---|---|---|
| `createLeadMatch` | `(lead_id, user_id)` | Member gets double-billed for the same lead; inbox shows the match twice; reports double-count |
| `createTagRelationship` | `(tag_id, object_id, tag_type_id)` | Same tag attaches to same object twice; tag counts inflate; widgets may render duplicate tag chips |
| `createMemberSubCategoryLink` | `(user_id, service_id)` | Member double-counted in that Sub Category's listing widgets; per-link metadata (specialty/avg_price) ambiguous — which row wins? |

All 6 rules follow the canonical filter-find pattern (server-side filter, not paginate-and-search — one tiny response regardless of site size) established in v6.12.0. The blanket instruction paragraph in `mcp/index.js` is reorganized to separate "Name-based (single natural-key field)" from "Pair / composite uniqueness (join tables)" — **21 resources total now carry pre-check rules**.

### Removed — TagType write CRUD tools (safety)

Removed `createTagType`, `updateTagType`, `deleteTagType` from the spec. Only `listTagTypes` and `getTagType` remain.

**Why:** tag types are foundational taxonomy — each row defines a `tag_type_id` → `table_relation` mapping that drives `createTagRelationship` / `listTagRelationships` / widget filters / admin UI behavior. Accidental writes cascade across tags, groups, relationships, and any widget that binds to a `tag_type_id`. BD admin UI is the right surface for this; the API no longer exposes it.

**Impact:** if an automation was creating/updating/deleting tag types via this MCP, it must be re-routed to BD admin. Read operations (`listTagTypes` / `getTagType`) are unchanged — enumerating existing tag types to pick the right `tag_type_id` for `createTagRelationship` still works normally. Op count: 176 → 173.

Doc + spec change. No breaking changes to the 173 surviving tools.

### Added — users_meta IDENTITY RULE hardening

`(database, database_id)` is an atomic compound identity. The same numeric `database_id` routinely belongs to UNRELATED rows on different parent tables — `database_id`-alone queries return cross-table row mixes where one ID resolves as several different records simultaneously. A loop-delete by `meta_id` without checking `database` on each row can destroy unrelated resources' metadata.

**Hardened across all 5 users_meta tools** (`listUserMeta`, `getUserMeta`, `createUserMeta`, `updateUserMeta`, `deleteUserMeta`):
- `(database, database_id)` now framed explicitly as one atomic compound identity, not two independent fields. Agents must never treat `database_id` as a global identifier.
- `listUserMeta` carries the closed-set list of 25 valid `database` values (`users_data`, `deleted_users_data`, `data_posts`, `list_seo`, `subscription_types`, `list_professions`, `list_services`, `rel_services`, `tags`, `tag_groups`, `rel_tags`, `leads`, `lead_matches`, `forms`, `form_fields`, `users_reviews`, `menus`, `menu_items`, `data_widgets`, `email_templates`, `301_redirects`, `data_categories`, `smart_lists`, `users_clicks`, `unsubscribe_list`). Pass only these — never invent table names.
- `updateUserMeta` / `deleteUserMeta` require the agent either (a) `getUserMeta(meta_id)` first and inspect returned `database`+`database_id` before writing, OR (b) obtain `meta_id` from a `listUserMeta` whose results have been client-side filtered to the intended `(database, database_id)` pair. Never a `meta_id` from an unscoped list.
- Until the server honors array-syntax multi-filter, the canonical workflow is: list by `database_id`, CLIENT-SIDE filter to rows where `database` matches the intended parent, then act.

### Added — Orphan users_meta cleanup rule (applies to 17 delete tools)

New top-level paragraph in `mcp/index.js` instructions enumerates which delete tools have EAV footprint and the canonical safe-cleanup workflow: scoped cleanup → per-row `deleteUserMeta(meta_id, database, database_id)`. **Never loop-delete by `database_id` alone.**

- **Confirmed EAV parents (5 delete tools):** `deleteUser`, `deleteSingleImagePost`, `deleteMultiImagePost`, `deleteWebPage`, `deleteMembershipPlan`.
- **Probable EAV parents (12 delete tools):** `deleteLead`, `deleteLeadMatch`, `deleteForm`, `deleteFormField`, `deleteReview`, `deleteMenu`, `deleteMenuItem`, `deleteWidget`, `deleteEmailTemplate`, `deleteRedirect`, `deletePostType` / `deleteDataType`. Zero rows is a normal expected outcome on these — running the scoped cleanup is cheap insurance.

One canonical rule in the top-level instructions, not 17 per-tool duplicates — keeps tool descriptions lean while making the safety rule unmissable.

### Added — Universal directive: update-tool schemas are documentation, not whitelists

Closes a real hallucination pattern observed in the wild: an agent refused to edit `feature_categories` on a post type because it wasn't listed in `updatePostType`'s `properties` — the agent concluded "tool-schema limitation" and told the user the field couldn't be edited via the API. That was wrong. BD's backend accepts any field it recognizes as a column/EAV key on the target resource — the spec's `properties` list just documents the commonly-edited, enum-tagged, or interaction-annotated fields.

Live-verified on `updatePostType data_id=14 feature_categories="..."`: the call succeeded and the new value persisted, even though `feature_categories` is not in the spec's properties list.

Added a new top-level directive in `mcp/index.js` instructions: any field that appears in a resource's `get*`/`list*` response is updatable via that resource's `update*` tool, regardless of whether it's listed in the update schema. Agents should no longer refuse edits on schema-absence grounds; workflow is GET-to-confirm-field-exists → send update → re-GET to verify round-trip.

Applies universally to every `update*` tool in the API, not just post types.

Doc-only. No schema changes. No new tools. Zero breaking changes.

## [6.12.0] - 2026-04-20

### Added — Duplicate silent-accept pre-check rules extended to 10 more create endpoints

BD does NOT enforce DB-level uniqueness on most natural-key fields. Two creates with the same name both succeed, produce different primary keys, and leave downstream lookups ambiguous (which record wins?). v6.9.x–v6.11.x already documented the pre-check pattern for 5 resources (`createUser` email, `createTag` tag_name, `createUserMeta` triple, `createWebPage` filename, `createForm` form_name). This release extends the same pattern to **10 additional create endpoints**, closing the remaining silent-duplicate surface on the API.

**Endpoints that now carry a pre-check rule in their tool description:**

| Endpoint | Natural-key field | Consequence of duplicate |
|---|---|---|
| `createEmailTemplate` | `email_name` | Wrong template fires on transactional triggers |
| `createWidget` | `widget_name` | `[widget=Name]` shortcodes resolve to wrong widget |
| `createMenu` | `menu_name` | Wrong menu renders in layout slots |
| `createTopCategory` | `filename` | `/filename` URL resolves ambiguously |
| `createSubCategory` | `filename` (scoped to `profession_id`) | URL collision within a parent category |
| `createMembershipPlan` | `subscription_name` | Admin / billing / migration ambiguity |
| `createTagGroup` | `group_tag_name` | Tag-manager ambiguity + broken group-bound filters |
| `createSmartList` | `smart_list_name` | Lookups bind to the wrong list |
| `createDataType` | `category_name` | Post-type UI corruption + posts under wrong type |
| `createRedirect` | `old_filename` | **TWO checks** — exact-pair skip + reverse-rule loop prevention (prevents A→B + B→A redirect loops) |

**The canonical pre-check pattern — server-side filter-find, NOT paginate-and-search:**

```
list<Resource> property=<natural-key-field> property_value=<proposed> property_operator==
```

Returns ONE tiny response regardless of how many records the site has. Sites in the wild have thousands of posts / widgets / redirects / email templates / plans — dumping full lists to search for a name burns rate limit and context for nothing. The filtered lookup is deterministic, cheap, and correct.

**Flow:**
1. Filter-find with `property_operator==` on the natural-key field.
2. Zero rows → name is free, proceed with create.
3. ≥1 row → taken. Reuse the existing record's ID via the corresponding `update*`, OR ask the user, OR pick an alternate name and re-check. Never silently create a duplicate.

**`createRedirect` special case — redirects are uniquely dangerous** (wrong rules cause infinite loops and real SEO damage). TWO filter-finds required:
- **Check 1 — exact-pair skip:** if a rule with the same `old_filename` + same `new_filename` already exists, skip the create (idempotent). If same `old_filename` but different `new_filename`, ask the user which destination wins.
- **Check 2 — reverse-rule loop prevention:** if a rule B→A exists when creating A→B, STOP. Creating would produce an infinite redirect loop. Flag to the user and ask whether to delete the existing reverse rule first or abandon the create.

**MCP instructions blanket paragraph updated** (line 781 in `mcp/index.js`) — the top-level duplicate silent-accept rule now lists all 15 resources, names the natural-key field on each, and emphasizes "server-side filter-find, NOT paginate-and-search" as the canonical mechanism. The per-tool descriptions carry the fully-expanded rule with the resource-specific consequence; the top-level rule is the general pattern.

Doc-only. No schema changes. No new tools. Zero breaking changes.

## [6.11.3] - 2026-04-20

### Added — Existing CDATA/entity-escape rule now also covers tool-call scaffolding tags

Live-observed: an agent's `content` field on a WebPage got saved with a literal `<parameter name="content">...</parameter>` wrapper leaked in from the agent's reasoning scaffolding. Rendered as visible broken markup on the live page.

Same class of bug as CDATA (`<![CDATA[...]]>`) and entity-escape (`&lt;`) wrappers — agent's own tooling syntax leaks into the stored value, BD stores it verbatim, renders as text. We already had a strong rule forbidding the first two; it just didn't name the third pattern.

Extended the existing "never wrap in CDATA / never entity-escape" rule in:
- **MCP instructions** (top-level, line 787): added "never include tool-call scaffolding tags from your reasoning process" with concrete examples (`<parameter name="...">...</parameter>`, `<invoke>`, `<function_calls>`, OpenAI-style `{"function": {...}}` wrappers). Added an explicit recognition cue: "if your final string starts with `<parameter` or `<invoke` or contains `</parameter>` at the end — strip those before sending."
- **19 per-field descriptions** across the spec (all the fields that already carried the CDATA/entity-escape rule): extended to include the scaffolding-tag prohibition inline.
- **WebPage asset-routing quick-reference block** (createWebPage + updateWebPage, right under the 6-row routing bullets): same rule extension.

One rule, one place to document it, one mental model for agents: "BD stores verbatim — pass only the final unwrapped string, no wrappers of any kind."

Doc-only. No schema changes. No new tools. Zero breaking changes.

## [6.11.2] - 2026-04-20

### Fixed — Three-agent sanity audit: C-level + H-level findings closed. Privacy scrub on public docs.

Three sub-agents audited the spec, the `mcp/index.js` server code, and the user-facing docs (README / CHANGELOG / internal notes). Findings consolidated and every real CRITICAL + HIGH issue closed in this single release. Doc + small code fixes only; no schema changes.

**Sanitization fixes:**
- Scrubbed a live-test-site subdomain from README and recent CHANGELOG entries — replaced with generic `https://your-site.com` / "our BD test site" phrasing. Historical CHANGELOG entries that named the same subdomain will be rewritten in a follow-up git-history pass; going forward, no release notes or README reference specific site URLs.
- Scrubbed references to an internal BD core-files path from public CHANGELOG entries — replaced with "BD's admin AI Companion logic" for the same meaning without exposing the internal file path.
- Scrubbed mentions of our internal strategy document from public CHANGELOG entries — rules now restated inline ("per our Maintenance Contract", "our policy: avoid count numbers in user-facing copy", "tracked internally") without naming the internal file.

**CRITICAL directive fixes:**
- `mcp/index.js` HTML-allowed fields list had `content_footer` in it — but `content_footer` is the page-access gate enum (`""` / `members_only` / `digital_products`), NOT HTML. Fixed to list the actual HTML-accepting WebPage fields (`content_css` / `content_footer_html` / `content_head`) and explicitly call out that `content_footer` is the access-gate enum.
- `getBrandKit` spec description described v6.11.0's broken approach (single `layout_group=theme_1` call). Rewritten to describe the actual v6.11.1+ behavior: 20 parallel per-slot calls filtered by `setting_name`, using BD's canonical semantic mapping, ~1s wall-clock, safe under rate limit.
- `createWebPage.form_name` and `updateWebPage.form_name` field descriptions had the default for `profile_search_results` pages listed as `Member Profile Page` — contradicted the workflow step 4 which (correctly, as of v6.10.11) says `Member Search Result`. Both field-level descriptions now match: default is `Member Search Result`; explicit "NOT `Member Profile Page` — that's for member profile/detail pages, not search-results pages" clarifier.

**HIGH directive fixes:**
- `createWebPage` "Required:" prose now includes `date_updated` (YYYYMMDDHHmmss) alongside `seo_type` + `filename`, matching the schema `required` array. Previous prose omitted it.
- `content_footer` description on both `createWebPage` and `updateWebPage` had a circular sentence ("for below-body HTML use `content`") — rewritten to "there is no dedicated 'extra HTML below the body' field — put below-body markup inside `content` itself (the body field)."
- `getBrandKit` handler code: partial-failure path now surfaces a `_warnings` array on the response when any of the 20 BD fetches actually fail (network / non-200). Missing-row-on-success is NOT a failure (slot simply isn't set on this site, fallback applies silently, by design). Agents now get explicit signal when values are fallbacks due to upstream failures vs. by design.
- `getBrandKit` dispatch order: intercept now runs BEFORE the generic `toolMap` lookup / "Unknown tool" check, so the synthetic handler is structurally independent of whether the spec entry happens to be present in the tool registration. Removes a subtle coupling.
- README op-count scrubbing: three different op counts (175 tools / 175-op / 164 operations) in one document — user-facing counts rot as the spec evolves. Rewrote all three to future-proof wording: tier table now says "full BD MCP" without a count; Custom GPT fallback says "well over 30 operations"; bottom-of-README summary lists the domain areas (members / posts / leads / etc.) with no count. Our policy: no operation counts in user-facing copy.
- MCP instructions cache-refresh paragraph had `updatePostType` inside the "Also recommended" list with a parenthetical "not optional" — contradicted itself. Split into explicit REQUIRED (hero writes + `updatePostType`) and recommended (menus / widgets / plans / categories).

**Audit false positives (verified, no fix needed):**
- Audit flagged `listSidebars` as referenced-but-missing; the tool IS in the spec and registered — audit was working from a stale tool list.

**Medium/low findings deferred:** several phrasing inconsistencies, minor bloat in the Member Search Results SEO paragraph, `btn-light` exclusion could be made explicit in the Button variant list, `SLOTS_WITH_DEFAULTS` map values vs inline `pick()` defaults drift risk. None affect agent behavior today; batch into a future polish release.

No schema-breaking changes. No new tools. All edits are doc/instruction corrections + one minor handler restructure.

## [6.11.1] - 2026-04-20

### Fixed — `getBrandKit` now returns current values regardless of which `layout_group` they're stored in

v6.11.0's `getBrandKit` queried `/website_design_settings/get?property=layout_group&property_value=theme_1` on the assumption that all brand-kit slots live in `theme_1`. **That assumption was wrong.** BD stores design settings across multiple `layout_group` records (`default_layout`, `theme_1`, etc.) and the admin Design Settings UI reads whichever row has the saved value regardless of group. On our BD test site, a user-edited `custom_2 = rgb(245, 47, 0)` lived in `default_layout`, not `theme_1` — so v6.11.0 missed it and returned the fallback `rgb(51,51,51)`.

**Fix:** handler now makes **20 parallel calls** (one per slot) each filtered by `setting_name` only, with no `layout_group` filter. This matches what BD's admin AI Companion logic does internally (queries `WHERE setting_name IN (...)` with no group filter). BD returns whichever row has the value — the tool now sees the same values the admin UI does.

**Performance:**
- 20 parallel requests via `Promise.all`
- Live-tested: ~830ms total on the test site (parallelism means the user waits for the slowest single call, not the sum)
- Well under BD's 100 req/60s rate limit — even back-to-back `getBrandKit` calls wouldn't approach the ceiling
- Agents cache the result session-side (MCP instructions tell them to call once per conversation and reuse) — so real-world cost is 20 calls once, not repeated

**Why not fewer calls?** Tried and ruled out during v6.11.0 debug:
- `property_operator=LIKE` with `custom_%` — BD errored (`LIKE` on this endpoint is unreliable, known quirk we document elsewhere)
- `property_operator=in` with comma-separated values — BD errored
- Array-syntax OR-across-`setting_name` — BD errored
- Fetching unfiltered (`limit=250`) — BD caps page size at 100, total DB has 764 rows = 8 pages = 8 calls just to sweep the table, plus 700+ rows of noise

Per-slot filtered GET is the only reliable shape BD's current API offers. 20 parallel reads is the right answer.

**Live-verified fix on our BD test site:**
- `custom_2` → `rgb(245, 47, 0)` ✓ (was returning fallback `rgb(51,51,51)` in v6.11.0)
- All 20 slots resolved from their correct layout_groups in one call
- Output shape identical to v6.11.0 — no breaking changes for agents that already integrated

## [6.11.0] - 2026-04-20

### Added — `getBrandKit` synthetic tool for design-task color + font context

New MCP tool — **the first synthetic tool in this package** (all 175 prior tools are direct OpenAPI-to-MCP passthroughs; `getBrandKit` has a custom handler that transforms raw BD data into a compact semantic shape).

**Purpose:** give AI agents a one-call way to pull the site's brand palette + fonts before any design task (widget, WebPage, post template, email, hero) so their output visually matches the site's brand instead of guessing colors.

**Under the hood:**
- Single BD API call to `/api/v2/website_design_settings/get?property=layout_group&property_value=theme_1&limit=250` — same endpoint BD's admin AI Companion uses
- Transforms raw `custom_N` slots (BD's internal column names) into semantic labels using BD's canonical mapping (same mapping BD's in-admin AI Companion applies, so API-driven agents and admin-UI agents see the same brand kit)
- Applies BD's documented fallback defaults (from the same handler) when a slot is empty — response is never missing keys

**Response shape** — 10 semantic roles returned on every call:
- `body.background` / `body.text` / `body.font`
- `primary.color` / `primary.text_on`
- `dark.color` / `dark.text_on`
- `muted.color` / `muted.text_on`
- `success_accent.color` / `success_accent.text_on`
- `warm_accent.color` / `warm_accent.text_on`
- `alert_accent.color` / `alert_accent.text_on`
- `card.background` / `card.border` / `card.text` / `card.title`
- `heading_font`
- `usage_guidance` (inline — when to use primary vs dark vs muted, accent semantics, tint rule, font rule)

**Slot mapping (BD's canonical theme_1 layout):**

| Role | Slot | BD default |
|---|---|---|
| body.background | `custom_1` | `rgb(255,255,255)` |
| body.text | `custom_2` | `rgb(51,51,51)` |
| body.font | `custom_3` | `Inter` |
| primary.color | `custom_58` | `rgb(39,108,207)` |
| primary.text_on | `custom_59` | `rgb(255,255,255)` |
| dark.color | `custom_60` | `rgb(24,46,69)` |
| dark.text_on | `custom_61` | `rgb(255,255,255)` |
| success_accent.color | `custom_62` | `rgb(3,138,114)` |
| success_accent.text_on | `custom_63` | `rgb(255,255,255)` |
| warm_accent.color | `custom_64` | `rgb(240,173,78)` |
| warm_accent.text_on | `custom_65` | `rgb(255,255,255)` |
| alert_accent.color | `custom_66` | `rgb(217,83,79)` |
| alert_accent.text_on | `custom_67` | `rgb(255,255,255)` |
| card.background | `custom_71` | `rgb(255,255,255)` |
| card.border | `custom_72` | `rgb(230,232,236)` |
| card.text | `custom_73` | `rgb(24,46,69)` |
| muted.color | `custom_74` | `rgb(242,243,245)` |
| muted.text_on | `custom_75` | `rgb(24,46,69)` |
| card.title | `custom_134` | `rgb(24,46,69)` |
| heading_font | `custom_208` | falls back to `body.font` |

**Why `layout_group=theme_1` specifically:** live-test confirmed `setting_name` values like `custom_2` are NOT globally unique — the same slot name exists in multiple `layout_group`s simultaneously with different values. Filtering by `layout_group=theme_1` pins the call to the theme-level brand settings (where the agent-facing palette lives) and avoids cross-group ambiguity with `default_layout` or other groups.

**MCP instructions** — new paragraph tells agents to call `getBrandKit` ONCE at the start of any design-related task, cache the result for the session, and derive all hover/tinted/gradient colors from the returned palette. Explicit rule: **do NOT introduce unrelated hues** and **do NOT redeclare `body.font` / `heading_font` in `content_css`** (they're already globally loaded by BD — only re-import if deliberately switching font families).

**No args.** Read-only. Safe to call any time. Cheap (one BD API call, well under rate limit).

No schema changes to any existing endpoint. New synthetic endpoint `/_synthetic/brand_kit` in the OpenAPI spec is a tool-registration stub — the actual handler intercepts in `mcp/index.js` before the generic dispatcher, so no `/_synthetic/*` call ever hits BD.

## [6.10.12] - 2026-04-20

### Added — No max-width wrappers on `profile_search_results` page content

Live-observed: agents creating `profile_search_results` SEO pages were wrapping the `content` HTML (or adding `content_css` rules) like `max-width: 960px; margin: 60px auto; padding: 0 20px;`. BD's page layout already supplies the outer container (width, centering, padding) for these pages — adding an inner wrapper double-constrains the content and renders the SEO copy as a narrow strip inside BD's already-centered layout. Visibly broken.

Rule documented in:
- **`createWebPage` + `updateWebPage` `profile_search_results` workflow — new step 7**: "No max-width wrappers in `content` (or `content_css`) on profile_search_results pages. BD's layout already provides the outer container — don't double-constrain." Downstream step 8 (country-only slug caveat) renumbered to step 9.
- **MCP instructions `profile_search_results` paragraph**: brief one-liner appended to the h1/h2 double-render trap note, same rule.

No schema-breaking changes. Doc-only. Agents reading either surface now know to let section content flow at the natural container width, scope styling to section-specific classes under a unique page wrapper, and never add top-level `max-width` + `margin: auto` as the outermost layout rule.

## [6.10.11] - 2026-04-20

### Fixed — Default `form_name` on `profile_search_results` pages is `Member Search Result`, not `Member Profile Page`

Live-observed: agents creating `profile_search_results` pages were assigning `form_name="Member Profile Page"` per the directive's documented default. That's wrong — `Member Profile Page` is the sidebar designed for member profile/detail pages, not search-results pages. The correct default for `profile_search_results` pages is `Member Search Result` (one of the 6 Master Default Sidebars, purpose-built for this page type).

Fixed in 4 locations:
- `createWebPage` profile_search_results workflow step 4 (required defaults): now `form_name="Member Search Result"` with explicit "do NOT use Member Profile Page" warning.
- `updateWebPage` profile_search_results workflow step 4: same fix.
- Both descriptions' "if user requests different sidebar" fallback: now suggests `Member Search Result` as the safe default to offer, not `Member Profile Page`.
- MCP instructions profile_search_results paragraph: `form_name="Member Search Result"` with inline "NOT Member Profile Page" clarifier.

No schema-breaking changes; existing `profile_search_results` records created with `Member Profile Page` continue to render (they just have the wrong sidebar). Going forward, agents produce pages with the correct sidebar on first try.

## [6.10.10] - 2026-04-20

### Changed — OpenAI section honestly rewritten: Codex CLI is the real path, Custom GPT demoted to fallback

Live-testing the ChatGPT Custom GPT flow surfaced a hard wall: Custom GPT Actions cap at **30 operations per GPT**, and our MCP exposes 175. That wall applies to ChatGPT web, ChatGPT Desktop, and the Codex Cloud desktop app (all three share the same Custom GPT infrastructure). The only OpenAI surface that supports full BD integration is **Codex CLI** (terminal-based).

Section header renamed from `ChatGPT (GPT Actions)` to `OpenAI (ChatGPT / Codex)`. The section now leads with an honest tier table showing which OpenAI surfaces work vs. don't, followed by a complete Codex CLI walkthrough:

**Tier table** up top (at-a-glance):
- ChatGPT web — ❌ 30-op cap
- ChatGPT Desktop — ❌ same 30-op cap
- Codex Cloud app — ❌ App Server architecture, partial MCP support
- Codex CLI — ✅ full MCP, no cap

**Codex CLI walkthrough** (new, ~30 lines):
1. `npm install -g @openai/codex`
2. `codex --version` verify
3. `codex` → sign in with ChatGPT Plus/Pro/Team/Enterprise (required tier; free tier can't use Codex)
4. Edit `~/.codex/config.toml` (Mac/Linux) or `%USERPROFILE%\.codex\config.toml` (Windows)
5. Add TOML block (TOML format, not JSON — gotcha called out explicitly):
   ```toml
   [mcp_servers.bd-api]
   command = "npx"
   args = ["-y", "brilliant-directories-mcp", "--api-key", "ENTER_API_KEY", "--url", "https://your-site.com"]
   ```
6. Test: `codex` then ask for BD members

**Custom GPT section demoted to "Fallback"** subsection at the bottom with clear framing: only useful if you're already in ChatGPT Plus/Team, want a browser GUI, and are OK trimming our 175-op spec down to ≤30 ops manually before importing. Full integration path is Codex CLI above.

**TOC updated:** `ChatGPT (GPT Actions)` → `OpenAI (ChatGPT / Codex)`.

### Why this rewrite
Previous section told users to build a Custom GPT from our full spec — which silently fails past op 30. Live walkthrough with a new user surfaced the 30-op wall only AFTER they'd followed every other step correctly (sign up, create GPT, paste schema, configure auth, privacy policy, `Only me` sharing). Every minute spent in that flow was wasted. New section steers OpenAI users to the path that actually works on the first try, and tells everyone else (GUI users) to pick Claude Desktop / Cursor / Windsurf / Cline instead.

No code / schema changes. README-only; synced root + `mcp/` copies.

## [6.10.9] - 2026-04-20

### Fixed — CDATA/entity-escape rule reinforced at WebPage asset-routing decision point

Live incident: an agent creating a WebPage wrapped the HTML body in `<![CDATA[...]]>`, which BD stored as literal visible text on the rendered page. The existing "never wrap in CDATA, never entity-escape" rule was already documented on individual field descriptions (`content`, `seo_text`, `hero_section_content`) and in the MCP top-level instructions (line 785 of `mcp/index.js`), but the rule was absent from the WebPage asset-routing quick-reference bullets agents read at the moment of deciding which field gets which content. Plus, the three v6.9.6-new asset-routing fields (`content_css` / `content_footer_html` / `content_head`) weren't in the MCP top-level example list.

Two surgical additions, zero new rules:

- **`createWebPage` + `updateWebPage` asset-routing quick-reference:** new one-line reinforcement immediately after the 6-row routing list: *"All asset fields above accept raw content verbatim — never wrap in `<![CDATA[...]]>`, never entity-escape `<` as `&lt;` or `>` as `&gt;`. BD stores whatever you send; wrappers and escapes become literal visible text on the rendered page."* Places the rule at the moment of decision (agent reading routing matrix to pick a field = agent about to author the field content = perfect spot for the reminder).
- **MCP top-level instructions example list:** added `content_css` / `content_footer_html` / `content_head` to the list of HTML-accepting fields on the existing "Never wrap ANY field value in `<![CDATA[...]]>`" paragraph. Closes the gap where an agent reading the top-level paragraph would see `content` named but not the three other asset routing fields — and subconsciously treat them as "different."

Rejected Claude's suggestion to add a per-write verification step ("scan returned record for literal CDATA/entities after every write"). That's defensive paranoia that either gets ignored or over-applied; agents should already verify results and a per-tool self-check bloats every description. Prevention (clear rule at the decision point), not detection (post-hoc scanning).

No schema changes. Doc-only.

## [6.10.8] - 2026-04-20

### Changed — ChatGPT Custom GPT setup walkthrough rewritten from a live install session

Live-walkthrough with a first-time user surfaced several issues in the previous ChatGPT section. Entire section rewritten accurately. Doc-only.

- **🔒 CRITICAL: `Only me` sharing rule added up front.** Custom GPTs embed the BD API key in the Action. `Anyone with the link` sharing lets anyone with the URL invoke BD API calls on YOUR site using YOUR key — create members, delete pages, anything. `GPT Store` publishes it publicly. The previous section didn't cover the sharing step at all. Now a prominent red-flag callout at the top of the section + an explicit final step saying "pick `Only me` → Save."
- **`Import from URL` doesn't work** — ChatGPT Actions rejects our spec's `{bd_site_url}` template variable with `Could not find a valid URL in 'servers'`. Previous instructions told users to Import from URL; they'd hit the error and be stuck. Now the section explicitly says **"cannot use Import from URL"** and walks users through the paste-and-hand-edit workflow:
  1. Open raw JSON URL in browser, `Ctrl+A` → `Ctrl+C`
  2. Paste into ChatGPT's Schema text box
  3. Find the `"servers"` block near the top
  4. Replace the ENTIRE block with `[{"url": "https://<your-actual-BD-site>"}]` — delete `description`, `variables`, everything except one hard-coded URL
  5. Red error disappears, ~175 actions populate
- **Privacy policy field** — required by ChatGPT, not mentioned in the previous section. Users blocked at save. Now documented: use `https://brilliantdirectories.com/privacy-policy` for private/testing GPTs.
- **Skip Knowledge / Upload files / Capabilities / Conversation starters** — previous section implied all the main Configure fields mattered. Clarified: only Name + Description + Actions matter for this integration. Everything else is optional or unrelated.
- **Button locations and navigation paths updated** per ChatGPT's current UI (button labels differ from version to version — e.g. "Create" button is top-right in the current UI, not the left-sidebar location implied by old docs).
- **Authentication field-by-field table** — previous version was one sentence; now explicit per-field: `Authentication Type` = API Key, `API Key` = paste BD key, `Auth Type` = Custom (NOT Basic or Bearer), `Custom Header Name` = `X-Api-Key` (exact case). Explains why Custom (BD uses `X-Api-Key` not `Authorization: Bearer`).
- **Cross-reference to Advanced Endpoints prerequisite** added — reminds users to enable ALL ON permissions before pasting the key, so the GPT doesn't hit 403s on common tools.
- **"What won't work"** trailing note kept; added ChatGPT mobile apps (can't add Actions) to the list.

No schema / code changes. README-only; synced root and `mcp/` copies.

### Why the detail
Live-walking a new user through this setup surfaced ~7 specific friction points in ~30 minutes. Each one is now an explicit instruction instead of a gotcha to discover. Agents reading the section end-to-end should produce a working private Custom GPT on first try.

## [6.10.7] - 2026-04-20

### Added — Mandatory `form_name` pre-check on `createForm`

Same class of bug as the v6.10.4 duplicate-WebPage incident, extended to forms: BD does NOT enforce unique `form_name` values on the forms table, so two `createForm` calls with the same `form_name` both succeed and produce two separate form records with different `form_id` values. Downstream `createFormField` calls that target `form_name` become ambiguous, `[form=my_form_name]` shortcodes render unpredictably, and sidebar/template references are undefined.

- **`createForm` top-level description**: new prominent callout right after "Required:" with the mandatory pre-check pattern. Call `listForms property=form_name property_value=<slug> property_operator==` before every `createForm`. On match: `updateForm` the existing record, OR ask the user, OR pick an alternate slug (`-v2`, `-2026`, etc.) and confirm.
- **MCP instructions duplicate-silent-accept paragraph**: `createForm` (form_name on the forms table) added to the list of resources with no DB-level uniqueness, alongside `createUser`, `createTag`, `createUserMeta`, `createWebPage`.

Same shape as the `createWebPage` pre-check (v6.10.4) — agents running identical prompts in two sessions produce identical-slug duplicates unless they check first.

No schema-breaking changes; doc-only.

## [6.10.6] - 2026-04-20

### Fixed — Button `btn-light` removed from variant list; new JS-ready CSS-gate rule for admin editor compatibility

Two changes:

- **Button variant list correction.** `btn-light` is not a supported variant on BD sites by default — removed from the `input_class` pattern list on all 6 surfaces: createFormField description, createForm recipe, updateFormField description, createFormField schema property, updateFormField schema property, and MCP instructions form recipe paragraph. Remaining variants: `btn-primary` / `btn-secondary` / `btn-danger` / `btn-success` / `btn-warning` / `btn-info` / `btn-dark`, OR a custom site-CSS class.
- **Admin Froala editor compatibility for JS-gated CSS effects.** Live-observed issue: agent-generated pages using scroll-reveal animations (`.reveal { opacity: 0 }` in CSS + IntersectionObserver in JS) become un-editable in the admin Froala editor because the editor applies `content_css` but does NOT run `content_footer_html` scripts. Hide-by-default CSS fires; JS to un-hide never runs; content permanently invisible in the admin. Same pattern affects tab panels, accordion collapsed states, modal hidden defaults, slider non-active slides — anything that starts hidden and relies on JS to reveal.

  **Fix pattern documented:** gate hide-by-default rules behind a `.js-ready` class on a page-scoped wrapper, and have `content_footer_html` JS add that class on load as its first line. Live site: JS flips `.js-ready` on immediately, CSS activates, effects work. Admin editor: class never added, content stays visible and editable.

  ```
  /* content_css */
  .my-page.js-ready .reveal { opacity: 0; }
  .my-page.js-ready .reveal.is-visible { opacity: 1; }

  /* content_footer_html */
  <script>
    document.querySelector('.my-page')?.classList.add('js-ready');
    /* rest of reveal / slider / modal JS */
  </script>
  ```

  Documented in 3 places:
  - `content_css` property description: ⚠️ callout explaining the gotcha + pointing agents at the `.js-ready` gate pattern
  - `content_footer_html` property description: reverse-cross-ref explaining the JS requirement + the first-line `classList.add('js-ready')` rule
  - MCP instructions WebPage asset-routing paragraph: one-liner summary of the gotcha + gate pattern + JS first-line rule

  Credit to a Claude session that surfaced the bug after building a scroll-reveal landing page that rendered perfectly on the live site but went invisible in the admin editor.

No schema-breaking changes; doc-only.

## [6.10.5] - 2026-04-20

### Added — Form Button field `input_class` is required for styling

The Submit Button field on every BD form needs `input_class` set or it renders as an unstyled native browser button. Agents creating forms without this produced working-but-ugly submits — users would accept the form built, notice the button looked broken, and ask for a fix.

- **`createFormField` schema**: added `input_class` property (optional at schema level since it's only required on Button; non-Button fields can omit). Description explains canonical pattern `btn btn-lg btn-block <variant>` with the Bootstrap variant list (`btn-primary` / `btn-secondary` / `btn-danger` / `btn-success` / `btn-warning` / `btn-info` / `btn-light` / `btn-dark`) OR a custom class targeted by site CSS. Example value: `btn btn-lg btn-block btn-secondary`.
- **`updateFormField` schema**: same property added for editing existing Button fields.
- **`createFormField` tail-pattern description**: Button bullet now explicitly lists `input_class` as REQUIRED with the canonical pattern + variants + example.
- **`createForm` top-level recipe step 7 (tail pattern)**: Button line now carries the `input_class` requirement inline so agents see it when reading the recipe top-down.
- **MCP instructions form recipe paragraph**: same `input_class` rule appended to the Button-field sentence so cold agents see it on first load.

Without `input_class`, the submit button renders with no Bootstrap styling — reads as a broken form to end users even though submission works.

## [6.10.4] - 2026-04-20

### Fixed — v6.9–v6.10 directive sanity-check sweep + live-observed duplicate-WebPage incident

Cold-read audit across every directive shipped between v6.9.0 and v6.10.3. One CRITICAL, two HIGH, two LOW findings closed — plus a live-observed incident where two AI sessions running the same prompt produced two WebPages at the same URL (`/free-ebook` created twice).

- **CRITICAL — `updateWebPage.form_name` parameter description said "Five Master Default Sidebars" and omitted `Member Search Result`.** Every other surface (MCP instructions, `listSidebars`, `getSidebar`, `createWebPage.form_name`, `updatePostType.category_sidebar`) correctly said six. Agents editing an existing WebPage's sidebar in isolation — the most common read surface — would refuse a valid `Member Search Result` value or not suggest it when the user asked. Fixed to "Six" + full 6-master list.
- **HIGH — `updateForm` description missed the silent-fail warning on `form_target`.** `createForm` said "BD accepts the create without it and the form silently goes nowhere on submit" but `updateForm` just said "also set `form_target`" — an agent flipping `form_action_type` TO `redirect` via update could leave `form_target` unset. Warning now matches `createForm`.
- **HIGH — `updateFormField` description had no ReCaptcha/HoneyPot editing guidance.** `createFormField` told agents to OMIT `field_required` / `field_placeholder` / view-flags on those two field types; `updateFormField` didn't repeat it, so an agent editing an existing ReCaptcha/HoneyPot field could add those properties and break submission. Now mirrored. Also added a reorder warning — if moving a field via `field_order`, the ReCaptcha → HoneyPot → Button tail must remain the three highest-ordered fields.
- **LOW — "one of the one of the 6 Master Default Sidebars" duplicated-phrase typo** in two places in `createWebPage`/`updateWebPage` profile_search_results workflow. Fixed.
- **LOW — MCP hero image-sourcing rule said "every hero they create" — ambiguous about whether agents should always-enable-a-hero.** Clarified to "whenever an agent enables a hero without an image URL supplied by the user."

**NEW live-observed finding — duplicate-`filename` prevention reinforced.**

User reported: two Claude Desktop sessions with identical prompts produced two `createWebPage` calls with the same `filename=free-ebook` — both succeeded, both pages live at the same URL, different `seo_id`s. BD does not enforce unique filename (documented since v6.5.3) but the rule was buried inside the `profile_search_results` workflow section of the page descriptions. Now a prominent top-level rule on `createWebPage`:

- **Mandatory pre-check** before EVERY `createWebPage` call (not just `profile_search_results`): `listWebPages property=filename property_value=<slug> property_operator==`. If a row exists — either `updateWebPage` the existing one, ask the user, or pick an alternate slug (append `-2`, `-3`, etc.) and confirm.
- **MCP top-level duplicate silent-accept paragraph** updated with the live incident + the "pick an alternate slug" option so agents know they have three choices (reuse, confirm-overwrite, rename) rather than two.

No schema-breaking changes; every fix is doc-only.

## [6.10.3] - 2026-04-20

### Added — Hero + first-section background-color gap fix

When a WebPage has the hero enabled AND the first content section has any background color, BD's default layout inserts a ~40px blank white gap between them. The fix: add `.hero_section_container + div.clearfix-lg {display:none}` to `content_css`. Now documented in:

- **`createWebPage` + `updateWebPage` description**, right after the hero safe-defaults section. Includes when to apply (hero enabled + first section has BG color) and when it's unnecessary (first section has no background — gap not visually noticeable).
- **MCP instructions hero paragraph**, same rule in tighter phrasing.

Agents building hero pages with colored section backgrounds will now apply the fix proactively instead of the user reporting "weird white gap" after the fact.

## [6.10.2] - 2026-04-20

### Added — `form_action_div` is required when `form_action_type=widget`

The form recipe was missing one required field. When `form_action_type=widget` (Display Success Pop-Up Message — the agent default and most common setting), BD needs `form_action_div` set to the DOM target element ID that gets swapped when the success pop-up fires. Without it, the form submits but the user sees nothing happen. Canonical default: `#main-content`.

- **`createForm` schema**: added `form_action_div` property with default `#main-content`. Description explains it's required when `form_action_type=widget`, ignored otherwise, must include the leading `#`.
- **`updateForm` schema**: same property added with an "if flipping action type TO widget, set this" warning.
- **`createForm` top-level description recipe**: new step 4 (`form_action_div=#main-content` when action type is widget). Existing steps 4–6 renumbered to 5–7.
- **MCP instructions paragraph**: step 4 added with the same rule; downstream numbering bumped.

No schema-breaking changes; `form_action_div` is optional but strongly recommended whenever `form_action_type=widget` (which is every agent-created form by default). Agents following the v6.10.1 recipe continue to work but silently produced broken success pop-ups; agents reading v6.10.2 docs will produce working pop-ups on first try.

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

Source for this release: BD's internal AI Companion logic, the canonical source for what the admin-UI AI sends agents editing the same fields. We mirrored that context into our MCP so API-driven agents have the same rules the admin-UI agent already operates under.

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

**Internal strategy notes**
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

Live-tested and found the response shape is RICHER than previously documented, plus discovered two optional parameters BD's support docs don't mention:

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

1. **README.md hard-coded "170 endpoints across 32 resources"** — exactly the kind of count-quoting that rots as the spec evolves. Our policy: avoid count numbers in user-facing copy. Rewrote the headline to list the domains covered (members, posts, leads, reviews, categories, email templates, pages, redirects, smart lists, widgets, menus, forms, tags, membership plans, and more) without any endpoint count.

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
Per our Maintenance Contract, removing operationIds (`listCategoryGroups` et al.) is a breaking change requiring a major bump. Third-party consumers that referenced these tools will need to adapt. Given our traffic is minimal and the tools were rarely-called (likely never working correctly at the BD level anyway), the cost of the break is low and the cleanup value is high.

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

Average description length: 144 chars (only 18 ops) → 600+ chars (all 170 ops). Template is documented internally for all future endpoint additions.

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
Several fields (`email_type`, `type` on redirects, `click_type`, `lead_type`, `priority`, `form_layout`, plus a handful more) still need authoritative values from BD dev team. Tracked internally as open enum candidates.

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
