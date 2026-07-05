===== FILE: SKILL.md =====

# BD Content Skill: Multi-type content creation for Brilliant Directories sites

## What this skill does

Create content posts on a Brilliant Directories (BD) site. Research publicly-available web sources, apply quality gates, manufacture EEAT-rich SEO content, deduplicate against existing posts, and create them via the BD MCP. Works for events, jobs, properties, blog articles.

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
| Property listings (real estate) | Not yet available. Tell the user this content type is coming in a future release. |
| Something else | Ask the user to clarify which content type from this table their request maps to. |

If the user's intent is ambiguous, ask. If they say "create some posts" with no content type, ask which type.

## Top-to-bottom run protocol

The universal protocol in `shared/METHODOLOGY.md` sets the framework; the content-type file in `content-types/` lays out the end-to-end runbook for that type.

The user can invoke this skill with as little as a one-sentence goal ("create posts on my site"). The skill should:

1. Confirm the content type if not clear.
2. Detect mode (interactive vs autonomous — interactive if the user is in this chat).
3. Run the content-type runbook end-to-end without prompting unless genuinely ambiguous.

**Hard gate, every post type:** image dedup per corpus `Rule: Image dedup` MUST execute its `list*` call before any `create*Post` write. Never claim-without-executing.

## Required preconditions

Before running, confirm the user has a BD site URL connected to their MCP (check by calling `mcp__brilliant-directories__getSiteInfo` — if it returns a site, the connection works). The content-type file then verifies any per-type post-type requirements during its discovery step.

If `getSiteInfo` returns no site or errors out, tell the user the MCP isn't connected to a BD site and link them to https://brilliantmcp.com setup instructions.

## What this skill does NOT do

- Property content type (coming in a future release)
- Editing existing posts (only creates new ones)
- Auto-creating BD categories in autonomous mode
- Auto-publishing in autonomous mode (drafts only unless the user explicitly authorizes live publishing)
- Calling paid third-party services
- Bypassing source ToS, robots.txt, paywalls, or auth walls
- Any action outside the target post type (no member writes, no site config changes, no theme edits)

## Output guarantees

Every run ends with a brief summary listing what was created — title, `post_id`, admin edit URL per post. Customers can review and delete anything they don't want via the relevant `delete*` tool for the post type. Internal process details (candidates probed, gates failed, retries) stay out of the user-facing summary.

===== FILE: shared/METHODOLOGY.md =====

# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. The content-type file (`content-types/<type>.md`, routed to by `SKILL.md`) layers in type-specific details.

## Mode detection (first step)

`--autonomous` flag absent → interactive (ask user when stuck). Present → autonomous (no prompts; safer-side defaults).

**Both modes: under-produce correct > over-produce wrong. When in doubt, skip.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation. Informs vertical alignment, category routing, anchor-text choices, and internal-link inventory.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone, brand.
2. `listTopCategories limit=25` → **sample only, for site-flavor signal.** These are the categories actual site members are assigned to (e.g. "Personal Training", "Group Fitness") — NOT post-type categories. Real sites can have 100s of rows; 25 is enough to read the vertical. Do NOT use these for post category routing — post categories come from the resolved post type's `feature_categories` field (step 3).
3. `listPostTypes` → the content-type file provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`. The cached `feature_categories` is the authoritative list for post-category routing.
4. **Menu discovery — two phases, both mandatory.**

   **Phase 4a (find menus):** `listMenus` four times in sequence — `property=menu_name property_value=main% property_operator=like`, then `top%`, then `header%`, then `footer%`. Collect every `menu_id` from every match.

   **Phase 4b (fetch items — REQUIRED for each `menu_id` collected in 4a):** `listMenuItems property=menu_id property_value=<id> property_operator=eq`. Cache `{menu_name → menu_link}` from the items as internal-link candidates.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Autonomous: infer location from `primary_country`, vertical from site info and categories. Publish status defaults to draft unless the user's routine prompt explicitly authorized publishing live. Interactive question order is per-type — see the content-type file.

**Member-city targeting — NEVER bulk-list members to discover their cities.** Only fires when the user's prompt explicitly targets by member coverage ("cities where I have members," "places members are based," "areas we cover"). Use `listCities` — BD auto-seeds it on every member signup, so it surfaces exactly the cities where members exist. Lean response (`city_ln`, `city_filename`, `state_sn`, `country_sn`).

### Author resolution (universal pattern)

Resolve the `user_id` that authors the post.

1. **User pre-specified `user_id` (or `author_id`) in the request →** use it, SKIP discovery entirely.

2. **Interactive (user in chat, no pre-specified author; autonomous mode → skip to 3) →** ask "Which member should author post? Provide a name, email, or user_id." Resolve via `searchUsers` or `listUsers property=email property_value=<email> property_operator=eq`. Confirm back to the user before proceeding.

3. **Autonomous (no chat, no pre-specified author) →** copy the editorial pattern already on the site. Read the most recent post of this type and reuse its `user_id`:
    ```
    listSingleImagePosts property=data_id property_value=<resolved data_id> property_operator=eq order_column=revision_timestamp order_type=desc limit=1
    ```
    (For multi-image post types where `data_type=4`, substitute `listMultiImagePosts`.) Use the returned row's `user_id`.

4. **Fallback A** (zero existing posts of this type on the site) → find a member whose subscription plan is authorized to publish this post type:
    1. `listMembershipPlans limit=25` — lean default returns `subscription_id`, `subscription_name`, `data_settings`, and 7 other identity/pricing fields. `data_settings` is a CSV of post-type IDs the plan can publish (e.g. `"4,2,1,15,8,10,0"`).
    2. Client-side filter: keep plans where `data_settings.split(',').includes(<resolved data_id>)` — these are the subscription_ids authorized to publish this post type.
    3. `listUsers property=subscription_id property_value=<comma_separated_matched_ids> property_operator=in order_column=user_id order_type=asc limit=1` — returns the lowest-user_id eligible author (oldest member with permission). Server-side filter + sort; lean response.

5. **Fallback B** (zero matched plans OR zero eligible users) → use `user_id=0`.

### Candidate pool discipline (universal pattern)

When brainstorming a pool of candidates (topics, events, jobs, properties, anything the agent picks from for the user) — emit the full numbered 1-N pool as a visible list before researching any single candidate in depth. Research to discover candidates is fine; deep per-candidate research before the full pool exists is not. Interactive: surface the list, user picks. Autonomous: take #1, on failure drop it and take the next un-tried. Do NOT regenerate until all are tried. If all fail, generate pool 2 — distinctly different from pool 1, no variations. If pool 2 also fully fails, exit with audit.

**Failure** = dedup hit, source-research can't substantiate, required-field gate misses, or any other condition that blocks the candidate from progressing to post creation.

Per-type runbooks specify the pool size (`N`) and the brainstorm shape.

## Stage 2: Duplicate detection

Run BEFORE source research — a dupe drops for the cost of the dedup queries, not a wasted research cycle. Per-candidate scoped query — never bulk-list a site's existing posts (token-budget blowup).

**BD's `like` supports single-anchor wildcards only** — use `X%` (starts-with) or `%X` (ends-with). NEVER bidirectional `%X%` — BD's WAF strips one `%` and the query silently returns wrong results.

For each candidate, run THREE scoped queries against the relevant `list*` tool to catch overlaps from both ends of the title:

- **Title prefix:** `listSingleImagePosts property=post_title property_operator=like property_value=<first-3-distinctive-words>% limit=3` — catches titles with the same opening phrase.
- **Topic keyword (starts-with):** `listSingleImagePosts property=post_title property_operator=like property_value=<core-topic-noun>% limit=3` — catches titles that lead with the core noun.
- **Topic keyword (ends-with):** `listSingleImagePosts property=post_title property_operator=like property_value=%<core-topic-noun> limit=3` — catches titles ending with the core noun (e.g. "How to Pick a Personal Trainer" vs "How to Choose a Personal Trainer" share zero first-3-words but both end with `personal trainer`).

`limit=3` is a hard ceiling — never bump it, never run a fourth query. Merge results client-side. Substitute the `list*` tool that matches the post-type family. Pick the right 3 distinctive words and the right core noun once — do NOT brute-force variants.

**Scope to the resolved post type, client-side.** The three `like` queries above return rows across all single-image post types. After merging, FILTER to `row.data_id === <resolved data_id>` before semantic comparison — cross-type title overlaps would otherwise false-positive as duplicates.

**"Distinctive" means: the first 3 words that meaningfully fingerprint THIS candidate.** If the title starts with throwaway leaders that don't uniquely identify it — articles (`The`), years (`2026`), ordinals (`5th`, `Annual`, `Inaugural`) — skip them and pick the next 3 words that do. Example: `"The 5th Annual Austin Tech Summit"` → use `Austin Tech Summit%`, not `The 5th Annual%`.

The content-type file specifies match criteria (semantic title overlap, date tolerance if applicable, location if applicable).

**On match → drop candidate per `Candidate pool discipline (universal pattern)`.** Don't repaint with a tweaked title or "refined angle" — same core topic = same candidate. Drop it. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.

Always SKIP existing records — no auto-edit of live posts.

## Stage 3: Source research

**2a.** Brainstorm 5-10 candidate sources for vertical+location. The content-type file provides candidate categories. Be specific (real domain names, not "some sites").

**2b.** `WebSearch site:<domain> <keywords> <location>` per candidate. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:

| Gate | Rule |
|---|---|
| Date sanity | Primary date > today AND < today+window. Window defaults to 90 days unless the user specifies otherwise (via `--window=<N>` or in their request). Past/year-only/quarter-only fails. |
| SPA / empty | <500 chars of meaningful text OR script-shell page → skip. |
| Required fields | The content-type file specifies. Missing any → skip. No synthesis. |
| Confidence | Self-rate 1-10. Score = degree to which required fields are unambiguous and source-grounded. Auto: <8 skip, ≥8 use. Interactive: 6-7 flag for user, <6 always skip, ≥8 use without flagging. |
| Source credibility | Gov/association/university/established trade = high (1 source OK). Random blog/aggregator = low (autonomous needs 2-source confirmation). |
| URL liveness | Every URL the post links to must be verified before publish per `URL liveness gate`. |

**2d.** Cross-reference: 2 sources confirm → merge details, boost confidence.

**2e.** Stop at ~10-20 verified records or no new candidates.

### URL liveness gate

Every URL the post will link to must be verified live before publish. Three outcomes by `WebFetch` response:

- **HTTP 200 with real body content** → use. (200 with "page not found" / "error" body text is a soft-404 — treat as dead.)
- **404 / DNS fail** → drop the link, or skip the record entirely if it's the primary action URL.
- **403 / 401 / 429 / timeout / WAF block** → **UNKNOWN, not verified.** A CDN is blocking the bot UA, not proof the page is dead. Never ship on the rationalization that it's "probably live." Confirm the exact URL string in 2+ Google-indexed results from separate domains before using; otherwise drop.

**Third-party-sourced URLs** (aggregator, secondary listing) always require independent verification — never trust the third party's link as-is. Apply the same three-outcome decision tree above.

## Stage 4: Category routing

Interactive: ask user when ambiguous. Autonomous: fuzzy-match source category vs BD `feature_categories`. ≥70% confidence → use match. <70% → SKIP the record (do NOT auto-create categories).

The content-type file may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that competes for long-tail queries the source's thin listing doesn't target. Better depth, real internal-linking, structured info, honest source-grounded content. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different.

### Required outcomes (any structure achieves these)

Good posts leave the reader genuinely informed: core facts, practical considerations, useful context, honest comparisons, deeper insights on the location/category/focus where the source supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (tighter when the source is thin, expanded when source data + confident knowledge support more).

1. **Load-bearing facts up front.** A reader can answer the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it") within the first intro paragraph. The content-type file specifies which facts are load-bearing for the data type.
2. **Every claim source-supported.** No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because the source is thin is fine; short because you skipped multi-angle context, comparison, useful perspective, or related information the source supports is not.
3. **External source citations: 1-4 per post, only AFTER the first 1-2 internal links per `Link order`.** Cite static destinations only — a specific article, abstract, or official page, never a search-results/query URL (`?term=`, `?q=`, `search?`, tag/archive indexes). Link authoritative sources (industry publications, official event/venue/registration pages, governing-body sites) naturally in flowing prose with `rel="nofollow" target="_blank"` — no forced "Source: X" footer. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
4. **Internal links to relevant on-site content** — use URL-PATTERNS.md Pattern 1 (specific post URLs), Pattern 2 (post-type main page `/<data_filename>`), or Pattern 3 (filtered listing URLs by category/location/date). Weave them inline within body prose where they read naturally — not in a dedicated trailing "More X in Y" section. Anchor text reads as part of a sentence (the linked phrase is a noun or noun-phrase that belongs in the surrounding sentence), not as a standalone CTA. Never fabricate URLs. If no target exists, omit the link.
5. **External links to sources, ticket/registration vendors, official pages** — with `rel="nofollow" target="_blank"`.
6. **Reach for these depth dimensions where they fit the post type and don't require fabrication** — they separate a republished listing from a destination page. Include each where source data + confident knowledge support it honestly; omit any that would require guessing, padding, or stretching.
   - **What to expect** — sensory + situational detail before the reader decides to engage.
   - **Who this is for / who it's not for** — skill level, audience fit, accessibility, life stage.
   - **Practical considerations** — first-time/day-of detail rarely on the source page: prerequisites, logistics, pitfalls, exclusions, hidden costs, timing.
   - **Comparable anchors** — neutral orientation against something familiar ("similar to X but Y").
   - **Historical / community context** — provenance, longevity, lineage, reputation.
   - **Local context** — neighborhood character, nearby amenities, transit/access. Skip when the post type has no place anchor.
   - **Industry insight / players** — peers, alternatives, category leaders, where this one sits in the landscape.
   - **Positive comparison** — favorable positioning with a specific honest reason ("best choice for someone who wants Z"). Never puffery.

### Froala HTML safety

Follow Froala safety rules from the MCP corpus (`mcp/openapi/mcp-instructions.md`, loaded with every MCP tool). Skip `<h1>` — reserved for the post title field. **Always open `post_content` with `<p>` intro paragraph(s); never start with `<h2>` or any heading.** `post_content` is reader-facing only — never include HTML comments, source notes, machine-readable metadata, or skill-run identifiers.

### Link policy (strict)

Classify every `<a>` tag by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |

Full `title=` requirement + composition examples in URL-PATTERNS.

### Link order (universal — internal first, external later)

1. **First 1-2 links the reader hits** — must be internal links only (on-site pages, member search, related posts).
2. **After the first 1-2 internal links**, external citations mix in among the continuing internal links — internals keep flowing per the content-type budget, externals sprinkled through later sections, never two in the same or consecutive sentences, never clustered in one footer block.
3. **Unique href per post.** No URL repeats. If two anchors would target the same URL, re-derive one under a different Pattern (1-6); drop only if no Pattern variant fits.

**Short posts exception rule:** posts under ~500 words may carry fewer total links than the per-type floor. Under-link beats stuffed.

### Image strategy

Use Pexels for all images. After all 10 axes attempted without a commit, omit `post_image`. Omitting is the last resort.

**Memory scope on image inventory:** memory may flag prior axes as exhausted for `<topic>`, but every run still attempts all 10 axes fresh in the table-defined order. Stock-photo inventories change daily, so a saturation verdict from a prior run is treated as a hint, not a verdict.

1. **Pexels** — follow corpus `Rule: Image URLs` exactly. Always send to BD with `auto_image_import=1`.

   **Axes — 10 angles, try in order, one search per axis.**

   Each search phrase must carry a topical anchor — a vertical-specific word that ties the photo to the topic.

   | Axis | Why | Cafe blog: "choosing an espresso machine" | Web design blog: "button color trends" |
   |---|---|---|---|
   | 1. Subject + state (default) | The thing in its defining state | `barista pouring` / `barista pouring coffee` | `colorful buttons` / `modern ui buttons` |
   | 2. People + adjacent action | Same audience, related verb | `barista cleaning` / `barista weighing beans` | `designer sketching` / `designer choosing colors` |
   | 3. Detail / object close-up | A topical **prop or equipment** shot, no people | `portafilter shot` / `espresso shot pour` | `button mockup` / `colorful interface element` |
   | 4. Setting + topical marker | Topical location, named | `coffee shop` / `coffee shop bar` | `design studio` / `ui designer desk` |
   | 5. Adjacent activity / item | Related thing, different action | `latte art` / `coffee bean grinder` | `color swatch` / `figma wireframe sketch` |
   | 6. Result / outcome | The finished artifact, static, no process | `latte cup` / `finished espresso drink` | `finished website` / `launched landing page` |
   | 7. Process step / intermediate stage | A pre- or transitional workflow moment, not the headline action | `coffee beans roasting` / `tamping grounds` | `wireframe sketches` / `mood board layout` |
   | 8. Materials / raw inputs | Ingredients or textures before they become the subject | `coffee beans` / `roasted coffee` | `color palette` / `font samples` |
   | 9. Customer / recipient POV | The consumer side, not the practitioner | `customer drinking coffee` / `person ordering coffee` | `user browsing phone` / `person reading website` |
   | 10. Hands / body-part isolation | Symbolic close-up, hands as stand-in, no faces | `hands holding cup` / `hands pouring coffee` | `hands typing keyboard` / `hands sketching design` |

   **Comparison-shape posts ("X vs Y"):** Axes 3-10 must cover BOTH halves of the comparison, not just the primary subject. For "espresso vs pour-over" the prop axis needs items from both methods; for "React vs Vue" the setting axis needs developers using both stacks.

   **One search per axis.** If the first search returns weak or dedup'd candidates, SWITCH to the next axis. Do not retry the same axis with a different wording — that drift ("let me try axis 2 with one more phrase") is the most common axis-discipline failure.

   **Per-axis loop — repeat for each axis until commit or all 10 axes attempted:**

   **`searchStockImage` available → it replaces Steps 1, 3, and 4** (`query` = the axis phrase, `orientation=landscape`): apply Step 2's topic-fit gate to the returned descriptions and Step 5's dedup to the survivors' URLs.

   **Step 1 — Search construction.** `WebSearch query="site:pexels.com/photo <axis phrase>"` using the current axis's phrase per the **Axes** table. NOT `site:pexels.com/search` (403 on agent runtime). NOT `wide`/`landscape`/`horizontal` (Pexels indexes those as title/tag terms, not orientation). **2-3 words. Every word must carry topic information** — no filler ("the", "a"), no redundant adjectives, no contradictions. 2 words when the noun is already specific (`"pilates reformer"` — "reformer" disambiguates); 3 words when the noun is ambiguous (`"pasta plate restaurant"` — bare "pasta plate" returns dishware). 1 word is banned (pure noise pool).
   - Cross-vertical examples: ✓ `"fitness race competition"` (3, events/sport), ✓ `"professional conference audience"` (3, events/corporate), ✓ `"pilates reformer"` (2, blog/fitness — already specific), ✗ `"beautiful red pasta"` ("beautiful" is filler), ✗ `"plate"` (banned).
   - If results return mostly `/search/` URLs instead of `/photo/<slug>-<id>/`, treat as zero topic-fits → switch to the next axis.
   - **Axis-duplicate guard.** If an axis search returns only `/photo/<id>/` URLs already seen in a prior axis, that axis didn't generate fresh candidates — log it as a wasted axis and move to the next. Do not re-probe the same images with `getImageDimensions`. Widen vocabulary on the next axis instead of reusing the same search space.

   **Step 2 — Topic-fit gate** (identify every strong topic-fit from the ~10 results — up to 10):
   - Title must align with the spirit of the post's primary topic. Sharing one keyword is not enough. Wrong vertical (karate for a judo post) always fails.
   - **Broad-aesthetic topics** (fitness, food, real estate, design, etc.) — any photo within the category aesthetic counts as topic-fit. Don't demand niche-specific props (sled, kettlebell) when category-aesthetic shots (athlete running, athlete lifting) work.
   - Generic titles or wrong-context matches fail. `WebFetch` the `/photo/<slug>-<id>/` detail page when the title is ambiguous, or skip the candidate.
   - Title keyword salads (4+ unrelated nouns, e.g. `"People Rope Sport Rustic"`) are inherently ambiguous — WebFetch verify or skip; never commit on the assumption the title describes the image.
   - **If zero strong topic-fits in this pool → switch to the next axis.**

   **Step 3 — Extension filter (before any tool call).** Only consider candidate URLs ending in `.jpg`, `.jpeg`, or `.png` (case-insensitive). If a Pexels page only resolves to `.webp` / `.gif` / `.avif` / anything else, skip it. Move to the next candidate.

   **Step 4 — Dimension check (batch in parallel).** For the surviving JPG/JPEG/PNG topic-fits (up to 10), construct each canonical URL `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg` and call `getImageDimensions` on all of them. Per candidate:
   - **status=success + `orientation === "landscape"`** → landscape survivor, proceed to dedup.
   - **status=success + portrait OR square** → drop.
   - **status=error** (404, timeout, parse fail, "unsupported image format") → drop.
   - **If zero landscape survivors → switch to the next axis.**

   **Step 5 — Dedup (one batched call via `in` CSV).** Run corpus `Rule: Image dedup` — one `list*` call (matching the write tool) with `property=original_image_url`, `property_value=<URL1,URL2,...,URLN>` (up to 10), `property_operator=in`. Response rows include `original_image_url` and `post_title`. Before committing, walk survivors in Step 4 output order and apply per candidate:
   - **URL in the response** → candidate is a URL-dupe; drop it, try the next survivor.
   - **`post_title` semantic-matches the candidate's topic** → drop candidate per **Candidate pool discipline (universal pattern)**. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.
   - **Neither hit** → commit this URL as `post_image`.
   - **If every survivor drops → switch to the next axis.**
2. **Omit `post_image`** entirely.

**Multiple inline body images** (`post_content`, `group_desc`). Long-form posts (blogs especially) often weave 2-5 inline body images alongside the feature image. Each inline image goes through corpus `Rule: Image URLs` Pexels sourcing workflow. **Dedup scope:** corpus `Rule: Image dedup` applies to the feature image only. Inline body URLs require intra-post uniqueness — no URL repeats within the post, no body URL equals the feature URL. Inline body images are NOT checked against other posts site-wide.

### Voice

Every word goes through `ANTI-SLOP.md`. Mandatory before posting.

### Self-check before posting

Scan the assembled body. Fix anything that fires:
- Any en/em-dash outside code? Rewrite.
- Throat-clearing opener? Cut.
- Unsourced claim presented as fact? Cite or rewrite.
- Internal link with `rel="nofollow"` or `target="_blank"`? Strip those attributes.
- External link missing `rel="nofollow" target="_blank"`? Add.
- Citation on a search/query URL? Replace with the static source page, or drop.
- Anchor over 5 words? Tighten; move the description to `title`.
- Same href twice? Re-derive one under a different Pattern; drop only if none fits.
- Section present without source data to support it? Remove.
- Any fabricated detail? Remove.
- Does the body open with `<p>` intro paragraph(s)? It must — never start with `<h2>` or any heading.
- Are H2 headings marking topic shifts, not fact transitions? Each H2 introduces meaningfully different content. Vary section length naturally — some sections one paragraph, some several, some with a bulleted list. Do NOT trim source-supported depth just to keep sections compact.
- Are all headings (H2 and H3) in **title case**, not sentence case? `"Where to Fly a Kite"`, not `"Where to fly a kite"`.
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is reader-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.
- Pexels image picked: does the search-result title name the post's primary subject AND match its defining context (activity vs generic scene, urban vs trail, indoor vs outdoor, season, beginner vs elite, etc.)? Generic title or wrong-context match = re-pick or WebFetch verify.

## Universal post fields

Field rules that apply across ALL post types via `createSingleImagePost` (and `createMultiImagePost`). Content-type files reference these universally and add only type-specific examples or additions.

| Field | Rule |
|---|---|
| `post_image` | Feature image URL per Stage 5 image strategy. Pass `auto_image_import=1` for external images. Pexels via `Rule: Image URLs`, or omit. |
| `post_category` | Best-matched category name, verbatim from the resolved post type's `feature_categories`. No fabrication. Skip if no ≥70% confidence match (autonomous mode). |
| `post_meta_title` | SEO `<title>` tag, ~80-120 chars. Expand on `post_title` with long-tail keyword modifiers — audience qualifier, geographic context, use case, related terms — that didn't fit the title's tight cap. The content-type file gives type-specific examples. |
| `post_meta_description` | SEO meta description, ~150-160 chars. One-sentence value proposition. Not a verbatim repeat of `post_title`. The content-type file adds type-specific flavor (events: include date + city; blogs: value proposition for the reader's situation). |
| `post_meta_keywords` | Pass the same exact CSV value as `post_tags`. |
| `post_live_date` | Required on every create: the current UTC datetime converted to `getSiteInfo.timezone`, `YYYYMMDDHHmmss` (14 digits). |

## Tags

Universal `post_tags` field constraints — applies to ALL post types (single-image and multi-image alike):

- **Format:** comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`).
- **Hard 100-char total cap on the CSV.** BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.
- **Strategy:** aim for ~6 tags per post — roughly 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short, don't join words with hyphens. The content-type file may refine tag emphasis for the type (e.g. blogs may favor topical keywords over location).
- **Tags live ONLY in the post's `post_tags` field.** Do NOT call `listTags`, `createTag`, or any Tags-resource tool — those manage a separate global tag taxonomy unrelated to per-post `post_tags`.
- **Also pass the same CSV to `post_meta_keywords`.**

## Stage 6: Post creation

Call per-type `create*` tool with assembled fields. Pace BD writes ~600ms apart. On failure: continue to next record. Do not retry blindly.

## Stage 7: Audit summary (always printed)

Brief. Customer-facing receipt of deliverables — what got created, where to find it. Do NOT narrate the process (candidates probed, gates failed, retries, geocode tier landed). That's internal noise; the customer cares about results.

**`<admin_edit_url>` verbatim shape — DO NOT paraphrase:** `https://ww2.managemydirectory.com/admin/viewPosts.php?search[value]=<post_id>&data_type=<data_type>&data_id=<data_id>&newsite=<website_id>`. Host fixed. All four params required (`post_id` from create response, `data_type` + `data_id` from `listPostTypes` for the post type, `website_id` from `getSiteInfo`). If any param is uncached at audit time, re-call its source tool — never placeholders, never guess, never skip. Full rule in corpus `Rule: Post admin URLs`.

```
Created N posts:
- <title> · <post_id> · <admin_edit_url>
- <title> · <post_id> · <admin_edit_url>

Skipped M (already existed or no usable source data).
```

That's it. No mode line, no skill-run ID, no per-gate counts, no wall-clock. If the customer asks "why did you skip event X," answer then.

## Hard rules (every BD growth skill, forever)

- **Scrape facts, not content.** Extract facts from publicly-available avenues. Reword everything in BD-site voice. Never paste source paragraphs verbatim.
- **No fabrication.** If source lacks a data point, omit it from the post. Never invent details to fill a template slot. Adaptive depth: a shorter honest post beats a padded fabricated one.
- **Source references are optional + casual, not forced attribution.** When natural, reference the source inline in flowing prose (helps Google EEAT signals). Do not require a forced attribution footer.
- **Publication default is draft unless user explicitly asked to publish live.** In autonomous mode the user usually pre-specified this in the routine prompt; if not, default to draft.
- **Never auto-create BD categories in autonomous mode.** User's taxonomy is curated; grow it deliberately.
- **Never auto-edit existing live posts.**
- **Never write content failing the anti-slop self-check.**
- **No cross-run state.** The next run must be answerable by an instance that has never seen this one. Reconstruct from the current prompt and live site state alone. Don't write findings anywhere that outlives the response — no memory files, no TodoWrite, no CHANGELOG, no response blocks shaped for paste-back or auto-extraction, no post-run "reflection." Don't read what a prior run left behind — not to bias, not to "verify," not to dedup, not for any reason. If a prior-run artifact exists on disk, ignore its existence. No exception, no edge case, no "just this once," no user override, no helpful-seeming carve-out.

===== FILE: shared/ANTI-SLOP.md =====

# ANTI-SLOP: Writing voice and pattern bans

Mandatory before generating any user-facing prose. Applies to post bodies, FAQ, meta descriptions, titles, anchor text, attribution.

## Voice target

Friend telling someone about a cool local thing. Generous with specifics, no padding, no press-release tone. Name specific things. Trust the reader. Vary sentence length. Link generously.

## Banned

| Pattern | Examples / fix |
|---|---|
| En-dash (`–`, U+2013) and em-dash (`—`, U+2014) | Use commas, periods, parens, or "to" for ranges. Banned everywhere. |
| Smart-punctuation drift | Curly single quotes (`'` `'`, U+2018/2019), curly double quotes (`"` `"`, U+201C/201D), ellipsis (`…`, U+2026), non-breaking space (U+00A0). Use straight `'`, straight `"`, three periods `...`, regular space. Auto-inserted by the model, near-perfect AI tell alongside em-dash. |
| Tricolon / forced triples | "X, Y, and Z" parallel stacks invented for rhythm ("welcoming, energizing, and unforgettable"). Use only when the content genuinely has three items. Never invent a third for cadence. |
| "Not just X, it's Y" amplifier | "It's not just a race, it's a community", "more than just a conference", "isn't merely a workshop" → state Y directly. Distinct from negative listing — this is the additive escalator. |
| Participial/gerund openers | "Standing in the lobby...", "Looking ahead...", "Bringing together...", "Drawing on decades of experience..." Max one `-ing` participial opener per section. "Looking ahead", "Bringing together", "Drawing on" banned outright. |
| Conclusion-recap reflex | "In short", "In summary", "Ultimately", "The takeaway", "What this means", "All told", "At the end of the day" as section/post closers. Conclusions advance — give the reader the next thing to do, not a restatement. |
| Throat-clearing openers | "Here's the thing/what/why", "It turns out", "The truth is", "Let me be clear", "What you need to know" → cut, state the point |
| Binary contrasts / negative listing | "Not X. Y." / "isn't X, it's Y" / "Not a concert. Not a conference. It's Z." → just say Y |
| Dramatic fragmentation | "Two days. Two stages. That's it." → combine into a real sentence |
| Rhetorical setups | "What if I told you...", "Think about it:", "Here's what I mean:", Wh- sentence-starters in prose → restructure. **Exempt: FAQ question labels** ("When is...?", "Where does...?", "How much...?") — those are structural Q&A, not prose openers. |
| Inanimate as actor | "decisions emerge", "data tells us", "markets reward", "culture shifts" → name the human |
| Passive voice | "was created", "is believed", "mistakes were made" → name the actor |
| Adverb crutches | really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, interestingly, importantly, crucially, ultimately → delete |
| Business jargon | navigate, unpack, lean into, deep dive, double down, circle back, take a step back, moving forward, at its core, at the end of the day, when it comes to, in today's landscape, game-changer → plain language |
| Vocabulary fingerprints | delve, showcase, leverage, harness, elevate, empower, unlock, foster, vibrant, bustling, stunning, breathtaking, nestled, rich tapestry, treasure trove → replace with a concrete verb or adjective tied to the specific subject. Highest-signal single-word AI tells in 2026 detectors. |
| Scene-setting openers | "Picture this:", "Imagine", "It's a crisp morning in...", "The smell of [X] fills the air..." → state the article's subject directly. No asking the reader to visualize before getting to the point. |
| Performative emphasis | "Let that sink in", "Make no mistake", "Full stop", "Period.", "And that's okay" → cut |
| Vague declaratives | "significant", "important", "the implications are", "the stakes are" without naming the specific thing → name it |
| Telling not showing | "this is incredibly difficult", "this is what leadership looks like" → demonstrate with specifics |
| Fabricated authority | "studies show", "experts agree", "research suggests", "PubMed-indexed studies" without citation → link a specific static source or rewrite as opinion |
| Formulaic attribution | "[Org] says/notes/describes..." as the sentence opener for every citation → state the fact in your own sentence with the source linked mid- or end-sentence; max one speech-verb opener per post |
| Lazy extremes | every, always, never, everyone, nobody without specifics → use real numbers or "most"/"many"/"few" |
| Site self-reference | "on this site", "the site's X", "our directory", "our members", sentences that exist only to deliver a link → write as a publication about the subject, not about the website; the sentence must survive with the link removed |

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
16. Sentence names the site ("this site", "our directory") or exists only to carry a link? Rewrite about the subject; the sentence must survive with the link removed.

## Scoring (rate 1-10, ship if ≥40/50)

| Dimension | Question |
|---|---|
| Directness | Statements or announcements? |
| Rhythm | Varied sentence length, or metronomic? |
| Trust | Respects reader intelligence, no over-explaining? |
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
| 1 | Specific post | `/<post_filename>` | BD stores the data_filename prefix AS PART OF `post_filename` (e.g., `events/austin-tech-summit-2026`). Use verbatim with `/` prefix. |
| 2 | Post type main listing | `/<data_filename>` | From the cached `data_filename` on the resolved post type (already in agent memory from site context). Varies per site (`/events`, `/calendar`, etc.). |
| 3 | Filtered listing | `/<data_filename>?<filters>` | See the `Pattern 3 filter params` section. |
| 4 | Specific member profile | `/<user.filename>` | Resolve via `searchUsers` only — its results mirror the public member search, so the target is publicly findable. A member surfaced any other way passes only via the searchable-plan check in corpus **Rule: Filter by ID** (`searchable=1` AND `search_membership_permissions` contains `visitor`). Never `/listing/<id>`. |
| 5 | Member directory landing — entire directory | `/<getSiteInfo.main_directory_url_relative>` | The site's own directory landing (`search` on some sites, `search_results` on others), cached from the run's `getSiteInfo` call. Links to the entire directory of members with no location or category filter applied. Use when no category or location qualifier fits the sentence. Anchor text names who the reader finds there ("certified personal trainers"), never site furniture ("member directory," "browse listings"). **Takes NO query parameters** — appending `?category[]=...` or `?lat=...` does not work; Pattern 3's filter params apply to POST listings only, never to the member directory. For filtered member directory links, use Pattern 6 below. |
| 6 | Member directory — filtered by location and/or category | `/<slug-hierarchy>` | Slug-hierarchy URL that narrows the member directory by category and/or location (e.g. `/california/los-angeles/personal-trainer`). See the `Pattern 6 — Filtered member directory` section below for the full construction recipe. |

WebPage-backed link patterns (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) are OUT OF SCOPE for content-creation skills — those require `listWebPages` discovery and belong to the future `/bd:seo` skill. Pattern 6 slug-hierarchy URLs are NOT in this category — BD's dynamic router resolves them natively, no WebPage lookup needed.

## Pattern 3 filter params (universal, every post type)

| Param | Format | Notes |
|---|---|---|
| `q` | `q=keyword` | Keyword search. Tags filter via `q=` (no dedicated tag param). |
| `category[]` | `category[]=Category%20Name` | Repeat for multi-category. Skill defaults to single-category. |
| `daterange` | `daterange=mm%2Fdd%2Fyyyy+-+mm%2Fdd%2Fyyyy` | Single-day = same date both sides. |
| `lat` / `lng` / `location_value` / `location_type` | `lat=46.7534&lng=-92.0681&location_value=Duluth%2C+MN+55802&location_type=locality` | **Send all four together — `location_type` is required even though `lat`/`lng` do the search.** `lat`/`lng` drive the geo radius (implicit default from site settings). `location_value` is the human-readable label that BD writes into the sidebar search-form input. `location_type` toggles the sidebar form's mode (city vs ZIP) — omit it and BD's URL parser breaks, returning zero results. Use `location_type=locality` for city-level (default for content-skill links). Use `location_type=postal_code` for ZIP-radius filtering on sites where the city is too broad (e.g. dense metros). Use the post's `post_location` string for `location_value` regardless of mode. |

## Encoding rules

1. Spaces in `category[]`: `%20`, NOT `+` (BD strips `+`).
2. Slashes in `daterange`: `%2F`. `+` inside `daterange` IS the space-around-hyphen separator.
3. Ampersands in category names: URL-encode (`Food%20%26%20Beverage`).
4. Multi-category: repeat `category[]=A&category[]=B`. Default single.
5. **`&` in `href` attributes of HTML-embedded URLs (e.g. inside `post_content`): escape as `&amp;`** per HTML5 spec. Browsers + Froala both accept raw `&` for non-entity sequences, but `?ref=foo&copy=yes` becomes `?ref=foo©=yes` because the parser interprets `&copy` as the copyright entity. The URL examples in this file show URL syntax (raw `&`); when wrapping any URL in `<a href="...">` for `post_content`, output `&amp;` instead.

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
- **Use Pattern 5** when no verifiable category or location fits the sentence. Anchor text still names who the reader finds there ("local personal trainers"), never site furniture ("our directory," "browse trainers").
- **When in doubt, Pattern 5 is the safer default.**

## Internal vs external link attributes

Classify by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |

**`title` attribute required on every `<a>` in post body content** (`post_content`, `group_desc`). Short descriptive phrase (~50-80 chars) of what the link points to — not a duplicate of the anchor text. Example: anchor "certified personal trainers in Boston" → `title="Browse certified personal trainers in Boston by category and specialty"`. Helps screen readers, hover previews, and SEO.

**Anchor text: 2-5 word noun phrase that reads as part of the sentence — internal and external alike.** The longer description belongs in `title`, never in the anchor. Never the target's full title, never generic ("here", "this page").

## Composition examples (substitute `data_filename` for prefix)

```
/events
/events?q=austin
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
- Invent geo params. Only `lat`+`lng`+`location_value`+`location_type` (sent together — `location_type` required) filter by location. `state_sn`, `state`, `country`, `city`, `region`, `zip` as raw query params are NOT supported — BD ignores them and the URL filters nothing. Anchor text must match the URL granularity: if `location_type=locality` (city-level), say the city in the link text; if `location_type=postal_code` (ZIP-level), say the city + ZIP. Do not say "in [State]" or "in [Country]" — state/country are not supported filter modes.
- Build links to WebPage-backed URLs that require `listWebPages` discovery (custom `list_seo` pages with arbitrary slugs, hand-built WebPages) — those are `/bd:seo` territory. **Pattern 6 slug-hierarchy URLs are NOT in this category** — they're constructed from live list-tool lookups, no `listWebPages` call needed.
- Bulk-list existing posts to "see what's available" for internal linking. Pattern 3 URLs are constructed from the current post's own category + location values — no lookup needed.

## Internal-link variety (SEO)

When body copy benefits from internal links to filtered listings, vary the link shape across posts to spread internal-link equity. Per post, pick from: (a) category-only, (b) location-only, (c) category+location combined. 1-3 filtered-listing links per post within the broader internal-link budget set by the content-type file — distributed across intro, middle, and later sections, never clustered at the end. LLM-judged per post; no fixed rotation. Filtered-listing links use Pattern 3 (post listings) or Pattern 6 (member directory) per their respective construction rules. Link order rule (internal first, external later) lives in METHODOLOGY `Link order` subsection.

## Link shape priority (SEO ranking, universal)

When picking which filter combination to link, prefer in this order:

1. **Category + location combo** — highest SEO value. Tightest user intent match. Example for events: same category + same city. Example for jobs: same role + same city. Example for properties: same neighborhood + same property type.
2. **Single-filter category-only** OR **single-filter location-only** — medium value. Use when only one dimension is naturally relevant in the sentence.
3. **Location + daterange** (events only) — strong "what's happening near here that weekend" intent match. Combine with category for the tightest anchor.
4. **Date-range alone** (events only) — lowest. Useful for "other events on this date." Skip for non-time-bound post types.

Combine across posts — every post doesn't need a combo link. Mix (1) and (2) shapes across a multi-post run to spread internal-link equity.

===== FILE: content-types/blog.md =====

# Blog content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create blog post(s). Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a goal like "write blog articles for SEO," "write a viral piece for my industry," or "write an article about XYZ." Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Only make the tool calls each step specifies — no extras.** On per-post failure, continue to the next post.

1. **Mode detection.** Per METHODOLOGY `Mode detection`.
2. **Site context discovery.** Run METHODOLOGY `Stage 1: Site context`.
3. **Post-type discovery.** Run the `Post-type discovery` section.
4. **Author resolution.** Run METHODOLOGY's `Author resolution (universal pattern)` against the resolved `data_id`.
5. **Build the topic pool.** Run the `Topic resolution` section. Pool size `N=5`.
6. **Apply pool discipline.** Apply METHODOLOGY's `Candidate pool discipline (universal pattern)`.
7. **Duplicate detection.** Run METHODOLOGY `Stage 2: Duplicate detection`. Run the `Dedup` section for blog-specific match criteria.
8. **Source research per topic.** Run METHODOLOGY `Stage 3: Source research`. Run the `Source research` section. Land 3-5 source-supported angles BEFORE drafting.
9. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for blog-specific authorization.
10. **Image selection — FEATURE image only at this step.** Run METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` end-to-end: Topic-fit gate → extension filter → `getImageDimensions` orientation gate (landscape only) → dedup. The sequencing rules + retry behavior are defined there; follow them exactly. Lock the feature image first — re-doing body content when an image fails dedup is the expensive path. Inline body images are opt-in only — see the `Inline body images` section.
11. **Image dedup (FEATURE).** Per METHODOLOGY `Stage 5: Content manufacture (universal)` → `Image strategy` dedup step. For blog: `listSingleImagePosts property=original_image_url property_value=<URL1,URL2,URL3> property_operator=in`.
12. **Content manufacture.** Proceed straight from runbook Step 11 — no extra lookups. Follow METHODOLOGY `Stage 5: Content manufacture (universal)`; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density). Inline body images are NOT default; only apply per the `Inline body images` section when the user explicitly requests them.
13. **Create the post** via `createSingleImagePost` with the field set in the `BD Blog field reference` section.
14. **Audit summary.** Run METHODOLOGY `Stage 7: Audit summary`.

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer:

1. **Post-type** (if runbook Step 3 found multiple blog-flavored post-type candidates)
2. **Topic input** ("What's the article about? Or do you want me to suggest topics for SEO traffic in your vertical, or write a piece designed to go viral for your industry?")
3. **Author** — per METHODOLOGY `Author resolution (universal pattern)`
4. **Categories / vertical filter** (if not pre-specified)
5. **Post format** ("How-to, listicle, pillar/comprehensive, news/announcement?" — or autonomous default by topic shape)
6. **Publish vs draft** ("Publish live, or save as drafts for your review?")

Skip any question the user already answered in the original request.

---

## Post-type discovery (runbook Step 3)

Resolve by user intent first, then canonical markers, then semantic match.

1. **User named a post type explicitly** (e.g., "post to my 'Tips for Homeowners' section"). Match the user's phrase against `data_name`, `system_name`, `form_name` on `listPostTypes`. Single confident match wins — skip steps 2-3.

2. **User didn't specify** — try in order, stop at first match. Server-side filter via `listPostTypes` — do NOT `getPostType` per-candidate:
   a. `system_name=website_blog_article` (BD canonical)
   b. `form_name=blog_article_fields` (canonical blog form)
   c. `data_type=20` + semantic match on `data_name`/`system_name` (blog, news, journal, insights, resources, articulo, noticia, nachrichten, artikel)

3. **EXCLUDE from any blog resolution:**
   - `community_article` / `form_name=member_article_fields` — member-written, NOT site-owner blog
   - `coupon`, `soundcloud_post`, `discussion`, `event`, `job_listing` — different content types

**`type_of_feature` is NOT a blog marker.** Reserved for events (`1`), properties (`2`), digital products (`0`). Blogs are `type_of_feature=null`.

**Decision after resolution:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run. Surface clean message, exit. |
| One | Use it. Cache `data_id`, `data_name`, `system_name`, `form_name`. |
| Multiple, interactive | Ask the user. List by data_id + data_name. |
| Multiple, autonomous | If the user pre-specified a post-type id, use it. Else exit with clear audit message. |

User's explicit post-type pick always wins.

---

## Topic resolution (runbook Step 5)

### Shape A — User-specified topic

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. Run source research for that exact topic.

### Shape B — Vertical-derived (user picks no topic)

User said "write articles for SEO traffic," "organic search," "viral content," "industry news," "related to a topic," "trending content," or similar — anything that means "you pick the topic." Brainstorm `N` distinctly different topic candidates cached from **Site context discovery**.

**Within-pool diversity — span distinct subjects.** Each candidate must occupy its own sub-theme of the vertical. If two or more share a sub-theme, anchor noun, focus, or subject, regenerate with broader spread before taking #1.

**If user signaled viral/trending intent**, also pull `WebSearch` for trending discussions/news in the vertical (last 30-60 days).

**Topic bar (Shape B).** Frame each candidate for a non-expert outside the niche while keeping specific qualifiers (audience segment, geographic context, use case, life stage). Compounded specificity, not one. **Specific ≠ jargon** — the qualifier should be a real audience or scenario a reader outside the niche can picture (marathon runner, ACL recovery, desk worker), not insider terminology or acronym strings (mid-cycle loading, conjugate periodization, eccentric utilization ratio, NASM vs ACE vs NSCA). Pivot examples: "TPO vs EPDM Roof Membranes" → "The Best Roofing Materials for Residential Homeowners in Cold Climates". "IRC §179 vs §168(k) Deductions" → "Which 2026 Tax Deductions Save Sole Proprietors the Most?"

**Topic depth (Shape B) — go specific, not safe.** Default LLM move is the broadest possible framing ("How Much Protein to Build Muscle"). That competes against millions of existing articles and ranks for nothing. Go two or three specificity layers deeper on each candidate:

**Bad Broad versus Good Specific — across title shapes** (each row a different shape AND a different vertical — read the broad→specific transformation and the variety of framings, not the topic). Vary the framing across your `N` candidates; do not open all of them with "How"/"What"/"Why".

| Title shape | What it does | Too broad (Bad LLM default) | Good (specific, in that shape) |
|---|---|---|---|
| Imperative | Command, verb-first, promises an outcome | Dog Training Basics | Stop a Rescue Dog From Pulling on Walks in Its First Two Weeks Home |
| How-to | Explicit instruction | Roof Repair Tips | How to Tell If a Hail-Damaged Roof Needs Full Replacement or a Patch |
| Question | Poses the reader's query | Choosing a Lawyer | Do You Need a Lawyer to File for Custody in a No-Fault State? |
| Listicle / number | Counted set | Saving for Retirement | 5 Retirement Accounts a Freelancer Should Open Before Age 40 |
| Declarative / statement | Asserts a claim or truth | Electric Cars | Heat Pumps Are Quietly Replacing the Gas Furnace in Cold Climates |
| Noun-phrase / definitional | Names the subject, no verb | Wedding Photography Ideas | The Real Cost of a Second Shooter for a Full-Day Wedding |
| Comparison / vs | Pits two options against each other | Types of Mattresses | Memory Foam vs Latex for Side Sleepers With Back Pain |
| Guide / explainer | "The complete/beginner's" framing | Houseplant Care | A Beginner's Guide to Keeping Fiddle-Leaf Figs Alive Through Winter |

Specificity layers: audience segment + scenario + format. The qualifiers ARE the specificity — broad reader-appeal framing AND specific qualifiers are not opposites. Each narrows the long-tail query. Broad topics still ship occasionally — but the default is specific.

**Pick qualifiers that match real search intent** — what readers actually query, not a narrowing that sounds clever to a strategist.

**Never bulk-list existing posts to "understand coverage" before picking a topic.** The per-candidate query in the `Dedup` section catches real overlaps; pre-scanning the feed adds nothing and burns reads on sites with hundreds of posts. Pick topics from vertical/category signals (Shape B above), then let dedup do its job at the per-candidate stage.

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

Per METHODOLOGY `Stage 4: Category routing`. Blogs use the post type's `feature_categories` (cached from `Stage 1: Site context`).

Authorization:
- Interactive grant ("yes, create new blog categories") → skill respects for the run.
- User-specified default category in their request → every post in the run goes to that category.

---

## Content manufacture (runbook Step 12)

Follow METHODOLOGY `Stage 5: Content manufacture (universal)`: EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check. Blog posts additionally follow the per-format and per-section rules in this section.

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

1. **Direct-answer opening paragraph.** First `<p>` answers the headline's implicit question in 40-100 words. No throat-clearing ("Here's the thing"), no preamble. Reader knows within ~80 words what they're getting and why.
2. **Question-shaped H2s for ~60% of sections.** "What is X?" "How does Y work?" "When should you Z?" — captures long-tail queries and AI-Overview citations. Mix in statement-shaped H2s for variety where natural.
3. **Answer-first paragraph per H2.** Every H2 opens with a 40-60 word direct answer to its implicit question. Then expand with detail, examples, lists.
4. **Paragraph cap: 40-80 words typical, 150 hard max.** Long walls of text fail mobile readability and AI-Overview extraction.
5. **Sentence cap: ~15-20 words typical.** Tighter sentences read cleaner.
6. **List shape per ANTI-SLOP `Bullets rule`.** Numbered for sequence (how-to steps), bulleted for parallel items (listicle entries, comparison criteria).
7. **FAQ block before conclusion.** H2 "Frequently Asked Questions" (or per-language equivalent) with 3-5 H3 questions, each answered in 40-60 words. High AI-citation density per word.
8. **Conclusion 100-150 words.** Advance the reader to a next step or a fresh specific that wasn't in the body — never restate the body's load-bearing answer. Close with ONE internal link whose href is not yet used in the post. The closing sentence gives the reader a concrete next step and survives with the link removed; the anchor is a noun phrase naming the destination's subject ("marathon training coaches in Austin"), never the website itself.

### Internal-link strategy

Blog posts link broadly across BD resources — this is where the SEO compounding lives. Budget **5-10 internal links per 2000 words**, distributed:

| Section | Recommended links |
|---|---|
| Direct-answer opening | 0-1 |
| Body H2 sections | 3-6 spread across sections (1-2 per major section, max) |
| FAQ block | 1-2 (answer text may include a link) |
| Conclusion | 1 (always — the CTA-shape closer) |

**Link targets — all valid for blog posts:**

- **Specific member profile** (Pattern 4): `/<user.filename>` — resolve via `searchUsers` only, and only when the agent has a specific known person to deep-link to. Rows returned by verification calls (dedup, member-count gates) are never link targets. No bulk-listing members.
- **Member directory landing** (Pattern 5): `/<getSiteInfo.main_directory_url_relative>` — the entire member directory, no filters.
- **Filtered member directory** (Pattern 6): slug-hierarchy paths by location and/or category — construction + member-count gate per URL-PATTERNS `Pattern 6 — Filtered member directory`.
- **Specific post of any type** (Pattern 1): `/<post_filename>` — resolve via title-filtered `listSingleImagePosts` when the agent has a specific known post to deep-link to. No bulk-listing.
- **Post search results of any type** (Pattern 3): `/<post_type_data_filename>?category[]=<cat>&...` — for "more {category} {posts}" style anchors.
- **Post-type main listing** (Pattern 2): `/<data_filename>` — bare listing of all posts of that type.

Pick targets by **contextual relevance to the body sentence**. If the paragraph mentions finding a local pro, link to the member search filtered by the site's relevant category + the city named in the paragraph. If the paragraph references a related concept covered by another article on the site, deep-link to that article via Pattern 1 (but only if the agent has confirmed the article exists). Never fabricate URLs.

**Anchor text:** reads as part of the sentence. The linked phrase is a noun or noun phrase that belongs naturally in the surrounding prose ("certified personal trainers in Boston" not "click here for personal trainers"). Not a standalone CTA in the middle of paragraphs.

### Inline body images

**Opt-in only — do NOT include inline body images by default.** Only apply this section when the user explicitly requests inline images in their prompt (e.g. "with inline images", "include body images", "add photos throughout"). Default blog runs ship with the feature image only — prose carries the post.

When opted in: 1 inline body image per 300-500 words (excluding the feature image). Image float: `class="fr-dib fr-fil img-rounded"` (left) or `class="fr-dib fr-fir img-rounded"` (right) + inline `style="width: 350px;"` on the `<img>`. Source URLs use the retina variant: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=700`. Per corpus `Rule: Post-body formatting`.

**Inline body image dedup (intra-post only):**
- No URL repeats within the same `post_content`.
- No body URL equals the post's own `post_image` (feature) URL.
- NO site-wide dedup on inline body URLs.

Each inline image is sourced via the Pexels workflow (corpus `Rule: Image URLs`). Vary the search topic per image so candidates differ naturally.

### Title shape

Blog titles run different from event titles — clickbait-flavored but anti-slop-disciplined. Pick a shape from the title-shape table in `Topic resolution`; vary the shape across the run rather than defaulting every title to "How"/"What"/"Why".

Caps: ~70 chars where SEO matters (Google truncates title tags around there). Keep punchy. No clickbait that overpromises ("This One Trick Will Change Your Life"). No throat-clearing. No fabricated curiosity. **Single statement only — no `X: Y`, no `X (Y)`, no `X? Y`.**

---

## BD Blog field reference (runbook Step 13)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, kept as insurance; BD doesn't strictly require it but harmless to pass) |
| `data_type` | `20` (single-image classification, always for blogs) |
| `data_id` | resolved blog post-type id from runbook Step 3 |
| `post_title` | per the `Title shape` section — clickbait-flavored, anti-slop, ~70 char target |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `user_id` | resolved author from runbook Step 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_category, post_meta_title length, post_meta_description length). Universal tags rule in **METHODOLOGY `Tags`**. Blog-specific additions and examples below:

| Field | Blog-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — direct-answer opening + question H2s + answer-first paragraphs + FAQ + conclusion. Inline body images only when user explicitly requested. |
| `post_meta_title` | Type-specific example: `"Reformer Pilates vs Mat Pilates for Beginners Working Out at Home in a Small Apartment"` — audience qualifier (beginners) + use case (home workouts) + scenario (small apartment) expanded from the shorter `post_title`. |
| `post_meta_description` | Blog-specific flavor: one-sentence value proposition for the reader's decision-stage situation (e.g. "Comparing reformer and mat Pilates for beginners working out at home: calorie burn per 45-minute session, equipment cost, and which style fits a small apartment."). |
| `post_start_date` | Required. The user's future publish datetime if given, else identical to `post_live_date`. `YYYYMMDDHHmmss`, site timezone. |

### Do NOT pass

- `post_expire_date` — events-only.
- `post_venue`, `post_location`, `lat`, `lon`, `country_sn`, `state_sn` — geo fields; blogs do not have a place anchor.
- `auto_geocode` — geo-only; not applicable to blogs.
- `revision_timestamp` — BD-managed.
