# Events content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create event posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.
4. `../shared/GEOCODING.md`: Nominatim protocol (transliteration, retry ladder, normalization).

---

## End-to-end runbook

The user invoked the skill with a request like "create event posts on my site" or similar. They may have specified cities, categories, window, or limit. Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Only make the tool calls the runbook steps specify — no extras; every turn fills its five slots per Rule: Search discipline.** On per-event failure, continue to the next event.

1. **Autonomy.** Per METHODOLOGY `Autonomy`: never ask; decide and proceed.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Source discovery.**
    - **5a. Search round** — one turn of five queries per the `Source candidates` section and METHODOLOGY `Stage 3: Source research` steps 2a-2b.
    - **5b. Pool** — every WebSearch result already showing a title and a future, in-window start date pools as-is (best-fit, up to 10). Capture and print the numbered pool per METHODOLOGY `Candidate pool discipline (universal pattern)` — Step 6 fires in that same message; none pooled → straight to 5c. Once title and start date are known, that candidate's source research stops until it survives Step 6.
    - **5c. Shortfall only — fewer than five pooled:** the same message also carries `WebFetch` for viable entries missing only their keys and the best list-page(s), plus new-angle `WebSearch` to fill the message — these searches are the round's one reformulation; no viable entries to open → every shortfall call is a new-angle `WebSearch`. The 5b+5c message carries as many calls as it needs. Newly-keyed and newly-found entries pool and dedup on arrival.
6. **Duplicate detection.** Stage 2's calls (both retrieval keys: the title compound plus one date probe per candidate, per the `Dedup` section) fired with 5b's message — compare the returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's events-specific match criteria. Dupes drop from the pool with no further calls; survivors advance to METHODOLOGY `Stage 3: Source research` steps 2c-2e verification.
7. **Geocode.** Nominatim every address-confirmed survivor in one turn — each survivor's GEOCODING.md retry-ladder tiers batched together as backups; the geocode turn carries as many calls as the survivors need; the lowest-numbered hit wins per survivor. Skip lat/lon on failure.
8. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for events-specific authorization.
9. **Image selection.** Run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` end-to-end; follow its sequencing exactly. Lock the image first — re-doing content when an image fails dedup is the expensive path.
10. **Final-title check (+ image dedup on the Steps 1-3 path).** Steps 1-3 image path: run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step here. `poolImages` path: the image is settled — title check only. Compose the final `post_title` once, to the field reference's title spec, then confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call before create (batched with the Step 3 image-dedup when that path runs; on the `poolImages` path it rides any turn — `poolImages`' own turn included), never word-order variants. Run it exactly once — the checked title is the created title, verbatim.
11. **Content manufacture.** Proceed straight from runbook Step 10 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds events-specific load-bearing facts.
12. **Create the post** — fires ALONE in its own turn, after Steps 6-11 are complete for the candidate; nothing batches with a create. Via `createSingleImagePost` with the field set in the `BD Events field reference` section.
13. **Audit summary.** Run METHODOLOGY `Stage 7: Closing reply + JSON receipt`.

---

## Post-type discovery (runbook Step 3)

A BD site does NOT necessarily have a post type named "Events." Site owners rename, translate, or run multiple event-flavored post types ("Open Houses" + "Property Auctions" + "Community Events").

**Primary marker:** event-flavored post types have `type_of_feature=1`. Call `listPostTypes property=type_of_feature property_value=1 property_operator=eq` — server-side filter returns just the event post-type row(s). Do NOT `getPostType` per-candidate.

**Fallback:** if zero `type_of_feature=1` matches, semantic-match `data_name`/`system_name` against event terms in any language (event, calendar, agenda, open-house, auction, show, schedule, happening, eventos, calendario, événements, veranstaltungen, etc.). Confirm `data_type=20` (single-image classification).

**Decision:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run — exit with the Stage 7 receipt; `shortfall_reason` says no event-capable post type exists. |
| One | Use it — even a niche flavor (e.g. "Open Houses" as the site's only event-shaped type). Cache `data_id`, `data_name`, `system_name`, `form_name`, `feature_categories` — and write the **category ledger** line from this row, per `Stage 1: Site context` step 3. |
| Multiple | Resolve per METHODOLOGY `Post-type disambiguation (universal pattern)` — never exit over ambiguity. |

The user's explicit post-type pick always wins.

---

## Source candidates (runbook Step 5)

Per METHODOLOGY `Stage 3: Source research` (sub-step 2a). Discovery is faceted and list-producing — derive the facets, then run the discovery ladder per **Rule: Search discipline**: one batched round of broad-faceted temporal (`<category> <location> <window>`) + list-page vocabulary (`<location> <category> calendar`), on 5c shortfall, open the best list-page(s) and harvest many events per fetch — after their entries show forward dates in the correct location.

**Facets to derive:**
- **Category** — from the resolved post type's `feature_categories` (cached) + audience/vertical as flavor.
- **Location** — the user's named city/region; else infer from the prompt + `getSiteInfo` `primary_country`/timezone — any locally-relevant city, not only cities where you have members. Use `listCities` **only** when the user explicitly asks for events in member cities ("where I have members," "cities we cover"); never find member cities by listing members. Never bulk-list existing posts to infer geographic focus.
- **Date-range** — the user's window if given; else default forward window.

**What a qualifying source looks like when it appears in results** — recognition vocabulary, not a probe list:

- City government event calendars, county tourism boards, chamber of commerce sites, library/community-center calendars
- Trade association event pages, industry trade-publication event sections, CE calendars for licensed professions
- Local university event pages, community college calendars, adult-education schedules
- Public-page aggregators: Eventbrite public event pages, AllEvents.in, Bandsintown public artist/venue pages, Songkick artist/venue pages, Ticketmaster public event pages, public Meetup group pages, Conference Index
- Local newspaper event sections, city alt-weeklies, hyperlocal weekend roundups

Tailor by vertical: real estate → MLS open-house listings; fitness → race calendars, gym/yoga schedules; medical/dental → CME calendars, association meetings; music → venue calendars + Bandsintown; food → restaurant association events.

A single list-page `WebFetch` may return one event or dozens. Capture and print the pool per METHODOLOGY `Candidate pool discipline (universal pattern)`, take the top survivor after the verdicts, and drop-and-advance through the surviving list on failure — no re-fetch.

Still under five pooled after 5c's searches → the ladder's recovery per **Rule: Search discipline** (one month-year query; venue/facility-noun retry only when blocked). Still nothing → stop with the labelled verdict; a clean "no fresh events found" run is a valid outcome (`shortfall_reason`). Pool 2 is for candidates that exist and fail per-candidate; a sweep-proven-dry market ends the run.

---

## Dedup (runbook Step 6)

Per METHODOLOGY `Stage 2: Duplicate detection`, retrieval uses TWO keys, batched in the same turn: ONE compound query covering every pooled candidate's titles, plus one date-only probe per candidate — a five-candidate pool fires six calls — a find enters the pool once both its title and start date are known, so every pooled candidate probes here; a date that changes at verification re-probes — `post_start_date` + `data_id` alone, window = exactly 3 days — the day before the start, the start day, the day after the start, comma-joined as 8-digit days:
`listSingleImagePosts property=["post_start_date","data_id"] property_operator=["contains","eq"] property_value=["20260716,20260717,20260718","8"] limit=50` (July 17 candidate → the probe carries 20260716, 20260717, 20260718 — the start day in the middle; substitute the site's event data_id). Its verdict line cites the window: `no match (title + 20260716-20260718) — survives`. Rows include `post_venue` and `post_location`. The date probe needs no title match — a retitled dupe surfaces by date. The dedup turn carries as many calls as the pool needs.

A returned row is a dupe when EITHER:
- Title: semantic match; or
- Date + place: `post_start_date` within ±24 hours AND same `post_venue`; when either row lacks a venue, same city — whatever either post is titled. Sponsor renames, abbreviations, and year suffixes never make it new.

---

## Geocoding (runbook Step 7)

Use results for survivors only (candidates that passed runbook Step 6 dedup). Follow `../shared/GEOCODING.md` end-to-end: transliteration, retry ladder, `Extraction prompt`, `Rules`, normalization.

For events, `post_venue` (the venue name) is usually known — the 4-tier branch of the retry ladder is the common path.

---

## Category routing (runbook Step 8)

Per METHODOLOGY `Stage 4: Category routing`. Events route via the **category ledger** (written at `Stage 1: Site context` step 3).

User-specified default category in the request → every event in the run goes to that category (must match an existing `feature_categories` value; else route per Stage 4).

---

## Content manufacture (runbook Step 11)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML per **Rule: Post-body formatting**, link policy, image strategy, voice via ANTI-SLOP, self-check.

**Voice:** this page IS the event page. State the event's facts as your own: "Doors open at 6", "Tickets run $25." Never narrate a source document, its gaps, or its agreement with another source ("the organizer's page says", "the page does not publish a start time", "the calendar lists the same date") — an unannounced fact is stated as its own fact ("Start time TBA") or silently absent, never reported as the page's gap. Local context, scene details, what to expect.

**Events-specific load-bearing facts**: event date + time, venue + address, ticket price or "free", parking, agenda, how to attend or buy tickets. Surface these in the opening paragraphs.

**Bullets per ANTI-SLOP `Bullets rule`** — content that often qualifies for events: parking, price tiers, what to bring, schedule blocks, ticket types.

**Events-specific Pexels search topics:** category + venue type (`"outdoor music festival"`, `"tech conference auditorium"`, `"5k race runners"`, `"yoga class studio"`). Pass to METHODOLOGY `Image strategy` as the `<topic>` slot.

**Internal links:** placed by Stage 5's linking pass onto the finished draft, per **URL-PATTERNS `Pattern 6 — Filtered member directory`** (member-count gate) and **Link shape priority** — distributed, NOT clustered at the end. Budget **4-8 internal links per event post, pro-rated to length (a ~400-word post carries 2-4)**; the pass distributes:

| Section | Recommended links |
|---|---|
| Opening section (event hook + load-bearing facts) | 0-1 (category or location filter, riding a noun the opening already has) |
| Body sections (venue/scene/what-to-expect) | 2-5 links, **maximum 1 per major body section** — never two links in the same paragraph, never three links clustered in the final two sections |
| Closing paragraph | 0-1 (riding a sentence the close already needs, never a "go browse X" line) |

Events get the full set of filter dimensions available — category, location (`lat`+`lng`+`location_value`+`location_type=locality`), and date (`daterange`). Date filters are events-only (other post types skip them).

---

## BD Events field reference (runbook Step 12)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, always pass) |
| `data_type` | `20` (single-image classification, always for events) |
| `data_id` | resolved events post-type id from runbook Step 3 |
| `post_title` | **Hybrid format: short headline + colon + concise hook.** Never two colons in a single title — if the headline itself contains a colon (e.g. `"Aspen Ideas: Health"`), use a different separator (e.g. a hyphen) or no separator for the hook. Cap at ~54 chars total. Plain text, no HTML, no commas. Aim for clarity over completeness — a scan of the card immediately shows what the event IS and why it matters. **Headline conveys what the event IS, not just what it's called.** Names that already describe the event (`"Austin Tech Summit"`, `"Community Yoga"`, `"IRONMAN 70.3 Boulder"`) stand on their own. Brand or series names that don't self-explain (`"NEWLIFE Expo"`, `"Cool Sommer Mornings"`) benefit from a category appended (`"NEWLIFE Expo Wellness Retreat"`, `"Cool Sommer Mornings Triathlon"`). **Hook is whatever's most clarifying for THIS event:** venue or city when location is the draw, format/distance for races (`"5K"`, `"1.2-mi swim"`), a special angle (`"Free Class"`, `"Sunset Edition"`), or a combination if space allows. Date is optional — include when it adds context and fits within the cap. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |
| `post_start_date` | Event start datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock — see the `Date/time formats` section). Date AND time both live here. The event template renders its date from this field; a candidate that reached creation already cleared METHODOLOGY's Date-sanity gate, so it carries a confirmed future date — pass it. Date confirmed but the source published no clock time → use `000000`. BD silently truncates other formats. |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: re-read the **category ledger** line and copy one value from it verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Events-specific fields and examples:

| Field | Events-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (date/time, venue, price, how to attend) + bullets where they help scannability + a close that lands the next step (how to attend or buy tickets). |
| `post_promo` | A published ticket price — numeric only, no currency symbol; ticket tiers or a range → midpoint of low+high. **Send `post_promo` (BD back-fills `post_price`); sending `post_price` alone leaves `post_promo` null.** OMIT unless the source states a real dollar amount — a passed `0` renders as a literal `$0.00` price tag, so a free or unpriced event omits it and states "free" in `post_content`. |
| `post_expire_date` | Event end datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock). For a single-day event, set to the same date as `post_start_date` with the actual end time. Source states no end: equal to `post_start_date`. |
| `post_venue` | Venue name only ("Stubb's BBQ", "Staples Center", "Delta Hotels Toronto"). |
| `post_location` | The display address — full street when the source gives one, else city/state (the string that geocoded, e.g. `"Denver, CO"`); lat/lon carry the map pin. Do NOT prepend the venue name (already in `post_venue`). |
| `post_url` | Only on explicit user request — renders CTA button on post page. All other links go in the post content. |
| `lat` | Latitude float (from Nominatim, skip if geocoding failed). |
| `lon` | Longitude float (from Nominatim, skip if geocoding failed). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Austin Tech Summit 2026 in Downtown Austin, Enterprise Software and AI Conference June 13"` — venue + city + date + category modifiers expanded from the shorter `post_title`. |
| `post_meta_description` | Events-specific flavor: distill the event's value proposition + date + city (e.g. "Three-day enterprise software conference in downtown Austin, June 13-15, 2026. Speakers from Microsoft, AWS, and Salesforce."). |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

### Date/time formats

Both fields use `YYYYMMDDHHmmss` (14 digits). BD silently truncates other formats, corrupting the value.

- `post_start_date`: event start (date AND time). **Event-local wall-clock — the time as a visitor in the event's city would read it. Do NOT convert to the site's own timezone.** A 7 PM Brooklyn event on a Los Angeles-timezoned site stores as `20260616190000`, not `20260616160000`.
- `post_expire_date`: event end (date AND time). Same event-local wall-clock as `post_start_date`; no published end clock time → the same `000000`.
