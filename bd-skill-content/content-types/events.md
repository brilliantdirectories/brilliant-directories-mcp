# Events content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create event posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol, 5 quality gates, dedup, audit, hard rules.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

MCP wrapper specifics (rate limits, force-injections, lean responses, EAV routing, HTTP codes) come from the MCP's own corpus, loaded with every MCP tool. Don't re-document.

This file extends the shared protocol with events-specific details.

---

## End-to-end runbook

The user invoked the skill with a request like "create event posts on my site" or similar. They may have specified cities, categories, window, or limit. Run all 12 steps in order:

1. **Mode detection** (METHODOLOGY Stage 1). User is in the chat → interactive mode. If they invoked from a programmatic context with no chat presence → autonomous.
2. **Site context discovery** (METHODOLOGY Stage 1): `getSiteInfo`, homepage, menus, top categories, `listPostTypes`.
3. **Post-type discovery (events-specific, this file).** See "Post-type discovery" below.
4. **Author resolution (this file).** See "Author resolution" below.
5. **URL pattern discovery (URL-PATTERNS).** Cache `data_filename`, category-landing map, profile_search_results filenames.
6. **Source research** (METHODOLOGY Stage 2): brainstorm 5-10 candidates from "Source candidates" below, probe via `WebSearch`, extract via `WebFetch`, apply all 5 quality gates.
7. **Geocode (events-specific, this file).** Nominatim each event's address. Skip lat/lon on failure.
8. **Duplicate detection** (METHODOLOGY Stage 3) against existing events on the site, including drafts. Skip duplicates.
9. **Category routing** (METHODOLOGY Stage 4). Best-existing category at ≥70% confidence, or skip.
10. **Content manufacture (events-specific, this file).** Follow METHODOLOGY Stage 5 universal rules; this file adds events-specific load-bearing facts.
11. **Create the post** via `createSingleImagePost` with the field set in "BD Events field reference" below. Embed dedup HTML comment at end of `post_content`.
12. **Audit summary** (METHODOLOGY Stage 7). Print everything that happened.

Run all 12 steps. Skip none. If any step fails for a given event, log in audit and continue to next event.

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer before the next:

1. **Post-type** (if Stage 3 found multiple `type_of_feature=1` candidates)
2. **Author** ("Which member should author these event posts?")
3. **Cities / region** (if the user didn't already specify)
4. **Categories / vertical filter** (if not already specified)
5. **Publish vs draft** ("Publish live, or save as drafts for your review?")
6. **Category-creation grant** (only ask if Stage 9 about to skip an event due to no ≥70% match: "Source category 'X' has no good match. Skip the event, create a new BD category 'X', or pick existing 'Y'?")

If the user already specified any of these in their request, skip that question.

---

## Post-type discovery (Stage 3 of runbook)

A BD site does NOT necessarily have a post type named "Events." Site owners rename, translate, or run multiple event-flavored post types ("Open Houses" + "Property Auctions" + "Community Events").

**Primary marker:** event-flavored post types have `type_of_feature=1`. Call `listPostTypes` ONCE and client-side filter on this field — the response includes it. Do NOT `getPostType` per-candidate.

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

Interactive: ask "Which member should author these event posts? Give me a name, email, or user_id." Resolve via `searchUsers` or `listUsers property=email property_value=<email>`. Confirm back to user before proceeding.

Autonomous: use a user-pre-specified author_id if given. Else `listUsers --limit=5 --order_column=admin_level --order_type=desc`, take highest-admin user_id. Fallback to `user_id=1` if no admin-level users. Log resolved author in audit.

---

## Source candidates (Stage 6 of runbook)

For METHODOLOGY Stage 2a, brainstorm 5-10 candidates from these categories, tailored to the user's vertical + location:

- City government event calendars, county tourism boards, chamber of commerce sites, library/community-center calendars
- Trade association event pages, industry trade-publication event sections, CE calendars for licensed professions
- Local university event pages, community college calendars, adult-education schedules
- Public-page aggregators: Eventbrite public event pages, AllEvents.in, Bandsintown public artist/venue pages, public Meetup group pages, Conference Index
- Local newspaper event sections, city alt-weeklies, hyperlocal weekend roundups

Tailor by vertical: real estate → MLS open-house listings; fitness → race calendars, gym/yoga schedules; medical/dental → CME calendars, association meetings; music → venue calendars + Bandsintown; food → restaurant association events.

Be specific. Brainstorm real domain names, not "some sites."

---

## Geocoding (Stage 7 of runbook)

BD's `auto_geocode=1` requires a Google Maps server-side API key most sites lack. Skill geocodes itself via Nominatim (OpenStreetMap, free, no key).

```
WebFetch(
  url="https://nominatim.openstreetmap.org/search?q=<URL-encoded-address>&format=json&limit=1&addressdetails=1",
  prompt="Extract from this Nominatim JSON response: (1) lat as a decimal, (2) lon as a decimal, (3) country_code (ISO 2-letter), (4) state name from the address breakdown (full name as returned, e.g. 'New York', 'California', 'Ontario'). Return as a flat object with keys: lat, lon, country_code, state_name. Omit keys whose values are not present in the response."
)
```

Rules:
- ≥1 second between geocode calls (Nominatim ToS).
- Cache within run: two events at same venue → geocode once.
- No-result → skip `lat`/`lon` on that event. Post still creates. Note in audit.
- Never fabricate coords. Never use LLM-knowledge coordinates.

### Normalize Nominatim output before passing to BD

Nominatim returns `country_code` lowercase (`"us"`, `"ca"`, `"gb"`) and state as a full name (`"New York"`, `"Ontario"`). BD's `country_sn` and `state_sn` expect ISO 2-letter codes (`"US"`, `"NY"`). Normalize before passing:

1. **`country_sn`**: uppercase the Nominatim `country_code`. `"us"` → `"US"`. Done.
2. **`state_sn`**: map the Nominatim state name to its 2-letter code via `listStates`. The BD `location_states` table fields are `state_sn` (2-letter code, e.g. `"NY"`), `state_ln` (full name, e.g. `"New York"`), `country_sn` (2-letter, e.g. `"US"`). Once per skill run per country, cache: `listStates property=country_sn property_value=<uppercased_country_code> property_operator=eq` (paginate if >25 rows; e.g. US has 50+). Build a `state_ln → state_sn` map. Look up the Nominatim state name in the map (case-insensitive); use the matched `state_sn`. If no match (some countries don't have first-admin subdivisions BD tracks, or Nominatim returned an unmappable region name), OMIT `state_sn`.
3. Cache the per-country state map for the rest of the run.
4. International addresses with no state/region equivalent → pass `country_sn` only, OMIT `state_sn`.

On success, pass `lat`, `lon`, normalized `country_sn`, and normalized `state_sn` (if mapped). Do NOT pass `auto_geocode=1`.

---

## Dedup (Stage 8 of runbook)

Per METHODOLOGY Stage 3. Events-specific match criteria:
- Title: semantic match.
- Date: `post_start_date` within ±24 hours.
- Location: same `post_venue` if known, else same city.

Embed dedup HTML comment at end of `post_content` per METHODOLOGY Stage 3:

```html
<!-- bd-events-skill-meta v1
source_id=tm-evt-12345
source_url=https://...
source_name=Ticketmaster
record_fingerprint=austin-tech-summit-2026:2026-06-15:austin
skill_run_id=20260517143022-k3m9pw
-->
```

`record_fingerprint`'s date is `post_start_date` (the event date, not the post date).

---

## Category routing (Stage 9 of runbook)

Per METHODOLOGY Stage 4. Events use the post type's `feature_categories` for routing.

Discovery: `getPostTypeCustomFields form_name=<events post-type's form_name>` → find the `post_category` field's `choices[].key`.

Authorization:
- Interactive grant ("yes, create new event categories") → skill respects for the run.
- User-specified default category in their request → every event in the run goes to that category.
- Default: best-existing match at ≥70% confidence, or SKIP.

---

## Content manufacture (Stage 10 of runbook)

Follow METHODOLOGY Stage 5 (universal): EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check.

**Events-specific load-bearing facts** (the reader needs these up front): event date + time, venue + address, ticket price or "free", how to attend or buy tickets. Surface these in the opening paragraph or first FAQ block.

**Events-specific image keywords for Pexels fallback:** category + venue type ("austin music festival outdoor", "tech conference auditorium", "wine tasting hall"). Bare landscape URL only.

**Events-specific internal-link opportunities** (only if URL-PATTERNS.md discovery confirms the target exists):
- More events in same category: `?category[]={cat}`
- More events in same city: `?lat={lat}&lng={lng}&location_value={URL-encoded post_location}` (using THIS event's coords + address label so the search-results page shows the address in its input)
- Other events on same date: `?daterange={d}+-+{d}`
- Highest-value combo: same category + same city

---

## Tags

`post_tags` format: comma-only, no spaces (`tag1,tag2,tag3`).

Strategy: `listTags` first to reuse existing tags. Create new ones via `createTag` when SEO-relevant and missing. 3-7 tags per post. Lowercase, short, no special chars.

---

## BD Events field reference (Stage 11 of runbook)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, NOT the user-facing post-type concept) |
| `data_type` | `20` (single-image classification, always for events) |
| `data_id` | resolved events post-type id from Stage 3 |
| `post_title` | event title (plain text, no HTML) |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `post_live_date` | now in site timezone, `YYYYMMDDHHmmss` |
| `user_id` | resolved author from Stage 4 |

### Recommended (include when source data supports)

| Field | Value |
|---|---|
| `post_content` | assembled HTML body per "Content manufacture" + dedup HTML comment at end |
| `post_filename` | BD stores the data_filename prefix AS PART OF post_filename. BD auto-generates from post_title if omitted. For slug control, pass `<data_filename>/<lowercase-hyphenated-slug>` |
| `post_image` | image URL per image strategy. Pass `auto_image_import=1` for external images. |
| `original_image_url` | The original source image URL the skill ATTEMPTED to use (before any fallback). Forensic field. Always populate this with the FIRST image URL the skill considered (the source image candidate), even if the skill ended up falling through to Pexels or omitting. If the skill never considered any source image (page had no image candidate at all), pass empty string. |
| `post_category` | best-matched category name (verbatim from `feature_categories`) |
| `post_tags` | comma-only, no spaces |
| `post_start_date` | event start datetime `YYYYMMDDHHmmss` (14 digits, site timezone). Date AND time both live here. BD silently truncates other formats. |
| `post_expire_date` | event end datetime `YYYYMMDDHHmmss` (14 digits, site timezone). For a single-day event, set to the same date as `post_start_date` with the actual end time. |
| `post_venue` | venue name ("Stubb's BBQ", "Staples Center") |
| `post_location` | full address text ("Stubb's BBQ, 801 Red River St, Austin, TX 78701") |
| `lat` | latitude float (from Nominatim, skip if geocoding failed) |
| `lon` | longitude float (from Nominatim, skip if geocoding failed) |
| `country_sn` | ISO country code from Nominatim |
| `state_sn` | state code from Nominatim |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

### Date/time formats

All three fields use `YYYYMMDDHHmmss` (14 digits, site timezone). BD silently truncates other formats, corrupting the value.

- `post_live_date`: when the post becomes visible (now, or future for scheduled publish)
- `post_start_date`: event start (date AND time)
- `post_expire_date`: event end (date AND time)

---

## Audit summary (events-specific lines)

Adds to METHODOLOGY Stage 7 base format:

```
Geocoding:
  - N events geocoded via Nominatim
  - N events posted without lat/lon (geocode failed)
```

---

## v0.2 deferred

Do NOT add in v0.1:
- Dry-run flag, rollback-run mass-undo, token-cost preview, depth modes
- Update-existing for changed events
- Performer biographies, event-series history sections (LLM-knowledge fabrication risk)
- Ticketmaster API integration, user-supplied ICS/RSS feeds
- Non-English content generation
- Cross-site federated dedup
