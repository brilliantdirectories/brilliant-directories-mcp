# Events content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create event posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a request like "create event posts on my site" or similar. They may have specified cities, categories, window, or limit. Run the runbook in order; on per-step failure for a given event, continue to the next event.

1. **Mode detection** (METHODOLOGY Stage 1). User is in the chat → interactive mode. If they invoked from a programmatic context with no chat presence → autonomous.
2. **Site context discovery** (METHODOLOGY Stage 1): `getSiteInfo`, homepage, menus, top categories, `listPostTypes`. Also fetch `data_filename` from the resolved events post type (cache for Pattern 1/2/3 URL construction in Stage 9).
3. **Post-type discovery (events-specific, this file).** See the `Post-type discovery` section.
4. **Author resolution (this file).** **If the user pre-specified a `user_id` (or `author_id`) in the request, use it and SKIP this step entirely — no discovery calls.** Otherwise see the `Author resolution` section.
5. **Source research** (METHODOLOGY Stage 2): brainstorm 5-10 candidates from the `Source candidates` section, probe via `WebSearch`, extract via `WebFetch`, apply all 5 quality gates. Land N viable candidates BEFORE any dedup check.
6. **Duplicate detection** (METHODOLOGY Stage 3). For each candidate (NOT bulk), run `listSingleImagePosts property=post_title property_operator=like property_value=<first-3-distinctive-words-of-candidate-title>% limit=10` scoped to the events post type. See METHODOLOGY Stage 3 for the "distinctive" definition. Returns 0-1 matching rows. Apply title-similarity + date-tolerance + location-match per METHODOLOGY. Never bulk-pull the events feed.
7. **Geocode survivors only (events-specific, this file).** Nominatim each non-duplicate candidate's address. Skip lat/lon on failure.
8. **Category routing** (METHODOLOGY Stage 4). Best-existing category at ≥70% confidence, or skip.
9. **Content manufacture (events-specific, this file).** Follow METHODOLOGY Stage 5 universal rules; this file adds events-specific load-bearing facts. Highest-value internal-link filters for events: category, location (lat+lng+location_value), date (daterange). See URL-PATTERNS.md for param syntax.
10. **Create the post** via `createSingleImagePost` with the field set in the `BD Events field reference` section.
11. **Audit summary** (METHODOLOGY Stage 7).

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer before the next:

1. **Post-type** (if Stage 3 found multiple `type_of_feature=1` candidates)
2. **Author** ("Which member should author these event posts?")
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

**Short-circuit: if the user already provided a `user_id` (or `author_id`) in the request/args, use it and SKIP this entire section.** No discovery calls needed.

**Interactive (user not pre-specified):** ask "Which member should author these event posts? Give me a name, email, or user_id." Resolve via `searchUsers` or `listUsers property=email property_value=<email> property_operator=eq`. Confirm back to user before proceeding.

**Autonomous (user not pre-specified):** find a member whose subscription plan is authorized to publish this post type, then use that user_id.

1. `listMembershipPlans limit=25` — lean default returns `subscription_id`, `subscription_name`, `data_settings`, and 7 other identity/pricing fields. `data_settings` is a CSV of post-type IDs the plan can publish (e.g. `"4,2,1,15,8,10,0"`).
2. Client-side filter: keep plans where `data_settings.split(',').includes(<events_data_id>)` — these are the subscription_ids authorized to publish events.
3. `listUsers property=subscription_id property_value=<comma_separated_matched_ids> property_operator=in limit=10` — returns eligible authors. Server-side filter; lean response.
4. Pick one user_id at random from the result.
5. **Fallback:** if step 2 returns zero matched plans OR step 3 returns zero eligible users → use `user_id=0`. BD stores this as "no author" — the post page renders publicly, but won't show in member search; site admin gets a queue alert to reassign.


---

## Source candidates (Stage 5 of runbook)

For METHODOLOGY Stage 2a, brainstorm 5-10 candidates from these categories, tailored to the user's vertical + location:

- City government event calendars, county tourism boards, chamber of commerce sites, library/community-center calendars
- Trade association event pages, industry trade-publication event sections, CE calendars for licensed professions
- Local university event pages, community college calendars, adult-education schedules
- Public-page aggregators: Eventbrite public event pages, AllEvents.in, Bandsintown public artist/venue pages, public Meetup group pages, Conference Index
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

Per METHODOLOGY Stage 4. Events use the post type's `feature_categories` for routing — already cached from Stage 1's `listPostTypes` call (comma-separated string on the post-type row). No additional discovery needed.

Authorization:
- Interactive grant ("yes, create new event categories") → skill respects for the run.
- User-specified default category in their request → every event in the run goes to that category.
- Default: best-existing match at ≥70% confidence, or SKIP.

---

## Content manufacture (Stage 9 of runbook)

Follow METHODOLOGY Stage 5 (universal): EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check.

**Events-specific load-bearing facts** (the reader needs these up front): event date + time, venue + address, ticket price or "free", how to attend or buy tickets. Surface these in the opening paragraph or first FAQ block.

**Events-specific Pexels search topics:** category + venue type (`"music festival crowd outdoor"`, `"tech conference auditorium"`, `"5k race runners"`, `"yoga class studio"`). Pass to the corpus `Rule: Image URLs` workflow as the `<topic>` slot.

**Events-specific internal-link opportunities** (only if URL-PATTERNS.md discovery confirms the target exists):
- More events in same category: `?category[]={cat}`
- More events in same city: `?lat={lat}&lng={lng}&location_value={URL-encoded post_location}&location_type=locality` (all four params required; `location_type=locality` is what BD's sidebar form needs to render — omit it and the URL returns zero results)
- Other events on same date: `?daterange={d}+-+{d}`
- Highest-value combo: same category + same city

---

## Tags

`post_tags` format: comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`). **Hard 100-char total cap on the CSV** — BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.

Strategy: aim for 6 tags per post — 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short and don't join words with hyphens. Tags live ONLY in the post's `post_tags` field — do NOT call `listTags`, `createTag`, or any Tags-resource tool.

Same field, same rules, same 100-char cap apply to multi-image post types when their per-type SKILL.md adopts the post_tags field.

---

## BD Events field reference (Stage 10 of runbook)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, NOT the user-facing post-type concept) |
| `data_type` | `20` (single-image classification, always for events) |
| `data_id` | resolved events post-type id from Stage 3 |
| `post_title` | **Hybrid format: short headline + colon + concise hook.** Never two colons in a single title — if the headline itself contains a colon (e.g. `"Aspen Ideas: Health"`), use a different separator (e.g. comma, hyphen) or no separator for the hook. Cap at ~54 chars total. Plain text, no HTML. Aim for clarity over completeness — a reader scanning the card should immediately know what the event IS and why they'd care. **Headline conveys what the event IS, not just what it's called.** Names that already describe the event (`"Austin Tech Summit"`, `"Community Yoga"`, `"IRONMAN 70.3 Boulder"`) stand on their own. Brand or series names that don't self-explain (`"NEWLIFE Expo"`, `"Cool Sommer Mornings"`) benefit from a category appended (`"NEWLIFE Expo Wellness Retreat"`, `"Cool Sommer Mornings Triathlon"`). **Hook is whatever's most clarifying for THIS event:** venue or city when location is the draw, format/distance for races (`"5K"`, `"1.2-mi swim"`), a special angle (`"Free Class"`, `"Sunset Edition"`), or a combination if space allows. Date is optional — include when it adds context and fits within the cap. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `post_live_date` | now in site timezone, `YYYYMMDDHHmmss` |
| `user_id` | resolved author from Stage 4 |

### Recommended (include when source data supports)

| Field | Value |
|---|---|
| `post_content` | assembled HTML body per "Content manufacture" |
| `post_filename` | BD stores the data_filename prefix AS PART OF post_filename. **BD ignores this field on `createSingleImagePost` — always auto-generates from `post_title`.** To control slug, either keep `post_title` short, or follow up with `updateSingleImagePost post_filename=<data_filename>/<lowercase-hyphenated-slug>` (update accepts the override). |
| `post_image` | image URL per image strategy. Pass `auto_image_import=1` for external images. |
| `post_category` | best-matched category name (verbatim from `feature_categories`) |
| `post_tags` | comma-only, no spaces |
| `post_start_date` | event start datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock — see the `Date/time formats` section). Date AND time both live here. BD silently truncates other formats. |
| `post_expire_date` | event end datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock). For a single-day event, set to the same date as `post_start_date` with the actual end time. |
| `post_venue` | venue name only ("Stubb's BBQ", "Staples Center", "Delta Hotels Toronto"). |
| `post_location` | full street address only — do NOT prepend the venue name (already in `post_venue`). Example: `"801 Red River St, Austin, TX 78701"`, NOT `"Stubb's BBQ, 801 Red River St, Austin, TX 78701"`. |
| `lat` | latitude float (from Nominatim, skip if geocoding failed) |
| `lon` | longitude float (from Nominatim, skip if geocoding failed) |
| `country_sn` | ISO country code from Nominatim |
| `state_sn` | state code from Nominatim |
| `post_meta_title` | SEO `<title>` tag (~80-120 chars). Expand on `post_title` with extra keywords — venue, city, date, category modifiers — that didn't fit the title's tight cap. Example: `"Austin Tech Summit 2026 in Downtown Austin — Enterprise Software & AI Conference, June 13"`. |
| `post_meta_description` | SEO meta description (~150-160 chars). Distill the event's value proposition + date + city. Not a duplicate of `post_title`. |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

`createSingleImagePost` accepts the `post_meta_title` and `post_meta_description` fields; the wrapper passes them through.

### Date/time formats

All three fields use `YYYYMMDDHHmmss` (14 digits). BD silently truncates other formats, corrupting the value.

- `post_live_date`: when the post becomes visible (now, or future for scheduled publish). **Site timezone.**
- `post_start_date`: event start (date AND time). **Event-local wall-clock — the time as a visitor in the event's city would read it. Do NOT convert to the site's own timezone.** A 7 PM Brooklyn event on a Los Angeles-timezoned site stores as `20260616190000`, not `20260616160000`.
- `post_expire_date`: event end (date AND time). Same event-local wall-clock as `post_start_date`.
