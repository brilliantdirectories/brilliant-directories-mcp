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

A good post covers the full picture: core facts, practical considerations, useful context, deeper facts on the location/category/focus where the source or confident knowledge supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (expanded when source data + confident knowledge support more, tighter only when both are genuinely exhausted).

1. **Load-bearing facts up front.** The first intro paragraph answers the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it") across its sentences, never packed into one — and the body never opens with the post title restated. The content-type file names the load-bearing facts for the data type.
2. **Every record fact source-supported — by a source about THIS record.** A similarly-named different event, role, or record is a different subject, never a source. No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because you skipped multi-angle context, comparison, useful perspective, or related information the source data supports is a failure; short is fine only when source and confident knowledge are both genuinely exhausted.
3. **External source citations: 2 per ~500 words, cap 4 total (a ~500-word listing carries 2-3; a ~1,000-word-plus post 4)** (fewer only when credible sources are genuinely exhausted; for article-type posts one per source — same-owner pages = one source; a listing's externals may all be the record's own pages — each page once, the CTA button's URL excepted — that one is the button's alone, never also a citation — each backing different record facts — the page itself never a sentence's subject or a section's topic; per the Source credibility gate), never before an internal link per `Link order`. Source in order, stopping at target: (a) this run's Stage 3 verified set — zero calls, the default path; (b) one batched round per **Rule: Search discipline**: broad topic query (3-6 plain words, no operators) + a `<topic> guidelines`-or-`standards` companion, judged by the Source credibility gate, then one `site:` probe on a surfaced domain — it rides the citations' fetch pack; (c) practice/profession topic → its encyclopedia article's institutional references; (d) ship with fewer — legitimate only once (b)'s round has fired. Budget: 3 WebSearch + 2 WebFetch per post. Cite static destinations only — a specific article, abstract, or the organization's own page, never a search-results/query URL (`?term=`, `?q=`, `search?`, tag/archive indexes), never a login-gated page. A citation wraps a noun the finished draft already contains, in a sentence about the subject — never the post's first sentence, never a sentence about the source, never a sentence added to carry it — with `rel="noopener" target="_blank"`; no forced "Source: X" footer. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
4. **Internal links riding the draft's own nouns** — use URL-PATTERNS.md Pattern 1 (specific post URLs) or Pattern 3 (the post-type page carrying at least one filter — category, location, date, or combos). **Write the entire body first, with zero links and zero link intent. Then a linking pass: its targets are the run's verified internal targets — live posts this run's dedup/list calls already returned (**`post_status=1`**) and Pattern 3/6 URLs constructed from the post's own category, location, and — for events — date values — then wrap noun phrases the finished draft already contains — no link in the post's first sentence — (the city, the role, the venue, a concept another post or a category's listing page covers — never a category's own label, and taxonomy words ("category", "section", "archive") never enter the prose) onto targets from that list — at most one link per sentence, at most two per paragraph, no href twice, no anchor phrase twice, distributed evenly across the post's full length and across the Pattern types the draft's nouns support — never clustered, never one Pattern carrying the page — hitting — never exceeding — the internal-link budget: **up to one internal link per ~125 words, plateauing at 12 (a ~500-word post up to 4; a 1,000-word post up to 7-9; a 1,500-word-or-longer post up to 10-12) — a ceiling, never a figure to reach: link every noun the frozen draft already contains that has a verified internal target; a count under the cap is correct only once every such noun is linked — a target-bearing noun left unlinked is a miss, not a short count**. The linking pass may not add, reshape, or reorder a single sentence. The chosen targets' gate checks (member-count, taxonomy, and title-filtered post lookups) share ONE message — exactly ten checks: chosen links first, spare slots filled with the draft's other linkable nouns; fewer only when nouns run out. This is the run's only gate message: a cleared check keeps its one link — one check, one placement; a failed or unchecked one re-targets to a cleared spare, a run-verified post URL, a Pattern 3 URL in any filter shape, or Pattern 5, dropping only when none fits.** A slot goes unfilled whenever its section has no qualifying draft noun — **a sentence, bullet, or clause that exists for a link is a worse failure than the unfilled slot; a slot left unfilled while a draft noun with a verified internal target still stands unlinked is also a failure; wrapping a noun a sentence already owns is never the crime; the budget never outranks the prose.** Anchor text reads as part of its sentence — a sentence about the topic, never about the linked destination — never a standalone CTA, never a trailing "More X in Y" section. Never fabricate URLs; a reference with no verifiable target omits that link.
5. **External links to sources, ticket/registration vendors, organizers' own pages** — with `rel="noopener" target="_blank"`.
6. **Work through every depth dimension that fits the post type** — their material is the subject and its real world, never the site's own posts or pages, and a dimension's label never enters the prose or its headings — dimensions are lenses, not sections; headings rise from THIS record's own material — a fit section's heading names its participants, never the label; they separate a republished record from a destination page. Each one that source data + confident knowledge honestly support goes in — skipping a supported dimension is the failure; omit only one that would require guessing. The depth score: how many developed sections rise from the record's material — the fuller post wins on record material alone; a thin record makes a short post — pad it to length and every added sentence is filler, the worse failure.
  - **Observable specifics** — the record's own, stated as settled knowledge.
  - **Audience fit** — skill level, accessibility, life stage — for whom.
  - **Practical considerations** — first-time/day-of detail rarely on the source page: prerequisites, logistics, exclusions, hidden costs, timing — pitfalls as if/then facts ("If X happens, Y is the fix").
  - **Historical / community context** — provenance, longevity, lineage, reputation.
  - **Local context** — neighborhood character, nearby landmarks and amenities, parking, transit/access. Skip when the post type has no place anchor.
  - **The organizer and venue's story** — who runs it, their history, what they're known for; confident knowledge counts ("open since 1937 in the same Fifth Street building").
  - **Industry insight / players** — real peers and market leaders from the wider market, named with their facts.
  - **Standout fact** — a verifiable fact that sets the record apart in its real market ("the city's only weekday-morning session"). Never puffery, never praise of the post or its source.
  - **The program / agenda** — the published run of show: day-by-day or hour-by-hour flow, itinerary, speakers or session lineup; a start time alone is logistics, a flow is a section.



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
2. **Once an internal link has appeared**, external citations mix in among the continuing internal links — internals continue per the internal-link budget, externals sprinkled through later sections, never two in the same or consecutive sentences, never clustered in one footer block. Internal and external links together cap 16 — the internal floor holds; externals fill the remainder.
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
| `post_meta_description` | SEO meta description, ~150-160 chars. One sentence stating what the record is and its key facts. Not a verbatim repeat of `post_title`. The content-type file adds type-specific flavor (events: include date + city; blogs: the decision the post settles).                      |
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

After the last create's response, the run is not finished until you emit this — never stop on the create tool call. The receipt fires only when no candidate still owes a create — a due create's message is never the receipt's. A run that created posts but sends no receipt still owes one. Each of the goal's slots ends created (a real `post_id` greater than zero — a `posts` entry) or not, for a reason named in `shortfall_reason` (no candidate found, conflicting input, a failed gate, dedup, or a create that returned no live `post_id`).

**Part 1 — the human reply, plain Markdown.** `-` bullets, links as `[text](url)`, zero HTML tags. One parent bullet per post in the receipt's `posts` array — the title linked to its live URL — with one child bullet per detail: post type, post_id, author (name + user_id), publish status (published live / saved as draft), the full live URL written out, the `<admin_edit_url>` linked as "View in Admin". No bullet presents any other post. A count under the goal states the shortfall reason plainly in the reply. Never narrate the process or your own output mechanics ("Emitting the receipt", "Here is the JSON").

**Part 2 — the receipt**, a raw JSON object directly after the reply:

- The receipt starts at `{` and ends at `}` — no markdown fences, no prefix labels, nothing after the closing brace.
- Return complete, valid JSON — never partial or truncated. Pretty-print at every nesting level: 2-space indent, one field per line — including each object inside `posts`, never compacted onto one line.
- ONLY these fields, in this order — never add extra fields: `post_create`, `post_create_goal`, `post_create_count`, `posts`, `shortfall_reason`.
- `post_create`: `1` (this run's task was creating posts). `post_create_goal`: the requested post count — from the run's instructions, never lowered to match the outcome. `post_create_count`: posts with a `post_id` greater than zero returned by a `create*` response this run — nothing else counts.
- `posts`: one object per real `post_id` greater than zero — from the `create*` response, or the Stage 6 confirming probe when the response lacked one — copied verbatim, never predicted from the title or filled from the fields you sent. No real `post_id` = no entry (never a placeholder `0`). `{"post_id": N, "post_type_id": <data_id>, "post_data_type": <data_type>, "post_type_name": "<post type name>", "post_title": "...", "post_url": "<full live URL>", "post_author_id": N}`. Empty array when none.
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
- Article-type posts speak as a knowledgeable friend sharing what's worth knowing, and the adjacent things it naturally connects to — stating facts plainly, connecting two only when one genuinely explains another, never previewing or framing what's coming.
- Listing-type posts (a job, an event, any post that IS the thing) state the record's facts as the organizer knows them — settled, not promoted — third person throughout, never first or second ("we", "our", "you", "your").
- Every voice: declarative. State what a thing is with the bare verb — "is", "is at", "runs", "opens", "costs" — and never swap in a light or transitive verb to make a fact look like an action ("sits at", "gives a role", "holds", "brings teams to"). Every sentence's subject comes from a closed set — a person, an organization, a place, or the record and its concrete parts; nothing abstract ever holds the subject slot, under any verb, and the record never acts on people or places. Facts stated plainly, not hedged.
- Every sentence is load-bearing information about the subject and earns its place — no filler, no asides.
- Generous with specifics, no press-release tone. Name specific things. No re-explaining, no fact entering twice. Vary sentence length.
- Audience fit is described in third person, plainly evaluative in a friend's everyday words, the thing itself as subject ("perfect for anyone who..."), never by addressing the reader — fit names the thing's own participants, never readers or followers of content; a participant described by the content they follow ("attendees following wellness talks") is the follower form.
- The telling's natural nouns — the city, the role, a thing a category page lists, the venue, and any related thing it names while talking about the subject — are the only candidate anchors, linked in place with the sentence unchanged, never on a comparison, never as the host's inventory.

## Banned constructions (the construction itself, in every wording)

Every `Banned constructions` and `Banned patterns` entry kills the wording, never the thought — restate it in a legal shape; dropping it is its own failure — except a payoff or gloss clause carrying no checkable fact (`False agency`, `Fact-gloss`): those drop.

- **Shell-noun subject (discourse deixis)** — an abstract noun summing the writing's own prior sentence ("that context") as subject. State the next fact instead.
- **Relational clause with abstract Carrier** — an abstraction suits/fits/works for/has/makes someone — any fit verb — or fit as the subject itself ("The best fit is..."). A person carries the fit, or the record in the commanded copula form only ("perfect for anyone who..."); the record never fit-verbs a person.
- **False agency** — an attribute, setting, or format as benefactor: inanimate subject + causative verb + evaluative payoff ("The seamless course elevates race day", "the vibrant pier setting showcases the race"). The payoff is the test, anywhere in the sentence — a trailing ", which ..." clause included: a measurable fact rides any subject ("The position offers competitive wages with commissions"); an evaluative payoff never does — state the bare fact or who does what.
- **Evidential subject** — the evidence for a fact as its sentence's actor, narrating the inference instead of stating the conclusion ("the address places the studio in Wynwood"). The sentence runs backwards: evidence, inference verb, then the real fact. State the concluded fact with the thing itself as subject ("The studio is located in Wynwood").
- **Fact-gloss** — a sentence or clause re-describing a stated fact as its mood, ease, appeal, or reach ("starts at 8:00 a.m." → "a short runway before the course begins"), or asserting such a quality with no checkable fact under it. The test: strike the clause — if no checkable fact leaves the post, it was gloss; the sentence keeps its fact clauses. Commanded restatements — the core-facts `<ul>`, FAQ answers, audience fit in its commanded form — stand.
- **Metaphoric locative predication** — a posture verb on anything but a physical place ("the 5K sits alongside"), or any verb placing or positioning the record alongside or among other things ("which places it alongside other industry events"), or a simile filing it among a class ("openings like this one"). A physical place can hold a real locative ("Park Center is next to the courts"); records and entries cannot. State the relation literally.
- **Reportative evidentiality** — a document or the record (the posting, the listing, the page, the source, the role, the job, the event) as a sentence's subject under any verb — lists, centers on, stays centered on, belongs with, lines up with, gives, shows, points to ("the posting lists", "the role belongs with the site's coaching roles", "gives the role a local anchor"), or the record's org or the record itself as sayer of a speech verb ("the club says", "identifies itself as"). A document is never a subject; state the facts bare as settled knowledge.
- **Metadiscursive importance predication** — announcing relevance ("X matters") instead of stating the relevant fact, headings included ("Why The Setting Matters").
- **Unglossed jargon transfer** — a source's opaque self-label or an unfamiliar named tool ("moves into Sched") carried verbatim. Say what it is on first mention, or drop the name and state the function.
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
| Tricolon / forced triples | "X, Y, and Z" parallel stacks invented for rhythm ("vibrant, bustling, and stunning"). Use only when the content genuinely has three items. Never invent a third for cadence. |
| "Not just X, it's Y" amplifier | "It's not just a race, it's a community", "more than just a conference", "isn't merely a workshop" → state Y directly. Distinct from negative listing — this is the additive escalator. |
| Participial/gerund openers | "Standing in the lobby...", "Looking ahead...", "Bringing together...", "Drawing on decades of experience..." Max one `-ing` participial opener per section. "Looking ahead", "Bringing together", "Drawing on" banned outright. |
| Conclusion-recap reflex | "In short", "In summary", "Ultimately", "The takeaway", "The result is", "What this means", "All told", "At the end of the day" as section/post closers. Conclusions advance — name the next step, not a restatement. |
| Throat-clearing openers | "Here's the thing/what/why", "It turns out", "The truth is", "Let me be clear", "What you need to know" → cut, state the point |
| Binary contrasts / negative listing | "Not X. Y." / "isn't X, it's Y" / "Not a concert. Not a conference. It's Z." → just say Y |
| Dramatic fragmentation | "Two days. Two stages. That's it." → combine into a real sentence |
| Rhetorical setups | "What if I told you...", "Think about it:", "Here's what I mean:", Wh- sentence-starters in prose → restructure. **Exempt: FAQ question labels** ("When is...?", "Where does...?", "How much...?") — those are structural Q&A, not prose openers. |
| Passive voice | "was created", "is believed", "mistakes were made" → name the actor |
| Hedged facts | "looks built around", "seems to focus on" on facts in hand → state it plainly ("Members book sessions by appointment") |
| Adverb crutches | really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, interestingly, importantly, crucially, ultimately → delete |
| Business jargon | navigate, unpack, lean into, deep dive, double down, circle back, take a step back, moving forward, at its core, at the end of the day, when it comes to, in today's landscape, game-changer, in one place → plain language |
| Vocabulary fingerprints | delve, showcase, leverage, harness, elevate, empower, unlock, foster, vibrant, bustling, stunning, breathtaking, nestled, rich tapestry, treasure trove, suits, suited, boasts, curated, discerning, seamless, oasis, pivotal, crucial, paramount, meticulous, intricate, utilize, facilitate, cutting-edge, groundbreaking, transformative, unprecedented → cut it, or state the concrete fact it gestures at. Highest-signal single-word AI tells in 2026 detectors. |
| Scene-setting openers | "Picture this:", "Imagine", "It's a crisp morning in...", "The smell of [X] fills the air..." → state the article's subject directly. No visualization warm-up before the point. |
| Performative emphasis | "Let that sink in", "Make no mistake", "Full stop", "Period.", "And that's okay", "(Read: ...)", "(Think: ...)" → cut |
| Marketing compounds | "[X]-centric", "[X]-driven", "[X]-worthy", "[X]-leading", "[X]-forward", "[X]-ready", "[X]-facing" → plain descriptors |
| Timeline filler | "Since its inception", "From day one", "Over the years" → the exact year, or cut |
| Sentence-initial shell | A sentence opening with "That" or "That [abstract noun]" summing the prior sentence ("That mix...") → open with the fact itself |
| Non-restrictive relative clause | A fact riding a comma-appended clause (", which ...", ", who ...", ", where ...", ", whose ...") on another sentence ("The summit, which draws 3,000 attendees") → give the fact its own sentence ("The summit draws 3,000 attendees."). Restrictive clauses that define their noun ("trainers who hold NASM certification") stay. |
| Vague declaratives | "significant", "important", "matters", "the implications are", "the stakes are" without naming the specific thing → name it |
| Telling not showing | "this is incredibly difficult", "this is what leadership looks like" → demonstrate with specifics |
| Fabricated authority | "studies show", "experts agree", "research suggests", "PubMed-indexed studies" without citation → link a specific static source or rewrite as opinion |
| Closing maxim | a section or paragraph bowing out on a tidy wisdom sentence ("At the end of the day, consistency is what counts") → end on the concrete fact, number, or next step — a closer that could end a different post is the maxim |
| Formulaic attribution | "[Page/posting/listing/schedule — any document, the record, or its org] says/notes/describes/shows/lists/frames/points to/covers..." as any sentence's or heading's actor, opener or mid-sentence, and "According to [Org]..." → state the fact in your own sentence — the source's name may ride as an anchor in a sentence about the subject, never as its subject or speaker; a claim that cannot be stated bare in plain words drops |
| Lazy extremes | every, always, never, everyone, nobody without specifics → use real numbers or "most"/"many"/"few" |
| Off-subject narration | Any sentence or section whose subject is the website, its pages, its link strategy or search performance ("stays fresh for local search", a "Why This Fits Local Search" H2), or its audience in the third person ("for readers who follow…"), or the record's genre or category in general as the sentence's subject, or that mentions the site or its furniture in any position ("on this site", "the site's", "the calendar fills with...") instead of the topic — the tell: the post's own voice could not have said it (the employer or organizer for listing-type posts; an outside writer sharing this find for articles) — a sentence or section about reading or interpreting the source document always fails → rewrite about the subject |

## Self-check before posting

Run every check below against the assembled body and every create-call field; a hit gets its fix applied in place, and the rewrite re-passes the sweep.

1. Any `–` (U+2013) or `—` (U+2014) outside code? Rewrite.
1a. Any curly quote (U+2018/2019/201C/201D), ellipsis (U+2026), or NBSP (U+00A0) outside code? Replace with straight ASCII.
1b. Subject-and-verb scan — every sentence, before any other check below. (a) Subject a document (the page, posting, listing, site, address, schedule, source, role, job, event)? Rewrite so the fact stands alone: "The page asks for a resume" → "A resume is required"; "the address places the studio in Wynwood" → "The studio is in Wynwood". (b) Main verb a light stand-in for "is/is at" — sits, gives, holds, places, brings, keeps, offers, carries — where "is", "is at", "runs", "costs", or "opens" states the plain fact? Swap to the plain verb: "LA FORME sits at 238 N. Citrus" → "LA FORME is located at 238 N. Citrus"; "Atlanta gives the Kroc Center a city anchor" → "The Kroc Center is in Atlanta". A light verb doing real, literal work stays: "the festival runs three days", "the gym offers childcare", "doors open at noon", "the pass costs $40".
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
10. Three sentences in a row sharing length, an opening word, or a "The [noun]" subject? Vary one — hand the next sentence to a person, the org, or a place, or let time or place lead it. Post-wide, one noun never holds the subject slot more than three times — repeat it plainly or hand the sentence elsewhere — never invent a synonym for it.
11. Unsourced authority claim? Cite or rewrite.
12. Lazy extreme? Add specifics.
13. Wh- sentence opener in prose? Restructure. (FAQ question labels exempt.)
14. Paragraph rhythm: 2-4 paragraphs between H2/H3 headings, 3-6 sentences each, varied — not metronomic. Back-to-back larger paragraphs encouraged when content supports it; asymmetrical sizing reads more human than uniform blocks.
15. **Bullets rule.** The content-type file's commanded lists always stand. Beyond them: bullets as default structure or to break up every section? Cut. Use a short bulleted/numbered list only when content is genuinely parallel and scannable (specs, steps, options, criteria) — one or two such lists per post, max. Prose is primary; bullets are a tool, not a layout.
16. Could the post's own voice have said this sentence (the employer/organizer for listings; an outside writer sharing a find for articles)? No → rewrite it about the subject — its link moves to a noun the rewrite keeps, or drops.
17. Any sentence instantiating a `Banned constructions` or `Banned patterns` entry, in any wording? Apply its arrow — restate legally, never drop.
18. Every depth dimension that source data or confident knowledge supports — grown into developed material? A mention is a seed, not coverage; skipping one is the failure.
19. Count the internal links (relative `<a href="/...">`). Zero means the linking pass never ran — run it per METHODOLOGY item 4.

## Scoring (rate 1-10; revise the lowest-scoring dimension — revised sentences re-pass the self-check — then ship if ≥40/50)

| Dimension | Question |
|---|---|
| Directness | Statements or announcements? |
| Rhythm | Varied sentence length and sentence subjects, or metronomic — the same "The [noun] [verb]s" frame again and again? |
| Trust | No sentence restating another sentence — in the same terms or summed into an abstract noun? |
| Authenticity | Sounds human-typed? |
| Density | Count filler — sentences deletable without losing a fact. Score = 10 − (2 × count), floored at 1. Coverage of supported depth is item 18's gate, not this one. |

## Drift triggers (stop and rewrite)

Filler sentences carrying no fact while the source still holds unused facts. Three "and"s in one sentence. Any `Banned constructions` entry surfacing mid-draft.

## Wrong-example reference

The code block in this section contains the banned U+2014 character — included so you can recognize the pattern. Do NOT write text like this:

```
Tickets cost $20—$45 for the Saturday show — bring sunscreen.
```

Right:

```
Tickets cost $20 to $45 for the Saturday show. Gates open at noon.
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

**Anchor text: 2-4 word noun phrase that reads as part of the sentence — internal and external alike.** The longer description belongs in `title`, never in the anchor. Never the target's full title, never generic ("here", "this page"), never site furniture or page-type nouns ("member directory", "full jobs board", "the events calendar") — in the anchor or anywhere in its sentence. The anchor is a noun phrase the draft already contains, as its sentence wrote it — `title` names the destination; the anchor never does. External anchors carry the source's name ("the NSCA guidelines", not "the guidelines"). An anchor opening a sentence capitalizes its first word like any sentence opener.

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

===== FILE: shared/GEOCODING.md =====

# GEOCODING: Nominatim protocol for post types with a place anchor

Applies to content types that set `lat`/`lon` — their runbook's geocoding step points here. Run on survivors (candidates that passed the runbook's `Duplicate detection` step).

BD's `auto_geocode=1` requires a Google Maps server-side API key most sites lack. Skill geocodes itself via Nominatim (OpenStreetMap, free, no key).

## MANDATORY: transliterate non-Latin scripts BEFORE any Nominatim query

Nominatim returns **wrong-country ghost matches** on native non-Latin scripts — confirmed live: `"Ακρόπολη, Αθήνα"` (Acropolis in Greek) returns Helsinki, Finland coords; `"台北101, 台北"` (Taipei 101) returns Iceland; `"故宫, 北京"` returns empty. The English transliteration of the same address resolves correctly every time.

Scan the address string first. If it contains characters outside the Latin alphabet + extended Latin (Greek, Cyrillic, CJK Chinese/Japanese/Korean, Arabic, Hebrew, Devanagari, Thai, etc.), **convert to English/transliterated form before running the geocode ladder.** Use the source page's English version if available, or LLM judgment for well-known landmark names ("Acropolis, Athens, Greece"; "Forbidden City, Beijing, China"; "Taipei 101, Taipei, Taiwan"). If neither source nor confident LLM judgment yields an English form, skip `lat`/`lon` for this post entirely. Never pass native script to Nominatim. Never fabricate a transliteration.

## Geocode ladder (fire the branch's tiers together in the pre-create step's ONE message — beside its `poolImages` call and title check — on the transliterated address; the lowest-numbered hit wins)

Nominatim is uneven — over-scoped queries (venue + street + city + region + zip + country) miss; medium-scoped queries (venue + city + region OR street + city + region) hit. Spelled-out state names beat 2-letter codes (`"Florida"` not `"FL"`). For international without state-equivalents, use country in place of state. Each tier is one `WebFetch` to `https://nominatim.openstreetmap.org/search?q=<URL-encoded-q>&format=json&limit=1&addressdetails=1` using the prompt in the `Extraction prompt` section.

**When `post_venue` is known — 4 tiers, tried IN ORDER starting at tier 1; the first hit wins and stops the ladder.** Never jump to tier 4 (city-center) first — it always resolves but loses venue accuracy, so it is the last resort, only after 1-3 miss. If tiers 1 and 3 both miss, retry each once with a trailing generic word dropped ("Fairthorne Manor Park" → "Fairthorne Manor") before falling to tier 4.

1. `q="<venue>, <city>, <state-name>"` (US/CA) OR `q="<venue>, <city>, <country>"` (intl).
2. `q="<street>, <city>, <state-name>"` OR `q="<street>, <city>, <country>"`. Catches venues that aren't named in Nominatim but have indexed street addresses.
3. `q="<venue>, <state-name>"` (US/CA) OR `q="<venue>, <country>"` (intl). Looser — landmark-level match.
4. `q="<city>, <state-name>"` OR `q="<city>, <country>"`. City-center match. Always resolves for any recognized city (venue-level accuracy lost).

**When `post_venue` is empty (source page only gave a street address) — 2 tiers:**

1. `q="<street>, <city>, <state-name>"` OR `q="<street>, <city>, <country>"`.
2. `q="<city>, <state-name>"` OR `q="<city>, <country>"`.

Skip `lat`/`lon` on that post only when every tier came back empty. Post still creates.

## Extraction prompt

For each `WebFetch` tier call: `"Extract from this Nominatim JSON response: (1) lat as a decimal, (2) lon as a decimal, (3) country_code (ISO 2-letter), (4) state name from the address breakdown (full name as returned, e.g. 'New York', 'California', 'Ontario'). Return as a flat object with keys: lat, lon, country_code, state_name. Omit keys whose values are not present in the response."`

## Rules

- Cache within run: two posts at same venue → geocode once.
- Never fabricate coords. Never use LLM-knowledge coordinates.

## Normalize Nominatim output before passing to BD

Nominatim returns `country_code` lowercase (`"us"`, `"ca"`, `"gb"`) and state as a full name (`"New York"`, `"Ontario"`). BD's `country_sn` and `state_sn` expect uppercase ISO codes. Normalize directly.

1. **`country_sn`**: uppercase the Nominatim `country_code`. `"us"` → `"US"`, `"ca"` → `"CA"`, `"gb"` → `"GB"`.
2. **`state_sn`**: map the Nominatim state name to its ISO-3166-2 2-letter code (US: `"New York"` → `"NY"`, `"California"` → `"CA"`; Canada: `"Ontario"` → `"ON"`, `"British Columbia"` → `"BC"`; Australia: `"New South Wales"` → `"NSW"`; etc.). Always uppercase. If the country has no state-equivalent (e.g. Malta, Luxembourg, Singapore) or Nominatim returned a sub-region that isn't a standard ISO-3166-2 subdivision, **OMIT `state_sn`** — pass `country_sn` alone.

Pass `lat`, `lon`, `country_sn`, and `state_sn` from the lowest-numbered hit. Do NOT pass `auto_geocode`.

===== FILE: content-types/events.md =====

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
4. **Author resolution.** A pre-specified `user_id` in the request settles it — no call. Else run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Search round** — one turn of five queries in the shapes the `Source candidates` section commands (METHODOLOGY `Stage 3: Source research` steps 2a-2b). Every query carries a month-year inside the window (`August 2026`, `September 2026`) — a year alone returns the year's past events — and a location per the `Source candidates` section — a placeless query returns global noise. The Search round's score: how many results it surfaces showing a title and a future, in-window start date — ten candidates beat one.
6. **Pool-print turn — the message right after the Search round's results arrive.** Walk every result line of all five outputs one by one — every line showing a title and a start date later than today (inside the user's window; default 90 days) is a dated result — no other test, the line's own words are enough; its shown date taken as shown, and a line showing no date is never dated from outside knowledge. The dated results ARE the pool — its members are the round's candidates — read as `Title - YYYYMMDD - v1 | v2 | v3` (its three title variants, each 1-3 words); the pool holds the first ten dated results in the order found — fewer only when the outputs show fewer. The Pool-print turn's score: how many dated results enter the pool — an omitted one costs a later round. The pool print opens with the count and prints one line per pooled dated result — fewer lines than the count is an incomplete print. A round has ONE pool-print turn: every dated result's calls fire here — a second dedup turn on the same round's results is an incomplete first turn. Fire every dated result's dedup calls in this same message, on `listSingleImagePosts` only — call shapes per the `Dedup` section: every dated result's 3 title variants in ONE title compound — 3 × N in element 1 — plus one date probe per dated result; the `post_start_date` leg never rides in the title call. N dated results = N+1 calls in this one message; fewer is an incomplete turn. No dated results → return to Step 5.
7. **Duplicate detection — the message right after the Pool-print turn's calls return.** Stage 2's calls (both retrieval keys: every candidate in ONE title compound, plus one separate date probe per candidate, per the `Dedup` section) fired with Step 6's message — compare the returned rows and write the verdicts per METHODOLOGY `Stage 2: Duplicate detection` and the `Dedup` section's events-specific match criteria. Dupes drop from the pool with no further calls; survivors advance to METHODOLOGY `Stage 3: Source research` steps 2c-2e verification — web calls travel in packs there: at least five to a message, spares preloaded, per `Rule: Search discipline`. No survivor → return to Step 5 and repeat until survivors meet the post goal.
8. **Pre-create batch — the message right after verification completes for all survivors. One single turn holds every survivor's calls — six, twelve, or eighteen together — and saves the tokens and time separate turns spend. This turn's only job: ONE message, six calls per survivor — its `poolImages` call, its final-title check, and its four `Geocode ladder` tiers.** A survivor with no venue fires the ladder's two-tier branch instead — four calls; fewer is an incomplete turn. Each additional survivor adds its own six (or four) to this same message. No other calls ride this turn. The six are three tools' calls — `poolImages`, `listSingleImagePosts`, `WebFetch` — born to fire together. The `poolImages` call: per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` — on the `poolImages` path the image is settled: no `getImageDimensions`, no image dedup (Steps 1-3 image path: run the `Image strategy` dedup step in this same message). The title check: compose the final `post_title` once from the verified record, to the field reference's title spec, and confirm it is unique with one `listSingleImagePosts property=post_title property_operator=eq property_value=<final title>` call, never word-order variants; run it exactly once — the checked title is the created title, verbatim. The geocode: Nominatim every survivor with the street or city verification returned — the ladder tiers batched together as backups, the lowest-numbered hit wins per survivor; skip lat/lon only when every tier was empty.
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
`listSingleImagePosts property=["post_start_date","data_id"] property_operator=["contains","eq"] property_value=["20260717","8"] limit=50 fields_only="post_id,post_title,post_status,post_filename,post_start_date,post_venue,post_location"` (July 17 candidate → the probe carries 20260717; substitute the site's event data_id). The title compound carries the same `fields_only`. Its verdict line cites the day: `no match (title + 20260717) - survives`. Rows include `post_venue` and `post_location`. The date probe needs no title match — a retitled dupe surfaces by date. The title compound's score: how many variants ride element 1 — 3 × N is full marks; a trimmed variant saves a token and ships a dupe.

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

**Voice:** this page IS the event page — the record needs no re-introduction: facts carry their own subjects ("Doors open at 6"), never a framing-abstraction under a light verb ("the schedule gives", "the setting lands"), the record-noun an ordinary subject. State the record's facts as settled knowledge, time, place, or a because-clause free to lead a sentence: "On Saturday, the meet runs 9 to noon at Pearl Park", "Tickets cost $25." Never make a source document — or anything that publishes, displays, or evidences a fact — a sentence's actor, quoting or analyzing ("the organizer's page says", "the page frames the weekend as", "the page does not publish a start time") — state each fact bare or leave it out — a fact from the fetched source IS the event's fact; bare assertion is the accurate report; two source facts may share a sentence, a because/while/so between them stating both, never inventing ("The festival runs 10 to 4 because the park closes at dusk") — the joint carries fact, never a mood or appeal — attribution is never a third door; an unannounced fact is stated as its own fact ("Start time TBA") or silently absent, never reported as the page's gap. Local context and scene details as real specifics — informative, never puffery.

**Events-specific load-bearing facts** — two intro paragraphs, at least six sentences split unevenly between them (never an even split), state the record's facts in any natural flowing order: what it is and its purpose, date + time, venue + city, who it's for (the source's own audience, never projected from the site's member professions), what will happen and what to expect, ticket price or "free", how to attend or buy tickets, and any known background or history (never manufactured); the first sentence leads with the event and what it is. The post closes with two paragraphs about the record, at least six sentences split unevenly between them (never an even split) — the close advances: day-of practicalities, the deadline, the next step — never a restatement of the body. A close that runs out of record facts ends short — filler sentences about the site's own pages or search views never pad it; links riding the close's real sentences stand. Section `<h2>`s: record-material noun phrases, never questions, never a dimension's label.

**Registration CTA** — unless the user requests otherwise: when a registration or official information URL is known (the event's own page outranks any booking engine), place this block right after the intro — all three parts in order, none skipped: (1) a short record-material `<h2>`, (2) a 2-3 sentence third-person `<p>` on how to register (the steps, what to have ready — never commands, never the button, link, or form described, never what they open), (3) `<p><a class="btn btn-secondary btn-lg vmargin" href="<an official URL this run fetched>" title="<descriptive phrase>" rel="noopener" target="_blank">Button Text In Title Case</a></p>`. The URL is the button's first — never a body citation; never the button alone; never an action or login-gated path — public pages only.

**Bullets** — the record's core facts as one scannable `<ul>` immediately after the CTA (after the intro when there is no CTA): the what, when, where, and cost at a glance. A slot the source doesn't fill is dropped, never written as missing. A later section whose facts enumerate — inclusions, tiers, formats, requirements — presents them as its own `<ul>`.

**Section headings**: record-material noun phrases — the event's own facts, program, or specifics; never the site's categories or an assembled search phrase, never forced or stuffed, never a dimension label.

**Depth**: an event page is a destination, not a stub — every available fact enters the post as settled knowledge: its story, program or speakers, tiers and inclusions, venue and day-of specifics; a fetched fact left unused is the failure. Self-praise and superlatives are not facts — they never enter, bare or attributed; the verifiable specifics they decorate enter bare. A known registration or tickets URL is fetched before drafting, its prompt asking for that same cargo alongside the logistics.

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
| `post_title` | **Hybrid format: short headline + colon + concise hook.** Never two colons in a single title — if the headline itself contains a colon (e.g. `"Aspen Ideas: Health"`), use a different separator (e.g. a hyphen) or no separator for the hook. Cap at ~54 chars total. Plain text, no HTML, no commas. Aim for clarity over completeness — a scan of the card immediately shows what the event IS. **Headline conveys what the event IS, not just what it's called.** Names that already describe the event (`"Austin Tech Summit"`, `"Community Yoga"`, `"IRONMAN 70.3 Boulder"`) stand on their own. Brand or series names that don't self-explain (`"NEWLIFE Expo"`, `"Cool Sommer Mornings"`) benefit from a category appended (`"NEWLIFE Expo Wellness Retreat"`, `"Cool Sommer Mornings Triathlon"`). **Hook is whatever's most clarifying for THIS event:** venue or city when the location itself sets the event apart, format/distance for races (`"5K"`, `"1.2-mi swim"`), a special angle (`"Free Class"`, `"Sunset Edition"`), or a combination if space allows. Date is optional — include when it adds context and fits within the cap. |
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
| `post_expire_date` | Event end datetime `YYYYMMDDHHmmss` (14 digits, event-local wall-clock). The source's published end clock time fills the last six digits (10 AM conclusion → `100000`). For a single-day event, set to the same date as `post_start_date` with the actual end time. Source states no end at all: `post_start_date`'s date + `235959`. |
| `post_venue` | The named place where the event happens, or the organization hosting it — a venue, park, school, university, base, or government body ("Stubb's BBQ", "Naval Station Norfolk", "Lincoln High School") — the name only, no city appended. No named place in the source → the geocode's named place when Nominatim returns one; else omit. |
| `post_location` | The display address — full street when the source gives one, else city/state (the string that geocoded, e.g. `"Denver, CO"`); lat/lon are the map coordinates. A multi-location source pins the post to ONE location — the location the post's own registration URL's page names; else the source's primary or first-listed — for the title, location, and geocode; the other locations are body facts only. Do NOT prepend the venue name (already in `post_venue`). |
| `lat` | Latitude float (from Nominatim, skip only if every tier was empty). |
| `lon` | Longitude float (from Nominatim, skip only if every tier was empty). |
| `country_sn` | ISO country code from Nominatim. |
| `state_sn` | State code from Nominatim. |
| `post_meta_title` | Type-specific example: `"Austin Tech Summit 2026 in Downtown Austin, Enterprise Software and AI Conference June 13"` — venue + city + date + category modifiers, plus a searcher's pairing term (dates, tickets, schedule) where natural, expanded from the shorter `post_title`. |
| `post_meta_description` | Events-specific flavor: distill what the event is + date + city (e.g. "Three-day enterprise software conference in downtown Austin, June 13-15, 2026. Speakers from Microsoft, AWS, and Salesforce."). |
| `post_meta_keywords` | Same exact CSV as `post_tags`. |

### Do NOT pass

- `auto_geocode` — unreliable (most sites lack Google Maps key). Skill geocodes via Nominatim.
- `revision_timestamp` — BD-managed.

### Date/time formats

Both fields use `YYYYMMDDHHmmss` (14 digits) in the create call. BD silently truncates other formats, corrupting the value.

- `post_start_date`: event start (date AND time). **Event-local wall-clock — the time as a visitor in the event's city would read it. Do NOT convert to the site's own timezone.** A 7 PM Brooklyn event on a Los Angeles-timezoned site stores as `20260616190000`, not `20260616160000`.
- `post_expire_date`: event end (date AND time). Same event-local wall-clock as `post_start_date`; an end date published without a clock time → that date + `235959`.
