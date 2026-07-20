# Events content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create event posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.
4. `../shared/GEOCODING.md`: Nominatim protocol (transliteration, geocode ladder, normalization).

---

## End-to-end runbook

The user invoked the skill with a request like "create event posts on my site" or similar. They may have specified cities, categories, window, or limit. Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Make only the tool calls the runbook steps specify and fill each message's pack per Rule: Search discipline — insurance fill is not an extra; improvised calls outside the steps and the fill rule are.** On per-event failure, continue to the next event.

1. **Autonomy.** Per METHODOLOGY `Autonomy`: never ask; decide and proceed.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Search round** — one turn of five queries per the `Source candidates` section and METHODOLOGY `Stage 3: Source research` steps 2a-2b. Every query carries a month-year inside the window (`August 2026`, `September 2026`) — a year alone returns the year's past events — and a location per the `Source candidates` section — a placeless query returns global noise. Its score: how many results it surfaces showing a title and a future, in-window start date — ten candidates beat one.
6. **Pool-print turn — the message right after the search round's results arrive.** Read the WebSearch results and count the candidates — every result showing a title and a start date later than today (inside the user's window; default 90 days) is a candidate, read as `Title — YYYYMMDD — v1 | v2 | v3` (its three title variants, each 1-3 words), its shown date taken as shown; cap 10 candidates when more — the candidates are the pool. Its score: how many candidates enter the pool — an omitted candidate costs a later round. A round has ONE pool-print turn: every candidate's calls fire here — a second dedup turn on the same round's results is an incomplete first turn. Fire all the candidates' dedup calls in this same message, on `listSingleImagePosts` only — call shapes per the `Dedup` section: every candidate's 3 title variants in ONE title compound — copied from the pool lines, 3 × N in element 1 — plus one date probe per candidate; the `post_start_date` leg never rides in the title call. N candidates = N+1 calls in this one message; fewer is an incomplete turn. No candidates → return to Step 5.
7. **Duplicate detection.** Stage 2's calls (both retrieval keys: every candidate in ONE title compound, plus one separate date probe per candidate, per the `Dedup` section) fired with Step 6's message — compare the returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's events-specific match criteria. Dupes drop from the pool with no further calls; survivors advance to METHODOLOGY `Stage 3: Source research` steps 2c-2e verification — web calls travel in packs there: at least five to a message, spares preloaded, per `Rule: Search discipline`. No survivor → return to Step 5 and repeat until survivors meet the post goal.
8. **Pre-create batch — the message right after verification completes for all survivors. One single turn holds every survivor's calls — six, twelve, or eighteen together — and saves the tokens and time separate turns spend. This turn's only job: ONE message, six calls per survivor — its `poolImages` call, its final-title check, and its four `Geocode ladder` tiers.** A survivor with no venue fires the ladder's two-tier branch instead — four calls; fewer is an incomplete turn. Each additional survivor adds its own six (or four) to this same message. No other calls ride this turn. The six are three tools' calls — `poolImages`, `listSingleImagePosts`, `WebFetch` — born to fire together. The `poolImages` call: per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` — on the `poolImages` path the image is settled: no `getImageDimensions`, no image dedup (Steps 1-3 image path: run the `Image strategy` dedup step in this same message). The title check: compose the final `post_title` once from the verified record, to the field reference's title spec, and confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call, never word-order variants; run it exactly once — the checked title is the created title, verbatim. The geocode: Nominatim every survivor with the street or city verification returned — the ladder tiers batched together as backups, the lowest-numbered hit wins per survivor; skip lat/lon on failure.
9. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for events-specific authorization.
10. **Content manufacture.** Proceed straight from runbook Step 9 — no extra BD lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds events-specific load-bearing facts.
11. **Create the post** — fires ALONE in its own turn, after Steps 7-10 are complete for the candidate; nothing batches with a create. Via `createSingleImagePost` per METHODOLOGY `Stage 6: Post creation`, with the field set in the `BD Events field reference` section.
12. **Audit summary.** Run METHODOLOGY `Stage 7: Closing reply + JSON receipt`.

---

## Post-type discovery (runbook Step 3)

A BD site does NOT necessarily have a post type named "Events." Site owners rename, translate, or run multiple event-flavored post types ("Open Houses" + "Property Auctions" + "Community Events").

**Primary marker:** event-flavored post types have `type_of_feature=1`. Turn 1's `listPostTypes` already returned every type — keep the `type_of_feature=1` row(s). No second `listPostTypes`, no `getPostType` per-candidate.

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

Per METHODOLOGY `Stage 3: Source research` (sub-step 2a). Discovery is faceted and list-producing — derive the facets, then run the discovery ladder per **Rule: Search discipline**: one batched round of broad-faceted temporal (`<category> <location> <window>`) + list-page vocabulary (`<location> <category> calendar`). Unless the user directs otherwise, prefer candidates that fit the site's niche and carry strong local search intent.

**Facets to derive:**
- **Category** — from the resolved post type's `feature_categories` (cached) + audience/vertical as flavor.
- **Location** — the user's named city/region; else infer from the prompt + `getSiteInfo` `primary_country` — any city in that market, not only cities where you have members. Use `listCities` **only** when the user explicitly asks for events in member cities ("where I have members," "cities we cover"); never find member cities by listing members. Never bulk-list existing posts to infer geographic focus.
- **Date-range** — the user's window if given; else default forward window.

**What a qualifying source looks like when it appears in results** — vocabulary for judging results, never for composing queries; nothing named here becomes a `site:` target or a query term:

- City government event calendars, county tourism boards, chamber of commerce sites, library/community-center calendars
- Trade association event pages, industry trade-publication event sections, CE calendars for licensed professions
- Local university event pages, community college calendars, adult-education schedules
- Public-page aggregators: Eventbrite public event pages, AllEvents.in, Bandsintown public artist/venue pages, Songkick artist/venue pages, Ticketmaster public event pages, public Meetup group pages, Conference Index
- Local newspaper event sections, city alt-weeklies, hyperlocal weekend roundups

Tailor by vertical: real estate → MLS open-house listings; fitness → race calendars, gym/yoga schedules; medical/dental → CME calendars, association meetings; music → venue calendars + Bandsintown; food → restaurant association events.

No survivor after a round → return to Step 5 for the next five-query round, new angles each time. A swept-dry market → stop with the labelled verdict; a clean "no fresh events found" run is a valid outcome (`shortfall_reason`). Pool 2 is for candidates that exist and fail per-candidate; a sweep-proven-dry market ends the run.

---

## Dedup (runbook Step 7)

Per METHODOLOGY `Stage 2: Duplicate detection`, retrieval fires TWO separate calls, batched in the same turn — the `post_start_date` leg never rides in the title call: ONE compound query covering every candidate's 3 title variants, each 1-3 words, plus one date-only probe per candidate — one candidate fires two calls; a ten-candidate pool, eleven — a find is a candidate once both its title and start date are known, so every candidate probes here; a date, venue, or city that changes at verification re-probes — `post_start_date` + `data_id` alone, the start day as one 8-digit day — the start day is `property_value` element 1, the `data_id` alone is element 2:
`listSingleImagePosts property=["post_start_date","data_id"] property_operator=["contains","eq"] property_value=["20260717","8"] limit=50 fields_only="post_id,post_title,post_status,post_filename,post_start_date,post_venue,post_location"` (July 17 candidate → the probe carries 20260717; substitute the site's event data_id). The title compound carries the same `fields_only`. Its verdict line cites the day: `no match (title + 20260717) — survives`. Rows include `post_venue` and `post_location`. The date probe needs no title match — a retitled dupe surfaces by date. The compound's score: how many variants ride element 1 — 3 × N is full marks; a trimmed variant saves a token and ships a dupe.

A returned row is a dupe when EITHER:
- Title: semantic match; or
- Date + place: `post_start_date` within ±24 hours AND same `post_venue`; when either row lacks a venue, same city — whatever either post is titled. Sponsor renames, abbreviations, and year suffixes never make it new.

---

## Geocoding (runbook Step 8)

Use results for survivors only (candidates that passed runbook Step 7 dedup). Follow `../shared/GEOCODING.md` end-to-end: transliteration, geocode ladder, `Extraction prompt`, `Rules`, normalization.

For events, `post_venue` (the venue name) is usually known — the 4-tier branch of the geocode ladder is the common path.

---

## Image selection (runbook Step 8)

**Events-specific Pexels search topics:** category + venue type (`"outdoor music festival"`, `"tech conference auditorium"`, `"5k race runners"`, `"yoga class studio"`). They are the topical anchor for METHODOLOGY `Image strategy`'s **Axes** table phrases.

## Category routing (runbook Step 9)

Per METHODOLOGY `Stage 4: Category routing`. Events route via the **category ledger** (written at `Stage 1: Site context` step 3).

User-specified default category in the request → every event in the run goes to that category (must match an existing `feature_categories` value; else route per Stage 4).

---

## Content manufacture (runbook Step 10)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML per **Rule: Post-body formatting**, link policy, voice via ANTI-SLOP, self-check before posting.

**Voice:** this page IS the event page. State the event's facts as settled knowledge: "The meet takes place Saturday at Pearl Park", "Tickets cost $25." Never make a source document a sentence's actor, quoting or analyzing ("the organizer's page says", "the page frames the weekend as", "the page does not publish a start time") — state each fact bare or leave it out, attribution is never a third door; an unannounced fact is stated as its own fact ("Start time TBA") or silently absent, never reported as the page's gap. Local context and scene details, told welcoming and positive — informative first, never puffery.

**Events-specific load-bearing facts** — two intro paragraphs, at least six sentences split unevenly between them (never an even split), summarize the event in any natural flowing order: what it is and its purpose, date + time, venue + city, who it's for (the source's own audience, never projected from the site's member professions), what will happen and what to expect, ticket price or "free", how to attend or buy tickets, and any known background or history (never manufactured); the first sentence leads with the event and what it is. The post closes with two paragraphs about the event, at least six sentences split unevenly between them (never an even split).

**Registration CTA** — unless the user requests otherwise: when a registration or official information URL is known (the event's own page outranks any booking engine), place this block right after the intro — a short record-material `<h2>`, a 2-3 sentence third-person `<p>` on how to register (the steps, what to have ready — never commands, never the button or form described), then `<p><a class="btn btn-secondary btn-lg vmargin" href="<verified official URL>" title="<descriptive phrase>" rel="noopener" target="_blank">Button Text In Title Case</a></p>`. The URL is the button's first — never a body citation; never the button alone.

**Bullets** — the event's core facts as one scannable `<ul>` immediately after the CTA (after the intro when there is no CTA): the what, when, where, and cost at a glance. A slot the source doesn't fill is dropped, never written as missing. A later section whose facts enumerate — inclusions, tiers, formats, requirements — presents them as its own `<ul>`.

**Section headings**: natural search phrasing — category, place, or intent words as a reader would search them; never forced or stuffed, never a dimension label.

**Depth**: an event page is a destination, not a stub — every fact the source holds enters the post as settled knowledge: its story, program or speakers, tiers and inclusions, venue and day-of specifics; a fetched fact left unused is the failure. Self-praise and superlatives are not facts — they never enter, bare or attributed; the verifiable specifics they decorate enter bare. A known registration or tickets URL is fetched before drafting, its prompt asking for that same cargo alongside the logistics.

**Internal links:** placed by Stage 5's linking pass onto the finished draft, per **URL-PATTERNS `Pattern 3 filter params` and `Pattern 6 — Filtered member directory`** (member-count gate) and **Link shape priority** — no per-section quotas: the density law alone places them, riding only nouns the draft already wrote.

Events get the full set of filter dimensions available — category, location (`lat`+`lng`+`location_value`+`location_type=locality`), and date (`daterange`). Date filters are events-only (other post types skip them). A Pattern 1 event target needs a start date today or later — a past event is never linked, even when dedup returned its row.

---

## BD Events field reference (runbook Step 11)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `data_type` | `20` (single-image classification, always for events) |
| `data_id` | resolved events post-type id from runbook Step 3 |
| `post_title` | **Hybrid format: short headline + colon + concise hook.** Never two colons in a single title — if the headline itself contains a colon (e.g. `"Aspen Ideas: Health"`), use a different separator (e.g. a hyphen) or no separator for the hook. Cap at ~54 chars total. Plain text, no HTML, no commas. Aim for clarity over completeness — a scan of the card immediately shows what the event IS and why it matters. **Headline conveys what the event IS, not just what it's called.** Names that already describe the event (`"Austin Tech Summit"`, `"Community Yoga"`, `"IRONMAN 70.3 Boulder"`) stand on their own. Brand or series names that don't self-explain (`"NEWLIFE Expo"`, `"Cool Sommer Mornings"`) benefit from a category appended (`"NEWLIFE Expo Wellness Retreat"`, `"Cool Sommer Mornings Triathlon"`). **Hook is whatever's most clarifying for THIS event:** venue or city when location is the draw, format/distance for races (`"5K"`, `"1.2-mi swim"`), a special angle (`"Free Class"`, `"Sunset Edition"`), or a combination if space allows. Date is optional — include when it adds context and fits within the cap. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |
| `post_start_date` | Event start datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock — see the `Date/time formats` section). Date AND time both live here. The event template renders its date from this field; a candidate that reached creation already cleared METHODOLOGY's Date-sanity gate, so it carries a confirmed future date — pass it. The source's published start clock time fills the last six digits (7:30 AM start → `073000`); no published clock time → `000000`. BD silently truncates other formats. |

### Source-supported (a field whose data the source supplies is filled — leaving it empty is the failure)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: re-read the **category ledger** line and copy one value from it verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Events-specific fields and examples:

| Field | Events-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (date/time, venue, price, how to attend) + bullets where they help scannability + a close that lands the next step (how to attend or buy tickets). |
| `post_url` | Never sent — the registration URL lives in post_content's CTA; only an explicit user request fills it. |
| `post_promo` | The published cost to attend — ticket, registration, entry, or booking fee — a plain decimal number ("59.30"), no currency symbol; tiers or a range → the lowest standard adult price. **Send `post_promo` (BD back-fills `post_price`); sending `post_price` alone leaves `post_promo` null.** OMIT unless the source states a real dollar amount — a passed `0` renders as a literal `$0.00` price tag, so a free or unpriced event omits it and states "free" in `post_content`. |
| `post_expire_date` | Event end datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock). The source's published end clock time fills the last six digits (10 AM conclusion → `100000`). For a single-day event, set to the same date as `post_start_date` with the actual end time. Source states no end at all: equal to `post_start_date`. |
| `post_venue` | Venue name only ("Stubb's BBQ", "Staples Center", "Delta Hotels Toronto"). |
| `post_location` | The display address — full street when the source gives one, else city/state (the string that geocoded, e.g. `"Denver, CO"`); lat/lon carry the map pin. Do NOT prepend the venue name (already in `post_venue`). |
| `lat` | Latitude float (from Nominatim, skip if geocoding failed). |
| `lon` | Longitude float (from Nominatim, skip if geocoding failed). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Austin Tech Summit 2026 in Downtown Austin, Enterprise Software and AI Conference June 13"` — venue + city + date + category modifiers, plus a searcher's pairing term (dates, tickets, schedule) where natural, expanded from the shorter `post_title`. |
| `post_meta_description` | Events-specific flavor: distill the event's value proposition + date + city (e.g. "Three-day enterprise software conference in downtown Austin, June 13-15, 2026. Speakers from Microsoft, AWS, and Salesforce."). |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

### Date/time formats

Both fields use `YYYYMMDDHHmmss` (14 digits) in the create call. BD silently truncates other formats, corrupting the value.

- `post_start_date`: event start (date AND time). **Event-local wall-clock — the time as a visitor in the event's city would read it. Do NOT convert to the site's own timezone.** A 7 PM Brooklyn event on a Los Angeles-timezoned site stores as `20260616190000`, not `20260616160000`.
- `post_expire_date`: event end (date AND time). Same event-local wall-clock as `post_start_date`; an end date published without a clock time → that date + `000000`.
