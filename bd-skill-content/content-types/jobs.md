# Jobs content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create job posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.
4. `../shared/GEOCODING.md`: Nominatim protocol (transliteration, geocode ladder, normalization).

---

## End-to-end runbook

The user invoked the skill with a request like "create job posts on my site" or similar. They may have specified cities, occupations, categories, or limit. Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Make only the tool calls the runbook steps specify and fill each message's pack per Rule: Search discipline — insurance fill is not an extra; improvised calls outside the steps and the fill rule are.** On per-job failure, continue to the next job.

1. **Autonomy.** Per METHODOLOGY `Autonomy`: never ask; decide and proceed.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Search round — the opening round stocks the run: call 5a and 5b in this ONE message of exactly six calls; the round's slots are exactly these. Later rounds fire 5a alone, new angles each time.**
    - **5a. Five discovery queries** — the `Search ladder` rows 1-5, facets per `Source candidates` and METHODOLOGY `Stage 3: Source research` steps 2a-2b. Its score: how many results it surfaces showing a job title — ten candidates beat one.
    - **5b. The create-fields call** — `getPostTypeCustomFields data_id=<resolved>` (or `system_name=<resolved>`) per `Post-type discovery`. Cache `post_category.choices` and `post_job.choices` — used at create time. Step 4's author probe, when the request names no author, rides this message as its seventh call — six calls, seven with the probe aboard; the probe never takes 5b's slot.
6. **Pool-print round — the message right after a search round's results arrive: the same six-call round shape as Step 5 — call 6a and 6b in this ONE message; the round's slots are exactly these.** Walk every result of all five searches — and any fetched page in hand — one by one and cut the two keys: the role is the title's first segment, cut at its first separator; the employer is an ATS URL's slug (`apply.workable.com/<employer>/`, `jobs.lever.co/<employer>/`, `job-boards.greenhouse.io/<employer>/`), else the title's segment after ` at ` or its final `-` segment, else the snippet's named company — a board's own name (Indeed, ZipRecruiter, Glassdoor) is never the employer. Both keys cut, the result is a candidate (the 30-day staleness gate applies per `Source candidates` — a candidate showing no posted-date is never blocked by it); no employer in the three homes, not one. Each reads as `Title — Company — v1 | v2 | v3` (its three title variants, each 1-3 words — each a substring a matching title would contain, the role or employer as titles write it — a title writing `Metro, DMV` yields the variant `Metro`: a variant never spans a comma; matching is case-insensitive — case twins are one variant); cap 10 candidates when more. The pool print opens with the count and prints one line per counted candidate — fewer lines than the count is an incomplete print; omitting a candidate saves zero calls — the compound is one call at any pool size — and costs a later round. A round has ONE pool-print turn: every candidate's calls fire here — a second dedup turn on the same round's results is an incomplete first turn. Fire the candidates' dedup calls in this same message, on `listSingleImagePosts` only for the probes — call shape per the `Dedup` section: ONE title compound, the pool lines' variants merged into element 1 as one comma-joined string — 3 × N variants covering every pooled candidate. N candidates = 1 compound — 3 × N variants in element 1; a compound below 3 × N is an incomplete turn. The message is SIX calls:
    - **6a. The ladder's next five** — WebSearch, the five `Search ladder` rows after the highest row yet cited in an insurance line; the first 6a round fires rows 6-10. Fired now, read next round: a fully-duped pool re-pools from these yields at the next pool-print; the goal counts Step 7 survivors, never candidates at the read. The message prints one insurance line per row — `insurance: row <r> <shape> (<n results>) ×5` — a count only a fired query supplies; a line missing a count is an unfired query, an unprinted insurance line is an incomplete turn, and the next 6a round starts at the highest cited row + 1.
    - **6b. The compound** — per the `Dedup` section's fence: every keyed candidate from any search or fetch so far aboard. Once a candidate shows its title, its research stops until it survives Step 7. Results yielding a single keyed candidate are a pool of one — it prints as `1.` and the round's six calls fire the same. No candidates → the pre-fired yields pool at the next pool-print; with none in hand, return to Step 5.
7. **Duplicate detection.** Stage 2's calls fired with Step 6's message — compare the returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's jobs-specific match criteria. Dupes drop from the pool with no further calls; survivors advance to METHODOLOGY `Stage 3: Source research` steps 2c-2e verification — web calls travel in packs there: at least five to a message, spares preloaded, per `Rule: Search discipline` — each advancing survivor's application-page fetch (its prompt asks the posting's street address and application contact) and its Stage 5 citation sources ride those spare slots as inputs come ready, so Step 10 drafts from facts already in hand. No survivor → the pre-fired yields pool at the next pool-print (Step 6 again); with no pre-fired yields in hand, return to Step 5. Repeat until survivors meet the post goal. Survivors at or above the goal end the hunt — the top survivor advances to Step 8, the rest stand as backups.
8. **Pre-create batch — the message right after verification completes for all survivors; this turn's only job: call 8a, 8b, and 8c in this ONE message.** One survivor = six calls — its `poolImages` call, its title check, and its four `Geocode ladder` tiers; a remote survivor with no location fires two — its `poolImages` call and title check; fewer is an incomplete turn. Each additional survivor adds its own six (or two) to this same message. No other calls ride this turn. The six are three tools' calls — `poolImages`, `listSingleImagePosts`, `WebFetch` — born to fire together.
    - **8a. Image selection.** The `poolImages` call fires in this batch message, never its own turn — per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy`.
    - **8b. Final-title check (+ image dedup on the Steps 1-3 path).** Steps 1-3 image path: run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step here. `poolImages` path: the image is settled — title check only. Compose the final `post_title` once, to the field reference's title spec, then confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call before create (batched with the METHODOLOGY `Image strategy` Step 3 image-dedup when that path runs), never word-order variants. Run it exactly once — the checked title is the created title, verbatim.
    - **8c. Geocode survivors only.** Nominatim every non-duplicate candidate's address — their `Geocode ladder` tiers batched together as backups. Skip lat/lon on failure.
9. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for jobs-specific authorization.
10. **Content manufacture.** Proceed straight from runbook Step 9 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds jobs-specific load-bearing facts.
11. **Create the post** — fires ALONE in its own turn, after Steps 7-10 are complete for the candidate; nothing batches with a create. Via `createSingleImagePost` per METHODOLOGY `Stage 6: Post creation`, with the field set in the `BD Jobs field reference` section.
12. **Audit summary.** Run METHODOLOGY `Stage 7: Closing reply + JSON receipt`.

---

## Post-type discovery (runbook Step 3)

Jobs are `type_of_feature=null` (same as blogs). `data_type=20` is the SCOPE (single-image post family — same as blog, event, coupon, etc.), not a discriminator. `data_id=9` is typical but NOT canonical — every site can be different; do not hard-code.

Resolution order (try in order, stop at first match; server-side filter via `listPostTypes` — do NOT `getPostType` per-candidate):

1. **User named a post type explicitly** (e.g., "post to my 'Open Positions' section"). Match the user's phrase against `data_name`, `system_name`, `form_name` on `listPostTypes`. Single confident match wins — skip the rest.

2. **User didn't specify** — try in order, stop at first match:
   a. `system_name=job_listing` (BD canonical)
   b. `form_name=job_fields` (canonical jobs form)
   c. `data_type=20` + semantic match on `data_name`/`system_name` against role-listing terms in any language (job, jobs, careers, positions, openings, vacancies, hiring, internships, empleos, trabajos, vacantes, emplois, offres d'emploi, stellenangebote, vagas, lavoro, oferty, etc. — case-insensitive; catches sites that renamed away from canonical)

3. **EXCLUDE from any jobs resolution:**
   - `community_article` / `form_name=member_article_fields` — member-written, not job postings
   - `coupon`, `soundcloud_post`, `discussion`, `event`, `website_blog_article`, `property`, `product`, `photo_album`, `video`, `classified` — different content types

**`type_of_feature` is NOT a jobs marker.** Reserved for events (`1`), properties (`2`), digital products (`0`). Jobs are `type_of_feature=null`.

**Decision after resolution:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run — exit with the Stage 7 receipt; `shortfall_reason` says no jobs-capable post type exists. |
| One | Use it — even a niche flavor (e.g. "Internships" as the site's only jobs-shaped type). Cache `data_id`, `data_name`, `system_name`, `form_name`, `feature_categories` — and write the **category ledger** line from this row, per `Stage 1: Site context` step 3. |
| Multiple | Resolve per METHODOLOGY `Post-type disambiguation (universal pattern)` — never exit over ambiguity. |

The user's explicit post-type pick always wins.

**Resolution feeds `getPostTypeCustomFields`** — **runbook Step 5b carries the call.** Cache the response — it carries the live `post_category.choices` AND `post_job.choices` for this site (admin may have customized either). `getSingleImagePostFields` returns a stale fallback list for jobs — do NOT use it for `post_category` or `post_job` enums. Its output is used at create time.

---

## Search ladder (runbook Steps 5a and 6a)

15 rows, fired in order, five per round — Step 5a fires rows 1-5; each 6a round fires the five rows after the highest row yet cited in an insurance line. Row 15 spent → restart at row 1 with the next adjacent occupation as `<occupation>`. Facets fill per `Source candidates`.

1. `<occupation> hiring now`
2. `<occupation> job openings board`
3. `site:apply.workable.com <occupation>`
4. `site:boards.greenhouse.io <occupation>`
5. `site:jobs.lever.co <occupation>`
6. `site:jobs.ashbyhq.com <occupation>`
7. `site:jobs.smartrecruiters.com <occupation>`
8. `<occupation> jobs <city>`
9. `<adjacent-occupation> careers`
10. `<occupation> vacancies <country>`
11. `site:myworkdayjobs.com <occupation>`
12. `site:icims.com <occupation>`
13. `site:applytojob.com <occupation>`
14. `<occupation> jobs <second city>`
15. `site:recruitee.com <occupation>`

---

## Source candidates (runbook Step 5)

Per METHODOLOGY `Stage 3: Source research` (sub-step 2a), with one adjustment: the **Date sanity gate does NOT apply** to jobs — the **30-day staleness gate** is jobs' only date rule. Discovery is faceted and list-producing — derive the facets, then run the discovery ladder per **Rule: Search discipline**: one batched round of broad-faceted temporal (`<occupation> <location> hiring now`) + list-page vocabulary (`<location> <occupation> job openings board`); a shown posted-date within 30 days ranks a listing higher, its absence never drops one.

**Facets to derive:**
- **Occupation/industry** — from the user's named occupations + audience/vertical from `getSiteInfo` + the resolved post type's `feature_categories` (cached).
- **Location** — three modes, pick the one matching the user's request:
  1. **User named a city/region** → use that verbatim ("Boston jobs," "jobs in Bangkok").
  2. **User implied geographic scope but no specific city** ("local jobs," "jobs in my country," "near me") → scope to `getSiteInfo.primary_country`; pick locally-relevant cities for the country (not only cities where you have members). Use `listCities` ONLY when the user explicitly asks for jobs in member cities ("where I have members," "cities we cover"); never find member cities by listing members.
  3. **User asked for a location-agnostic vertical** ("IT jobs," "remote copywriters," "freelance designers") → don't force a city facet at all; let the source returns drive it. The post's own geo fields are set from whatever the source record says (specific city → fill `post_location`/`lat`/`lon`/`country_sn`/`state_sn`; remote → omit those fields entirely).
- Never bulk-list existing posts to infer geographic focus.

**Source-country routing.** When picking from the source buckets, default to the site's `primary_country` (cached Stage 1) — the AI should prefer that country's national job portals, associations, and chambers. If the user's request names a different country, route there instead. The bucket names are examples — adapt to the active country.

**What a qualifying source looks like when it appears in results** — recognition vocabulary, not a probe list:

- **ATS public job pages** — globally used: Greenhouse (`boards.greenhouse.io/<company>`), Lever (`jobs.lever.co/<company>`), Ashby (`jobs.ashbyhq.com/<company>`), Workable (`apply.workable.com/<company>`), Recruitee, SmartRecruiters, BambooHR, Personio, Teamtailor. One company URL = many listings, ToS-clean. Country-agnostic.
- **National + regional government job portals** — every country has them. US: USAJobs.gov + state `.gov/jobs`. UK: GOV.UK Find a Job. Canada: Job Bank. Australia: APSJobs.gov.au. EU: EURES. Singapore: MyCareersFuture. Thailand: ThaiJob.com (gov). Malaysia: JobsMalaysia.gov.my. India: NCS.gov.in. China: official municipal HR portals. For any other country, search `<country> national job portal site:.gov OR site:.<cc>`.
- **Professional / trade association career centers** — pick associations native to the site's country and vertical. Medical: AMA (US), BMA (UK), CMA (Canada), AMA (Australia), MMA (Malaysia). Engineering: ASCE/IEEE (US), ICE (UK), Engineers Australia, IEM (Malaysia). Finance: AICPA/CFA Institute (global). Legal: state/provincial/national bar associations. Each country has equivalents; search `<vertical> association careers <country>`.
- **Local chambers of commerce + workforce/employment boards** — every metro globally has a chamber-of-commerce-equivalent and a regional employment-services board with public local-employer listings (US: Workforce Development Boards; UK: Jobcentre Plus partner sites; EU: regional labour offices; Asia: regional manpower bureaus).
- **University public career boards + library job portals** — country-agnostic; every city's main library and university typically lists local employer postings on a public page.

**Never fetch or link:** Indeed, LinkedIn, ZipRecruiter, Glassdoor, Monster, SEEK, 51job (anti-scrape ToS — global aggregators all have it). Their results still count: one showing the dedup keys pools as an aggregator copy — keys from the snippet, harvest-only — and its canonical posting is reached per the canonical-posting rule after it survives.

Tailor by vertical AND country: pick the country-native association + the country's national job portal first, then ATS pages of companies operating in that country.

**30-day staleness gate.** During candidate harvest, read each candidate's source-page posted-date where the entry shows one, and reject candidates whose posted-date is >30 days old. A real on-topic listing in the correct location whose page shows no posted-date is valid — capture it and advance; the date orders the pool when present and never blocks a candidate.

A single list-page `WebFetch` may return one job or dozens. Capture and print the pool per METHODOLOGY `Candidate pool discipline (universal pattern)`, take the top survivor after the verdicts, and drop-and-advance through the surviving list on failure — no re-fetch.

Usable candidates pool per Step 6. No survivor after a round → return to Step 5 for the next five-query round, new angles each time. Only when every source is stale (>30 days), blocked, or wrong-location after the rounds → stop with the labelled verdict; a clean "no qualifying jobs found" run is a valid outcome (`shortfall_reason`). Pool 2 is for candidates that exist and fail per-candidate; a sweep-proven-dry market ends the run.

The post's outbound link is the canonical posting; an aggregator copy is harvest-only. The copy carries the probe keys — job reference, poster name: after its `no match — survives` verdict, one reference search, then one `site:` probe on the poster's domain — each riding its message's pack — reaches the canonical posting. Prefer the candidate whose canonical posting is already verified live. Unreachable → use the copy's application contact per `How to apply` (a generic careers page qualifies only there), or drop per `URL liveness gate`.

---

## Dedup (runbook Step 7)

Per METHODOLOGY `Stage 2: Duplicate detection`. Jobs-specific match criteria:
- Title: semantic match (the role, e.g. "Senior Marketing Manager").
- Company: same company (`post_venue`) semantic match.
- Location: same city.

Distinctive phrases = employer names, never bare role titles. Title + company + location together decide each row, so multi-location employers dedup per location, not per brand. Probes carry the snippet keys — title and company variants alone; location is never a variant. Location decides at the verdicts: returned rows carry `post_venue` and `post_location` — a title+company match splits on location there, and a candidate whose city is not yet shown pends its verdict to survivor verification. `total` exceeds the returned row count → re-run once with the candidate's city or most distinctive title token as the phrase. A company, city, or title that changes at verification re-probes. Retrieval fires as: `listSingleImagePosts property=["post_title","data_id"] property_operator=["contains","eq"] property_value=["<every pooled candidate's variants as ONE CSV string>","<the resolved jobs data_id>"] limit=50 fields_only="post_id,post_title,post_status,post_filename,post_venue,post_location"` — every retrieval call carries the same `fields_only`; the arrays stay two-and-two. Element 1 carries exactly 3 × N variants, N = the pool print's line count; a trimmed variant saves a token and ships a dupe. Its verdict line cites the candidate's company: `no match (title + Acme Corp) — survives` — one verdict line per pool line; a location-split verdict cites the city that decided it.

Date is NOT a dedup axis (jobs don't have a freshness-comparable date field).

---

## Geocoding (runbook Step 8c)

Run on survivors only (candidates that passed runbook Step 7 dedup). Follow `../shared/GEOCODING.md` end-to-end: transliteration, geocode ladder, `Extraction prompt`, `Rules`, normalization.

For jobs, `post_venue` = company name, so `Geocode ladder` tier 1 (`q="<company>, <city>, <state-name>"`) only hits if Nominatim has the company's headquarters indexed; tiers 2-4 (street → city-only) carry the load more often.

---

## Image selection (runbook Step 8a)

**Jobs-specific Pexels search topics:** occupation + setting (`"office desk professional"`, `"warehouse worker operations"`, `"nurse hospital ward"`, `"construction site engineer"`, `"teacher classroom"`). They are the topical anchor for METHODOLOGY `Image strategy`'s **Axes** table phrases. NEVER use Pexels for what looks like a company logo — feature image is generic occupation/setting.

## Category routing (runbook Step 9)

Per METHODOLOGY `Stage 4: Category routing`. Jobs route via the **category ledger** (written at `Stage 1: Site context` step 3). For `post_category` specifically, use the cached `getPostTypeCustomFields.post_category.choices` (from Step 3) — pass the `key` VERBATIM including any leading whitespace from the BD CSV-split quirk. Append the choices keys to the **category ledger** as a second labeled line (`post_category choices: <keys>`); `post_category` copies from that line only — Pattern 3 `category[]` copies from the `categories:` line only.

User-specified default category in the request → every job in the run goes to that category (must match a cached `post_category` `choices` key; else route per Stage 4).

---

## Content manufacture (runbook Step 10)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML per **Rule: Post-body formatting**, link policy, voice via ANTI-SLOP, self-check before posting.

**Voice:** this page IS the job posting. State the role's facts as your own: "The role requires STOTT certification", "Sessions are one-on-one." Never narrate a source document, its gaps, or its agreement with another source ("the posting says", "the pay band is not shown on the page", "the careers board lists the same date") — a fact the source omits is silently absent, never reported missing. Role context, company context, what the work actually is. Comparison context comes from the role's market (employer type, pay bands, schedule shape); related openings appear only as links riding the role's own nouns.

**Jobs-specific load-bearing facts**: role + employment type, company + city + state, top 3-5 responsibilities, required qualifications, how to apply. Surface these in the opening section.

**Bullets per ANTI-SLOP `Bullets rule`** — content that often qualifies for jobs: responsibilities, required qualifications, preferred qualifications, benefits, perks.

**How to apply** — application URL/email/phone surfaced as plain links inside a `How to apply` section. Button styling is NOT in the runbook — if the user wants a styled Apply button they specify it in their `prompts/jobs.md` system prompt.

**Internal links:** placed by Stage 5's linking pass onto the finished draft, per **URL-PATTERNS `Pattern 6 — Filtered member directory`** (member-count gate) and **Link shape priority** — distributed, NOT clustered at the end. Budget **4-8 internal links per job post, pro-rated to length (a ~400-word post carries 2-4)**; the pass distributes:

| Section | Recommended links |
|---|---|
| Opening section (role + load-bearing facts) | 0-1 (category or location filter, riding a noun the opening already has) |
| Body sections (company/responsibilities/qualifications) | 2-5 links, **maximum 1 per major body section** — never two links in the same paragraph, never three links clustered in the final two sections |
| Closing paragraph | 0-1 (riding a sentence the close already needs, never a "go browse X" line) |

Jobs get category, location (`lat`+`lng`+`location_value`+`location_type=locality`) filter dimensions. No date filter for jobs.

---

## BD Jobs field reference (runbook Step 11)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `data_type` | `20` (single-image classification, always for jobs) |
| `data_id` | resolved jobs post-type id from runbook Step 3 |
| `post_title` | **Graceful-degradation ladder, ~54 char cap.** Use a colon `:` as the primary separator (BD's slugifier handles colons cleanly — em dashes produce ugly `%E2%80%94` URL encoding). Never two colons in a single title — if the role name itself contains a colon, switch to "at"/"in" prose. Title+Company+City → Title+Company → Title+City → Title (+ employment type as fallback parenthetical). Adjust to fit the cap: drop city first, then company, then fall back to title-only. Examples: `"Marketing Manager: Acme Corp in Austin"` (full), `"Marketing Manager: Acme Corp"` (no city fits), `"Marketing Manager in Austin"` (no company source), `"Marketing Manager (Full-Time)"` (title-only fallback). Plain text, no HTML, no commas. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: copy one value from the ledger's `post_category choices:` line verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Jobs-specific fields and examples:

| Field | Jobs-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (role + employment type + company + location), responsibilities + qualifications bullets, `How to apply` close. |
| `post_venue` | **Always pass the hiring employer's name; never OMIT** (BD helpText: "Company name"). Verbatim from source — the same employer named in the title. Examples: `"Acme Corp"`, `"Loudoun County Government"`, `"Equinox"`. |
| `post_start_date` | Required. The source's future start date if listed, else identical to `post_live_date`. `YYYYMMDDHHmmss` (14 digits). A start date listed without a clock time → `000000`. |
| `post_promo` | Salary or hourly rate as shown in the source — numeric only, no currency symbol, no commas, decimals optional. Hourly source → `14.50`; annual source → `70000.00`. Do not convert between hourly and annual. On a salary range, use midpoint of low+high. **Send `post_promo` (BD back-fills `post_price`); sending `post_price` alone leaves `post_promo` null.** OMIT on "commensurate" / "DOE" / "competitive" / missing — never fabricate. |
| `post_job` | **Always pass a value; never OMIT.** Map source text case-insensitive against cached `post_job.choices` (Step 3). Pick the closest semantic match ("full time/FT" → live full-time choice; "intern" → internship; "contract/contractor" → contract-equivalent; etc.). On ambiguous or absent source, default to the live choice meaning "Full-Time". |
| `post_category` | Pull from cached `getPostTypeCustomFields.post_category.choices` (Step 3). NOT from `getSingleImagePostFields` (returns stale fallback for jobs). Pass the `key` VERBATIM including any leading whitespace from the BD CSV-split quirk. |
| `post_location` | The display address — full street when the source gives one, else city/state (the string that geocoded, e.g. `"Denver, CO"`); lat/lon carry the map pin. Do NOT prepend the company name (already in `post_venue`). Remote with no location: OMIT. |
| `post_url` | Only on explicit user request — renders CTA button on post page. All other links go in the post content. |
| `lat` | Latitude float (from Nominatim, skip if geocoding failed). |
| `lon` | Longitude float (from Nominatim, skip if geocoding failed). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Senior Marketing Manager Full-Time Position at Acme Corp in Downtown Austin, Texas"` — occupation + employment type + company + city expanded from the shorter `post_title`. |
| `post_meta_description` | Descriptive prose: role + key responsibility + location + employment type, one sentence (e.g. "Acme Corp is hiring a Senior Marketing Manager in Austin, TX to lead B2B SaaS brand strategy. Full-time, hybrid."). Apply URL/email/phone stays in the body's `How to apply` section, NOT in the meta description — Google strips URLs from SERP snippets and meta descriptions should read as natural prose. |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |

### Do NOT pass

- `post_expire_date` — BD job theme doesn't read it for auto-hide. Staleness discipline lives at the 30-day source-side gate.
- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.
