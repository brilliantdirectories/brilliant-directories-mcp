===== FILE: SKILL.md =====

# BD Content Skill: Multi-type content creation for Brilliant Directories sites

## What this skill does

Create content posts on a Brilliant Directories (BD) site. Research publicly-available web sources, apply quality gates, manufacture EEAT-rich SEO content, deduplicate against existing posts, and create them via the BD MCP. Works for events, jobs, blog articles.

## Required reading (in this order)

1. `shared/METHODOLOGY.md` — universal protocol.
2. `shared/ANTI-SLOP.md` — writing voice and pattern bans. Mandatory before generating any prose.
3. `shared/URL-PATTERNS.md` — internal URL construction for the user's site.

Then read the content-type-specific file from `content-types/` based on what the user wants (see the `Content-type routing` section).

## Content-type routing

Read the user's request and route to the correct content-type protocol:

| User wants to create | Route to |
|---|---|
| Event posts (concerts, conferences, workshops, fairs, open houses, meetups, auctions, any time-bound happening) | `content-types/events.md` |
| Blog articles (how-to, listicle, pillar guide, news, comparison — any evergreen long-form article) | `content-types/blog.md` |
| Job listings (job postings, open positions, hiring, careers — any "we're hiring for this role" listing) | `content-types/jobs.md` |

Request maps to no row → end the run with the Stage 7 receipt; `shortfall_reason` names the unsupported content type.

## Top-to-bottom run protocol

The universal protocol in `shared/METHODOLOGY.md` sets the framework; the content-type file in `content-types/` lays out the end-to-end runbook for that type.

The user can invoke this skill with as little as a one-sentence goal ("create posts on my site"). The skill should:

1. Resolve the content type from the request.
2. Run the content-type runbook end-to-end without prompting.

**Hard gate, every post type:** image dedup per METHODOLOGY **Rule: Image dedup** MUST execute its `list*` call before any `create*Post` write. Never claim-without-executing.

## Required preconditions

Before running, verify the MCP connection by calling `mcp__brilliant-directories__getSiteInfo` — a returned site means it works. The content-type file then verifies any per-type post-type requirements during its discovery step.

If `getSiteInfo` errors or returns no site, retry once; still failing → end the run with the tool's error as the shortfall reason.

## What this skill does NOT do

- Editing existing posts (only creates new ones)
- Calling paid third-party services
- Bypassing source ToS, robots.txt, paywalls, or auth walls
- Any action outside the target post type (no member writes, no site config changes, no theme edits)

===== FILE: shared/METHODOLOGY.md =====

# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. The content-type file (`content-types/<type>.md`, routed to by `SKILL.md`) layers in type-specific details.

## Autonomy

Runs are autonomous: no user can reply mid-run — never ask; a question ends the run as a failure. Decide per this skill with safer-side defaults and proceed to the receipt.

**A wrong fact is worse than a missing fact — a rule that weighs facts, never length. When a fact is in doubt, skip it and move to the next — doubt about a detail never ends the run. A doubtful candidate is settled by its gates and verdicts, never by leaving it uncounted — every qualifying result probes.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation — for vertical alignment. **Turn 1 starts exactly here: fire these 6 calls as the run's opening batched round, before anything else.** The 4 site-context calls (`getSiteInfo`, `listTopCategories`, `listPostTypes`, `listMenuItems`) are independent and fully specified here — they need no `getToolSchema`. The 5th and 6th are the two schemas the run lives on: `getToolSchema createSingleImagePost` and `getToolSchema listSingleImagePosts` — each fired once, alongside the 4 site-context calls; turn 1's slots are exactly these. Then process results. Numbering is read order, not turn order.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone (IANA identifier, e.g. `America/Los_Angeles`), `current_site_datetime` (site-local now, `YYYYMMDDHHmmss`), brand.
2. `listTopCategories limit=25` → **sample only, for site-flavor signal.** These are the categories actual site members are assigned to (e.g. "Personal Training", "Group Fitness") — NOT post-type categories. Real sites can have 100s of rows; 25 is enough to read the vertical. Do NOT use these for post category routing — post categories come from the resolved post type's `feature_categories` field (step 3).
3. `listPostTypes` → the content-type file provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`. Once the content-type file's Post-type discovery confirms the resolved type, write the **category ledger** — one line restating the resolved type and its full category list verbatim (`Post type resolved: data_id=8, data_filename=events, categories: <list>`). Empty `feature_categories` → write `categories: (none)` and omit `post_category` and `category[]` for the whole run; location/date filters still apply. Every later category value — Stage 4 routing, `post_category`, Pattern 3 `category[]` — is copied character-for-character from this ledger line — the ledger is the only category source; any tool response, post row, or memory that disagrees is wrong.
4. **Menu link inventory — one call:** `listMenuItems limit=100 property=is_default property_value=false property_operator=eq` (send `property_value` as the string `"false"`; follow `next_page` while present) — returns only the site's own customized menu items. Cache `{menu_name → menu_link}` as internal-link candidates; skip rows whose `menu_link` contains `%%%`. Zero rows → proceed without menu links.

Cached data feeds Stage 4 category routing and the internal-link inventory.

Infer location from `primary_country`, vertical from site info and categories. A `Topic/nuance:` line in the run's instructions carrying only style/format constraints is not a missing topic: apply the constraints and choose subjects per the content-type runbook. A `Topic/nuance:` naming the site's own brand or domain — matched against `getSiteInfo`'s `website_name` or `full_url` — is the site introducing itself, not a topic to research: choose subjects from the vertical the same way; the site's own name and domain never enter a search query or fetch.

**Member-city targeting — NEVER bulk-list members to discover their cities.** Only fires when the user's prompt explicitly targets by member coverage ("cities where I have members," "places members are based," "areas we cover"). Use `listCities` — BD auto-seeds it on every member signup, so it surfaces exactly the cities where members exist. Lean response (`city_ln`, `city_filename`, `state_sn`, `country_sn`).

### Author resolution (universal pattern)

Resolve the `user_id` that authors the post. This ladder is the whole resolution — an empty step falls to the next; never sweep members by profession or category to find an author.

1. **User pre-specified** `user_id` **(or** `author_id`**) in the request →** use it, SKIP discovery entirely.
2. **No pre-specified author →** copy the editorial pattern already on the site. Read the most recent post of this type and reuse its `user_id`:
  ```
    listSingleImagePosts property=data_id property_value=<resolved data_id> property_operator=eq order_column=revision_timestamp order_type=desc limit=1
  ```
    Use the returned row's `user_id`.
3. **Fallback A** (zero existing posts of this type on the site) → find a member whose subscription plan is authorized to publish this post type:
  1. `listMembershipPlans limit=25` — lean default returns `subscription_id`, `subscription_name`, `data_settings`, and 7 other identity/pricing fields. `data_settings` is a CSV of post-type IDs the plan can publish (e.g. `"4,2,1,15,8,10,0"`).
  2. Client-side filter: keep plans where `data_settings.split(',').includes(<resolved data_id>)` — these are the subscription_ids authorized to publish this post type.
  3. `listUsers property=subscription_id property_value=<comma_separated_matched_ids> property_operator=in order_column=user_id order_type=asc limit=1` — returns the lowest-user_id eligible author (oldest member with permission). Server-side filter + sort; lean response.
4. **Fallback B** (zero matched plans OR zero eligible users) → use `user_id=0`.



### Post-type disambiguation (universal pattern)

Multiple candidates from post-type discovery resolve in order — never exit over ambiguity:

1. The run's instructions pre-specify a post-type id → use it.
2. The run's wording names a flavor (e.g. "open house events", "internship listings") → single confident `data_name` match wins.
3. The site's editorial pattern — one batched call: `listSingleImagePosts property=data_id property_value=<candidate id CSV> property_operator=in order_column=revision_timestamp order_type=desc limit=1`. The newest returned row's `data_id` wins; cache the row — Author resolution step 2 reuses it. No rows → step 4.
4. No candidate has any posts → the lowest `data_id` (the site's oldest such type).



### Candidate pool discipline (universal pattern)

When the run holds one or more candidates — brainstormed or harvested (topics, events, jobs) — they ARE the pool, together: every candidate the round exposed enters the same printed list, each line `N.` + its title and dedup keys (the content-type file names them); a lone find still prints as `1.` — and it runs every pool stage, Stage 2 dedup included. Emit the full numbered 1-N pool as a visible list before researching any single candidate in depth. A WebSearch or WebFetch aimed at a specific find's domain, venue, or pages — pooled or not — or chosen because of it, is research on that find, not discovery; it waits for the find's `no match - survives` verdict. The pool prints and its calls fire in one message: Stage 2 dedup for every entry — the content-type file names the dedup keys. After the verdicts, take the top survivor; on failure drop it and take the next surviving un-tried — its verification fetches ride the very next message, all together. Do NOT regenerate until all are tried. If all fail, generate pool 2 — distinctly different from pool 1, no variations; a new pool re-enters at the pool print: it prints and fires Stage 2's calls in that same message. If pool 2 also fully fails, exit with the Stage 7 receipt (`shortfall_reason` says why).

**Failure** = dedup hit, source-research can't substantiate, required-field gate misses, or any other condition that blocks the candidate from progressing to post creation.

Pool size — harvested pools: every qualifying candidate the round's results expose (WebSearch results and opened list-pages), up to 10. Brainstormed pools (generated topics): the runbook's stated `N`. Both in the order found.

## Stage 2: Duplicate detection

Run all pool candidates together, in ONE turn — the same turn the pool prints. A candidate at any later point without its verdict line → run Stage 2 now for every verdict-less candidate, before their next call. A dupe drops for the cost of one dedup round, not a wasted research cycle. Never bulk-list a site's existing posts.

With the pool printed per `Candidate pool discipline (universal pattern)`, one compound query (**Rule: Compound filters**) covers the titles; the content-type file adds any further retrieval keys as their own separate calls, batched in this same turn. `property_value` is exactly TWO elements — never one, never one per candidate — element 1: ALL candidates' variants (each 1-3 words — trim full names to their distinctive core) comma-joined into ONE string — 3 × N values, one string; element 2: the data_id alone:

```
listSingleImagePosts property=["post_title","data_id"] property_operator=["contains","eq"] property_value=["Campbell River,River Marathon,Campbell Marathon,Studio Three,Reformer Week,Pilates Reformer","<data_id>"] limit=50 fields_only="<the content-type file's Dedup fields_only list>"
```

Two candidates, three variants each — a one-candidate pool runs its three alone; a ten-candidate pool, the same call with thirty variants in element 1. A compound that errors re-fires once, corrected, still covering every candidate — never re-fired per candidate.

Substitute the `list*` tool matching the post-type family. Compare returned rows client-side against the content-type file's match criteria; the message after the dedup calls opens with one verdict line per candidate — the matched post_ids `- dropped`, or `no match - survives` — each verdict citing the keys probed (the content-type file names them).

**Distinctive phrase = a 1-3 word combo that fingerprints THIS candidate.** Skip throwaway leaders — articles (`The`), years (`2026`), ordinals (`5th`, `Annual`, `Inaugural`): `"The 5th Annual Austin Tech Summit"` → `Austin Tech,Tech Summit,Austin Summit`. A generic single word (`Trainer`) floods the result set; a distinctive combo keeps it lean. Variant shapes — sponsor-stripped form, series or venue fragment; shorter substrings match more retitlings. Variants are free; a retitled dupe only matches a variant.

The content-type file specifies match criteria (semantic title overlap, date tolerance if applicable, location if applicable).

**On match → drop candidate per** `Candidate pool discipline (universal pattern)`**.** Don't repaint with a tweaked title or "refined angle" — same core topic = same candidate. Drop it. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.

Always SKIP existing records — never update or delete any existing post.

## Stage 3: Source research

**2a.** Brainstorm 5-10 candidate source types for vertical+location per the content-type file — vocabulary for judging what returns, never for composing queries; query shapes come only from the discovery ladder and the content-type file's commanded searches.

**2b.** One batched round per **Rule: Search discipline** — the discovery ladder's single turn of five queries. Read every result — reading triggers the pool print, not new queries; a `site:` query (with `-pdf`) may target only a domain that appeared in an earlier round's results. Drop dead/empty/archive pages.

**2c.** Survivors only — the verdicts' own message carries these calls: `WebFetch` the top survivor for each remaining post in the goal — every survivor's page fetch and any second-source search share ONE message, packed to at least five per `Rule: Search discipline`; a follow-up message carries only fetches of URLs the first surfaced, the `URL liveness gate`'s one confirm search when a fetch blocked, and the commanded re-probe when a date, venue, or city changed — nothing else until verification completes — and packed the same, at least five while the classes supply them. 2c's score: how many of verification's calls share the one message — every extra turn spends tokens and time. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:


| Gate               | Rule                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date sanity        | Primary date must be present AND > today AND < today+window. Window defaults to 90 days unless the user specifies otherwise (via `--window=<N>` or in their request). Absent/past/year-only/quarter-only fails — drop the candidate, never synthesize a date to pass this gate.                                                                                  |
| SPA / empty        | <500 chars of meaningful text OR script-shell page → skip.                                                                                                                                                                                                                                                                                                       |
| Required fields    | The content-type file specifies. Missing any → skip. No synthesis.                                                                                                                                                                                                                                                                                               |
| Confidence         | Self-rate 1-10. Score = how unambiguous and source-grounded the required fields are. <8 skip, ≥8 use.                                                                                                                                                                                                                                                    |
| Source credibility | Gov/association/university/established trade or broader-vertical publication = high (1 source OK). High only if its URL resolves to the claimed organization; same-owner outlets = one source. SEO farms, lead-gen sites, practitioner blogs, authoritative-sounding names without a verifiable charter = fail. Random blog/aggregator = low (needs 2-source confirmation). This gate judges returned pages — nothing in it becomes a query term or `site:` target; query shapes come only from the discovery ladder and the content-type file's commanded searches. |
| URL liveness       | Every external URL the post links to must be verified before publish per `URL liveness gate`.                                                                                                                                                                                                                                                                             |


**2d.** Cross-reference: 2 sources confirm → merge details, boost confidence.

**2e.** Stop at ~10-20 verified records or no new candidates.

### URL liveness gate

Every external URL the post will link to — each exact path, a verified domain never clears its other paths — must be verified live before publish (internal URLs verify per their Pattern's own gate). Three outcomes by `WebFetch` response:

- **HTTP 200 with real body content** → use. (200 with "page not found" / "error" body text is a soft-404 — treat as dead.)
- **404 / DNS fail** → drop the link, or skip the record entirely if it's the primary action URL.
- **403 / 401 / 429 / timeout / WAF block** → **UNKNOWN, not verified.** A CDN is blocking the bot UA, not proof the page is dead. Never ship on the rationalization that it's "probably live." Confirm the exact URL string in the results of at most ONE search — riding its message's pack per **Rule: Search discipline**; still unverified → drop.

**Third-party-sourced URLs** (aggregator, secondary listing) always require independent verification — never trust the third party's link as-is. Apply the `URL liveness gate` three-outcome decision tree.

## Stage 4: Category routing

Fuzzy-match source category vs the **category ledger** list. ≥70% confidence → carry the LEDGER value forward, never the source's wording. <70% → SKIP the record (do NOT create categories).

The content-type file may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that is THE definitive source for its subject — external sources exist to support this page's claims, never the other way around; the page never mentions or evaluates another page. Real internal-linking, structured info, honest source-grounded facts. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different.

### Required outcomes (any structure achieves these)

A good post covers the full picture: core facts, practical considerations, useful context, deeper insights on the location/category/focus where the source or confident knowledge supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (expanded when source data + confident knowledge support more, tighter only when both are genuinely exhausted).

1. **Load-bearing facts up front.** The first intro paragraph answers the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it") across its sentences, never packed into one — and the body never opens with the post title restated. The content-type file names the load-bearing facts for the data type.
2. **Every record fact source-supported — by a source about THIS record.** A similarly-named different event, role, or record is a different subject, never a source. No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because you skipped multi-angle context, comparison, useful perspective, or related information the source supports is a failure; short is fine only when source and confident knowledge are both genuinely exhausted.
3. **External source citations: 2 per ~500 words, cap 4 total (a ~500-word listing carries 2-3; a ~1,000-word-plus post 4)** (fewer only when credible sources are genuinely exhausted; for article-type posts one per source — same-owner pages = one source; a listing's externals may all be the record's own pages, each backing different record facts — the page itself never a sentence's subject or a section's topic; per the Source credibility gate), never before an internal link per `Link order`. Source in order, stopping at target: (a) this run's Stage 3 verified set — zero calls, the default path; (b) one batched round per **Rule: Search discipline**: broad topic query (3-6 plain words, no operators) + a `<topic> guidelines`-or-`standards` companion, judged by the Source credibility gate, then one `site:` probe on a surfaced domain — it rides the citations' fetch pack; (c) practice/profession topic → its encyclopedia article's institutional references; (d) ship with fewer — legitimate only once (b)'s round has fired. Budget: 3 WebSearch + 2 WebFetch per post. Cite static destinations only — a specific article, abstract, or the organization's own page, never a search-results/query URL (`?term=`, `?q=`, `search?`, tag/archive indexes). A citation wraps a noun the finished draft already contains, in a sentence about the subject — never the post's first sentence, never a sentence about the source, never a sentence added to carry it — with `rel="noopener" target="_blank"`; no forced "Source: X" footer. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
4. **Internal links riding the draft's own nouns** — use URL-PATTERNS.md Pattern 1 (specific post URLs) or Pattern 3 (the post-type page carrying at least one filter — category, location, date, or combos). **Write the entire body first, with zero links and zero link intent. Then a linking pass: its targets are the run's verified internal targets — live posts this run's dedup/list calls already returned (**`post_status=1`**) and Pattern 3/6 URLs constructed from the post's own category, location, and — for events — date values — then wrap noun phrases the finished draft already contains — never in the post's first sentence — (the city, the role, the venue, a concept another post or a category's listing page covers — never a category's own label, and taxonomy words ("category", "section") never enter the prose) onto targets from that list — at most one link per sentence, at most two per paragraph, distributed evenly across the post's full length and across the Pattern types the draft's nouns support — never clustered, never one Pattern carrying the page — hitting — never exceeding — the internal-link budget: **a floor of one internal link per ~200 words, plateauing at 8 (a ~500-word post carries 2-3; a 1,200-word post carries 6; a 1,600-word-or-longer post carries 8)**. The linking pass may not add, reshape, or reorder a single sentence. The wrapped targets' gate checks (member-count, taxonomy, and title-filtered post lookups) share ONE message — exactly ten checks: wrapped links first, spare slots filled with the draft's other linkable nouns; fewer only when nouns run out. This is the run's only gate message: a cleared check keeps its link; a failed or unchecked one re-targets to a cleared spare, a run-verified post URL, a Pattern 3 URL in any filter shape, or Pattern 5, dropping only when none fits.** A link with no natural carrier is re-targeted to a noun the draft does have; a slot goes unfilled whenever its section has no qualifying draft noun — **a sentence, bullet, or clause that exists for a link is a worse failure than the unfilled slot; the budget never outranks the prose.** Anchor text reads as part of its sentence, never a standalone CTA, never a trailing "More X in Y" section. Never fabricate URLs; a reference with no verifiable target omits that link.
5. **External links to sources, ticket/registration vendors, organizers' own pages** — with `rel="noopener" target="_blank"`.
6. **Work through every depth dimension that fits the post type** — their material is the subject and its real world, never the site's own posts or pages, and a dimension's label never enters the prose or its headings — dimensions are lenses, not sections; headings rise from THIS record's own material — a fit section's heading names its participants, never the label; they separate a republished record from a destination page. Each one that source data + confident knowledge honestly support goes in — skipping a supported dimension is the failure; omit only one that would require guessing. The depth score: how many developed sections rise from the record's material — the fuller post wins; thinness is the risk, never length.
  - **What to expect** — sensory + situational detail that sets the scene up front.
  - **Who this is for / who it's not for** — skill level, audience fit, accessibility, life stage.
  - **Practical considerations** — first-time/day-of detail rarely on the source page: prerequisites, logistics, exclusions, hidden costs, timing — pitfalls as if/then fixes ("If X happens, do Y").
  - **Historical / community context** — provenance, longevity, lineage, reputation.
  - **Local context** — neighborhood character, nearby landmarks and amenities, parking, transit/access. Skip when the post type has no place anchor.
  - **The organizer and venue's story** — who runs it, their history, what they're known for; confident knowledge counts ("open since 1937 and known citywide").
  - **Industry insight / players** — real peers and category leaders from the wider market, named with their facts.
  - **Standout fact** — a verifiable fact that sets the role or event apart in its real market ("the city's only weekday-morning session"). Never puffery, never praise of the post or its source.
  - **The program / agenda** — the published run of show: day-by-day or hour-by-hour flow, itinerary, speakers or session lineup, as the source states it; a start time alone is logistics, a flow is a section.



### Froala HTML safety

Follow **Rule: Post-body formatting** and **Rule: No scaffolding tags**. Skip `<h1>` — reserved for the post title field. **Always open** `post_content` **with** `<p>` **intro paragraph(s); never start with** `<h2>` **or any heading.** `post_content` is public-facing only — never include HTML comments, source notes, machine-readable metadata, or skill-run identifiers.

### Link policy (strict)

Classify every `<a>` tag by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.


| Type     | Format                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target)                   |
| External | `<a href="https://..." title="<descriptive>" rel="noopener" target="_blank">text</a>` |


Full `title=` requirement + composition examples in URL-PATTERNS.

### Link order (universal — internal first, external later)

1. **An external link never appears before an internal one** (any internal Pattern per URL-PATTERNS.md).
2. **Once an internal link has appeared**, external citations mix in among the continuing internal links — internals continue per the internal-link budget, externals sprinkled through later sections, never two in the same or consecutive sentences, never clustered in one footer block. Internal and external links together cap 12 — the internal floor holds; externals fill the remainder.
3. **Unique href per post.** No URL repeats — the CTA's URL counts. If two anchors would target the same URL, re-derive one under a different Pattern (1-6); drop only if no Pattern variant fits.

### Image strategy

Use Pexels for all images. After both axis batches yield no commit, omit `post_image`. Omitting is the last resort.

Every run works the axes fresh in the table-defined order, batch by batch until a commit — stock-photo inventories change daily.

**If** `poolImages` **is not in your tool list, ignore this paragraph and run Steps 1-3.** With the tool, `poolImages` replaces Steps 1-3: call it once per batch — `axis_terms` = the batch's five axis phrases (batch 1 = axes 1-5, batch 2 = axes 6-10 from the **Axes** table), `shape="landscape"`. In a runbook step that batches calls, `poolImages` is born to fire alongside the other tools' calls — it rides that step's batch message. It returns a numbered shortlist `{n, title, desc, url}`, already orientation-filtered and site-deduped. Pick the `n` whose title and desc best fit and put that `url` in the post's create call per **Rule: Image URLs** with `auto_image_import=1`. The image is then settled — do NOT re-check it: no `getImageDimensions` and no `listSingleImagePosts` dedup on a `poolImages` url. No title fits, or an empty result → call `poolImages` again with the next axis batch; both spent → omit `post_image`.

**Pexels** — follow **Rule: Image URLs** exactly. Always send to BD with `auto_image_import=1`.

   **Axes — 10 in order. Batch 1 = WebSearch each of axes 1-5 (five searches, one turn); batch 2 = axes 6-10 if batch 1 yields no commit. Each search returns that axis's raw results.**

   Each search phrase must carry a topical anchor — a vertical-specific word that ties the photo to the topic.


| Axis                                 | Why                                                             | Cafe blog: "choosing an espresso machine"             | Web design blog: "button color trends"             |
| ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| 1. Subject + state (default)         | The thing in its defining state                                 | `barista pouring` / `barista pouring coffee`          | `colorful buttons` / `modern ui buttons`           |
| 2. People + adjacent action          | Same audience, related verb                                     | `barista cleaning` / `barista weighing beans`         | `designer sketching` / `designer choosing colors`  |
| 3. Detail / object close-up          | A topical **prop or equipment** shot, no people                 | `portafilter shot` / `espresso shot pour`             | `button mockup` / `colorful interface element`     |
| 4. Setting + topical marker          | Topical location, named                                         | `coffee shop` / `coffee shop bar`                     | `design studio` / `ui designer desk`               |
| 5. Adjacent activity / item          | Related thing, different action                                 | `latte art` / `coffee bean grinder`                   | `color swatch` / `figma wireframe sketch`          |
| 6. Result / outcome                  | The finished artifact, static, no process                       | `latte cup` / `finished espresso drink`               | `finished website` / `launched landing page`       |
| 7. Process step / intermediate stage | A pre- or transitional workflow moment, not the headline action | `coffee beans roasting` / `tamping grounds`           | `wireframe sketches` / `mood board layout`         |
| 8. Materials / raw inputs            | Ingredients or textures before they become the subject          | `coffee beans` / `roasted coffee`                     | `color palette` / `font samples`                   |
| 9. Customer / recipient POV          | The consumer side, not the practitioner                         | `customer drinking coffee` / `person ordering coffee` | `user browsing phone` / `person reading website`   |
| 10. Hands / body-part isolation      | Symbolic close-up, hands as stand-in, no faces                  | `hands holding cup` / `hands pouring coffee`          | `hands typing keyboard` / `hands sketching design` |


   **Comparison-shape posts ("X vs Y"):** Axes 3-10 must cover BOTH halves of the comparison, not just the primary subject. For "espresso vs pour-over" the prop axis needs items from both methods; for "React vs Vue" the setting axis needs developers using both stacks.

   **One search per axis.** Each axis gets exactly one search phrase — do not retry an axis with reworded phrasing (that drift, "let me try axis 2 with one more phrase," is the most common axis-discipline failure).

   **Batched-axes loop.** A batch runs Step 1 through Step 3 in order: fire its five Step 1 searches in ONE turn as parallel calls, then run Steps 2 and 3 once over all five searches' combined results, every result from all five, not one per search. Batch empty of a commit → next batch. Both batches exhausted → omit.

   **Step 1 — Search construction.** `WebSearch query="site:pexels.com/photo <axis phrase>"` per axis, using each axis's phrase from the **Axes** table. NOT `site:pexels.com/search` (403 on agent runtime). NOT `wide`/`landscape`/`horizontal` (Pexels indexes those as title/tag terms, not orientation). **2-3 words. Every word must carry topic information** — no filler ("the", "a"), no redundant adjectives, no contradictions. 2 words when the noun is already specific (`"pilates reformer"` — "reformer" disambiguates); 3 words when the noun is ambiguous (`"pasta plate restaurant"` — bare "pasta plate" returns dishware). 1 word is banned (pure noise pool).

- Cross-vertical examples: ✓ `"fitness race competition"` (3, events/sport), ✓ `"professional conference audience"` (3, events/corporate), ✓ `"pilates reformer"` (2, blog/fitness — already specific), ✗ `"beautiful red pasta"` ("beautiful" is filler), ✗ `"plate"` (banned).
- **Cross-axis duplicate guard.** Keep each `/photo/<id>/` once — a duplicate another axis already surfaced collapses to a single entry.

   **Step 2 — Dimension-check the whole pool.** Take every `/photo/<slug>-<id>/` result from all searches, build each canonical URL `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`, and pass them ALL into ONE `getImageDimensions urls=<URL1,URL2,...,URLN>` call (up to 50). Omit only clearly off-topic results (wrong vertical — karate for a judo post); every plausibly on-topic result goes in. Read each row of that one response:

- **status=success +** `message.orientation === "landscape"` → landscape survivor, carry to dedup.
- **status=success + portrait OR square** → drop.
- **status=error** (404, timeout, parse fail, "unsupported image format") → drop.
- **Zero landscape survivors → next batch.**

   **Step 3 — Dedup (one batched call via** `in` **CSV).** Take every Step 2 landscape survivor as one list and run **Rule: Image dedup** — one `list`* call (matching the write tool) with `property=original_image_url`, `property_value=<URL1,URL2,...,URLN>` (up to 50), `property_operator=in`. Response rows include `original_image_url` and `post_title`. From that one response, read the survivors in entry order and commit the first that clears both checks:

- **URL in the response** → that survivor is a URL-dupe; skip it.
- `post_title` **semantic-matches the survivor's topic** → skip it (per `Candidate pool discipline (universal pattern)`).
- **Neither hit** → commit this URL as `post_image`.
- **Every survivor drops → next batch.**
**Both Image strategy batches ran and nothing committed → omit** `post_image`**.**

**Multiple inline body images** (`post_content`, `group_desc`). Long-form posts (blogs especially) often weave 2-5 inline body images alongside the feature image. Each inline image goes through the `Image strategy` sourcing workflow. **Dedup scope:** **Rule: Image dedup** applies to the feature image only. Inline body URLs require intra-post uniqueness — no URL repeats within the post, no body URL equals the feature URL. Inline body images are NOT checked against other posts site-wide.

### Voice

Every word goes through `ANTI-SLOP.md`. Mandatory before posting.

### Self-check before posting

Scan the assembled body AND the create-call field values. Fix anything that fires:

- Any en/em-dash outside code? Rewrite.
- Throat-clearing opener? Cut.
- Unsourced record fact presented as fact? Hyperlink it to its source or rewrite — naming the source in prose is not sourcing, and a source-naming sentence still rewrites after the link.
- Internal link with `rel="nofollow"` or `target="_blank"`? Strip those attributes.
- External link not carrying exactly `rel="noopener" target="_blank"`? Fix it.
- Citation on a search/query URL? Replace with the static source page, or drop.
- Anchor under 2 or over 4 words? Resize to the sentence's own 2-4 word noun phrase; move the description to `title` as a descriptive noun phrase, never an instruction ("Browse...").
- Same href twice? Re-derive one under a different Pattern, or cite a different source's static page for an external; drop only if none fits.
- `post_category` and every Pattern 3 `category[]` value copied character-for-character from the **category ledger** (written at `Stage 1: Site context` step 3)? Re-read that ledger line — do not trust memory. A value not on it filters nothing — fix to the matching ledger category or drop the param.
- Section present without source data or confident knowledge to support it? Remove. Source-supported material with no section carrying it? Add the section.
- Any fabricated detail? Remove.
- Does the body open with `<p>` intro paragraph(s)? It must — never start with `<h2>` or any heading.
- Are H2 headings marking topic shifts, not fact transitions? Each H2 introduces meaningfully different content. Vary section length naturally — some sections one paragraph, some several, some with a bulleted list. Do NOT trim source-supported depth just to keep sections compact.
- Are all headings (H2 and H3) in **title case**, not sentence case? `"Where to Fly a Kite"`, not `"Where to fly a kite"`.
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is public-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.
- Any sentence or heading about search value, SEO, or why the post links where it does — or existing only to carry a link? Cut — the page never explains its own strategy.
- Pexels image picked (Steps 1-3 path only): does the search-result title name the post's primary subject AND match its defining context (activity vs generic scene, urban vs trail, indoor vs outdoor, season, beginner vs elite, etc.)? Generic title or wrong-context match = re-pick or WebFetch verify.



## Universal post fields

Field rules that apply across ALL post types via `createSingleImagePost` (and `createMultiImagePost`). Content-type files reference these universally and add only type-specific examples or additions.


| Field                   | Rule                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_image`            | Feature image URL per Stage 5 image strategy. Pass `auto_image_import=1` for external images. Pexels via `Rule: Image URLs`, or omit.                                                                                                                               |
| `post_category`         | The Stage 4-matched **category ledger** value, copied character-for-character. The ledger is the only category source — any tool response or post row that disagrees is wrong.                                                                                      |
| `post_meta_title`       | SEO `<title>` tag, ~80-120 chars. Expand on `post_title` with long-tail keyword modifiers — audience qualifier, geographic context, use case, related terms — that didn't fit the title's tight cap. The content-type file gives type-specific examples.            |
| `post_meta_description` | SEO meta description, ~150-160 chars. One-sentence value proposition. Not a verbatim repeat of `post_title`. The content-type file adds type-specific flavor (events: include date + city; blogs: value proposition for the decision at hand).                      |
| `post_meta_keywords`    | Pass the same exact CSV value as `post_tags`.                                                                                                                                                                                                                       |
| `post_live_date`        | Required on every create: the current site-local datetime, `YYYYMMDDHHmmss` (14 digits). Source priority: the `Current UTC datetime:` line in your prompt converted to `getSiteInfo.timezone`; else `getSiteInfo.current_site_datetime` as-is (already site-local). |




## Tags

Universal `post_tags` field constraints — applies to ALL post types (single-image and multi-image alike):

- **Format:** comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`).
- **Hard 100-char total cap on the CSV.** BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.
- **Strategy:** aim for ~6 tags per post — roughly 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short, don't join words with hyphens. The content-type file may refine tag emphasis for the type (e.g. blogs may favor topical keywords over location).
- **Tags live ONLY in the post's** `post_tags` **field.** Do NOT call `listTags`, `createTag`, or any Tags-resource tool — those manage a separate global tag taxonomy unrelated to per-post `post_tags`.
- **Also pass the same CSV to** `post_meta_keywords`**.**



## Stage 6: Post creation

Call per-type `create*` tool with assembled fields. Assemble against the per-type field reference: every field this run already resolved ships — copy values (e.g. `lat`/`lon`, `post_location`, `post_venue`) verbatim from the run's earlier tool results, never from memory. Pace BD writes ~600ms apart. On a 5xx failure — or a success response without a `post_id` greater than zero — one exact-title `listSingleImagePosts eq` probe — row present → the post was created and its row's `post_id` stands as the create response's for Stage 7; row absent → retry the create once. Any other failure: continue to the next record. Never retry blindly.

## Stage 7: Closing reply + JSON receipt (the final message, always, in this order)

After the last create's response, the run is not finished until you emit this — never stop on the create tool call. The receipt fires only when no candidate still owes a create — a due create's message is never the receipt's. A run that created posts but sends no receipt still owes one.

**Part 1 — the human reply, plain Markdown.** `-` bullets, links as `[text](url)`, zero HTML tags. One parent bullet per post in the receipt's `posts` array — the title linked to its live URL — with one child bullet per detail: post type, post_id, author (name + user_id), publish status (published live / saved as draft), the full live URL written out, the `<admin_edit_url>` linked as "View in Admin". No bullet presents any other post. A count under the goal states the shortfall reason plainly in the reply. Never narrate the process or your own output mechanics ("Emitting the receipt", "Here is the JSON").

**Part 2 — the receipt**, a raw JSON object directly after the reply:

- The receipt starts at `{` and ends at `}` — no markdown fences, no prefix labels, nothing after the closing brace.
- Return complete, valid JSON — never partial or truncated. Pretty-print at every nesting level: 2-space indent, one field per line — including each object inside `posts`, never compacted onto one line.
- ONLY these fields, in this order — never add extra fields: `post_create`, `post_create_goal`, `post_create_count`, `posts`, `shortfall_reason`.
- `post_create`: `1` (this run's task was creating posts). `post_create_goal`: the requested post count — from the run's instructions, never lowered to match the outcome. `post_create_count`: posts with a `post_id` greater than zero returned by a `create*` response this run — nothing else counts.
- `posts`: one object per counted create response — `post_id` copied from it; not counted, no entry — `{"post_id": N, "post_type_id": <data_id>, "post_data_type": <data_type>, "post_type_name": "<post type name>", "post_title": "...", "post_url": "<full live URL>", "post_author_id": N}`. Empty array when none.
- `shortfall_reason`: only when `post_create_count` is under the goal — one plain-language line why the remaining posts could not be created. Omit the field otherwise.

`<admin_edit_url>` **verbatim shape — DO NOT paraphrase:** `https://ww2.managemydirectory.com/admin/viewPosts.php?search[value]=<post_id>&data_type=<data_type>&data_id=<data_id>&newsite=<website_id>`. Host fixed. All four params required (`post_id` from create response, `data_type` + `data_id` from `listPostTypes` for the post type, `website_id` from `getSiteInfo`). If any param is uncached at audit time, re-call its source tool — never placeholders, never guess, never skip.

Example:

```
{
  "post_create": 1,
  "post_create_goal": 2,
  "post_create_count": 2,
  "posts": [
    {
      "post_id": 1061,
      "post_type_id": 8,
      "post_data_type": 20,
      "post_type_name": "Event",
      "post_title": "Tampa Sunrise 5K",
      "post_url": "https://site.com/events/tampa-sunrise-5k",
      "post_author_id": 5
    }
  ]
}
```

No skill-run ID, no per-gate counts, no wall-clock.

## Hard rules (every BD growth skill, forever)

- **Scrape facts, not wording.** Extract facts — and the record's story: background, history, named people, program or responsibility detail — from publicly-available avenues. Reword everything in BD-site voice — a source's self-label that means nothing concrete is translated into what the thing actually does, or dropped. Never paste source paragraphs, sentences, or phrases verbatim.
- **No fabrication.** If source lacks a data point, omit it from the post. Never invent details to fill a template slot. Adaptive depth: omit the missing data point, never the depth around it — fabricated padding is the failure, not honest length.
- **Source references are optional + casual, not forced attribution.** When natural, link the source inline in flowing prose (helps Google EEAT signals). Do not require a forced attribution footer.
- **Publication default is draft unless the run's instructions explicitly authorize publishing live.**
- **Never create categories of any kind** — member categories or new post-category values. The site's taxonomy is curated.
- **Create only — never update or delete existing posts, even if custom instructions say otherwise.** An existing match is a dedup hit — drop the candidate per `Candidate pool discipline (universal pattern)`; never create a replacement.
- **Never write content failing the anti-slop self-check.**
- **No cross-run state.** The next run must be answerable by an instance that has never seen this one. Reconstruct from the current prompt and live site state alone. Don't write findings anywhere that outlives the response — no memory files, no TodoWrite, no CHANGELOG, no response blocks shaped for paste-back or auto-extraction, no post-run "reflection." Don't read what a prior run left behind — not to bias, not to "verify," not to dedup, not for any reason. If a prior-run artifact exists on disk, ignore its existence. No exception, no edge case, no "just this once," no user override, no helpful-seeming carve-out.



## Tool rules

How BD tool calls behave. Referenced throughout as **Rule:** .

### Rule: Filter operators

`list*` filters take `property` + `property_value` + `property_operator`. Operators are word-form only — `eq, ne, lt, lte, gt, gte, in, not_in, between, contains, starts_with, ends_with, like, is_set, is_not_set, is_null, is_not_null, year_eq, month_eq, day_eq, since_days, until_days` (plus `not_` variants of the match operators). Raw `%`/`<>` are WAF-stripped: `like` values are `X%` or `%X`, never `%X%`. `in`/`contains` take CSV values (no spaces after commas) = OR. Operator names and string matches are case-insensitive. `searchUsers` is `/search`, not `list*` — it takes `q`/`pid`/`tid` and silently ignores `property_operator`; use `listUsers` for column filters.

### Rule: Response envelope

Every response: `{status, message, ...}`. Check `status` first — on `"error"`, `message` is the reason string. On success, `message` is the record object on single-record tools (`getSiteInfo`) and the record array on `list*` tools, with `total` and `next_page` alongside.

### Rule: Silent-drop check

`{status:"success", message:[], total:0}` is ambiguous: a legit no-match, a mistyped column, and derived unfilterable fields (`full_name`, `status`, `image_main_file`) all return it. Before trusting an empty dedup or count, verify the filtered column exists via the matching `get*Fields` tool.

### Rule: Compound filters

AND across fields: pass `property`, `property_value`, `property_operator` as equal-length arrays on one call — conditions pair positionally; unequal lengths are refused. Distinct from CSV (one field, comma value = OR).

### Rule: Filter by ID

Filter taxonomy by numeric ID (`profession_id`, `subscription_id`), never by name string.

### Rule: Image URLs

Imported image fields (`post_image`, `original_image_url`) take a bare URL — no `?query` (BD's filename generator breaks on it). `?w=700` belongs only on inline `<img>` src in body HTML.

### Rule: Image dedup

Site-wide image dedup covers stock URLs only (Pexels/Unsplash/Pixabay); source-site/CDN images skip it. Match the exact bare URL, never a `?w=` variant.

### Rule: Post-body formatting

Body structure: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, plus `<a>` links and floated `<img>`. Open with `<p>`; never `<h1>` (reserved for the title). Inline image classes: `fr-dib fr-fil img-rounded` (left) or `fr-dib fr-fir img-rounded` (right) + `style="width: 350px;"`; inline body images landscape only.

### Rule: No scaffolding tags

Never emit `<![CDATA[`, `<invoke`, `<function_calls>`, or entity-escaped HTML into any content field — they render as literal text.

### Rule: Pagination

Pass the returned `page` cursor verbatim — never construct one. `total` is a string; coerce before comparing.

### Rule: Search discipline

A search round fires its five queries in one turn; the pool-print turn carries its calls in one message; after the verdicts a turn carries its steps' specified calls and nothing else — the verification, citation, and liveness research those steps command still fires; improvised WebSearch or WebFetch does not. Web calls travel in packs — a message carrying WebSearch or WebFetch carries at least five: searches, fetches, or a mix, the step's commanded calls first, the spare slots preloaded with the step's own upcoming calls — the next survivor's page, a second source, the citation ladder's next rung — insurance preloaded now is cheaper than a turn spent later; fewer than five only when the step's classes run out — a query echoing a fetched page's content is never a class; a lone genuine call fires alone. The `Geocode ladder`'s tiers are exempt — they ride the pre-create step's ONE message beside its `poolImages` call and title check. A message mixes tools freely — BD calls, `poolImages`, and web calls together; spare slots fill with a later step's specified calls whose inputs are ready. A step that states its own call arithmetic — the pool-print turn's stated count, the create alone — fires exactly that arithmetic. A candidate has later-step calls only after its `no match - survives` verdict; never a pre-verdict WebSearch or WebFetch on — or because of — a find, pooled or not. A step specifying more than ten calls fires them all in its one turn — never split a step's calls. Steps with stated timing (Stage 2 dedup in the pool-print turn) fire at their stated time. Read EVERY result before any new query — qualifying sources routinely rank 5-8. `site:` follows only a full domain a result list surfaced — never a bare TLD or wildcard (`Image strategy` pexels queries and the content-type file's commanded search shapes exempt). Negatives strip a known noise class — `-pdf` on probes, one megaboard domain on jobs queries; more trip bot-blocks; a blocked or emptied negated query retries once without them, riding the next pack. A snippet already showing the dedup keys is a hit unopened — it pools and probes as-is; opening waits until it survives. A round that returns usable results — on-topic, in-market, showing the content-type's dedup keys — has succeeded; every one of them pools, few or many; select from the pool and proceed. Classify only a round that surfaced no usable candidate: error/challenge pages = tooling-blocked → one structurally different five-query retry, then stop labelled "blocked"; clean-but-empty = dry. Ending with less than the target is a successful outcome — report it via `shortfall_reason`. No survivor from a round → the next round uses new angles, never repeats of spent queries. A runbook step's lettered parts are ONE step, all their calls in that step's one message.

**Discovery ladder** (events, jobs, any current inventory): (1) one batched round — a single turn of five queries: the broad-faceted temporal (`<niche> <location> <window>`) + list-page vocabulary (`<location> <niche> calendar/board/listings`) shapes, filled out with extra variants for coverage → read every result — every entry showing the content-type's dedup keys pools NOW: print the pool and fire Stage 2 dedup in bulk in that same message — then proceed; (2) no survivor → another single turn of five new-angle queries, repeated; (3) a swept-dry market → stop with the diagnosed verdict.

### Edge guards

- Enum fields take only values present in live `choices`; `post_category` is NOT one of them — its only source is the **category ledger**.
- Stock images are Pexels-only — never wikimedia, picsum, placekitten.
- Source-page images (events/jobs) are allowed and skip dedup.
- Never carry scraped source text verbatim into `post_content` — reword everything.

===== FILE: shared/ANTI-SLOP.md =====

# ANTI-SLOP: Writing voice and pattern bans

Mandatory before generating any user-facing prose. Applies to post bodies, FAQ, meta descriptions, titles, anchor text, attribution.

## Voice target

- The page speaks as the thing it is, never as a report about its source — and the writer does not know the site or its pages exist.
- Article-type posts speak as an independent service journalist sharing something they just found, and the adjacent things it naturally connects to.
- Listing-type posts (a job, an event, any post that IS the thing) speak with the employer's or organizer's authority, stating the record's facts as settled knowledge — third person throughout, never first or second ("we", "our", "you", "your").
- Every voice: declarative and active. Every sentence's subject comes from a closed set — a person, an organization, a place, or the record and its concrete parts; nothing abstract ever holds the subject slot, under any verb — doing real things in literal verbs ("East Bank Club is looking for trainers who..."). Facts stated plainly, not hedged.
- Every sentence is load-bearing information about the subject and earns its place — no filler, no asides.
- Generous with specifics, no press-release tone. Name specific things. No re-explaining, no fact entering twice. Vary sentence length.
- Audience fit is described in third person, plainly evaluative in a friend's everyday words, the thing itself as subject ("perfect for anyone who..."), never by addressing the reader — fit names the thing's own participants, never readers or followers of content; a participant described by the content they follow ("attendees following wellness talks") is the follower form.
- The telling's natural nouns — the city, the role, a thing a category page lists, the venue, and any related thing it names while talking about the subject — are the only candidate anchors, linked in place with the sentence unchanged, never on a comparison, never as the host's inventory.

## Banned constructions (the construction itself, in every wording)

Every `Banned constructions` and `Banned patterns` entry kills the wording, never the thought — restate it in a legal shape; dropping it is its own failure.

- **Shell-noun subject (discourse deixis)** — an abstract noun summing the writing's own prior sentence ("that context") as subject. State the next fact instead.
- **Relational clause with abstract Carrier** — an abstraction suits/fits/works for/has/makes someone — any fit verb — or fit as the subject itself ("The best fit is..."). The record or a person carries the fit ("perfect for anyone who...").
- **Metaphoric locative predication** — a posture verb on anything but a physical place ("the race sits with", "the 5K sits alongside"), or any verb placing or positioning the record alongside or among other things ("which places it alongside other industry events"), or a simile filing it among a class ("openings like this one"). Places sit ("Park Center sits near the courts"); records and entries do not. State the relation literally.
- **Reportative evidentiality** — a document (the posting, the listing, the page, the source) as a sentence's subject in any role ("the posting shows", "the posting centers on"), or the record's org or the record itself as sayer of a speech verb ("the club says", "identifies itself as"). A document is never a subject; state the facts bare as settled knowledge.
- **Metadiscursive importance predication** — announcing relevance ("X matters") instead of stating the relevant fact, headings included ("Why It Matters...", "Why The Setting Works").
- **Unglossed jargon transfer** — a source's opaque self-label carried verbatim. Translate to what the thing does, or drop.
- **Metaphoric identification** — the record or its parts equated with an image ("a hub for tech", "an oasis in the city", "a haven for..."). The thing is what it literally is: name the building, the room, the program.
- **Taxonomic self-classification** — the record filing itself into a catalog ("fits the [X] category"). Category is metadata, never prose.
- **Scalar approximation** — placing the record on a degree scale between reference points ("more X than Y", "closer to X than Y"). Say what it is, not where it sits.
- **Cross-record resemblance** — asserting this record resembles or differs from others of its kind ("the same style shows up in...", "but this one stays focused on..."). Each record stands alone.
- **Offer / navigation** — any sentence, bullet, or clause whose function is offering or steering rather than asserting: a reader-goal adjunct, fronted or trailing ("For a wider look...", "for people who want...", "If X is the better match..."), plus a clause presenting a resource as available, or steering verbs (compare, browse, scan, open). Every sentence asserts a fact about the subject; the post never offers, never routes.
- **Link-carrier sentence** — a sentence, bullet, or clause that exists for the link it holds; remove the link and it loses its reason. Every sentence, bullet, and clause stands linkless.

## Banned patterns

| Pattern | Examples / fix |
|---|---|
| En-dash (`–`, U+2013) and em-dash (`—`, U+2014) | Use commas, periods, parens, or "to" for ranges. Banned everywhere. |
| Smart-punctuation drift | Curly single quotes (`'` `'`, U+2018/2019), curly double quotes (`"` `"`, U+201C/201D), ellipsis (`…`, U+2026), non-breaking space (U+00A0). Use straight `'`, straight `"`, three periods `...`, regular space. Auto-inserted by the model, near-perfect AI tell alongside em-dash. |
| Tricolon / forced triples | "X, Y, and Z" parallel stacks invented for rhythm ("welcoming, energizing, and unforgettable"). Use only when the content genuinely has three items. Never invent a third for cadence. |
| "Not just X, it's Y" amplifier | "It's not just a race, it's a community", "more than just a conference", "isn't merely a workshop" → state Y directly. Distinct from negative listing — this is the additive escalator. |
| Participial/gerund openers | "Standing in the lobby...", "Looking ahead...", "Bringing together...", "Drawing on decades of experience..." Max one `-ing` participial opener per section. "Looking ahead", "Bringing together", "Drawing on" banned outright. |
| Conclusion-recap reflex | "In short", "In summary", "Ultimately", "The takeaway", "The result is", "What this means", "All told", "At the end of the day" as section/post closers. Conclusions advance — name the next step, not a restatement. |
| Throat-clearing openers | "Here's the thing/what/why", "It turns out", "The truth is", "Let me be clear", "What you need to know" → cut, state the point |
| Binary contrasts / negative listing | "Not X. Y." / "isn't X, it's Y" / "Not a concert. Not a conference. It's Z." → just say Y |
| Dramatic fragmentation | "Two days. Two stages. That's it." → combine into a real sentence |
| Rhetorical setups | "What if I told you...", "Think about it:", "Here's what I mean:", Wh- sentence-starters in prose → restructure. **Exempt: FAQ question labels** ("When is...?", "Where does...?", "How much...?") — those are structural Q&A, not prose openers. |
| Passive voice | "was created", "is believed", "mistakes were made" → name the actor |
| Hedged facts | "looks built around", "seems to focus on", "appears to involve" on facts the source states → state it plainly ("Members book sessions by appointment") |
| Adverb crutches | really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, interestingly, importantly, crucially, ultimately → delete |
| Business jargon | navigate, unpack, lean into, deep dive, double down, circle back, take a step back, moving forward, at its core, at the end of the day, when it comes to, in today's landscape, game-changer, in one place → plain language |
| Vocabulary fingerprints | delve, showcase, leverage, harness, elevate, empower, unlock, foster, vibrant, bustling, stunning, breathtaking, nestled, rich tapestry, treasure trove, suits, suited, boasts, curated, discerning, seamless, oasis → replace with a concrete verb or adjective tied to the specific subject. Highest-signal single-word AI tells in 2026 detectors. |
| Scene-setting openers | "Picture this:", "Imagine", "It's a crisp morning in...", "The smell of [X] fills the air..." → state the article's subject directly. No visualization warm-up before the point. |
| Performative emphasis | "Let that sink in", "Make no mistake", "Full stop", "Period.", "And that's okay", "(Read: ...)", "(Think: ...)" → cut |
| Marketing compounds | "[X]-centric", "[X]-driven", "[X]-worthy", "[X]-leading", "[X]-forward", "[X]-ready", "[X]-facing" → plain descriptors |
| Timeline filler | "Since its inception", "From day one", "Over the years" → the exact year, or cut |
| Sentence-initial shell | A sentence opening with "That" or "That [abstract noun]" summing the prior sentence ("That mix gives...", "That makes...") → open with the fact itself |
| Non-restrictive relative clause | A fact riding a comma-appended clause (", which ...", ", who ...", ", where ...", ", whose ...") on another sentence ("The summit, which draws 3,000 attendees") → give the fact its own sentence ("The summit draws 3,000 attendees."). Restrictive clauses that define their noun ("trainers who hold NASM certification") stay. |
| Vague declaratives | "significant", "important", "matters", "the implications are", "the stakes are" without naming the specific thing → name it |
| Telling not showing | "this is incredibly difficult", "this is what leadership looks like" → demonstrate with specifics |
| Fabricated authority | "studies show", "experts agree", "research suggests", "PubMed-indexed studies" without citation → link a specific static source or rewrite as opinion |
| Closing maxim | a section or paragraph bowing out on a tidy wisdom sentence ("That keeps progress visible without turning the routine into a new project", "A week built that way is easier to repeat than one hard workout") → end on the concrete fact, number, or next step |
| Formulaic attribution | "[Page/posting/listing/schedule — any document, the record, or its org] says/notes/describes/shows/lists/frames/points to/covers..." as any sentence's or heading's actor, opener or mid-sentence, and "According to [Org]..." → state the fact in your own sentence — the source's name may ride as an anchor in a sentence about the subject, never as its subject or speaker; a claim that cannot be stated bare in plain words drops |
| Lazy extremes | every, always, never, everyone, nobody without specifics → use real numbers or "most"/"many"/"few" |
| Off-subject narration | Any sentence or section whose subject is the website, its pages, its link strategy or search performance ("stays fresh for local search", a "Why This Fits Local Search" H2), or its audience in the third person ("for readers who follow…"), or the record's genre or category in general as the sentence's subject, or that mentions the site or its furniture in any position ("on this site", "the site's", "the calendar fills with...") instead of the topic — the tell: the post's own voice could not have said it (the employer or organizer for listing-type posts; an outside writer sharing this find for articles) — a sentence or section about reading or interpreting the source document always fails → rewrite about the subject |

## Self-check before posting

Run every check below against the assembled body and every create-call field; a hit gets its fix applied in place, and the rewrite re-passes the sweep.

1. Any `–` (U+2013) or `—` (U+2014) outside code? Rewrite.
1a. Any curly quote (U+2018/2019/201C/201D), ellipsis (U+2026), or NBSP (U+00A0) outside code? Replace with straight ASCII.
2. Throat-clearing opener? Cut.
3. "Not X, it's Y" / negative listing / "not just X, it's Y" amplifier? State Y.
3a. Invented tricolon ("X, Y, and Z" with no real third item)? Drop the third or rewrite.
3b. `-ing` participial opener — more than one per section, or any of the banned three ("Looking ahead", "Bringing together", "Drawing on")? Restructure.
3c. Conclusion or section closer that recaps ("In short", "Ultimately", "The takeaway", etc.)? Replace with a next-step or a fresh specific.
4. Banned adverb / jargon / vocabulary fingerprint (delve/showcase/leverage/nestled/vibrant/bustling/tapestry/suits/suited/etc.)? Delete or replace with a concrete subject-specific word.
4a. Scene-setting opener ("Picture this", "Imagine", "It's a [adjective] [time]...")? Cut, state the subject directly.
5. Passive voice? Name the actor.
6. Subject outside the closed set (person, org, place, concrete thing of the record)? Rewrite so it is.
7. Vague declarative? Name the specific.
8. Stacked fragments? Combine.
9. Performative emphasis? Cut.
10. Three same-length sentences in a row? Vary one.
11. Unsourced authority claim? Cite or rewrite.
12. Lazy extreme? Add specifics.
13. Wh- sentence opener in prose? Restructure. (FAQ question labels exempt.)
14. Paragraph rhythm: 2-4 paragraphs between H2/H3 headings, 3-6 sentences each, varied — not metronomic. Back-to-back larger paragraphs encouraged when content supports it; asymmetrical sizing reads more human than uniform blocks.
15. **Bullets rule.** The content-type file's commanded lists always stand. Beyond them: bullets as default structure or to break up every section? Cut. Use a short bulleted/numbered list only when content is genuinely parallel and scannable (specs, steps, options, criteria) — one or two such lists per post, max. Prose is primary; bullets are a tool, not a layout.
16. Could the post's own voice have said this sentence (the employer/organizer for listings; an outside writer sharing a find for articles)? No → rewrite it about the subject — its link moves to a noun the rewrite keeps, or drops.
17. Any sentence instantiating a `Banned constructions` or `Banned patterns` entry, in any wording? Apply its arrow — restate legally, never drop.
18. Every depth dimension that source data or confident knowledge supports — grown into developed material? A mention is a seed, not coverage; skipping one is the failure.

## Scoring (rate 1-10; revise the lowest-scoring dimension — revised sentences re-pass the self-check — then ship if ≥40/50)

| Dimension | Question |
|---|---|
| Directness | Statements or announcements? |
| Rhythm | Varied sentence length, or metronomic? |
| Trust | No sentence restating another sentence — in the same terms or summed into an abstract noun? |
| Authenticity | Sounds human-typed? |
| Density | Padding cut, substance kept? A short shallow post fails this — depth from specifics, examples, and useful context is not padding. |

## Drift triggers (stop and rewrite)

Filler sentences carrying no fact while the source still holds unused facts. Three "and"s in one sentence. Any `Banned constructions` entry surfacing mid-draft.

## Wrong-example reference

The code block in this section contains the banned U+2014 character — included so you can recognize the pattern. Do NOT write text like this:

```
Tickets cost $20—$45 for the Saturday show — bring sunscreen.
```

Right:

```
Tickets cost $20 to $45 for the Saturday show. Bring sunscreen.
```

## Scope

Prose and sentence law, including how link-bearing sentences read. URL construction and targets: `URL-PATTERNS.md`. Research/gates/dedup/hard-rules: `METHODOLOGY.md`.

===== FILE: shared/URL-PATTERNS.md =====

# URL-PATTERNS: BD internal URL construction

Read before generating any internal link. Universal across post types.

**Never fabricate an internal URL.** If you can't verify the target exists, omit the link or section.

## Patterns

| # | Pattern | Format | Notes |
|---|---|---|---|
| 1 | Specific post | `/<post_filename>` | BD stores the data_filename prefix AS PART OF `post_filename` (e.g., `events/austin-tech-summit-2026`). Use verbatim with `/` prefix. Only link posts that are live — the resolved row's `post_status=1`; never drafts. |
| 2 | Post type main listing | `/<data_filename>` | From the cached `data_filename` on the resolved post type (already in agent memory from site context). Varies per site (`/events`, `/calendar`, etc.). |
| 3 | Filtered listing | `/<data_filename>?<filters>` | See the `Pattern 3 filter params` section. |
| 4 | Specific member profile | `/<user.filename>` | Resolve via `searchUsers` only — its results mirror the public member search, so the target is publicly findable. A member surfaced any other way passes only via the searchable-plan check: their plan on `listMembershipPlans` has `searchable=1` AND `search_membership_permissions` contains `visitor`. Never `/listing/<id>`. |
| 5 | Member directory landing — entire directory | `/<getSiteInfo.main_directory_url_relative>` | The directory landing page, cached from the run's `getSiteInfo` call. Lists every member, no location or category filter applied. **Takes NO query parameters** — appending `?category[]=...` or `?lat=...` does not work; Pattern 3's filter params apply to POST listings only, never to the member directory. For filtered member directory links, use Pattern 6. |
| 6 | Member directory — filtered by location and/or category | `/<slug-hierarchy>` | Slug-hierarchy URL that narrows the member directory by category and/or location (e.g. `/california/los-angeles/personal-trainer`). See the `Pattern 6 — Filtered member directory` section for the full construction recipe. |

WebPage-backed link patterns (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) are OUT OF SCOPE for content-creation skills — those require `listWebPages` discovery and belong to the future `/bd:seo` skill. Pattern 6 slug-hierarchy URLs are NOT in this category — BD's dynamic router resolves them natively, no WebPage lookup needed.

## Pattern 3 filter params (universal, every post type)

| Param | Format | Notes |
|---|---|---|
| `category[]` | `category[]=Category%20Name` | Value copied character-for-character from the category ledger — any other string filters nothing. One category per link. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` / `location_type` | `lat=46.7534&lng=-92.0681&location_value=Duluth%2C+MN&location_type=locality` | **Send all four together — `location_type` is required even though `lat`/`lng` do the search.** `lat`/`lng` drive the geo radius (implicit default from site settings). `location_value` is the human-readable label that BD writes into the sidebar search-form input. `location_type` toggles the sidebar form's mode (city vs ZIP) — omit it and BD's URL parser breaks, returning zero results. Always `location_type=locality` (city-level). `location_value` is the clean city string ("Duluth, MN"). |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. **`&` in `href` attributes of HTML-embedded URLs (e.g. inside `post_content`): escape as `&amp;`** per HTML5 spec. Browsers + Froala both accept raw `&` for non-entity sequences, but `?ref=foo&copy=yes` becomes `?ref=foo©=yes` because the parser interprets `&copy` as the copyright entity. The URL examples in this file show URL syntax (raw `&`); when wrapping any URL in `<a href="...">` for `post_content`, output `&amp;` instead.

## Pattern 6 — Filtered member directory (slug-hierarchy URLs)

**Use when:** the sentence's noun matches a specific category and/or location by meaning — the taxonomy label itself is not required — for the member directory (e.g. "running coach in NYC", "yoga instructors in Austin", "personal trainers in Brazil"). When no category or location qualifier fits, use Pattern 5.

**Do NOT call `createWebPage`.** BD's dynamic router resolves these URLs natively. No WebPage needs to exist for the URL to work.

### Slug hierarchy

`country/state/city/top-category/sub-category`

- **Strict order, block-contiguous.** Never reorder. No gaps inside the location chain (country→state→city) or the category pair (top→sub); the location block may meet the category block at any level.
- **A sub-sub filename (`master_id != 0`) takes the sub slot, replacing its parent sub** — never three category segments.
- **A city segment always follows its state** — city names collide across states.
- **No leading slash on the slug itself** (the full URL starts with `/`).
- **Slugs are case-sensitive lowercase**, exactly as returned by the list tools.
- **Prefer the most specific slug-hierarchy you can verify.** Country+state+city+top beats state+top beats top alone.

Valid combinations include (non-exhaustive):

- `top` alone
- `top/sub`
- `state/top`
- `state/top/sub`
- `state/city/top`
- `state/city/top/sub`
- `country/state/top`
- `country/state/city/top`
- `country/state/city/top/sub`
- `state` / `state/city` / `country` / `country/state` / `country/state/city` — location only

Invalid combinations:

- Skipped middle segment (e.g. `country/city/top` — state missing between country and city)
- Wrong order (e.g. `top/state/city`)

### Discovery lookups

Every slug segment MUST come from a live list-tool return. LIKE wildcards: `X%` or `%X` only, never `%X%` — BD's WAF strips one `%`.

**Categories — once per run, both levels:**

```
listTopCategories limit=100
listSubCategories limit=100
```

`total_pages: 1` → the full tree is cached; semantic-match the topic against it (a weightlifting topic matches "Strength Training" — keyword filters cannot make that match). Sites with one generic top (e.g. "Members") carry the real taxonomy at sub/sub-sub level (`master_id`). `total_pages > 1` → do NOT page; probe with `property=name property_value=<keyword> property_operator=contains limit=10` per distinct topic keyword (max 3). Slugs come from the returned `filename`; subs scope to a resolved top via `profession_id`.

**Member-count gate (every Pattern 6 URL):**

Category-only URLs (top alone, or top/sub):

```
searchUsers pid=<profession_id> (+ tid=<service_id>) limit=1
```

Location-bearing URLs (`searchUsers` cannot filter location):

```
listUsers property=[<location fields>(, profession_id)] limit=1
```

Location fields per `Rule: Compound filters`: city URLs filter `city` + `state_code`; state URLs `state_code`; country URLs `country_code`. Filter values come from the cached discovery rows: `city` = `city_ln`, `state_code` = `state_sn`, `country_code` = the row's `country_code`. Add `profession_id` when the URL has a category segment. This proves the top only — a location URL with a sub segment passes via the `URL liveness gate` instead (its fetch status is definitive: 200 = seeded, 404 = not). Link only when the count is `>= 1` — BD serves unseeded directory pages with a 404 status by design. Otherwise pick a different category or another Pattern (a Pattern 3 listing in any filter shape, a run-verified post URL, or Pattern 5). Cache verdicts per run. Gate rows verify counts only — never recycle a returned member row as a Pattern 4 link target.

**Country:**

```
listCountries property=country_name property_value=<country>% property_operator=like limit=5
```

Slug = lowercase country_name with hyphens (e.g. "United States" → `united-states`). No `filename` field exists on this resource.

**State:**

```
listStates property=state_sn property_value=<2-letter-code> property_operator=eq
```

Slug = `state_filename` from the return.

**City:**

```
listCities property=city_ln property_value=<city>% property_operator=like limit=10
```

Slug = `city_filename` from the return.

### Per-run caching

- Resolved `<country, state, city>` triples cache once per skill run. Reuse for every link to the same location.
- Resolved `<keyword → top/sub filename>` mappings cache once per skill run. Reuse for every link to the same category.
- Never re-lookup the same value twice in one run.

### Anti-fabrication (mandatory)

- Every slug segment MUST come from a list-tool return.
- Never invent slugs.
- If ANY segment lookup returns zero matches, fall back to Pattern 5 (the bare directory landing) — at most once per post per METHODOLOGY `Link order` — or omit the link.
- A Pattern 5 link is always safer than a fabricated `/austin/running-coach` URL that 404s.

### Examples

- `/united-states/new-york/new-york/running-coach` — country + state + city + top
- `/california/los-angeles/yoga-instructor` — state + city + top (country omitted)
- `/running-coach/marathon-training` — top + sub (location-agnostic)
- `/personal-trainer` — bare top-cat fallback when location lookups fail or aren't applicable
- `/brazil/personal-trainer` — country + top (state/city omitted when the post's location is country-level only)

### When to use Pattern 6 vs Pattern 5

- **Use Pattern 6** when the post body names BOTH a specific category AND a verifiable location, OR a specific category alone with a verifiable top/sub slug, OR a verifiable location alone.
- **Use Pattern 5** when no verifiable category or location fits the sentence. The anchor is still a draft noun naming the people themselves ("local personal trainers"), never site furniture ("our directory," "browse trainers") and never a description of the page.
- **When in doubt, Pattern 5 is the safer default.**

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="noopener" target="_blank">text</a>` |

**`title` attribute required on every `<a>` in post body content** (`post_content`, `group_desc`). Short descriptive phrase (~50-80 chars) of what the link points to — not a duplicate of the anchor text, never an instruction ("Browse...", "Check..."). Example: anchor "personal trainers in Boston" → `title="Boston trainer listings filtered by category and specialty"`. Helps screen readers, hover previews, and SEO.

**Anchor text: 2-4 word noun phrase that reads as part of the sentence — internal and external alike.** The longer description belongs in `title`, never in the anchor. Never the target's full title, never generic ("here", "this page"), never site furniture or page-type nouns ("member directory", "full jobs board", "the events calendar") — in the anchor or anywhere in its sentence. The anchor is a noun phrase the draft already contains, as its sentence wrote it — `title` names the destination; the anchor never does. External anchors carry the source's name ("the IATBP member portal", not "member portal").

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?category[]=Live%20Music
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality
/events?daterange=06%2F15%2F2026+-+06%2F15%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
```

## Don't

- Hardcode `/events` (read `data_filename` live).
- Use `+` for spaces in `category[]`.
- Trailing slashes (BD doesn't use them).
- Double-encode `post_filename` (already URL-safe).
- Mix protocols (use `getSiteInfo.full_url` protocol).
- Invent geo params. Only `lat`+`lng`+`location_value`+`location_type` (sent together — `location_type` required) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip` as raw query params are NOT supported — BD ignores them and the URL filters nothing. Anchor text says the city when the URL filters by location. A draft noun without the city rides a URL filtered another way instead — any shape `Pattern 3 filter params` supports. `location_value` is display-facing (`lat`/`lng` drive the filter) — give it the clean city string ("Los Angeles, CA"), never a street address, never a ZIP. Do not say "in [State]" or "in [Country]" — state/country are not supported filter modes.
- Build links to WebPage-backed URLs that require `listWebPages` discovery (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) — those are `/bd:seo` territory. **Pattern 6 slug-hierarchy URLs are NOT in this category** — they're constructed from live list-tool lookups, no `listWebPages` call needed.
- Bulk-list existing posts to "see what's available" for internal linking — the ban is on new lookups; live post rows already in context from this run's dedup/list calls are fair Pattern 1 targets. Pattern 3 URLs are constructed from the current post's own category + location values — no lookup needed.

## Internal-link variety

In the linking pass, vary the shape of filtered-listing links across posts so posts don't all point at the same pages. Per post, mix several of: (a) category-only, (b) location-only, (c) category+location combined, (d) direct post links (Pattern 1) riding nouns the draft already wrote, to run-verified rows in hand. Up to 6 filtered-listing links per post within the overall internal-link budget in METHODOLOGY `Required outcomes` — distributed, never clustered at the end. LLM-judged per post; no fixed rotation. Filtered-listing links use Pattern 3 (post listings) or Pattern 6 (member directory) per their respective construction rules. Link order rule (internal first, external later) lives in METHODOLOGY `Link order` subsection.

## Link shape priority (universal)

Resolve each internal link to the most specific verifiable target the draft's own nouns support, top-down — drop a tier only when the one above has no target:

1. **Category + location combo.** Example for events: same category + same city. Example for jobs: same role + same city. Example for blogs: a Pattern 6 link to the member directory filtered to the member category the topic serves + the post's city (an article mentioning personal trainers in Los Angeles → `/california/los-angeles/personal-trainer`).
2. **Single-filter category-only** OR **single-filter location-only.** Use when only one dimension is naturally relevant in the sentence. A specific related post (Pattern 1) counts at this tier when a draft noun names its specific subject; a draft noun inside a category's subject matter ("water workout" rides its category's listing page) or a city noun goes to that listing page — the anchor keeps the draft's own wording; the taxonomy label lives only in the URL, never planted into prose.
3. **Location + daterange** (events only). Combine with category for the tightest anchor.
4. **Date-range alone** (events only). Rides a time mention the draft already has ("the July 19 race day"). Skip for non-time-bound post types.

Combine across posts — every post doesn't need a combo link. Mix (1) and (2) shapes across a multi-post run so the run's posts don't all target the same pages.

===== FILE: content-types/blog.md =====

# Blog content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create blog post(s). Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a goal like "write blog articles for SEO," "write a viral piece for my industry," or "write an article about XYZ." Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Make only the tool calls the runbook steps specify and fill each message's pack per Rule: Search discipline — insurance fill is not an extra; improvised calls outside the steps and the fill rule are.** On per-post failure, continue to the next post.

1. **Autonomy.** Per METHODOLOGY `Autonomy`: never ask; decide and proceed.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Build and print the numbered topic pool — the first message after Step 4 resolves.** Run the `Topic resolution` section. Pool size `N=5`, each line `N. Topic - v1 | v2 | v3` — its three title variants, each 1-3 words. The pool prints and its dedup call fires in this same message.
6. **Apply pool discipline.** Apply METHODOLOGY's `Candidate pool discipline (universal pattern)`.
7. **Duplicate detection.** Step 5's call already fired — compare its returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's blog-specific match criteria.
8. **Source research per topic.** Run METHODOLOGY `Stage 3: Source research`. Run the `Source research` section. Land 3-5 source-supported angles BEFORE drafting — the verdicts' own message carries the search round; then ONE fetch message carrying the round's best pages; that fetch message's pack is the research's whole fetch budget. A later fetch message fires only as the citation ladder's next rung when the `Source credibility gate` leaves the post under-cited.
9. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for blog-specific authorization.
10. **Image selection — FEATURE image only.** Run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy`; on the `poolImages` path the call rides the pre-create batch (Step 13). Steps 1-3 image path: follow that sequencing end-to-end. Inline body images: see the `Inline body images` section.
11. **Image dedup (FEATURE — Steps 1-3 path; `poolImages` settled the image).** Per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step.
12. **Content manufacture.** Proceed straight from runbook Step 11 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density).
13. **Pre-create batch — the message right after the draft stands. This turn's only job: ONE message — the linking pass's gate checks, the `poolImages` call when the tool list carries it, and the final-title check, born to fire together; fewer only when the gate message's nouns run out — a member left to a later message is an incomplete batch. No other calls ride this turn.** The gate checks: per METHODOLOGY `Stage 5: Content manufacture (universal)`'s linking pass — wrapped links first, spare slots filled with the draft's other linkable nouns. The `poolImages` call: per `Image strategy` — on the `poolImages` path the image is settled: no `getImageDimensions`, no image dedup. The title check: compose the final `post_title` once, to the `BD Blog field reference` title spec, and confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call, never word-order variants; run it exactly once — the checked title is the created title, verbatim.
14. **Create the post** — fires ALONE in its own turn, after Steps 7-13 are complete for the candidate; nothing batches with a create. Via `createSingleImagePost` per METHODOLOGY `Stage 6: Post creation`, with the field set in the `BD Blog field reference` section. Compose the create against the schema turn 1 fetched — the run's one `getToolSchema` per tool.
15. **Audit summary.** Run METHODOLOGY `Stage 7: Closing reply + JSON receipt`.

---

## Post-type discovery (runbook Step 3)

Resolve by user intent first, then canonical markers, then semantic match.

1. **User named a post type explicitly** (e.g., "post to my 'Tips for Homeowners' section"). Match the user's phrase against `data_name`, `system_name`, `form_name` on `listPostTypes`. Single confident match wins — skip steps 2-3.

2. **User didn't specify** — try in order, stop at first match. Server-side filter via `listPostTypes` — do NOT `getPostType` per-candidate:
   a. `system_name=website_blog_article` (BD canonical)
   b. `form_name=blog_article_fields` (canonical blog form)
   c. `data_type=20` + semantic match on `data_name`/`system_name` against article terms in any language (blog, news, journal, insights, resources, articulo, noticia, nachrichten, artikel, etc.)

3. **EXCLUDE from any blog resolution:**
   - `community_article` / `form_name=member_article_fields` — member-written, NOT site-owner blog
   - `coupon`, `soundcloud_post`, `discussion`, `event`, `job_listing` — different content types

**`type_of_feature` is NOT a blog marker.** Reserved for events (`1`), properties (`2`), digital products (`0`). Blogs are `type_of_feature=null`.

**Decision after resolution:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run — exit with the Stage 7 receipt; `shortfall_reason` says no blog-capable post type exists. |
| One | Use it. Cache `data_id`, `data_name`, `system_name`, `form_name`, `feature_categories` — and write the **category ledger** line from this row, per `Stage 1: Site context` step 3. |
| Multiple | Resolve per METHODOLOGY `Post-type disambiguation (universal pattern)` — never exit over ambiguity. |

User's explicit post-type pick always wins.

---

## Topic resolution (runbook Step 5)

### Shape A — User-specified topic

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. The topic is a pool of one — Step 5 prints it as `1.` with its variants and fires its census per the `Dedup` section. Run source research for that exact topic.

### Shape B — Vertical-derived (no topic provided)

User said "write articles for SEO traffic," "organic search," "viral content," "industry news," "related to a topic," "trending content," or similar — anything that means "you pick the topic." Brainstorm `N` distinctly different topic candidates cached from **Site context discovery**. Unless the user directs otherwise, prefer topics that fit the site's niche and intersect with its categories; balance long-tail evergreen SEO value with deeper niche perspectives and high-search-intent topical authority.

**Within-pool diversity — span distinct subjects.** Each candidate must occupy its own sub-theme of the vertical. If two or more share a sub-theme, anchor noun, focus, or subject, regenerate with broader spread before taking #1.

**If user signaled viral/trending intent**, also pull a five-query `WebSearch` round for trending discussions/news in the vertical (last 30-60 days).

**Topic bar (Shape B).** Frame each candidate for a non-expert outside the niche while keeping specific qualifiers (audience segment, geographic context, use case, life stage). Compounded specificity, not one. **Specific ≠ jargon** — the qualifier should be a real audience or scenario anyone outside the niche can picture (marathon runner, ACL recovery, desk worker), not insider terminology or acronym strings (mid-cycle loading, conjugate periodization, eccentric utilization ratio, NASM vs ACE vs NSCA). Pivot examples: "TPO vs EPDM Roof Membranes" → "The Best Roofing Materials for Residential Homeowners in Cold Climates". "IRC §179 vs §168(k) Deductions" → "Which 2026 Tax Deductions Save Sole Proprietors the Most?"

**Topic depth (Shape B) — go specific, not safe.** Default LLM move is the broadest possible framing ("How Much Protein to Build Muscle"). That competes against millions of existing articles and ranks for nothing. Go two or three specificity layers deeper on each candidate:

**Bad Broad versus Good Specific — across title shapes** (each row a different shape AND a different vertical — read the broad→specific transformation and the variety of framings, not the topic). Vary the framing across your `N` candidates; do not open all of them with "How"/"What"/"Why".

| Title shape | What it does | Too broad (Bad LLM default) | Good (specific, in that shape) |
|---|---|---|---|
| Imperative | Command, verb-first, promises an outcome | Dog Training Basics | Stop a Rescue Dog From Pulling on Walks in Its First Two Weeks Home |
| How-to | Explicit instruction | Roof Repair Tips | How to Tell If a Hail-Damaged Roof Needs Full Replacement or a Patch |
| Question | Poses the searched question | Choosing a Lawyer | Do You Need a Lawyer to File for Custody in a No-Fault State? |
| Listicle / number | Counted set | Saving for Retirement | 5 Retirement Accounts a Freelancer Should Open Before Age 40 |
| Declarative / statement | Asserts a claim or truth | Electric Cars | Heat Pumps Are Quietly Replacing the Gas Furnace in Cold Climates |
| Noun-phrase / definitional | Names the subject, no verb | Wedding Photography Ideas | The Real Cost of a Second Shooter for a Full-Day Wedding |
| Comparison / vs | Pits two options against each other | Types of Mattresses | Memory Foam vs Latex for Side Sleepers With Back Pain |
| Guide / explainer | "The complete/beginner's" framing | Houseplant Care | A Beginner's Guide to Keeping Fiddle-Leaf Figs Alive Through Winter |

Specificity layers: audience segment + scenario + format. The qualifiers ARE the specificity — broad-appeal framing AND specific qualifiers are not opposites. Each narrows the long-tail query. Broad topics still ship occasionally — but the default is specific.

**Pick qualifiers that match real search intent** — what people actually search, not a narrowing that sounds clever to a strategist.

**Never bulk-list existing posts to "understand coverage" before picking a topic.** The pool's compound query in the `Dedup` section catches real overlaps; pre-scanning the feed adds nothing and burns reads on sites with hundreds of posts. Pick topics from vertical/category signals (Shape B), then let dedup do its job at the dedup stage.

---

## Source research (runbook Step 8)

Per METHODOLOGY `Stage 3: Source research`, with one adjustment: the **Date sanity gate does NOT apply** to blog source research. Blogs are evergreen; sources can be from any date.

**Blog-specific source candidate buckets:**

- Industry trade publications, professional association sites
- Established expert blogs / personal sites in the vertical
- Mainstream press and vertical-relevant culture/lifestyle magazines
- Government / academic research, public health/data agencies, university extension publications
- Peer-reviewed studies / official journal sites (for science/medical/legal topics)
- Reputable podcast transcripts, interview shows, popular vertical Substacks
- Real practitioner interviews / case studies on public-facing pages

---

## Dedup (runbook Step 7)

Per METHODOLOGY `Stage 2: Duplicate detection`. Blog-specific match criteria:
- Title: semantic match (not string-exact).
- Topic angle: semantic overlap on the core thesis/angle, not just shared keywords.
- Date: NOT a dedup factor (blogs are evergreen).

Retrieval is ONE call, fired in the pool-print message: `listSingleImagePosts property=["post_title","data_id"] property_operator=["contains","eq"] property_value=["<ONE string: every topic's variants joined as a single CSV>","<the resolved blog data_id>"] limit=50 fields_only="post_id,post_title,post_status,post_filename"` — the pool lines' variants merge into element 1 as one comma-joined string (`Personal Trainer,Trainer Cost,Home Workout,Home Gym,Protein Timing,Recovery Meal,...` — 3 × N variants, each 1-3 words); each variant is a substring a matching title would contain — the topic's core noun phrase as titles write it, never an invented compound (`Personal Trainer Match`); the arrays stay two-and-two; N topics = 1 call; a second dedup call on the same pool is an incomplete first message. The compound query's score: how many variants ride element 1 — 3 × N is full marks; a trimmed variant saves a token and ships a dupe. `total` above the returned row count → re-run once, element 1 carrying each topic's single most distinctive variant — the narrower net surfaces the rows the first cast left unseen.

---

## Category routing (runbook Step 9)

Per METHODOLOGY `Stage 4: Category routing`. Blogs route via the **category ledger** (written at `Stage 1: Site context` step 3).

User-specified default category in the request → every post in the run goes to that category (must match an existing `feature_categories` value; else route per Stage 4).

---

## Content manufacture (runbook Step 12)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML per **Rule: Post-body formatting**, link policy, image strategy, voice via ANTI-SLOP, self-check. Blog posts additionally follow the per-format and per-section rules in this section.

**Voice:** this page IS the article. State the topic's facts as settled knowledge; a source document is never a sentence's subject or sayer ("the page says", "it also says", "the guidance is just as direct") — the fact holds the sentence and the citation rides a wrapped noun inside it ("per the [ACR guidance]", "in a [PMC trial]", or the fact's own noun linked bare). A named outside authority may hold a speech verb only when the sentence states its full finding ("Mayo Clinic recommends stretch breaks every 30 to 45 minutes") — never its page as proxy, never two attributed sentences in a row; most facts stay bare.

### Post format → target length

Pick one format per post; let topic shape decide. Apply the section + length guidance for that format:

| Format | Total words | When |
|---|---|---|
| How-to | 1500-2500 | Step-by-step instruction on accomplishing X |
| Listicle | 1200-2000 | "N ways to X," "Top N Y," "N best Z" |
| Pillar / comprehensive guide | 2500-4000 | Definitive long-form coverage of a topic |
| News / announcement | 600-1200 | Event/launch/update coverage |
| Comparison / vs | 1500-2500 | "X vs Y," "When to choose X over Y" |

### Body structure (universal across formats)

1. **Direct-answer opening.** Two intro `<p>`s, 6-8 sentences split unevenly between them (never an even split): the first `<p>` answers what the headline promises in fresh words — its first ~100 words making clear what the article covers and why it matters — never re-typing the title as the first sentence; the second widens with the article's context and stakes. No throat-clearing ("Here's the thing"), no preamble — in either.
2. **At-a-glance block** — when the topic's facts tabulate (targets, doses, tiers, steps): directly after the intro, one `<ul>` of plain key-value facts ("Weekly target: 150 minutes moderate"), each under ~10 words — no heading, no label: the bare `<ul>` sits between the intro and the first `<h2>`. A topic without tabulating facts skips the block.
3. **Mix statement-shaped and question-shaped H2s** — shapes to riff on, never strings to reuse: "The Real Cost of X", "Choosing Y in 2026" beside "How does Y work?" — a heading opening with What, How, Why, When, or Should is question-shaped, question mark or not; question-shaped H2s stay at or under half. Questions capture long-tail queries and AI-Overview citations.
4. **Answer-first paragraph per H2.** Every H2 opens with a 40-60 word direct answer to what its heading promises. Then expand with detail, examples, lists.
5. **Paragraph cap: 40-80 words typical, 150 hard max.** Long walls of text fail mobile readability and AI-Overview extraction.
6. **Sentence cap: ~15-20 words typical.** Tighter sentences read cleaner.
7. **List shape.** Numbered for sequence (how-to steps), bulleted for parallel items (listicle entries, comparison criteria).
8. **FAQ block before conclusion.** H2 named in the topic's own words — never the stock "Frequently Asked Questions" — opening with a 2-3 sentence `<p>` stating a fact the questions share, never an announcement ("Here are common questions") — with 3-5 H3 questions, each answered in 40-60 words. High AI-citation density per word.
9. **Conclusion — two `<p>`s, 6-8 sentences split unevenly between them (never an even split).** Advance to a next step or a fresh specific that wasn't in the body — never restate the body's load-bearing answer. Close with ONE internal link riding a sentence the conclusion already needs — never a "go browse X" line.

### Internal-link strategy

Blog posts cite related coverage the way a journalist cites other outlets' pieces — this is where the SEO compounding lives. Links are placed by Stage 5's linking pass onto the finished draft — no per-section quotas: the density law alone places them, riding only nouns the draft already wrote (FAQ answer text may include a link).

**Link targets — all valid for blog posts:**

- **Specific member profile** (Pattern 4): `/<user.filename>` — resolve via `searchUsers` only, and only when the agent has a specific known person to deep-link to. Rows returned by verification calls (dedup, member-count gates) are never link targets. No bulk-listing members.
- **Filtered member directory** (Pattern 6): slug-hierarchy paths by location and/or category — construction + member-count gate per URL-PATTERNS `Pattern 6 — Filtered member directory`.
- **Specific post of any type** (Pattern 1): `/<post_filename>` — a live row this run's dedup or list calls already returned needs no re-lookup; otherwise resolve via title-filtered `listSingleImagePosts` when the agent has a specific known post to deep-link to. No bulk-listing.
- **Post search results of any type** (Pattern 3): `/<post_type_data_filename>?category[]=<cat>&...` — anchor names the category's posts as a subject noun phrase ("winter races in Austin") — never the category's own label, and taxonomy words ("category", "section") never enter the prose.

Pick targets by **contextual relevance to the body sentence**. If the paragraph mentions finding a local pro, link that mention to the matching category + city page (Pattern 6). If the paragraph touches a concept another article already covers, cite it like a journalist citing another outlet's piece: the concept phrase carries the link ("a solid warmup progression", "picking the right coach"), never a title-noun or ownership tag ("the knee injury guide", "the site's warmup plan") — via Pattern 1, only if the agent has confirmed the post exists and is live (`post_status=1`). Never fabricate URLs.

### Inline body images

**Opt-in only — do NOT include inline body images by default.** Only apply this section when the user explicitly requests inline images in their prompt (e.g. "with inline images", "include body images", "add photos throughout"). Default blog runs ship with the feature image only — prose carries the post.

When opted in: 1 inline body image per 300-500 words (excluding the feature image). Image float: `class="fr-dib fr-fil img-rounded"` (left) or `class="fr-dib fr-fir img-rounded"` (right) + inline `style="width: 350px;"` on the `<img>`. Source URLs use the retina variant: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=700`. Per **Rule: Post-body formatting**.

**Inline body image dedup (intra-post only):**
- No URL repeats within the same `post_content`.
- No body URL equals the post's own `post_image` (feature) URL.
- NO site-wide dedup on inline body URLs.

Each inline image is sourced via METHODOLOGY `Image strategy`. Vary the search topic per image so candidates differ naturally.

### Title shape

Blog titles run different from event titles — clickbait-flavored but anti-slop-disciplined. Pick a shape from the title-shape table in `Topic resolution`; vary the shape across the run rather than defaulting every title to "How"/"What"/"Why".

Caps: ~70 chars where SEO matters (Google truncates title tags around there). Keep punchy. No clickbait that overpromises ("This One Trick Will Change Your Life"). No throat-clearing. No fabricated curiosity. **Single statement only — no `X: Y`, no `X (Y)`, no `X? Y`.**

---

## BD Blog field reference (runbook Step 14)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `data_type` | `20` (single-image classification, always for blogs) |
| `data_id` | resolved blog post-type id from runbook Step 3 |
| `post_title` | per the `Title shape` section — clickbait-flavored, anti-slop, ~70 char target |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Source-supported (a field whose data the source supplies is filled — leaving it empty is the failure)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: re-read the **category ledger** line and copy one value from it verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Blog-specific additions and examples:

| Field | Blog-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — direct-answer opening + mixed-shape H2s + answer-first paragraphs + FAQ + conclusion. Inline body images only when user explicitly requested. |
| `post_meta_title` | Type-specific example: `"Reformer Pilates vs Mat Pilates for Beginners Working Out at Home in a Small Apartment"` — audience qualifier (beginners) + use case (home workouts) + scenario (small apartment) expanded from the shorter `post_title`. |
| `post_meta_description` | Blog-specific flavor: one-sentence value proposition for the decision-stage situation (e.g. "Comparing reformer and mat Pilates for beginners working out at home: calorie burn per 45-minute session, equipment cost, and space needs for a small apartment."). |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |
| `post_start_date` | Required. The user's future publish datetime if given, else identical to `post_live_date`. `YYYYMMDDHHmmss`, site timezone. A date given without a clock time → `000000`. |

### Do NOT pass

- `post_expire_date` — events-only.
- `post_venue`, `post_location`, `lat`, `lon`, `country_sn`, `state_sn` — geo fields; blogs do not have a place anchor.
- `auto_geocode` — geo-only; not applicable to blogs.
- `revision_timestamp` — BD-managed.
