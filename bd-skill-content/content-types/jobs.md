# Jobs content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create job posts. Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a request like "create job posts on my site" or similar. They may have specified cities, occupations, categories, or limit. Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Only make the tool calls each step specifies — no extras.** On per-job failure, continue to the next job.

1. **Mode detection.** Per METHODOLOGY `Mode detection`.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Source discovery.** Run METHODOLOGY `Stage 3: Source research`. Run the `Source candidates` section. Apply the 30-day staleness gate. Capture ~5 candidates and number them per METHODOLOGY `Candidate pool discipline (universal pattern)`.
6. **Duplicate detection.** Run METHODOLOGY `Stage 2: Duplicate detection`. Run the `Dedup` section for jobs-specific match criteria. On a dupe, drop to the next captured candidate — no re-fetch.
7. **Geocode survivors only.** Nominatim each non-duplicate candidate's address. Skip lat/lon on failure.
8. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for jobs-specific authorization.
9. **Image selection.** Run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` end-to-end: Topic-fit gate → extension filter → `getImageDimensions` orientation gate (landscape only) → dedup. The sequencing rules + retry behavior are defined there; follow them exactly. Lock the image first — re-doing content when an image fails dedup is the expensive path.
10. **Image dedup.** Per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step. For jobs: `listSingleImagePosts property=original_image_url property_value=<URL1,URL2,URL3> property_operator=in`.
11. **Content manufacture.** Proceed straight from runbook Step 10 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds jobs-specific load-bearing facts.
12. **Create the post** via `createSingleImagePost` with the field set in the `BD Jobs field reference` section.
13. **Audit summary.** Run METHODOLOGY `Stage 7: Audit summary`.

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer:

1. **Post-type** (if runbook Step 3 found multiple "Job"-flavored candidates)
2. **Author** — per METHODOLOGY `Author resolution (universal pattern)`
3. **Cities / region** (if the user didn't already specify)
4. **Occupations / categories** (if not already specified)
5. **Publish vs draft** ("Publish live, or save as drafts for your review?")
6. **Category-creation grant** (only ask if runbook Step 8 about to skip a job due to no ≥70% match: "Source category 'X' has no good match. Skip the job, create a new BD category 'X', or pick existing 'Y'?")

Skip any question the user already answered in the original request.

---

## Post-type discovery (runbook Step 3)

Jobs are `type_of_feature=null` (same as blogs). `data_type=20` is the SCOPE (single-image post family — same as blog, event, coupon, etc.), not a discriminator. `data_id=9` is typical but NOT canonical — every site can be different; do not hard-code.

Resolution order (try in order, stop at first match; server-side filter via `listPostTypes` — do NOT `getPostType` per-candidate):

1. **User named a post type explicitly** (e.g., "post to my 'Open Positions' section"). Match the user's phrase against `data_name`, `system_name`, `form_name` on `listPostTypes`. Single confident match wins — skip the rest.

2. **User didn't specify** — try in order, stop at first match:
   a. `system_name=job_listing` (BD canonical)
   b. `form_name=job_fields` (canonical jobs form)
   c. `data_type=20` + `data_name` contains "Job" / "Jobs" / "Job Listing" (case-insensitive — catches sites that renamed `system_name`/`form_name` away from canonical but kept "Job" in the display label, which is the most stable across renames)

3. **EXCLUDE from any jobs resolution:**
   - `community_article` / `form_name=member_article_fields` — member-written, not job postings
   - `coupon`, `soundcloud_post`, `discussion`, `event`, `website_blog_article`, `property`, `product`, `photo_album`, `video`, `classified` — different content types

**`type_of_feature` is NOT a jobs marker.** Reserved for events (`1`), properties (`2`), digital products (`0`). Jobs are `type_of_feature=null`.

**Decision after resolution:**

| Match count | Action |
|---|---|
| Zero, interactive | Ask the user to name their job post type (recovery path). Then re-resolve via tier 1 (user-named). |
| Zero, autonomous | Skill cannot run. Surface clean audit message, exit. |
| One | Use it. Cache `data_id`, `data_name`, `system_name`, `form_name`, `feature_categories`. |
| Multiple, interactive | Ask the user. List all candidates by `data_id` + `data_name`. |
| Multiple, autonomous | If the user pre-specified a post-type id, use it. Else exit with clear audit message. |

The user's explicit post-type pick always wins.

**After resolution, call `getPostTypeCustomFields data_id=<resolved>`** (or `system_name=<resolved>`). Cache the response — it carries the live `post_category.choices` AND `post_job.choices` for this site (admin may have customized either). `getSingleImagePostFields` returns a stale fallback list for jobs — do NOT use it for `post_category` or `post_job` enums.

---

## Source candidates (runbook Step 5)

Per METHODOLOGY `Stage 3: Source research` (sub-step 2a). Discovery is faceted and list-producing — derive the facets, point a `WebSearch` at them to find list-pages, then `WebFetch` a list-page to harvest many job postings in one fetch.

**Facets to derive:**
- **Occupation/industry** — from the user's named occupations + audience/vertical from `getSiteInfo` + the resolved post type's `feature_categories` (cached).
- **Location** — three modes, pick the one matching the user's request:
  1. **User named a city/region** → use that verbatim ("Boston jobs," "jobs in Bangkok").
  2. **User implied geographic scope but no specific city** ("local jobs," "jobs in my country," "near me") → scope to `getSiteInfo.primary_country`; pick locally-relevant cities for the country (not only cities where you have members). Use `listCities` ONLY when the user explicitly asks for jobs in member cities ("where I have members," "cities we cover"); never find member cities by listing members.
  3. **User asked for a location-agnostic vertical** ("IT jobs," "remote copywriters," "freelance designers") → don't force a city facet at all; let the source returns drive it. The post's own geo fields are set from whatever the source listing says (specific city → fill `post_location`/`lat`/`lon`/`country_sn`/`state_sn`; remote → omit those fields entirely).
- Never bulk-list existing posts to infer geographic focus.

**Source-country routing.** When picking from the source buckets, default to the site's `primary_country` (cached Stage 1) — the AI should prefer that country's national job portals, associations, and chambers. If the user's request names a different country, route there instead. The bucket names are examples — adapt to the active country.

**Where to point the faceted `WebSearch`** — brainstorm real domain names, not "some sites":

- **ATS public job pages** — globally used: Greenhouse (`boards.greenhouse.io/<company>`), Lever (`jobs.lever.co/<company>`), Ashby (`jobs.ashbyhq.com/<company>`), Workable (`apply.workable.com/<company>`), Recruitee, SmartRecruiters, BambooHR, Personio, Teamtailor. One company URL = many listings, ToS-clean. Country-agnostic.
- **National + regional government job portals** — every country has them. US: USAJobs.gov + state `.gov/jobs`. UK: GOV.UK Find a Job. Canada: Job Bank. Australia: APSJobs.gov.au. EU: EURES. Singapore: MyCareersFuture. Thailand: ThaiJob.com (gov). Malaysia: JobsMalaysia.gov.my. India: NCS.gov.in. China: official municipal HR portals. For any other country, search `<country> national job portal site:.gov OR site:.<cc>`.
- **Professional / trade association career centers** — pick associations native to the site's country and vertical. Medical: AMA (US), BMA (UK), CMA (Canada), AMA (Australia), MMA (Malaysia). Engineering: ASCE/IEEE (US), ICE (UK), Engineers Australia, IEM (Malaysia). Finance: AICPA/CFA Institute (global). Legal: state/provincial/national bar associations. Each country has equivalents; search `<vertical> association careers <country>`.
- **Local chambers of commerce + workforce/employment boards** — every metro globally has a chamber-of-commerce-equivalent and a regional employment-services board with public local-employer listings (US: Workforce Development Boards; UK: Jobcentre Plus partner sites; EU: regional labour offices; Asia: regional manpower bureaus).
- **University public career boards + library job portals** — country-agnostic; every city's main library and university typically lists local employer postings on a public page.

**Explicitly avoid:** Indeed, LinkedIn, ZipRecruiter, Glassdoor, Monster, SEEK, 51job (anti-scrape ToS — global aggregators all have it).

Tailor by vertical AND country: pick the country-native association + the country's national job portal first, then ATS pages of companies operating in that country.

**30-day staleness gate.** During candidate harvest, capture each listing's source-page posted-date and reject candidates with posted-date >30 days old.

A single list-page `WebFetch` returns many jobs. Capture ~5 as the candidate pool, number them per METHODOLOGY `Candidate pool discipline (universal pattern)`, take #1, and drop-and-advance through the captured list on failure — no re-fetch.

---

## Dedup (runbook Step 6)

Per METHODOLOGY `Stage 2: Duplicate detection`. Jobs-specific match criteria:
- Title: semantic match (the role, e.g. "Senior Marketing Manager").
- Company: same company (`post_venue`) semantic match.
- Location: same city.

Date is NOT a dedup axis (jobs don't have a freshness-comparable date field).

---

## Geocoding (runbook Step 7)

Run on survivors only (candidates that passed runbook Step 6 dedup) — don't waste Nominatim calls on dupes.

Geocoding behavior for jobs is identical to events. Run the Nominatim ladder per `content-types/events.md` § Geocoding — transliteration, 4-tier `post_venue` known / 2-tier `post_venue` empty, normalization (`country_sn` uppercase, `state_sn` ISO-3166-2 2-letter code). Note: for jobs, `post_venue` = company name, so tier 1 (`q="<company>, <city>, <state-name>"`) only hits if Nominatim has the company's headquarters indexed; tiers 2-4 (street → city-only fallback) carry the load more often.

Pass `lat`, `lon`, `country_sn`, and `state_sn` (when applicable). Do NOT pass `auto_geocode=1`.

---

## Category routing (runbook Step 8)

Per METHODOLOGY `Stage 4: Category routing`. Jobs use the post type's `feature_categories` (cached from `Stage 1: Site context`). For `post_category` specifically, use the cached `getPostTypeCustomFields.post_category.choices` (from Step 3) — pass the `key` VERBATIM including any leading whitespace from the BD CSV-split quirk.

Authorization:
- Interactive grant ("yes, create new job categories") → skill respects for the run.
- User-specified default category in their request → every job in the run goes to that category.

---

## Content manufacture (runbook Step 11)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check.

**Voice:** reads like a naturally-written job posting page, not an SEO link container. Role context, company context, what the work actually is — the reader is deciding whether to apply, not parsing a directory listing.

**Jobs-specific load-bearing facts** (the reader needs these up front): role + employment type, company + city + state, top 3-5 responsibilities, required qualifications, how to apply. Surface these in the opening section.

**Bullets per ANTI-SLOP `Bullets rule`** — content that often qualifies for jobs: responsibilities, required qualifications, preferred qualifications, benefits, perks.

**How to apply** — application URL/email/phone surfaced as plain links inside a `How to apply` section. Button styling is NOT in the runbook — if the user wants a styled Apply button they specify it in their `prompts/jobs.md` system prompt.

**Jobs-specific Pexels search topics:** occupation + setting (`"office desk professional"`, `"warehouse worker operations"`, `"nurse hospital ward"`, `"construction site engineer"`, `"teacher classroom"`). Pass to the corpus `Rule: Image URLs` workflow as the `<topic>` slot. NEVER use Pexels for what looks like a company logo — feature image is generic occupation/setting; if the company has an official logo and you can source it from their website verifiably, that's acceptable, but never fabricate.

**Internal links:** weave into body prose per **URL-PATTERNS Link shape priority** — distributed, NOT clustered at the end. Budget **4-8 internal links per job post**, distributed:

| Section | Recommended links |
|---|---|
| Opening paragraph (role + load-bearing facts) | 1 (category or location filter) |
| Body sections (company/responsibilities/qualifications) | 2-5 links, **maximum 1 per major body section** — never two links in the same paragraph, never three links clustered in the final two sections |
| CTA close | 1 (always — the "see more jobs" closer to `/jobs?<filter>`) |

Jobs get category, location (`lat`+`lng`+`location_value`+`location_type=locality`) filter dimensions. No date filter for jobs.

---

## BD Jobs field reference (runbook Step 12)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, kept as insurance; BD doesn't strictly require it but harmless to pass) |
| `data_type` | `20` (single-image classification, always for jobs) |
| `data_id` | resolved jobs post-type id from runbook Step 3 |
| `post_title` | **Graceful-degradation ladder, ~54 char cap.** Use a colon `:` as the primary separator (BD's slugifier handles colons cleanly — em dashes produce ugly `%E2%80%94` URL encoding). Never two colons in a single title — if the role name itself contains a colon, switch to "at"/"in" prose. Title+Company+City → Title+Company → Title+City → Title (+ employment type as fallback parenthetical). Adjust to fit the cap: drop city first, then company, then fall back to title-only. Examples: `"Marketing Manager: Acme Corp in Austin"` (full), `"Marketing Manager: Acme Corp"` (no city fits), `"Marketing Manager in Austin"` (no company source), `"Marketing Manager (Full-Time)"` (title-only fallback). Plain text, no HTML. |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_category, post_meta_title length, post_meta_description length). Universal tags rule in **METHODOLOGY `Tags`**. Jobs-specific fields and examples below:

| Field | Jobs-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — load-bearing facts up front (role + employment type + company + location), responsibilities + qualifications bullets, `How to apply` close. |
| `post_venue` | **Company name** (per BD helpText). Verbatim from source. Examples: `"Acme Corp"`, `"Austin Independent School District"`, `"Texas General Land Office"`. |
| `post_start_date` | Role start date in source if listed, else **today's date**. Format `YYYYMMDDHHmmss` (14 digits, time defaults to `000000` if start-of-day not specified in source). Example: `"20260901000000"`. |
| `post_promo` | Salary or hourly rate as shown in the source — numeric only, no currency symbol, no commas, decimals optional. Hourly source → `14.50`; annual source → `70000.00`. Do not convert between hourly and annual. On a salary range, use midpoint of low+high. **Send `post_promo` (BD back-fills `post_price`); sending `post_price` alone leaves `post_promo` null.** OMIT on "commensurate" / "DOE" / "competitive" / missing — never fabricate. |
| `post_job` | **Always pass a value; never OMIT.** Map source text case-insensitive against cached `post_job.choices` (Step 3). Pick the closest semantic match ("full time/FT" → live full-time choice; "intern" → internship; "contract/contractor" → contract-equivalent; etc.). On ambiguous or absent source, default to the live choice meaning "Full-Time". |
| `post_category` | Pull from cached `getPostTypeCustomFields.post_category.choices` (Step 3). NOT from `getSingleImagePostFields` (returns stale fallback for jobs). Pass the `key` VERBATIM including any leading whitespace from the BD CSV-split quirk. |
| `post_location` | Full street address only — do NOT prepend the company name (already in `post_venue`). Example: `"500 W 2nd St, Austin, TX 78701"`, NOT `"Acme Corp, 500 W 2nd St, Austin, TX 78701"`. Many remote/hybrid postings have no street; OMIT then. |
| `lat` | Latitude float (from Nominatim, skip if geocoding failed). |
| `lon` | Longitude float (from Nominatim, skip if geocoding failed). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Senior Marketing Manager Full-Time Position at Acme Corp in Downtown Austin, Texas"` — occupation + employment type + company + city expanded from the shorter `post_title`. |
| `post_meta_description` | Descriptive prose: role + key responsibility + location + employment type, one sentence (e.g. "Acme Corp is hiring a Senior Marketing Manager in Austin, TX to lead B2B SaaS brand strategy. Full-time, hybrid."). Apply URL/email/phone stays in the body's `How to apply` section, NOT in the meta description — Google strips URLs from SERP snippets and meta descriptions should read as natural prose. |

### Do NOT pass

- `post_expire_date` — BD job theme doesn't read it for auto-hide. Stale-listing discipline lives at the 30-day source-side gate.
- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

`createSingleImagePost` accepts `post_meta_title` and `post_meta_description`; the wrapper passes them through.
