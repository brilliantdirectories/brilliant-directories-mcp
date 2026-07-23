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
4. **Author resolution.** A pre-specified `user_id` in the request settles it — no call. Else run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Search round — the opening round stocks the run: call 5a and 5b in this ONE message of exactly six calls; the round's slots are exactly these. Later rounds fire 5a alone, new angles each time.**
    - **5a. Five discovery queries** — the round's set, facets per `Source candidates` and METHODOLOGY `Stage 3: Source research` steps 2a-2b: `<occupation> hiring now`, `<occupation> job openings board`, `site:apply.workable.com <occupation>`, `site:boards.greenhouse.io <occupation>`, `site:jobs.lever.co <occupation>`. The Search round's score: how many results it surfaces showing a job title — ten candidates beat one.
    - **5b. The create-fields call** — `getPostTypeCustomFields data_id=<resolved>` (or `system_name=<resolved>`) per `Post-type discovery`. Cache `post_category.choices` and `post_job.choices` — used at create time. Step 4's author probe, when the request names no author, rides this message as its seventh call — six calls, seven with the probe aboard; the probe never takes 5b's slot.
6. **Pool-print turn — the message right after a search round's results arrive.** Walk every result of all five searches — and any fetched page in hand — one by one and cut the two keys: the role is the title segment containing the searched occupation (the first segment when none does); the employer is the URL's employer — a path or subdomain slug (`apply.workable.com/<employer>/`, `<employer>.recruitee.com`) or a careers page's own domain, any TLD — else the title's other segment (` at <employer>`, `<employer> - <role>`, `<role> - <employer>`), else the snippet's named company — a board's own name is never the employer; a board is any site listing many employers' jobs (Indeed, ZipRecruiter, Glassdoor). Nothing else cuts the keys — the result's own URL, title, and snippet are enough; its page is never fetched to cut them. Both keys cut and the role sharing a word with the searched occupation, the result is a candidate (the 30-day staleness gate applies per `Source candidates` — a candidate showing no posted-date is never blocked by it); no employer in the three homes, not one. Each reads as `Title - Company - v1 | v2 | v3` (its three variants, each 1-3 words, each a fingerprint bet on an existing post's title: the employer, an employer + role combo, and one more employer-anchored string that could fingerprint the title — a one-word employer `Bramblewood` hiring a nurse yields `Bramblewood,Bramblewood Nurse,Nurse Bramblewood`; an employer written `Smith, Jones & Co` yields `Smith`: a variant never spans a comma; matching is case-insensitive — case twins are one variant); the pool holds the first ten candidates in the order found — fewer only when the outputs and pages in hand show fewer. The Pool-print turn's score: how many candidates enter the pool — an omitted one costs a later round. The pool print opens with the count and prints one line per counted candidate — fewer lines than the count is an incomplete print. A round has ONE pool-print turn: every candidate's calls fire here — a second dedup turn on the same round's results is an incomplete first turn. Fire every candidate's dedup calls in this same message, on `listSingleImagePosts` only for the probes — call shapes per the `Dedup` section: every candidate's 3 variants in ONE title compound — 3 × N in element 1, the pool lines' variants merged as one comma-joined string — plus one venue probe per candidate; the venue leg never rides the title call. N candidates = N+1 calls in this one message; fewer is an incomplete turn.
    - **6a. Shortfall queries — fewer than five pooled →** five new-angle WebSearch shapes ride this same message — untried facets on untried source classes: `site:jobs.ashbyhq.com <occupation>`, `site:jobs.smartrecruiters.com <occupation>`, `<occupation> jobs <city>`, `<adjacent-occupation> careers`, `site:governmentjobs.com <occupation>` — never repeats of spent queries. Fired now, read next round: a fully-duped pool re-pools from these yields at the next pool-print; the goal counts Step 7 survivors, never candidates at the read. Their message prints one insurance line citing each shape with its result count — `insurance: <shape> (<n results>) ×5` — a count only a fired query supplies; a line missing a count is an unfired query, and an unprinted insurance line is an incomplete turn.
    - **6b. The compound and probes** — per the `Dedup` section: every keyed candidate from any search or fetch so far aboard. Once a candidate shows its title, its research stops until it survives Step 7. Results yielding a single keyed candidate are a pool of one — it prints as `1.` and fires its two calls the same. No candidates → the pre-fired yields pool at the next pool-print; with none in hand, return to Step 5.
7. **Duplicate detection.** Stage 2's calls fired with Step 6's message — compare the returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's jobs-specific match criteria. Dupes drop from the pool with no further calls; survivors advance to METHODOLOGY `Stage 3: Source research` steps 2c-2e verification — web calls travel in packs there: at least five to a message, spares preloaded, per `Rule: Search discipline` — each advancing survivor's application-page fetch (its prompt asks the posting's street address and application contact, plus the `Depth` line's cargo) and its Stage 5 citation sources ride those spare slots as inputs come ready, so Step 10 drafts from facts already in hand. No survivor → the pre-fired yields pool at the next pool-print (Step 6 again); with no pre-fired yields in hand, return to Step 5. Repeat until survivors meet the post goal. Survivors at or above the goal end the hunt — the top survivor advances to Step 8, the rest stand as backups.
8. **Pre-create batch — the message right after verification completes for all survivors; this turn's only job: call 8a, 8b, and 8c in this ONE message.** One survivor = six calls — its `poolImages` call, its title check, and its four `Geocode ladder` tiers; a remote survivor with no location fires two — its `poolImages` call and title check; fewer is an incomplete turn. Each additional survivor adds its own six (or two) to this same message. No other calls ride this turn. The six are three tools' calls — `poolImages`, `listSingleImagePosts`, `WebFetch` — born to fire together.
    - **8a. Image selection.** The `poolImages` call fires in this batch message, never its own turn — per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy`.
    - **8b. Final-title check (+ image dedup on the Steps 1-3 path).** Steps 1-3 image path: run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step here. `poolImages` path: the image is settled — title check only. Compose the final `post_title` once, to the field reference's title spec, then confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call before create (batched with the METHODOLOGY `Image strategy` Step 3 image-dedup when that path runs), never word-order variants. Run it exactly once — the checked title is the created title, verbatim.
    - **8c. Geocode survivors only.** Nominatim every non-duplicate candidate's address — their `Geocode ladder` tiers batched together as backups. Skip lat/lon only when every tier was empty.
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

## Source candidates (runbook Step 5)

Per METHODOLOGY `Stage 3: Source research` (sub-step 2a), with one adjustment: the **Date sanity gate does NOT apply** to jobs — the **30-day staleness gate** is jobs' only date rule. Discovery is faceted and list-producing — derive the facets, then run the discovery ladder per **Rule: Search discipline**: one batched round of broad-faceted temporal (`<occupation> <location> hiring now`) + list-page vocabulary (`<location> <occupation> job openings board`); a shown posted-date within 30 days ranks a listing higher, its absence never drops one. Unless the user directs otherwise, prefer listings that fit the site's niche and carry strong local search intent, with public application info available.

**Facets to derive:**
- **Occupation/industry** — from the user's named occupations + audience/vertical from `getSiteInfo` + the resolved post type's `feature_categories` (cached).
- **Location** — three modes, pick the one matching the user's request:
  1. **User named a city/region** → use that verbatim ("Boston jobs," "jobs in Bangkok").
  2. **User implied geographic scope but no specific city** ("local jobs," "jobs in my country," "near me") → scope to `getSiteInfo.primary_country`; pick locally-relevant cities for the country (not only cities where you have members). Use `listCities` ONLY when the user explicitly asks for jobs in member cities ("where I have members," "cities we cover"); never find member cities by listing members.
  3. **User asked for a location-agnostic vertical** ("IT jobs," "remote copywriters," "freelance designers") → don't force a city facet at all; let the returned data drive it. The post's own geo fields are set from whatever the source record says (specific city → fill `post_location`/`lat`/`lon`/`country_sn`/`state_sn`; remote → omit those fields entirely).
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

The post's outbound link is the canonical posting; an aggregator copy is harvest-only. The copy carries the probe keys — job reference, poster name: after its `no match - survives` verdict, one reference search, then one `site:` probe on the poster's domain — each riding its message's pack — reaches the canonical posting. Prefer the candidate whose canonical posting is already verified live. Unreachable → use the copy's application contact per `How to apply` (a generic careers page qualifies only there), or drop per `URL liveness gate`.

---

## Dedup (runbook Step 7)

Per METHODOLOGY `Stage 2: Duplicate detection`. Jobs-specific match criteria:
- Title: semantic match (the role, e.g. "Senior Marketing Manager").
- Company: same company (`post_venue`) semantic match.
- Location: same city.

Distinctive phrases = employer names, never bare role titles. Title + company + location together decide each row, so multi-location employers dedup per location, not per brand. Probes carry the snippet keys — employer variants alone; location is never a variant. Location decides at the verdicts: returned rows carry `post_venue` and `post_location` — a title+company match splits on location there, and a candidate whose city is not yet shown pends its verdict to survivor verification. `total` exceeds the returned row count → re-run once with the candidate's most distinctive employer fragment, or its city, as the phrase. A company, city, or title that changes at verification re-probes. Retrieval fires as: `listSingleImagePosts property=["post_title","data_id"] property_operator=["contains","eq"] property_value=["<every pooled candidate's variants as ONE CSV string>","<the resolved jobs data_id>"] limit=50 fields_only="post_id,post_title,post_status,post_filename,post_venue,post_location"` — every retrieval call carries the same `fields_only`; the arrays stay two-and-two. Element 1 carries exactly 3 × N variants — per candidate: the employer, an employer + role combo, and one more distinctive fingerprint; an omitted variant saves a token and ships a dupe. Plus one venue probe per candidate, batched in the same turn — the employer core against the company field: `listSingleImagePosts property=["post_venue","data_id"] property_operator=["contains","eq"] property_value=["<employer core>","<the resolved jobs data_id>"] limit=50` with the same `fields_only` — a fully retitled dupe still carries its company in `post_venue`. Its verdict line cites the candidate's company: `no match (title + venue: Bramblewood) - survives` — one verdict line per pool line; a location-split verdict cites the city that decided it.

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

**Voice:** this page IS the job posting — the record needs no re-introduction: facts carry their own subjects ("Pay runs $22 to $29 an hour"), never a framing-abstraction under a light verb ("the schedule keeps", "the posted price keeps"), the record-noun an ordinary subject. State the record's facts as settled knowledge, candidates, the employer, or the position holding the subject slot, time, place, or a because-clause free to lead a sentence: "The position requires STOTT certification", "On weekends, sessions run one-on-one." Never make a source document — or anything that publishes, displays, or evidences a fact — a sentence's actor, quoting or analyzing ("the posting says", "the posting frames the work around", "the pay band is not shown on the page") — state each fact bare or leave it out — a fact from the fetched source IS the role's fact; bare assertion is the accurate report; two source facts may share a sentence, a because/while/so between them stating both, never inventing ("Sessions run one-on-one because the studio caps classes at four") — the joint carries fact, never a mood or appeal — attribution is never a third door; a fact the source omits is silently absent, never reported missing. Record and company context, what the work is, told straightforward — informative, never puffery. Ground market context in real specifics: employer type, pay bands, schedule shape; related openings appear only as links riding nouns the finished draft already wrote, never sentences written to carry them.

**Jobs-specific load-bearing facts** — two intro paragraphs, at least six sentences split unevenly between them (never an even split), state the record's facts in any natural flowing order: the title and employment type, who's hiring, the city, pay when published, what the work is, and who it's for; the first sentence leads with who's hiring and the role. The post closes with two paragraphs about the record, at least six sentences split unevenly between them (never an even split) — the close advances: the deadline, the next step — never a restatement of the body, never the button or its form (how to apply belongs to the CTA, or to the plain-link close when there is no URL). A close that runs out of record facts ends short — filler sentences about the site's own pages or search views never pad it; links riding the close's real sentences stand. Section `<h2>`s: record-material noun phrases, never questions, never a dimension's label.

**Application CTA** — unless the user requests otherwise: when an application or official job information URL is known, it is reserved for this CTA — place this block right after the intro — all three parts in order, none skipped: (1) a short record-material `<h2>`, (2) a 2-3 sentence third-person `<p>` on how to apply (the steps, what to have ready — never commands, never the button, link, or form described, never what they open), (3) `<p><a class="btn btn-secondary btn-lg vmargin" href="<an official URL this run fetched, copied character-for-character from its source>" title="<descriptive phrase>" rel="noopener" target="_blank">Button Text In Title Case</a></p>`. The URL is the button's first — never a body citation; never the button alone; never an action or login-gated path — public pages only.

**Bullets** — the record's core facts as one scannable `<ul>` immediately after the CTA (after the intro when there is no CTA): the role, employer, location, pay, and employment type at a glance. A slot the source doesn't fill is dropped, never written as missing. A later section whose facts enumerate — responsibilities, qualifications, formats, benefits — presents them as its own `<ul>`.

**Section headings**: record-material noun phrases — the job's own facts, work, or requirements; never the site's categories or an assembled search phrase, never forced or stuffed, never a dimension label (e.g. Overview, Details, Background, Responsibilities, Requirements, Benefits, About).

**Depth**: a job page is a destination, not a stub nor a spec sheet — every sourced fact enters under its dimension as settled knowledge (the company's story, its own numbers, responsibilities, requirements, benefits, pay specifics, the workplace and team context), and confident knowledge fills every dimension the subject supports — such as what the role involves, what the work is like and what the hire grows into, who the employer is and what they are about, the field as context; a fact or a dimension left unused is the failure — record specifics (pay, terms, this employer's numbers) stay source-only, never invented. Self-praise and superlatives are not facts — they never enter, bare or attributed; the verifiable specifics they decorate enter bare. A known application or official listing URL is fetched before drafting, its prompt asking for that cargo plus responsibilities and qualifications alongside the logistics.

**How to apply** — a known URL rides the CTA and needs no `How to apply` section; application by email or phone surfaces as plain links in a closing `How to apply` section.

**Internal links:** placed from the internal-link inventory by Stage 5's linking pass, per **URL-PATTERNS `Pattern 3 filter params` and `Pattern 6 — Filtered member directory`** (member-count gate) and **Link shape priority** — no per-section quotas: the density law alone places them, riding only nouns the body writes.

Jobs get category, location (`lat`+`lng`+`location_value`+`location_type=locality`) filter dimensions. No date filter for jobs.

---

## BD Jobs field reference (runbook Step 11)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `data_type` | `20` (single-image classification, always for jobs) |
| `data_id` | resolved jobs post-type id from runbook Step 3 |
| `post_title` | **Graceful-degradation ladder, ~54 char cap.** Use a colon `:` as the primary separator (BD's slugifier handles colons cleanly — em dashes produce ugly `%E2%80%94` URL encoding). Never two colons in a single title — if the role name itself contains a colon, switch to "at"/"in" prose. Title+Company+City → Title+Company → Title+City → Title (+ employment type as fallback parenthetical). Adjust to fit the cap: drop city first, then company, then fall back to title-only. Examples: `"Marketing Manager: Bramblewood in Austin"` (full), `"Marketing Manager: Bramblewood"` (no city fits), `"Marketing Manager in Austin"` (no company source), `"Marketing Manager (Full-Time)"` (title-only fallback). Plain text, no HTML, no commas. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Source-supported (a field whose data the source supplies is filled — leaving it empty is the failure)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: copy one value from the ledger's `post_category choices:` line verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Jobs-specific fields and examples:

| Field | Jobs-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (role + employment type + company + location), responsibilities + qualifications bullets, `How to apply` close. |
| `post_venue` | **Always pass the hiring employer's name; never OMIT** (BD helpText: "Company name"). Verbatim from source — the same employer named in the title. Examples: `"Bramblewood"`, `"Loudoun County Government"`. |
| `post_start_date` | Required. The source's future apply-by date — application close date, deadline, start date, and similar are all this one date. Else identical to `post_live_date`. `YYYYMMDDHHmmss` (14 digits). A date listed without a clock time → `000000`. |
| `post_url` | Never sent — the application URL lives in post_content's CTA; only an explicit user request fills it. |
| `post_promo` | Salary or hourly rate as shown in the source — a plain decimal number, no currency symbol, no commas. Hourly source → `14.50`; annual source → `70000.00`. Do not convert between hourly and annual. On a salary range, use midpoint of low+high, rounded to two decimals. **Send `post_promo` (BD back-fills `post_price`); sending `post_price` alone leaves `post_promo` null.** OMIT on "commensurate" / "DOE" / "competitive" / missing — never fabricate. |
| `post_job` | **Always pass a value; never OMIT.** Map source text case-insensitive against cached `post_job.choices` (Step 3). Pick the closest semantic match ("full time/FT" → live full-time choice; "intern" → internship; "contract/contractor" → contract-equivalent; etc.). On ambiguous or absent source, default to the live choice meaning "Full-Time". |
| `post_category` | Pull from cached `getPostTypeCustomFields.post_category.choices` (Step 3). NOT from `getSingleImagePostFields` (returns stale fallback for jobs). Pass the `key` VERBATIM including any leading whitespace from the BD CSV-split quirk. |
| `post_location` | The display address — full street when the source gives one, else city/state (the string that geocoded, e.g. `"Denver, CO"`); lat/lon are the map coordinates. A multi-location source pins the post to ONE location — the location the post's own apply URL's posting names; else the source's primary or first-listed — for the title, location, and geocode; the other locations are body facts only. Do NOT prepend the company name (already in `post_venue`). Remote with no location: OMIT. |
| `lat` | Latitude float (from Nominatim, skip only if every tier was empty). |
| `lon` | Longitude float (from Nominatim, skip only if every tier was empty). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Senior Marketing Manager Full-Time Position at Bramblewood in Downtown Austin, Texas"` — occupation + employment type + company + city, plus a searcher's pairing term (salary, hiring, apply) where natural, expanded from the shorter `post_title`. |
| `post_meta_description` | Descriptive prose: role + key responsibility + location + employment type, one sentence (e.g. "Bramblewood is hiring a Senior Marketing Manager in Austin, TX to lead B2B SaaS brand strategy. Full-time, hybrid."). Apply URL/email/phone stays in the body's `How to apply` section, NOT in the meta description — Google strips URLs from SERP snippets and meta descriptions should read as natural prose. |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |

### Do NOT pass

- `post_expire_date` — BD job theme doesn't read it for auto-hide. Staleness discipline lives at the 30-day source-side gate.
- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.
