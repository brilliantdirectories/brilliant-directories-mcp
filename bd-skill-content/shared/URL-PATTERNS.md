# URL-PATTERNS: BD internal URL construction

Read before generating any internal link. Universal across post types.

**Never fabricate an internal URL.** If you can't verify the target exists, omit the link or section.

## Patterns

| # | Pattern | Format | Notes |
|---|---|---|---|
| 1 | Specific post | `/<post_filename>` | BD stores the data_filename prefix AS PART OF `post_filename` (e.g., `events/austin-tech-summit-2026`). Use verbatim with `/` prefix. |
| 2 | Post type main listing | `/<data_filename>` | From the cached `data_filename` on the resolved post type (already in agent memory from site context). Varies per site (`/events`, `/calendar`, etc.). |
| 3 | Filtered listing | `/<data_filename>?<filters>` | See the `Pattern 3 filter params` section. |

WebPage-backed link patterns (data_category landings, profile_search_results pages, custom WebPages) are OUT OF SCOPE for content-creation skills. Those belong to the future `/bd:seo` skill.

## Pattern 3 filter params (universal, every post type)

| Param | Format | Notes |
|---|---|---|
| `q` | `q=keyword` | Keyword search. Tags filter via `q=` (no dedicated tag param). |
| `category[]` | `category[]=Category%20Name` | Repeat for multi-category. Skill defaults to single-category. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` / `location_type` | `lat=46.7534&lng=-92.0681&location_value=Duluth%2C+MN+55802&location_type=locality` | **Send all four together — `location_type` is required even though `lat`/`lng` do the search.** `lat`/`lng` drive the geo radius (implicit default from site settings). `location_value` is the human-readable label that BD writes into the sidebar search-form input. `location_type` toggles the sidebar form's mode (city vs ZIP) — omit it and BD's URL parser breaks, returning zero results. Use `location_type=locality` for city-level (default for content-skill links). Use `location_type=postal_code` for ZIP-radius filtering on sites where the city is too broad (e.g. dense metros). Use the post's `post_location` string for `location_value` regardless of mode. |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. Multi-category: repeat `category[]=A&category[]=B`. Default single.
5. **`&` in `href` attributes of HTML-embedded URLs (e.g. inside `post_content`): escape as `&amp;`** per HTML5 spec. Browsers + Froala both accept raw `&` for non-entity sequences, but `?ref=foo&copy=yes` becomes `?ref=foo©=yes` because the parser interprets `&copy` as the copyright entity. The URL examples in this file show URL syntax (raw `&`); when wrapping any URL in `<a href="...">` for `post_content`, output `&amp;` instead.

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |

**`title` attribute required on every `<a>` in post body content** (`post_content`, `group_desc`). Short descriptive phrase (~50-80 chars) of what the link points to — not a duplicate of the anchor text. Example: anchor "certified personal trainers in Boston" → `title="Browse certified personal trainers in Boston by category and specialty"`. Helps screen readers, hover previews, and SEO.

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?q=austin
/events?category[]=Live%20Music
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality
/events?daterange=06%2F15%2F2026+-+06%2F15%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality
```

## Don't

- Hardcode `/events` (read `data_filename` live).
- Use `+` for spaces in `category[]`.
- Trailing slashes (BD doesn't use them).
- Double-encode `post_filename` (already URL-safe).
- Mix protocols (use `getSiteInfo.full_url` protocol).
- Invent geo params. Only `lat`+`lng`+`location_value`+`location_type` (sent together — `location_type` required) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip` as raw query params are NOT supported — BD ignores them and the URL filters nothing. Anchor text must match the URL granularity: if `location_type=locality` (city-level), say the city in the link text; if `location_type=postal_code` (ZIP-level), say the city + ZIP. Do not say "in [State]" or "in [Country]" — state/country are not supported filter modes.
- Build links to WebPage-backed URLs (custom `list_seo` pages: data_category landings, custom `profile_search_results` pages, hand-built WebPages) — those require `listWebPages` discovery and are `/bd:seo` territory. **Allowed for content skills:** Pattern 1/2/3 URLs for ANY post type — including the Member Listings post type (use its `data_filename` for member search results, use `user.filename` for specific member profiles). These are constructed from values already known, no WebPage lookup needed.
- Bulk-list existing posts to "see what's available" for internal linking. Pattern 3 URLs are constructed from the current post's own category + location values — no lookup needed.

## Internal-link variety (SEO)

When body copy benefits from internal links to filtered listings, vary the link shape across posts to spread internal-link equity. Per post, pick from: (a) category-only, (b) location-only, (c) category+location combined. 1-3 links per post, distributed across intro, middle, and later sections — never clustered at the end. LLM-judged per post; no fixed rotation. Each link must be a Pattern 3 URL with only params from the `Pattern 3 filter params` section.

## Link shape priority (SEO ranking, universal)

When picking which filter combination to link, prefer in this order:

1. **Category + location combo** — highest SEO value. Tightest user intent match. Example for events: same category + same city. Example for jobs: same role + same city. Example for properties: same neighborhood + same property type.
2. **Single-filter category-only** OR **single-filter location-only** — medium value. Use when only one dimension is naturally relevant in the sentence.
3. **Date-range filters** (events only) — lowest. Useful only on events for "other events on this date." Skip for non-time-bound post types.

Combine across posts — every post doesn't need a combo link. Mix (1) and (2) shapes across a multi-post run to spread internal-link equity.
