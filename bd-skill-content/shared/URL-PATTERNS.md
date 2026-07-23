# URL-PATTERNS: BD internal URL construction

Read before generating any internal link. Universal across post types.

**Never fabricate an internal URL.** If you can't verify the target exists, omit the link or section. Any URL placed in a post — internal or external — is character-for-character from its source (a fetched result, a cached row, or a slug built per URL-PATTERNS), never retyped from memory.

## Patterns

| # | Pattern | Format | Notes |
|---|---|---|---|
| 1 | Specific post | `/<post_filename>` | BD stores the data_filename prefix AS PART OF `post_filename` (e.g., `events/austin-tech-summit-2026`). Use verbatim with `/` prefix. Only link posts that are live — the resolved row's `post_status=1`; never drafts. |
| 2 | Post type main listing | `/<data_filename>` | From the cached `data_filename` on the resolved post type (already in agent memory from site context). Varies per site (`/events`, `/calendar`, etc.). |
| 3 | Filtered listing | `/<data_filename>?<filters>` | See the `Pattern 3 filter params` section. |
| 4 | Specific member profile | `/<user.filename>` | Resolve via `searchUsers` only — its results mirror the public member search, so the target is publicly findable. A member surfaced any other way passes only via the searchable-plan check: their plan on `listMembershipPlans` has `searchable=1` AND `search_membership_permissions` contains `visitor`. Never `/listing/<id>`. |
| 5 | Member directory landing — entire directory | `/<getSiteInfo.main_directory_url_relative>` | The directory landing page, cached from the run's `getSiteInfo` call. Lists every member, no location or category filter applied. **Takes NO query parameters** — appending `?category[]=...` or `?lat=...` does not work; Pattern 3's filter params apply to POST listings only, never to the member directory. For filtered member directory links, use Pattern 6. |
| 6 | Member directory — filtered by location and/or category | `/<slug-hierarchy>` | Slug-hierarchy URL that narrows the member directory by category and/or location (e.g. `/california/los-angeles/personal-trainer`). See the `Pattern 6 — Filtered member directory` section for the full construction recipe. |

WebPage-backed link patterns (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) are OUT OF SCOPE for content-creation skills — those require `listWebPages` discovery and belong to the future `/bd:seo` skill. Pattern 6 slug-hierarchy URLs are NOT in this category — BD's dynamic router resolves them natively, no WebPage lookup needed.

## Pattern 3 filter params (universal, every post type)

| Param | Format | Notes |
|---|---|---|
| `category[]` | `category[]=Category%20Name` | Value copied character-for-character from the category ledger — any other string filters nothing. One category per link. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` / `location_type` | `lat=46.7534&lng=-92.0681&location_value=Duluth%2C+MN&location_type=locality` | **Send all four together — `location_type` is required even though `lat`/`lng` do the search.** `lat`/`lng` drive the geo radius (implicit default from site settings). `location_value` is the human-readable label that BD writes into the sidebar search-form input. `location_type` toggles the sidebar form's mode (city vs ZIP) — omit it and BD's URL parser breaks, returning zero results. Always `location_type=locality` (city-level). `location_value` is the clean city string ("Duluth, MN"). |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. **`&` in `href` attributes of HTML-embedded URLs (e.g. inside `post_content`): escape as `&amp;`** per HTML5 spec. Browsers + Froala both accept raw `&` for non-entity sequences, but `?ref=foo&copy=yes` becomes `?ref=foo©=yes` because the parser interprets `&copy` as the copyright entity. The URL examples in this file show URL syntax (raw `&`); when wrapping any URL in `<a href="...">` for `post_content`, output `&amp;` instead.

## Pattern 6 — Filtered member directory (slug-hierarchy URLs)

**Use when:** the sentence's noun matches a specific category and/or location by meaning — the taxonomy label itself is not required — for the member directory (e.g. "running coach in NYC", "yoga instructors in Austin", "personal trainers in Brazil"). When no category or location qualifier fits, use Pattern 5.

**Do NOT call `createWebPage`.** BD's dynamic router resolves these URLs natively. No WebPage needs to exist for the URL to work.

### Slug hierarchy

`country/state/city/top-category/sub-category`

- **Strict order, block-contiguous.** Never reorder. No gaps inside the location chain (country→state→city) or the category pair (top→sub); the location block may meet the category block at any level.
- **A sub-sub filename (`master_id != 0`) takes the sub slot, replacing its parent sub** — never three category segments.
- **A city segment always follows its state** — city names collide across states.
- **No leading slash on the slug itself** (the full URL starts with `/`).
- **Slugs are case-sensitive lowercase**, exactly as returned by the list tools.
- **Prefer the most specific slug-hierarchy you can verify.** Country+state+city+top beats state+top beats top alone.

Valid combinations include (non-exhaustive):

- `top` alone
- `top/sub`
- `state/top`
- `state/top/sub`
- `state/city/top`
- `state/city/top/sub`
- `country/state/top`
- `country/state/city/top`
- `country/state/city/top/sub`
- `state` / `state/city` / `country` / `country/state` / `country/state/city` — location only

Invalid combinations:

- Skipped middle segment (e.g. `country/city/top` — state missing between country and city)
- Wrong order (e.g. `top/state/city`)

### Discovery lookups

Every slug segment MUST come from a live list-tool return. LIKE wildcards: `X%` or `%X` only, never `%X%` — BD's WAF strips one `%`.

**Categories — both levels.** Fire these two calls together, one time per run — only when the draft has produced a noun that wants a Pattern 6 member-directory link, in the same message as that link's member-count check (per METHODOLOGY's Pattern 6/4 gate). Never in Turn 1.

```
listTopCategories limit=100
listSubCategories limit=100
```

`total_pages: 1` → the full tree is cached; semantic-match the topic against it (a weightlifting topic matches "Strength Training" — keyword filters cannot make that match). Sites with one generic top (e.g. "Members") carry the real taxonomy at sub/sub-sub level (`master_id`). `total_pages > 1` → do NOT page; probe with `property=name property_value=<keyword> property_operator=contains limit=10` per distinct topic keyword (max 3). Slugs come from the returned `filename`; subs scope to a resolved top via `profession_id`.

**Member-count gate (every Pattern 6 URL):**

Category-only URLs (top alone, or top/sub):

```
searchUsers pid=<profession_id> (+ tid=<service_id>) limit=1
```

Location-bearing URLs (`searchUsers` cannot filter location):

```
listUsers property=[<location fields>(, profession_id)] limit=1
```

Location fields per `Rule: Compound filters`: city URLs filter `city` + `state_code`; state URLs `state_code`; country URLs `country_code`. Filter values come from the cached discovery rows: `city` = `city_ln`, `state_code` = `state_sn`, `country_code` = the row's `country_code`. Add `profession_id` when the URL has a category segment. This proves the top only — a location URL with a sub segment verifies the same way — `listUsers` with the location fields plus `profession_id` for the sub, `limit=1`; a combination that cannot be counted drops the sub segment and re-counts the top, or drops to Pattern 5. Link only when the count is `>= 1` — BD serves unseeded directory pages with a 404 status by design. Otherwise pick a different category or another Pattern (a Pattern 3 listing in any filter shape, a run-verified post URL, or Pattern 5). Cache verdicts per run. Gate rows verify counts only — never recycle a returned member row as a Pattern 4 link target.

**Country:**

```
listCountries property=country_name property_value=<country>% property_operator=like limit=5
```

Slug = lowercase country_name with hyphens (e.g. "United States" → `united-states`). No `filename` field exists on this resource.

**State:**

```
listStates property=state_sn property_value=<2-letter-code> property_operator=eq
```

Slug = `state_filename` from the return.

**City:**

```
listCities property=city_ln property_value=<city>% property_operator=like limit=10
```

Slug = `city_filename` from the return.

### Per-run caching

- Resolved `<country, state, city>` triples cache once per skill run. Reuse for every link to the same location.
- Resolved `<keyword → top/sub filename>` mappings cache once per skill run. Reuse for every link to the same category.
- Never re-lookup the same value twice in one run.

### Anti-fabrication (mandatory)

- Every slug segment MUST come from a list-tool return.
- Never invent slugs.
- If ANY segment lookup returns zero matches, fall back to Pattern 5 (the bare directory landing) — at most once per post per METHODOLOGY `Link order` — or omit the link.
- A Pattern 5 link is always safer than a fabricated `/austin/running-coach` URL that 404s.

### Examples

- `/united-states/new-york/new-york/running-coach` — country + state + city + top
- `/california/los-angeles/yoga-instructor` — state + city + top (country omitted)
- `/running-coach/marathon-training` — top + sub (location-agnostic)
- `/personal-trainer` — bare top-cat fallback when location lookups fail or aren't applicable
- `/brazil/personal-trainer` — country + top (state/city omitted when the post's location is country-level only)

### When to use Pattern 6 vs Pattern 5

- **Use Pattern 6** when the post body names BOTH a specific category AND a verifiable location, OR a specific category alone with a verifiable top/sub slug, OR a verifiable location alone.
- **Use Pattern 5** when no verifiable category or location fits the sentence. The anchor is still a draft noun naming the people themselves ("local personal trainers"), never site furniture ("our directory," "browse trainers") and never a description of the page.
- **When in doubt, Pattern 5 is the safer default.**

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="noopener" target="_blank">text</a>` |

**`title` attribute required on every `<a>` in post body content** (`post_content`, `group_desc`). Short descriptive phrase (~50-80 chars) of what the link points to — not a duplicate of the anchor text, never an instruction ("Browse...", "Check..."). Example: anchor "personal trainers in Boston" → `title="Boston trainer listings filtered by category and specialty"`. Helps screen readers, hover previews, and SEO.

**Anchor text: 2-4 word noun phrase that reads as part of the sentence — internal and external alike.** The longer description belongs in `title`, never in the anchor. Never the target's full title, never generic ("here", "this page"), never site furniture or page-type nouns ("member directory", "full jobs board", "the events calendar") — in the anchor or anywhere in its sentence. The anchor is a noun phrase the draft already contains, as its sentence wrote it — `title` names the destination; the anchor never does. External anchors carry the source's name ("the NSCA guidelines", not "the guidelines"). An anchor opening a sentence capitalizes its first word like any sentence opener.

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?category[]=Live%20Music
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality
/events?daterange=06%2F15%2F2026+-+06%2F15%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
```

## Don't

- Hardcode `/events` (read `data_filename` live).
- Use `+` for spaces in `category[]`.
- Trailing slashes (BD doesn't use them).
- Double-encode `post_filename` (already URL-safe).
- Mix protocols (use `getSiteInfo.full_url` protocol).
- Invent geo params. Only `lat`+`lng`+`location_value`+`location_type` (sent together — `location_type` required) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip` as raw query params are NOT supported — BD ignores them and the URL filters nothing. Anchor text says the city when the URL filters by location. A draft noun without the city rides a URL filtered another way instead — any shape `Pattern 3 filter params` supports. `location_value` is display-facing (`lat`/`lng` drive the filter) — give it the clean city string ("Los Angeles, CA"), never a street address, never a ZIP. Do not say "in [State]" or "in [Country]" — state/country are not supported filter modes.
- Build links to WebPage-backed URLs that require `listWebPages` discovery (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) — those are `/bd:seo` territory. **Pattern 6 slug-hierarchy URLs are NOT in this category** — they're constructed from live list-tool lookups, no `listWebPages` call needed.
- Bulk-list existing posts to "see what's available" for internal linking — the ban is on new lookups; live post rows already in context from this run's dedup/list calls are fair Pattern 1 targets. Pattern 3 URLs are constructed from the current post's own category + location values — no lookup needed.

## Internal-link variety

In the linking pass, vary the shape of filtered-listing links across posts so posts don't all point at the same pages. Per post, mix several of: (a) category-only, (b) location-only, (c) category+location combined, (d) direct post links (Pattern 1) riding nouns the draft already wrote, to run-verified rows in hand. At most 6 filtered-listing links per post within the overall internal-link budget in METHODOLOGY `Required outcomes`, distributed, never clustered at the end. LLM-judged per post; no fixed rotation. Filtered-listing links use Pattern 3 (post listings) or Pattern 6 (member directory) per their respective construction rules. Link order rule (internal first, external later) lives in METHODOLOGY `Link order` subsection.

## Link shape priority (universal)

Resolve each internal link to the most specific verifiable target the draft's own nouns support, top-down — drop a tier only when the one above has no target:

1. **Category + location combo.** Example for events: same category + same city. Example for jobs: same role + same city. Example for blogs: a Pattern 6 link to the member directory filtered to the member category the topic serves + the post's city (an article mentioning personal trainers in Los Angeles → `/california/los-angeles/personal-trainer`).
2. **Single-filter category-only** OR **single-filter location-only.** Use when only one dimension is naturally relevant in the sentence. A specific related post (Pattern 1) counts at this tier when a draft noun names its specific subject; a draft noun inside a category's subject matter ("water workout" rides its category's listing page) or a city noun goes to that listing page — the anchor keeps the draft's own wording; the taxonomy label lives only in the URL, never planted into prose.
3. **Location + daterange** (events only). Combine with category for the tightest anchor.
4. **Date-range alone** (events only). Rides a time mention the draft already has ("the July 19 race day"). Skip for non-time-bound post types.

Combine across posts — every post doesn't need a combo link. Mix (1) and (2) shapes across a multi-post run so the run's posts don't all target the same pages.
