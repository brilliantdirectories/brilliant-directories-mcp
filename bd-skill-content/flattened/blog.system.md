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

**Under-produce correct > over-produce wrong. When a fact or candidate is in doubt, skip it and move to the next — doubt about a detail never ends the run.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation — for vertical alignment. **Turn 1 starts exactly here: fire these 5 calls as the run's opening batched round, before anything else.** The 4 site-context calls (`getSiteInfo`, `listTopCategories`, `listPostTypes`, `listMenuItems`) are independent and fully specified here — they need no `getToolSchema`. The 5th is the create schema the run ends on: `getToolSchema createSingleImagePost` — fired once, alongside the 4 site-context calls; turn 1's slots are exactly these. Then process results. Numbering is read order, not turn order.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone (IANA identifier, e.g. `America/Los_Angeles`), `current_site_datetime` (site-local now, `YYYYMMDDHHmmss`), brand.
2. `listTopCategories limit=25` → **sample only, for site-flavor signal.** These are the categories actual site members are assigned to (e.g. "Personal Training", "Group Fitness") — NOT post-type categories. Real sites can have 100s of rows; 25 is enough to read the vertical. Do NOT use these for post category routing — post categories come from the resolved post type's `feature_categories` field (step 3).
3. `listPostTypes` → the content-type file provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`. Once the content-type file's Post-type discovery confirms the resolved type, write the **category ledger** — one line restating the resolved type and its full category list verbatim (`Post type resolved: data_id=8, data_filename=events, categories: <list>`). Empty `feature_categories` → write `categories: (none)` and omit `post_category` and `category[]` for the whole run; location/date filters still apply. Every later category value — Stage 4 routing, `post_category`, Pattern 3 `category[]` — is copied character-for-character from this ledger line — the ledger is the only category source; any tool response, post row, or memory that disagrees is wrong.
4. **Menu link inventory — one call:** `listMenuItems limit=100 property=is_default property_value=false property_operator=eq` (send `property_value` as the string `"false"`; follow `next_page` while present) — returns only the site's own customized menu items. Cache `{menu_name → menu_link}` as internal-link candidates; skip rows whose `menu_link` contains `%%%`. Zero rows → proceed without menu links.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Infer location from `primary_country`, vertical from site info and categories. A `Topic/nuance:` line in the run's instructions carrying only style/format constraints is not a missing topic: apply the constraints and choose subjects per the content-type runbook.

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

When the run holds one or more candidates — brainstormed or harvested (topics, events, jobs) — they ARE the pool, together: every candidate the round exposed enters the same printed list; a lone find still prints as `1.` — and it runs every pool stage, Stage 2 dedup included. Emit the full numbered 1-N pool as a visible list before researching any single candidate in depth. Research to discover candidates is fine; pre-verdict research on a single candidate reaches only its missing dedup keys. The pool prints and its calls fire in one message: Stage 2 dedup for every entry whose dedup keys are known — the content-type file names them — plus new WebFetches that pin each remaining entry's missing keys. After the verdicts, take the top survivor; on failure drop it and take the next surviving un-tried. Do NOT regenerate until all are tried. If all fail, generate pool 2 — distinctly different from pool 1, no variations; a new pool re-enters the runbook at its `Duplicate detection` step. If pool 2 also fully fails, exit with the Stage 7 receipt (`shortfall_reason` says why).

**Failure** = dedup hit, source-research can't substantiate, required-field gate misses, or any other condition that blocks the candidate from progressing to post creation.

Pool size — harvested pools: every qualifying candidate the round's results expose (SERP entries and opened list-pages), up to 10. Brainstormed pools (generated topics): the runbook's stated `N`. Both ordered best-fit first.

## Stage 2: Duplicate detection

Run all pool candidates together, in ONE turn — the same turn the pool prints. A candidate at any later point without its verdict line → run Stage 2 now for every verdict-less candidate, before their next call. A dupe drops for the cost of one dedup round, not a wasted research cycle. Never bulk-list a site's existing posts.

With the pool printed per `Candidate pool discipline (universal pattern)`, one compound query (**Rule: Compound filters**) covers the titles; the content-type file adds any further retrieval keys as their own separate calls, batched in this same turn. `property_value` is exactly TWO elements — element 1: every candidate's 3 variants (each 1-3 words — trim official names to their distinctive core) comma-joined into one string; element 2: the data_id alone:

```
listSingleImagePosts property=["post_title","data_id"] property_operator=["contains","eq"] property_value=["Campbell River,River Marathon,Campbell Marathon,Studio Three,Reformer Week,Pilates Reformer","9"] limit=25
```

Two candidates, three variants each — a five-candidate pool runs the same call with fifteen variants in element 1; a one-candidate pool, its three alone.

Substitute the `list*` tool matching the post-type family. Compare returned rows client-side against the content-type file's match criteria; the message after the dedup calls opens with one verdict line per candidate — the matched post_ids `— dropped`, or `no match — survives`.

**Distinctive phrase = a 1-3 word combo that fingerprints THIS candidate.** Skip throwaway leaders — articles (`The`), years (`2026`), ordinals (`5th`, `Annual`, `Inaugural`): `"The 5th Annual Austin Tech Summit"` → `Austin Tech,Tech Summit,Austin Summit`. A generic single word (`Trainer`) floods the result set; a distinctive combo keeps it lean. Variant shapes — sponsor-stripped form, series or venue fragment; shorter substrings match more retitlings. Variants are free; a retitled dupe only matches a variant.

The content-type file specifies match criteria (semantic title overlap, date tolerance if applicable, location if applicable).

**On match → drop candidate per** `Candidate pool discipline (universal pattern)`**.** Don't repaint with a tweaked title or "refined angle" — same core topic = same candidate. Drop it. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.

Always SKIP existing records — never update or delete any existing post.

## Stage 3: Source research

**2a.** Brainstorm 5-10 candidate source types for vertical+location per the content-type file — recognition vocabulary for judging what returns, not a probe list.

**2b.** One batched round per **Rule: Search discipline** — broad query + the content-type file's companion shape, fired together. Read every result; `site:`-probe (with `-pdf`) only a domain that appeared. Drop dead/empty/archive pages.

**2c.** Survivors only — after Stage 2's verdicts: `WebFetch` the top 5 survivors. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:


| Gate               | Rule                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date sanity        | Primary date must be present AND > today AND < today+window. Window defaults to 90 days unless the user specifies otherwise (via `--window=<N>` or in their request). Absent/past/year-only/quarter-only fails — drop the candidate, never synthesize a date to pass this gate.                                                                                  |
| SPA / empty        | <500 chars of meaningful text OR script-shell page → skip.                                                                                                                                                                                                                                                                                                       |
| Required fields    | The content-type file specifies. Missing any → skip. No synthesis.                                                                                                                                                                                                                                                                                               |
| Confidence         | Self-rate 1-10. Score = degree to which required fields are unambiguous and source-grounded. <8 skip, ≥8 use.                                                                                                                                                                                                                                                    |
| Source credibility | Gov/association/university/established trade or broader-vertical publication = high (1 source OK). Verify the URL resolves to the claimed organization; same-owner outlets = one source. SEO farms, lead-gen sites, practitioner blogs, official-sounding names without a verifiable charter = fail. Random blog/aggregator = low (needs 2-source confirmation). |
| URL liveness       | Every URL the post links to must be verified before publish per `URL liveness gate`.                                                                                                                                                                                                                                                                             |


**2d.** Cross-reference: 2 sources confirm → merge details, boost confidence.

**2e.** Stop at ~10-20 verified records or no new candidates.

### URL liveness gate

Every URL the post will link to must be verified live before publish. Three outcomes by `WebFetch` response:

- **HTTP 200 with real body content** → use. (200 with "page not found" / "error" body text is a soft-404 — treat as dead.)
- **404 / DNS fail** → drop the link, or skip the record entirely if it's the primary action URL.
- **403 / 401 / 429 / timeout / WAF block** → **UNKNOWN, not verified.** A CDN is blocking the bot UA, not proof the page is dead. Never ship on the rationalization that it's "probably live." Confirm the exact URL string in the results of at most ONE search per **Rule: Search discipline**; still unverified → drop.

**Third-party-sourced URLs** (aggregator, secondary listing) always require independent verification — never trust the third party's link as-is. Apply the `URL liveness gate` three-outcome decision tree.

## Stage 4: Category routing

Fuzzy-match source category vs the **category ledger** list. ≥70% confidence → carry the LEDGER value forward, never the source's wording. <70% → SKIP the record (do NOT create categories).

The content-type file may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that is THE definitive source for its subject — external sources exist to support this page's claims, never the other way around; the page never mentions or evaluates another page. Real internal-linking, structured info, honest source-grounded facts. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different.

### Required outcomes (any structure achieves these)

A good post covers the full picture: core facts, practical considerations, useful context, honest comparisons, deeper insights on the location/category/focus where the source supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (tighter when the source is thin, expanded when source data + confident knowledge support more).

1. **Load-bearing facts up front.** The first intro paragraph answers the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it"). The content-type file specifies which facts are load-bearing for the data type.
2. **Every claim source-supported — by a source about THIS record.** A similarly-named different event, role, or record is a different subject, never a source. No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because the source is thin is fine; short because you skipped multi-angle context, comparison, useful perspective, or related information the source supports is not.
3. **External source citations: target 2 per post** (1 acceptable; hard cap 3, the 3rd only when it substantially improves accuracy), only AFTER the first 1-2 internal links per `Link order`. Source in order, stopping at target: (a) this run's Stage 3 verified set — zero calls, the default path; (b) one batched round per **Rule: Search discipline**: broad topic query (3-6 plain words, no operators) + a `<topic> guidelines`-or-`standards` companion, judged by the Source credibility gate, then one `site:` probe on a surfaced domain; (c) practice/profession topic → its encyclopedia article's institutional references; (d) ship under-cited. Budget: 2 WebSearch + 2 WebFetch per post. Cite static destinations only — a specific article, abstract, or official page, never a search-results/query URL (`?term=`, `?q=`, `search?`, tag/archive indexes). Link naturally in flowing prose with `rel="nofollow" target="_blank"` — no forced "Source: X" footer. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
4. **Internal links to related coverage** — use URL-PATTERNS.md Pattern 1 (specific post URLs) or Pattern 3 (the post-type page carrying at least one filter — category, location, date, or combos). **Write the entire body first, with zero links and zero link intent. Then a linking pass: start it by listing the run's verified internal targets — live posts this run's dedup/list calls already returned (**`post_status=1`**) and Pattern 3/6 URLs constructed from the post's own category and location values — then wrap noun phrases the finished draft already contains (the city, the role, the category, the venue, a concept another post covers) onto targets from that list, up to — never exceeding — the content-type file's budget. The linking pass may not add, reshape, or reorder a single sentence.** A link with no natural carrier is re-targeted to a noun the draft does have; under-budget beats a forced carrier. Anchor text reads as part of its sentence, never a standalone CTA, never a trailing "More X in Y" section. Never fabricate URLs; a reference with no verifiable target omits that link.
5. **External links to sources, ticket/registration vendors, official pages** — with `rel="nofollow" target="_blank"`.
6. **Reach for these depth dimensions where they fit the post type and don't require fabrication** — they separate a republished record from a destination page. Include each where source data + confident knowledge support it honestly; omit any that would require guessing, padding, or stretching.
  - **What to expect** — sensory + situational detail that sets the scene up front.
  - **Who this is for / who it's not for** — skill level, audience fit, accessibility, life stage.
  - **Practical considerations** — first-time/day-of detail rarely on the source page: prerequisites, logistics, pitfalls, exclusions, hidden costs, timing.
  - **Comparable anchors** — neutral orientation against something familiar from the subject's own world ("similar to X but Y").
  - **Historical / community context** — provenance, longevity, lineage, reputation.
  - **Local context** — neighborhood character, nearby amenities, transit/access. Skip when the post type has no place anchor.
  - **Industry insight / players** — peers, alternatives, category leaders from the wider market, where this one sits in the landscape.
  - **Positive comparison** — favorable positioning of the role or event itself against real peers in its market, with a specific honest reason ("best choice for someone who wants Z"). Never puffery, never praise of the post or its source.



### Froala HTML safety

Follow **Rule: Post-body formatting** and **Rule: No scaffolding tags**. Skip `<h1>` — reserved for the post title field. **Always open** `post_content` **with** `<p>` **intro paragraph(s); never start with** `<h2>` **or any heading.** `post_content` is public-facing only — never include HTML comments, source notes, machine-readable metadata, or skill-run identifiers.

### Link policy (strict)

Classify every `<a>` tag by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.


| Type     | Format                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target)                   |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |


Full `title=` requirement + composition examples in URL-PATTERNS.

### Link order (universal — internal first, external later)

1. **The article's first 1-2 links** — must be internal links only (any internal Pattern per URL-PATTERNS.md).
2. **After the first 1-2 internal links**, external citations mix in among the continuing internal links — internals keep flowing per the content-type budget, externals sprinkled through later sections, never two in the same or consecutive sentences, never clustered in one footer block.
3. **Unique href per post.** No URL repeats. If two anchors would target the same URL, re-derive one under a different Pattern (1-6); drop only if no Pattern variant fits.

**Short posts exception rule:** posts under ~500 words may carry fewer total links than the per-type floor. Under-link beats stuffed.

### Image strategy

Use Pexels for all images. After both axis batches yield no commit, omit `post_image`. Omitting is the last resort.

Every run works the axes fresh in the table-defined order, batch by batch until a commit — stock-photo inventories change daily.

**If** `poolImages` **is not in your tool list, ignore this paragraph and run Steps 1-3.** With the tool, `poolImages` replaces Steps 1-3: call it once per batch — `axis_terms` = the batch's five axis phrases (batch 1 = axes 1-5, batch 2 = axes 6-10 from the **Axes** table), `shape="landscape"`. It returns a numbered shortlist `{n, title, desc, url}`, already orientation-filtered and site-deduped. Pick the `n` whose title and desc best fit and put that `url` in the post's create call per **Rule: Image URLs** with `auto_image_import=1`. The image is then settled — do NOT re-check it: no `getImageDimensions` and no `listSingleImagePosts` dedup on a `poolImages` url. No title fits, or an empty result → call `poolImages` again with the next axis batch; both spent → omit `post_image`.

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
- Unsourced claim presented as fact? Cite or rewrite.
- Internal link with `rel="nofollow"` or `target="_blank"`? Strip those attributes.
- External link missing `rel="nofollow" target="_blank"`? Add.
- Citation on a search/query URL? Replace with the static source page, or drop.
- Anchor over 5 words? Tighten; move the description to `title` as a descriptive noun phrase, never an instruction ("Browse...").
- Same href twice? Re-derive one under a different Pattern, or cite a different static source for an external; drop only if none fits.
- `post_category` and every Pattern 3 `category[]` value copied character-for-character from the **category ledger** (written at `Stage 1: Site context` step 3)? Re-read that ledger line — do not trust memory. A value not on it filters nothing — fix to the matching ledger category or drop the param.
- Section present without source data to support it? Remove.
- Any fabricated detail? Remove.
- Does the body open with `<p>` intro paragraph(s)? It must — never start with `<h2>` or any heading.
- Are H2 headings marking topic shifts, not fact transitions? Each H2 introduces meaningfully different content. Vary section length naturally — some sections one paragraph, some several, some with a bulleted list. Do NOT trim source-supported depth just to keep sections compact.
- Are all headings (H2 and H3) in **title case**, not sentence case? `"Where to Fly a Kite"`, not `"Where to fly a kite"`.
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is public-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.
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

Call per-type `create*` tool with assembled fields. Assemble against the per-type field reference: every field this run already resolved ships — copy values (e.g. `lat`/`lon`, `post_location`, `post_venue`) verbatim from the run's earlier tool results, never from memory. Pace BD writes ~600ms apart. On failure: continue to next record. Do not retry blindly.

## Stage 7: Closing reply + JSON receipt (the final message, always, in this order)

After the last create, the run is not finished until you emit this — never stop on the create tool call. A run that created posts but sends no receipt still owes one.

**Part 1 — the human reply, plain Markdown.** `-` bullets, links as `[text](url)`, zero HTML tags. One parent bullet per created post — the title linked to its live URL — with one child bullet per detail: post type, post_id, author (name + user_id), publish status (published live / saved as draft), the full live URL written out, the `<admin_edit_url>` linked as "View in Admin". Never narrate the process or your own output mechanics ("Emitting the receipt", "Here is the JSON").

**Part 2 — the receipt**, a raw JSON object directly after the reply:

- The receipt starts at `{` and ends at `}` — no markdown fences, no prefix labels, nothing after the closing brace.
- Return complete, valid JSON — never partial or truncated. Pretty-print at every nesting level: 2-space indent, one field per line — including each object inside `posts`, never compacted onto one line.
- ONLY these fields, in this order — never add extra fields: `post_create`, `post_create_goal`, `post_create_count`, `posts`, `shortfall_reason`.
- `post_create`: `1` (this run's task was creating posts). `post_create_goal`: the requested post count. `post_create_count`: posts actually created this run.
- `posts`: one object per created post — `{"post_id": N, "post_type_id": <data_id>, "post_data_type": <data_type>, "post_type_name": "<post type name>", "post_title": "...", "post_url": "<full live URL>", "post_author_id": N}`. Empty array when none.
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

- **Scrape facts, not content.** Extract facts from publicly-available avenues. Reword everything in BD-site voice. Never paste source paragraphs verbatim.
- **No fabrication.** If source lacks a data point, omit it from the post. Never invent details to fill a template slot. Adaptive depth: a shorter honest post beats a padded fabricated one.
- **Source references are optional + casual, not forced attribution.** When natural, reference the source inline in flowing prose (helps Google EEAT signals). Do not require a forced attribution footer.
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

Every turn fires 5 parallel calls — WebSearches, WebFetches, runbook-step BD calls, or a mix. Whatever the immediate work leaves unused, fill with insurance — new calls only: speculatively preload backup candidates, extra query angles, or a later step's specified calls whose inputs are ready — a turn whose step needs 2 calls still fires 5: the step's 2, plus 3 insurance. Steps with stated timing (Stage 2 dedup in the pool-print turn) fire at their stated time. After the pool is printed, even while narrowing on its #1 candidate, the spare slots keep loading backups — the candidate you are chasing might fail, and that is exactly when you want ready fallbacks already in hand next turn. 5 every turn — one fat turn beats a chain of try-one-fail-retry turns, it is faster and cheaper. Read EVERY result before any new query — qualifying sources routinely rank 5-8. `site:` follows only a domain a result list surfaced (`Image strategy` pexels queries exempt). Negatives strip a known noise class — `-pdf` on probes, one megaboard domain on jobs queries; more trip bot-blocks; a blocked or emptied negated query retries once without them. Count a hit only after opening it: live and on-topic; list-pages additionally show current dates and the correct location in the listed entries themselves. A usable candidate is one that clears your type's gates — on-topic, correct location, and any date/recency rule the content-type sets. A round that returns usable candidates has succeeded; even a few, surfaced by the same sources repeating across queries, are your pool; select from them and proceed. Classify only a round that surfaced no usable candidate: error/challenge pages = tooling-blocked → one structurally different retry, then stop labelled "blocked"; clean-but-empty = dry. Ending with less than the target is a successful outcome — report it via `shortfall_reason`. Reformulate at most once per round, and only to recover a round that surfaced no usable candidate.

**Discovery ladder** (events, jobs, any current inventory): (1) one batched round — a single turn of five queries: the broad-faceted temporal (`<niche> <location> <window>`) + list-page vocabulary (`<location> <niche> calendar/board/listings`) shapes, filled out with extra variants for coverage → read every result — every entry showing the content-type's dedup keys pools NOW: print the pool and fire Stage 2 dedup in bulk in that same message, new WebFetches that pin remaining viable entries' missing keys batched alongside; newly-keyed entries pool and dedup on arrival — then proceed; (2) only a round that surfaced no usable candidate earns recovery: empty → one `<niche> <location> <month year>` recovery, blocked → one venue/facility-noun retry; (3) stop with the diagnosed verdict.

### Edge guards

- Enum fields take only values present in live `choices`; `post_category` is NOT one of them — its only source is the **category ledger**.
- Stock images are Pexels-only — never wikimedia, picsum, placekitten.
- Source-page images (events/jobs) are allowed and skip dedup.
- Never carry scraped source text verbatim into `post_content` — reword everything.

===== FILE: shared/ANTI-SLOP.md =====

# ANTI-SLOP: Writing voice and pattern bans

Mandatory before generating any user-facing prose. Applies to post bodies, FAQ, meta descriptions, titles, anchor text, attribution.

## Voice target

The page speaks as the thing it is, never as a report about its source. Article-type posts speak as an independent service journalist sharing something they just found, and the adjacent things it naturally connects to. Listing-type posts (a job, an event, any post that IS the thing) speak as the employer or organizer — the source of truth, stating the role's or event's facts in their own authority. Every voice: declarative and active — facts stated plainly, not hedged or reported. Every sentence is load-bearing information about the subject and earns its place — no filler, no asides. Generous with specifics, no press-release tone. Name specific things. No over-explaining. Vary sentence length. Address the reader directly where audience-fit matters ("If you're a Los Angeles trainer looking for studio work…"). Link generously: the telling's natural mentions of related things are the anchors, each linked to its matching page, cited the way a journalist links another outlet's piece, never as the host's inventory.

## Banned

| Pattern | Examples / fix |
|---|---|
| En-dash (`–`, U+2013) and em-dash (`—`, U+2014) | Use commas, periods, parens, or "to" for ranges. Banned everywhere. |
| Smart-punctuation drift | Curly single quotes (`'` `'`, U+2018/2019), curly double quotes (`"` `"`, U+201C/201D), ellipsis (`…`, U+2026), non-breaking space (U+00A0). Use straight `'`, straight `"`, three periods `...`, regular space. Auto-inserted by the model, near-perfect AI tell alongside em-dash. |
| Tricolon / forced triples | "X, Y, and Z" parallel stacks invented for rhythm ("welcoming, energizing, and unforgettable"). Use only when the content genuinely has three items. Never invent a third for cadence. |
| "Not just X, it's Y" amplifier | "It's not just a race, it's a community", "more than just a conference", "isn't merely a workshop" → state Y directly. Distinct from negative listing — this is the additive escalator. |
| Participial/gerund openers | "Standing in the lobby...", "Looking ahead...", "Bringing together...", "Drawing on decades of experience..." Max one `-ing` participial opener per section. "Looking ahead", "Bringing together", "Drawing on" banned outright. |
| Conclusion-recap reflex | "In short", "In summary", "Ultimately", "The takeaway", "What this means", "All told", "At the end of the day" as section/post closers. Conclusions advance — name the next step, not a restatement. |
| Throat-clearing openers | "Here's the thing/what/why", "It turns out", "The truth is", "Let me be clear", "What you need to know" → cut, state the point |
| Binary contrasts / negative listing | "Not X. Y." / "isn't X, it's Y" / "Not a concert. Not a conference. It's Z." → just say Y |
| Dramatic fragmentation | "Two days. Two stages. That's it." → combine into a real sentence |
| Rhetorical setups | "What if I told you...", "Think about it:", "Here's what I mean:", Wh- sentence-starters in prose → restructure. **Exempt: FAQ question labels** ("When is...?", "Where does...?", "How much...?") — those are structural Q&A, not prose openers. |
| Inanimate as actor | "decisions emerge", "data tells us", "markets reward", "culture shifts" → name the human |
| Passive voice | "was created", "is believed", "mistakes were made" → name the actor |
| Hedged facts | "looks built around", "seems to focus on", "appears to involve" on facts the source states → state it plainly ("The day runs on member appointments") |
| Adverb crutches | really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, interestingly, importantly, crucially, ultimately → delete |
| Business jargon | navigate, unpack, lean into, deep dive, double down, circle back, take a step back, moving forward, at its core, at the end of the day, when it comes to, in today's landscape, game-changer → plain language |
| Vocabulary fingerprints | delve, showcase, leverage, harness, elevate, empower, unlock, foster, vibrant, bustling, stunning, breathtaking, nestled, rich tapestry, treasure trove → replace with a concrete verb or adjective tied to the specific subject. Highest-signal single-word AI tells in 2026 detectors. |
| Scene-setting openers | "Picture this:", "Imagine", "It's a crisp morning in...", "The smell of [X] fills the air..." → state the article's subject directly. No visualization warm-up before the point. |
| Performative emphasis | "Let that sink in", "Make no mistake", "Full stop", "Period.", "And that's okay" → cut |
| Vague declaratives | "significant", "important", "the implications are", "the stakes are" without naming the specific thing → name it |
| Telling not showing | "this is incredibly difficult", "this is what leadership looks like" → demonstrate with specifics |
| Fabricated authority | "studies show", "experts agree", "research suggests", "PubMed-indexed studies" without citation → link a specific static source or rewrite as opinion |
| Formulaic attribution | "[Org] says/notes/describes...", "According to [Org]..." sentence openers → state the fact in your own sentence with the source linked mid- or end-sentence |
| Lazy extremes | every, always, never, everyone, nobody without specifics → use real numbers or "most"/"many"/"few" |
| Off-subject narration | Any sentence or section whose subject is the website, its pages, its link strategy or search performance ("stays fresh for local search", a "Why This Fits Local Search" H2), or its audience in the third person ("for readers who follow…") instead of the topic — the tell: the post's own voice could not have said it (the employer or organizer for listing-type posts; an outside writer sharing this find for articles) — a section about reading or interpreting the source document always fails → rewrite about the subject, or speak to the reader's situation directly ("If you coach clients around Costa Mesa…"); every sentence survives with its link removed |

## Self-check before posting

1. Any `–` (U+2013) or `—` (U+2014) outside code? Rewrite.
1a. Any curly quote (U+2018/2019/201C/201D), ellipsis (U+2026), or NBSP (U+00A0) outside code? Replace with straight ASCII.
2. Throat-clearing opener? Cut.
3. "Not X, it's Y" / negative listing / "not just X, it's Y" amplifier? State Y.
3a. Invented tricolon ("X, Y, and Z" with no real third item)? Drop the third or rewrite.
3b. `-ing` participial opener — more than one per section, or any of the banned three ("Looking ahead", "Bringing together", "Drawing on")? Restructure.
3c. Conclusion or section closer that recaps ("In short", "Ultimately", "The takeaway", etc.)? Replace with a next-step or a fresh specific.
4. Banned adverb / jargon / vocabulary fingerprint (delve/showcase/leverage/nestled/vibrant/bustling/tapestry/etc.)? Delete or replace with a concrete subject-specific word.
4a. Scene-setting opener ("Picture this", "Imagine", "It's a [adjective] [time]...")? Cut, state the subject directly.
5. Passive voice? Name the actor.
6. Inanimate-as-actor? Name the person.
7. Vague declarative? Name the specific.
8. Stacked fragments? Combine.
9. Performative emphasis? Cut.
10. Three same-length sentences in a row? Vary one.
11. Unsourced authority claim? Cite or rewrite.
12. Lazy extreme? Add specifics.
13. Wh- sentence opener in prose? Restructure. (FAQ question labels exempt.)
14. Paragraph rhythm: 2-4 paragraphs between H2/H3 headings, 3-6 sentences each, varied — not metronomic. Back-to-back larger paragraphs encouraged when content supports it; asymmetrical sizing reads more human than uniform blocks.
15. **Bullets rule.** Bullets used as a default structure or to break up every section? Cut. Use a short bulleted/numbered list only when content is genuinely parallel and scannable (specs, steps, options, criteria). One or two lists per post, max. Prose is primary; bullets are a tool, not a layout.
16. Could the post's own voice have said this sentence (the employer/organizer for listings; an outside writer sharing a find for articles)? No → rewrite it about the subject or as direct address ("If you're…") — move its link onto a noun the rewrite keeps.

## Scoring (rate 1-10, ship if ≥40/50)

| Dimension | Question |
|---|---|
| Directness | Statements or announcements? |
| Rhythm | Varied sentence length, or metronomic? |
| Trust | No over-explaining, nothing spelled out twice? |
| Authenticity | Sounds human-typed? |
| Density | Padding cut, substance kept? A short shallow post fails this — depth from specifics, examples, and useful context is not padding. |

## Drift triggers (stop and rewrite)

Wh- sentence-starter in prose (FAQ labels exempt). Hedging every claim. Explaining what you're about to say. Padding when data doesn't support length. Three "and"s in one sentence.

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

Prose only. See `METHODOLOGY.md` (research/gates/dedup/hard-rules), `URL-PATTERNS.md` (links).

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
| `q` | `q=keyword` | How BD renders its own tag links. Skill-built links filter via the params below, never `q=`. |
| `category[]` | `category[]=Category%20Name` | Value copied character-for-character from the category ledger — any other string filters nothing. One category per link. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` / `location_type` | `lat=46.7534&lng=-92.0681&location_value=Duluth%2C+MN+55802&location_type=locality` | **Send all four together — `location_type` is required even though `lat`/`lng` do the search.** `lat`/`lng` drive the geo radius (implicit default from site settings). `location_value` is the human-readable label that BD writes into the sidebar search-form input. `location_type` toggles the sidebar form's mode (city vs ZIP) — omit it and BD's URL parser breaks, returning zero results. Use `location_type=locality` for city-level (default for content-skill links). Use `location_type=postal_code` for ZIP-radius filtering on sites where the city is too broad (e.g. dense metros). Use the post's `post_location` string for `location_value` regardless of mode. |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. **`&` in `href` attributes of HTML-embedded URLs (e.g. inside `post_content`): escape as `&amp;`** per HTML5 spec. Browsers + Froala both accept raw `&` for non-entity sequences, but `?ref=foo&copy=yes` becomes `?ref=foo©=yes` because the parser interprets `&copy` as the copyright entity. The URL examples in this file show URL syntax (raw `&`); when wrapping any URL in `<a href="...">` for `post_content`, output `&amp;` instead.

## Pattern 6 — Filtered member directory (slug-hierarchy URLs)

**Use when:** anchor text names a specific category and/or location for the member directory (e.g. "running coach in NYC", "yoga instructors in Austin", "personal trainers in Brazil"). When no category or location qualifier fits, use Pattern 5.

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

Location fields per `Rule: Compound filters`: city URLs filter `city` + `state_code`; state URLs `state_code`; country URLs `country_code`. Filter values come from the cached discovery rows: `city` = `city_ln`, `state_code` = `state_sn`, `country_code` = the row's `country_code`. Add `profession_id` when the URL has a category segment. This proves the top only — a location URL with a sub segment passes via the `URL liveness gate` instead (its fetch status is definitive: 200 = seeded, 404 = not). Link only when the count is `>= 1` — BD serves unseeded directory pages with a 404 status by design. Otherwise pick a different category or Pattern. Cache verdicts per run. Gate rows verify counts only — never recycle a returned member row as a Pattern 4 link target.

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
- **Use Pattern 5** when no verifiable category or location fits the sentence. Anchor text still names who the page lists ("local personal trainers"), never site furniture ("our directory," "browse trainers").
- **When in doubt, Pattern 5 is the safer default.**

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |

**`title` attribute required on every `<a>` in post body content** (`post_content`, `group_desc`). Short descriptive phrase (~50-80 chars) of what the link points to — not a duplicate of the anchor text, never an instruction ("Browse...", "Check..."). Example: anchor "certified personal trainers in Boston" → `title="Certified personal trainers in Boston by category and specialty"`. Helps screen readers, hover previews, and SEO.

**Anchor text: 2-5 word noun phrase that reads as part of the sentence — internal and external alike.** The longer description belongs in `title`, never in the anchor. Never the target's full title, never generic ("here", "this page"), never site furniture or page-type nouns ("member directory", "full jobs board", "the events calendar"). The anchor names the destination's content qualified by the post's topic ("Los Angeles fitness expos" for a fitness expo post), not the raw category label and not the page. External anchors carry the source's name ("the IATBP member portal", not "member portal").

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?category[]=Live%20Music
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality
/events?daterange=06%2F15%2F2026+-+06%2F15%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality
/events?lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
/events?category[]=Live%20Music&lat=30.2672&lng=-97.7431&location_value=Austin%2C+TX+78701&location_type=locality&daterange=06%2F15%2F2026+-+06%2F17%2F2026
```

## Don't

- Hardcode `/events` (read `data_filename` live).
- Use `+` for spaces in `category[]`.
- Trailing slashes (BD doesn't use them).
- Double-encode `post_filename` (already URL-safe).
- Mix protocols (use `getSiteInfo.full_url` protocol).
- Invent geo params. Only `lat`+`lng`+`location_value`+`location_type` (sent together — `location_type` required) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip` as raw query params are NOT supported — BD ignores them and the URL filters nothing. Anchor text must match the URL granularity: if `location_type=locality` (city-level), say the city in the link text; if `location_type=postal_code` (ZIP-level), say the city + ZIP. `location_value` is display-facing (`lat`/`lng` drive the filter) — give it the granularity's clean string ("Los Angeles, CA"), never a street address. Do not say "in [State]" or "in [Country]" — state/country are not supported filter modes.
- Build links to WebPage-backed URLs that require `listWebPages` discovery (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) — those are `/bd:seo` territory. **Pattern 6 slug-hierarchy URLs are NOT in this category** — they're constructed from live list-tool lookups, no `listWebPages` call needed.
- Bulk-list existing posts to "see what's available" for internal linking — the ban is on new lookups; live post rows already in context from this run's dedup/list calls are fair Pattern 1 targets. Pattern 3 URLs are constructed from the current post's own category + location values — no lookup needed.

## Internal-link variety

In the linking pass, vary the shape of filtered-listing links across posts so posts don't all point at the same pages. Per post, pick from: (a) category-only, (b) location-only, (c) category+location combined. 1-3 filtered-listing links per post within the broader internal-link budget set by the content-type file — distributed across intro, middle, and later sections, never clustered at the end. LLM-judged per post; no fixed rotation. Filtered-listing links use Pattern 3 (post listings) or Pattern 6 (member directory) per their respective construction rules. Link order rule (internal first, external later) lives in METHODOLOGY `Link order` subsection.

## Link shape priority (universal)

Resolve each internal link to the most specific verifiable target the draft's own nouns support, top-down — drop a tier only when the one above has no target:

1. **Category + location combo.** Example for events: same category + same city. Example for jobs: same role + same city. Example for blogs: a Pattern 6 link to the member directory filtered to the member category the topic serves + the post's city (an article mentioning personal trainers in Los Angeles → `/california/los-angeles/personal-trainer`).
2. **Single-filter category-only** OR **single-filter location-only.** Use when only one dimension is naturally relevant in the sentence. A specific related post (Pattern 1) counts at this tier when its topic matches the mention.
3. **Location + daterange** (events only). Combine with category for the tightest anchor.
4. **Date-range alone** (events only). Carrier: a same-day mention the draft already has ("three other races share the July 19 date"). Skip for non-time-bound post types.

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

The user invoked the skill with a goal like "write blog articles for SEO," "write a viral piece for my industry," or "write an article about XYZ." Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Only make the tool calls the runbook steps specify — no extras; every turn fills its five slots per Rule: Search discipline.** On per-post failure, continue to the next post.

1. **Autonomy.** Per METHODOLOGY `Autonomy`: never ask; decide and proceed.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Build and print the numbered topic pool.** Run the `Topic resolution` section. Pool size `N=5`.
6. **Apply pool discipline.** Apply METHODOLOGY's `Candidate pool discipline (universal pattern)`.
7. **Duplicate detection.** Run METHODOLOGY `Stage 2: Duplicate detection`. Run the `Dedup` section for blog-specific match criteria.
8. **Source research per topic.** Run METHODOLOGY `Stage 3: Source research`. Run the `Source research` section. Land 3-5 source-supported angles BEFORE drafting.
9. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for blog-specific authorization.
10. **Image selection — FEATURE image only at this step.** Run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` end-to-end; follow its sequencing exactly. Lock the feature image first — re-doing body content when an image fails dedup is the expensive path. Inline body images: see the `Inline body images` section.
11. **Image dedup (FEATURE — Steps 1-3 path; `poolImages` settled the image).** Per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step.
12. **Content manufacture.** Proceed straight from runbook Step 11 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density).
13. **Create the post** — fires ALONE in its own turn, after Steps 7-12 are complete for the candidate; nothing batches with a create. Via `createSingleImagePost` with the field set in the `BD Blog field reference` section.
14. **Audit summary.** Run METHODOLOGY `Stage 7: Closing reply + JSON receipt`.

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

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. Run source research for that exact topic.

### Shape B — Vertical-derived (no topic provided)

User said "write articles for SEO traffic," "organic search," "viral content," "industry news," "related to a topic," "trending content," or similar — anything that means "you pick the topic." Brainstorm `N` distinctly different topic candidates cached from **Site context discovery**.

**Within-pool diversity — span distinct subjects.** Each candidate must occupy its own sub-theme of the vertical. If two or more share a sub-theme, anchor noun, focus, or subject, regenerate with broader spread before taking #1.

**If user signaled viral/trending intent**, also pull `WebSearch` for trending discussions/news in the vertical (last 30-60 days).

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

---

## Category routing (runbook Step 9)

Per METHODOLOGY `Stage 4: Category routing`. Blogs route via the **category ledger** (written at `Stage 1: Site context` step 3).

User-specified default category in the request → every post in the run goes to that category (must match an existing `feature_categories` value; else route per Stage 4).

---

## Content manufacture (runbook Step 12)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML per **Rule: Post-body formatting**, link policy, image strategy, voice via ANTI-SLOP, self-check. Blog posts additionally follow the per-format and per-section rules in this section.

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

1. **Direct-answer opening paragraph.** First `<p>` answers the headline's implicit question in 40-100 words — in fresh words, never re-typing the title as the first sentence. No throat-clearing ("Here's the thing"), no preamble. The first ~80 words make clear what the article covers and why it matters.
2. **Question-shaped H2s for ~60% of sections.** "What is X?" "How does Y work?" "When should you Z?" — captures long-tail queries and AI-Overview citations. Mix in statement-shaped H2s for variety where natural.
3. **Answer-first paragraph per H2.** Every H2 opens with a 40-60 word direct answer to its implicit question. Then expand with detail, examples, lists.
4. **Paragraph cap: 40-80 words typical, 150 hard max.** Long walls of text fail mobile readability and AI-Overview extraction.
5. **Sentence cap: ~15-20 words typical.** Tighter sentences read cleaner.
6. **List shape per ANTI-SLOP `Bullets rule`.** Numbered for sequence (how-to steps), bulleted for parallel items (listicle entries, comparison criteria).
7. **FAQ block before conclusion.** H2 "Frequently Asked Questions" (or per-language equivalent) with 3-5 H3 questions, each answered in 40-60 words. High AI-citation density per word.
8. **Conclusion 100-150 words.** Advance to a next step or a fresh specific that wasn't in the body — never restate the body's load-bearing answer. Close with ONE internal link riding a sentence the conclusion already needs — never a "go browse X" line.

### Internal-link strategy

Blog posts cite related coverage the way a journalist cites other outlets' pieces — this is where the SEO compounding lives. Links are placed by Stage 5's linking pass onto the finished draft. Budget **5-10 internal links per 2000 words, pro-rated to the post's length (a ~1,000-word post carries 3-5)**; the pass distributes:

| Section | Recommended links |
|---|---|
| Direct-answer opening | 0-1 |
| Body H2 sections | 3-6 spread across sections (1-2 per major section, max) |
| FAQ block | 1-2 (answer text may include a link) |
| Conclusion | 1 (always — riding a sentence the conclusion already needs, never a "go browse X" line) |

**Link targets — all valid for blog posts:**

- **Specific member profile** (Pattern 4): `/<user.filename>` — resolve via `searchUsers` only, and only when the agent has a specific known person to deep-link to. Rows returned by verification calls (dedup, member-count gates) are never link targets. No bulk-listing members.
- **Filtered member directory** (Pattern 6): slug-hierarchy paths by location and/or category — construction + member-count gate per URL-PATTERNS `Pattern 6 — Filtered member directory`.
- **Specific post of any type** (Pattern 1): `/<post_filename>` — a live row this run's dedup or list calls already returned needs no re-lookup; otherwise resolve via title-filtered `listSingleImagePosts` when the agent has a specific known post to deep-link to. No bulk-listing.
- **Post search results of any type** (Pattern 3): `/<post_type_data_filename>?category[]=<cat>&...` — anchor names the category's posts as a subject noun phrase ("winter races in Austin").

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

## BD Blog field reference (runbook Step 13)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, always pass) |
| `data_type` | `20` (single-image classification, always for blogs) |
| `data_id` | resolved blog post-type id from runbook Step 3 |
| `post_title` | per the `Title shape` section — clickbait-flavored, anti-slop, ~70 char target |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length, post_meta_keywords). `post_category`: re-read the **category ledger** line and copy one value from it verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Blog-specific additions and examples:

| Field | Blog-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — direct-answer opening + question H2s + answer-first paragraphs + FAQ + conclusion. Inline body images only when user explicitly requested. |
| `post_meta_title` | Type-specific example: `"Reformer Pilates vs Mat Pilates for Beginners Working Out at Home in a Small Apartment"` — audience qualifier (beginners) + use case (home workouts) + scenario (small apartment) expanded from the shorter `post_title`. |
| `post_meta_description` | Blog-specific flavor: one-sentence value proposition for the decision-stage situation (e.g. "Comparing reformer and mat Pilates for beginners working out at home: calorie burn per 45-minute session, equipment cost, and which style fits a small apartment."). |
| `post_start_date` | Required. The user's future publish datetime if given, else identical to `post_live_date`. `YYYYMMDDHHmmss`, site timezone. |

### Do NOT pass

- `post_expire_date` — events-only.
- `post_venue`, `post_location`, `lat`, `lon`, `country_sn`, `state_sn` — geo fields; blogs do not have a place anchor.
- `auto_geocode` — geo-only; not applicable to blogs.
- `revision_timestamp` — BD-managed.
