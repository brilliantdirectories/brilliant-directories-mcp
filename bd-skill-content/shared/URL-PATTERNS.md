# URL-PATTERNS: BD internal URL construction

Read before generating any internal link. Universal across post types.

**Never fabricate an internal URL.** If you can't verify the target exists, omit the link or section.

## Patterns

| # | Pattern | Format | Notes |
|---|---|---|---|
| 1 | Specific post | `/<post_filename>` | BD stores the data_filename prefix AS PART OF `post_filename` (e.g., `events/austin-tech-summit-2026`). Use verbatim with `/` prefix. |
| 2 | Post type main listing | `/<data_filename>` | From `getPostType data_id=N`. Varies per site (`/events`, `/calendar`, etc.). |
| 3 | Filtered listing | `/<data_filename>?<filters>` | See filter params below. |
| 4 | Category landing (data_category WebPage) | `/<webpage.filename>` | From `listWebPages property=seo_type property_value=data_category` map. Fallback to Pattern 3 or omit. |
| 5 | Member search results (profile_search_results WebPage) | `/<webpage.filename>` | From `listWebPages property=seo_type property_value=profile_search_results`. **Site-customized: every site uses a different filename. Never hardcode (`/listing`, `/find`, `/members`, etc.). If no `profile_search_results` WebPage exists for the slug you want, OMIT the link — do not substitute another URL.** |
| 6 | Custom WebPage | `/<filename>` | Rarely needed by content skills. |

## Pattern 3 filter params (universal, every post type)

| Param | Format | Notes |
|---|---|---|
| `q` | `q=keyword` | Keyword search. Tags filter via `q=` (no dedicated tag param). |
| `category[]` | `category[]=Category%20Name` | Repeat for multi-category. Skill defaults to single-category. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` | `lat=34.05&lng=-118.25&location_value=Los+Angeles%2C+CA+90014` | Send all three together for location filtering. `lat`/`lng` drive the geo radius (implicit default from site settings); `location_value` is the human-readable label that populates the search-results address input. Use the post's `post_location` string for `location_value`. |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. Multi-category: repeat `category[]=A&category[]=B`. Default single.

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/...">text</a>` (no rel, no target) |
| External | `<a href="https://..." rel="nofollow" target="_blank">text</a>` |

## Runtime discovery (once per skill run, cache for the run)

1. `getPostType data_id=<target post-type>` → cache `data_filename`.
2. `listWebPages property=seo_type property_value=data_category` → cache `linked_post_category → filename` map.
3. `listWebPages property=seo_type property_value=profile_search_results` → cache filename list.

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?q=austin
/events?category[]=Live%20Music
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX
/events?daterange=06%2F15%2F2026+-+06%2F15%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX
```

## Don't

- Hardcode `/events` (read `data_filename` live).
- Use `+` for spaces in `category[]`.
- Trailing slashes (BD doesn't use them).
- Double-encode `post_filename` (already URL-safe).
- Mix protocols (use `getSiteInfo.full_url` protocol).
- Invent geo params. Only `lat`+`lng`+`location_value` (sent together) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip`, `postal_code` are NOT supported — BD ignores them and the URL filters nothing. Anchor text must match the URL: if the URL filters by city (the only location granularity available), say the city in the link text. Do not say "in [State]" or "in [Country]" when the URL geocode is city-level.
- Guess member-search URLs. The Pattern 5 filename is site-customized (`/listing`, `/find`, `/members`, `/directory`, `/professionals`, etc. — different on every site). Only use what `listWebPages property=seo_type property_value=profile_search_results` returns. If nothing returns, OMIT the link; do NOT pick a plausible-sounding default.

## Internal-link variety (SEO)

When body copy benefits from internal links to filtered listings, vary the link shape across posts to spread internal-link equity. Per post, pick from: (a) category-only, (b) location-only, (c) category+location combined. 1-3 links per post, woven inline where they read naturally — not always concentrated at the end. LLM-judged per post; no fixed rotation. Each link must be a Pattern 3 URL with only the supported params above.
