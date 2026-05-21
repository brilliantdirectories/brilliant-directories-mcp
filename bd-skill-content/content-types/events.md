# Events content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create event posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a request like "create event posts on my site" or similar. They may have specified cities, categories, window, or limit. Run the runbook in order; on per-step failure for a given event, continue to the next event.

1. **Mode detection.** Per METHODOLOGY `Mode detection`.
2. **Site context discovery** (METHODOLOGY Stage 1): `getSiteInfo`, `listTopCategories limit=25` (site-flavor sample only), `listPostTypes`, menus (`main%`/`top%`/`header%`/`footer%` sequence). Also fetch `data_filename` from the resolved events post type (cache for Pattern 1/2/3 URL construction in Stage 9).
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Source research** (METHODOLOGY Stage 2): brainstorm 5-10 candidates from the `Source candidates` section, probe via `WebSearch`, extract via `WebFetch`, apply all 6 quality gates. Land N viable candidates BEFORE any dedup check.
6. **Duplicate detection.** Run METHODOLOGY `Stage 3: Duplicate detection`. Run the `Dedup` section for events-specific match criteria.
7. **Geocode survivors only.** Nominatim each non-duplicate candidate's address. Skip lat/lon on failure.
8. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for events-specific authorization.
9. **Image selection.** Run METHODOLOGY Stage 5 image strategy end-to-end: Topic-fit gate → extension filter → `getImageDimensions` orientation gate (landscape only) → dedup. The sequencing rules + retry behavior are defined there; follow them exactly. Lock the image first — re-doing content when an image fails dedup is the expensive path.
10. **Image dedup.** Per METHODOLOGY Stage 5 dedup step. For events: `listSingleImagePosts property=original_image_url property_value=<URL1,URL2,URL3> property_operator=in`.
11. **Content manufacture.** Proceed straight from Step 10 — no extra lookups. Follow METHODOLOGY Stage 5 universal rules; this file adds events-specific load-bearing facts.
12. **Create the post** via `createSingleImagePost` with the field set in the `BD Events field reference` section.
13. **Audit summary** (METHODOLOGY Stage 7).

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer before the next:

1. **Post-type** (if Stage 3 found multiple `type_of_feature=1` candidates)
2. **Author** — per METHODOLOGY `Author resolution (universal pattern)`
3. **Cities / region** (if the user didn't already specify)
4. **Categories / vertical filter** (if not already specified)
5. **Publish vs draft** ("Publish live, or save as drafts for your review?")
6. **Category-creation grant** (only ask if Stage 8 about to skip an event due to no ≥70% match: "Source category 'X' has no good match. Skip the event, create a new BD category 'X', or pick existing 'Y'?")

If the user already specified any of these in their request, skip that question.

---

## Post-type discovery (Stage 3 of runbook)

A BD site does NOT necessarily have a post type named "Events." Site owners rename, translate, or run multiple event-flavored post types ("Open Houses" + "Property Auctions" + "Community Events").

**Primary marker:** event-flavored post types have `type_of_feature=1`. Call `listPostTypes property=type_of_feature property_value=1 property_operator=eq` — server-side filter returns just the event post-type row(s). Do NOT `getPostType` per-candidate.

**Fallback:** if zero `type_of_feature=1` matches, semantic-match `data_name`/`system_name` against event terms in any language (event, calendar, agenda, open-house, auction, show, schedule, happening, eventos, calendario, événements, veranstaltungen, etc.). Confirm `data_type=20` (single-image classification).

**Decision:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run. Surface clean message, exit. |
| One | Use it. Cache `data_id`, `data_name`, `system_name`, `form_name`. |
| Multiple, interactive | Ask the user. List by data_id + data_name. |
| Multiple, autonomous | If the user pre-specified a post-type id in their request, use it. Else exit with clear audit message. |

The user's explicit post-type pick always wins.

---

## Author resolution (Stage 4 of runbook)

Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id` (cached from Stage 1 `listPostTypes`).

---

## Source candidates (Stage 5 of runbook)

For METHODOLOGY Stage 2a, brainstorm 5-10 candidates from these categories, tailored to the user's vertical + location:

- City government event calendars, county tourism boards, chamber of commerce sites, library/community-center calendars
- Trade association event pages, industry trade-publication event sections, CE calendars for licensed professions
- Local university event pages, community college calendars, adult-education schedules
- Public-page aggregators: Eventbrite public event pages, AllEvents.in, Bandsintown public artist/venue pages, Songkick artist/venue pages, Ticketmaster public event pages, public Meetup group pages, Conference Index
- Local newspaper event sections, city alt-weeklies, hyperlocal weekend roundups

Tailor by vertical: real estate → MLS open-house listings; fitness → race calendars, gym/yoga schedules; medical/dental → CME calendars, association meetings; music → venue calendars + Bandsintown; food → restaurant association events.

Be specific. Brainstorm real domain names, not "some sites."

---

## Dedup (Stage 6 of runbook)

Per METHODOLOGY Stage 3. Events-specific match criteria:
- Title: semantic match.
- Date: `post_start_date` within ±24 hours.
- Location: same `post_venue` if known, else same city.

---

## Geocoding (Stage 7 of runbook)

Run on survivors only (candidates that passed Stage 6 dedup) — don't waste Nominatim calls on dupes.

BD's `auto_geocode=1` requires a Google Maps server-side API key most sites lack. Skill geocodes itself via Nominatim (OpenStreetMap, free, no key).

### MANDATORY: transliterate non-Latin scripts BEFORE any Nominatim query

Nominatim returns **wrong-country ghost matches** on native non-Latin scripts — confirmed live: `"Ακρόπολη, Αθήνα"` (Acropolis in Greek) returns Helsinki, Finland coords; `"台北101, 台北"` (Taipei 101) returns Iceland; `"故宫, 北京"` returns empty. The English transliteration of the same address resolves correctly every time.

Scan the address string first. If it contains characters outside the Latin alphabet + extended Latin (Greek, Cyrillic, CJK Chinese/Japanese/Korean, Arabic, Hebrew, Devanagari, Thai, etc.), **convert to English/transliterated form before running the retry ladder.** Use the source page's English version if available, or LLM judgment for well-known landmark names ("Acropolis, Athens, Greece"; "Forbidden City, Beijing, China"; "Taipei 101, Taipei, Taiwan"). If neither source nor confident LLM judgment yields an English form, skip `lat`/`lon` for this event entirely. Never pass native script to Nominatim. Never fabricate a transliteration.

### Adaptive retry ladder (run sequentially on the transliterated address, accept first hit)

Nominatim is uneven — over-scoped queries (venue + street + city + region + zip + country) miss; medium-scoped queries (venue + city + region OR street + city + region) hit. Spelled-out state names beat 2-letter codes (`"Florida"` not `"FL"`). For international without state-equivalents, use country in place of state. Each tier is one `WebFetch` to `https://nominatim.openstreetmap.org/search?q=<URL-encoded-q>&format=json&limit=1&addressdetails=1` using the extraction prompt defined at the end of this section.

**When `post_venue` is known (most events) — 4 tiers:**

1. `q="<venue>, <city>, <state-name>"` (US/CA) OR `q="<venue>, <city>, <country>"` (intl). Highest specificity AND highest hit rate — Nominatim has named venues indexed.
2. `q="<street>, <city>, <state-name>"` OR `q="<street>, <city>, <country>"`. Catches venues that aren't named in Nominatim but have indexed street addresses.
3. `q="<venue>, <state-name>"` (US/CA) OR `q="<venue>, <country>"` (intl). Looser — landmark-level match.
4. `q="<city>, <state-name>"` OR `q="<city>, <country>"`. City-center fallback. Always resolves for any recognized city (venue-level accuracy lost).

**When `post_venue` is empty (source page only gave a street address) — 2 tiers:**

1. `q="<street>, <city>, <state-name>"` OR `q="<street>, <city>, <country>"`.
2. `q="<city>, <state-name>"` OR `q="<city>, <country>"`.

After all tiers empty → skip `lat`/`lon` on that event. Post still creates.

**Extraction prompt for each `WebFetch`:** `"Extract from this Nominatim JSON response: (1) lat as a decimal, (2) lon as a decimal, (3) country_code (ISO 2-letter), (4) state name from the address breakdown (full name as returned, e.g. 'New York', 'California', 'Ontario'). Return as a flat object with keys: lat, lon, country_code, state_name. Omit keys whose values are not present in the response."`

### Rules

- ≥1 second between every Nominatim call (Nominatim ToS — tier retries count as calls).
- Cache within run: two events at same venue → geocode once.
- Never fabricate coords. Never use LLM-knowledge coordinates.

### Normalize Nominatim output before passing to BD

Nominatim returns `country_code` lowercase (`"us"`, `"ca"`, `"gb"`) and state as a full name (`"New York"`, `"Ontario"`). BD's `country_sn` and `state_sn` expect uppercase ISO codes. Normalize directly.

1. **`country_sn`**: uppercase the Nominatim `country_code`. `"us"` → `"US"`, `"ca"` → `"CA"`, `"gb"` → `"GB"`.
2. **`state_sn`**: map the Nominatim state name to its ISO-3166-2 2-letter code (US: `"New York"` → `"NY"`, `"California"` → `"CA"`; Canada: `"Ontario"` → `"ON"`, `"British Columbia"` → `"BC"`; Australia: `"New South Wales"` → `"NSW"`; etc.). Always uppercase. If the country has no state-equivalent (e.g. Malta, Luxembourg, Singapore) or Nominatim returned a sub-region that isn't a standard ISO-3166-2 subdivision, **OMIT `state_sn`** — pass `country_sn` alone.

Pass `lat`, `lon`, `country_sn`, and `state_sn` (when applicable). Do NOT pass `auto_geocode=1`.

---

## Category routing (Stage 8 of runbook)

Per METHODOLOGY Stage 4. Events use the post type's `feature_categories` (cached from Stage 1).

Authorization:
- Interactive grant ("yes, create new event categories") → skill respects for the run.
- User-specified default category in their request → every event in the run goes to that category.

---

## Content manufacture (Stage 11 of runbook)

Follow METHODOLOGY Stage 5 (universal): EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check.

**Voice:** reads like a naturally-written editorial event page, not an SEO link container. Local context, scene details, what to expect — the reader is deciding whether to go, not parsing a directory listing.

**Events-specific load-bearing facts** (the reader needs these up front): event date + time, venue + address, ticket price or "free", parking, agenda, how to attend or buy tickets. Surface these in the opening paragraphs.

**Bullets per ANTI-SLOP `Bullets rule`** — content that often qualifies for events: parking, price tiers, what to bring, schedule blocks, ticket types.

**Events-specific Pexels search topics:** category + venue type (`"outdoor music festival"`, `"tech conference auditorium"`, `"5k race runners"`, `"yoga class studio"`). Pass to the corpus `Rule: Image URLs` workflow as the `<topic>` slot.

**Internal links:** weave into body prose per **URL-PATTERNS Link shape priority** — distributed, NOT clustered at the end. Budget **4-8 internal links per event post**, distributed:

| Section | Recommended links |
|---|---|
| Opening paragraph (event hook + load-bearing facts) | 1 (category or location filter) |
| Body sections (venue/scene/what-to-expect) | 2-5 links, **maximum 1 per major body section** — never two links in the same paragraph, never three links clustered in the final two sections |
| CTA close | 1 (always — the "see more events" closer) |

Events get the full set of filter dimensions available — category, location (`lat`+`lng`+`location_value`+`location_type=locality`), and date (`daterange`). Date filters are events-only (other post types skip them).

---

## BD Events field reference (Stage 12 of runbook)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, kept as insurance; BD doesn't strictly require it but harmless to pass) |
| `data_type` | `20` (single-image classification, always for events) |
| `data_id` | resolved events post-type id from Stage 3 |
| `post_title` | **Hybrid format: short headline + colon + concise hook.** Never two colons in a single title — if the headline itself contains a colon (e.g. `"Aspen Ideas: Health"`), use a different separator (e.g. comma, hyphen) or no separator for the hook. Cap at ~54 chars total. Plain text, no HTML. Aim for clarity over completeness — a reader scanning the card should immediately know what the event IS and why they'd care. **Headline conveys what the event IS, not just what it's called.** Names that already describe the event (`"Austin Tech Summit"`, `"Community Yoga"`, `"IRONMAN 70.3 Boulder"`) stand on their own. Brand or series names that don't self-explain (`"NEWLIFE Expo"`, `"Cool Sommer Mornings"`) benefit from a category appended (`"NEWLIFE Expo Wellness Retreat"`, `"Cool Sommer Mornings Triathlon"`). **Hook is whatever's most clarifying for THIS event:** venue or city when location is the draw, format/distance for races (`"5K"`, `"1.2-mi swim"`), a special angle (`"Free Class"`, `"Sunset Edition"`), or a combination if space allows. Date is optional — include when it adds context and fits within the cap. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `post_live_date` | now in site timezone, `YYYYMMDDHHmmss` |
| `user_id` | resolved author from Stage 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `## Universal post fields`** (post_image, post_category, post_meta_title length, post_meta_description length). Universal tags rule in **METHODOLOGY `## Tags`**. Events-specific fields and examples below:

| Field | Events-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (date/time, venue, price, how to attend) + bullets where they help scannability + source attribution close. |
| `post_start_date` | Event start datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock — see the `Date/time formats` section). Date AND time both live here. BD silently truncates other formats. |
| `post_expire_date` | Event end datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock). For a single-day event, set to the same date as `post_start_date` with the actual end time. |
| `post_venue` | Venue name only ("Stubb's BBQ", "Staples Center", "Delta Hotels Toronto"). |
| `post_location` | Full street address only — do NOT prepend the venue name (already in `post_venue`). Example: `"801 Red River St, Austin, TX 78701"`, NOT `"Stubb's BBQ, 801 Red River St, Austin, TX 78701"`. |
| `lat` | Latitude float (from Nominatim, skip if geocoding failed). |
| `lon` | Longitude float (from Nominatim, skip if geocoding failed). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Austin Tech Summit 2026 in Downtown Austin, Enterprise Software and AI Conference June 13"` — venue + city + date + category modifiers expanded from the shorter `post_title`. |
| `post_meta_description` | Events-specific flavor: distill the event's value proposition + date + city (e.g. "Three-day enterprise software conference in downtown Austin, June 13-15, 2026. Speakers from Microsoft, AWS, and Salesforce."). |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

`createSingleImagePost` accepts the `post_meta_title` and `post_meta_description` fields; the wrapper passes them through.

### Date/time formats

All three fields use `YYYYMMDDHHmmss` (14 digits). BD silently truncates other formats, corrupting the value.

- `post_live_date`: when the post becomes visible (now, or future for scheduled publish). **Site timezone.**
- `post_start_date`: event start (date AND time). **Event-local wall-clock — the time as a visitor in the event's city would read it. Do NOT convert to the site's own timezone.** A 7 PM Brooklyn event on a Los Angeles-timezoned site stores as `20260616190000`, not `20260616160000`.
- `post_expire_date`: event end (date AND time). Same event-local wall-clock as `post_start_date`.
