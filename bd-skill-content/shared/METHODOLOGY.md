# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. Per-type SKILL.md layers in type-specific details.

## Mode detection (first step)

`--autonomous` flag absent → interactive (ask user when stuck). Present → autonomous (no prompts; safer-side defaults).

**Both modes: under-produce correct > over-produce wrong. When in doubt, skip.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation. Informs vertical alignment, category routing, anchor-text choices, and internal-link inventory.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone, brand.
2. `listTopCategories limit=25` → **sample only, for site-flavor signal.** These are the categories actual site members are assigned to (e.g. "Personal Training", "Group Fitness") — NOT post-type categories. Real sites can have 100s of rows; 25 is enough to read the vertical. Do NOT use these for post category routing — post categories come from the resolved post type's `feature_categories` field (step 3).
3. `listPostTypes` → per-type SKILL.md provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`. The cached `feature_categories` is the authoritative list for post-category routing.
4. **Menu discovery — two phases, both mandatory.**

   **Phase 4a (find menus):** `listMenus` four times in sequence — `property=menu_name property_value=main% property_operator=like`, then `top%`, then `header%`, then `footer%`. Collect every `menu_id` from every match.

   **Phase 4b (fetch items — REQUIRED for each `menu_id` collected in 4a):** `listMenuItems property=menu_id property_value=<id> property_operator=eq`. Cache `{menu_name → menu_link}` from the items as internal-link candidates.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Autonomous: infer location from `primary_country`, vertical from site info and categories. Publish status defaults to draft unless the user's routine prompt explicitly authorized publishing live. Interactive question order is per-type — see the per-type SKILL.md.

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

Per-type SKILL.md specifies match criteria (semantic title overlap, date tolerance if applicable, location if applicable).

**On match → drop candidate per `Candidate pool discipline (universal pattern)`.** Don't repaint with a tweaked title or "refined angle" — same core topic = same candidate. Drop it. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.

Always SKIP existing records — no auto-edit of live posts.

## Stage 3: Source research

**2a.** Brainstorm 5-10 candidate sources for vertical+location. Per-type SKILL.md provides candidate categories. Be specific (real domain names, not "some sites").

**2b.** `WebSearch site:<domain> <keywords> <location>` per candidate. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:

| Gate | Rule |
|---|---|
| Date sanity | Primary date > today AND < today+window. Window defaults to 90 days unless the user specifies otherwise (via `--window=<N>` or in their request). Past/year-only/quarter-only fails. |
| SPA / empty | <500 chars of meaningful text OR script-shell page → skip. |
| Required fields | Per-type SKILL.md specifies. Missing any → skip. No synthesis. |
| Confidence | Self-rate 1-10. Score = degree to which required fields are unambiguous and source-grounded. Auto: <8 skip, ≥8 use. Interactive: 6-7 flag for user, <6 always skip, ≥8 use without flagging. |
| Source credibility | Gov/association/university/established trade = high (1 source OK). Random blog/aggregator = low (autonomous needs 2-source confirmation). |
| URL liveness | Every URL the post links to must be verified before publish — see the `URL liveness gate` section below for the full decision tree. |

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

Per-type SKILL.md may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that competes for long-tail queries the source's thin listing doesn't target. Better depth, real internal-linking, structured info, honest source-grounded content. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different.

### Required outcomes (any structure achieves these)

Good posts leave the reader genuinely informed: core facts, practical considerations, useful context, honest comparisons, deeper insights on the location/category/focus where the source supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (tighter when the source is thin, expanded when source data + confident knowledge support more).

1. **Load-bearing facts up front.** A reader can answer the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it") within the first intro paragraph. Per-type SKILL.md specifies which facts are load-bearing for the data type.
2. **Every claim source-supported.** No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because the source is thin is fine; short because you skipped multi-angle context, comparison, useful perspective, or related information the source supports is not.
3. **External source citations: 1-4 per post.** Authoritative sources (industry publications, official event/venue/registration pages, governing-body sites) linked in flowing prose with `rel="nofollow" target="_blank"`. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals. NOT a forced "Source: X" footer — natural and conversational. **External source citations come AFTER the first 1-2 internal links — see `Link order` rule below.**
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
2. **After the first 1-2 internal links**, external citations mix in throughout post — sprinkled through later sections, never clustered in one footer block.
3. **Unique href per post.** No URL repeats. If two anchors would target the same URL, re-derive one under a different Pattern (1-6); drop only if no Pattern variant fits.

**Short posts exception rule:** posts under ~500 words may carry fewer total links than the per-type floor. Under-link beats stuffed.

### Image strategy

Use Pexels for all images. After all 5 axes attempted without a commit, omit `post_image`. Omitting is the last resort.

**Memory scope on image inventory:** memory may flag prior axes as exhausted for `<topic>`, but every run still attempts all 5 axes fresh in the table-defined order. Stock-photo inventories change daily, so a saturation verdict from a prior run is treated as a hint, not a verdict.

1. **Pexels** — follow corpus `Rule: Image URLs` exactly. Always send to BD with `auto_image_import=1`.

   **Axes — 5 angles, try in order, one search per axis.**

   Each search phrase must carry a topical anchor — a vertical-specific word that ties the photo to the topic.

   | Axis | Why | Cafe blog: "choosing an espresso machine" | Web design blog: "button color trends" |
   |---|---|---|---|
   | 1. Subject + state (default) | The thing in its defining state | `barista pouring` / `barista pouring coffee` | `colorful buttons` / `modern ui buttons` |
   | 2. People + adjacent action | Same audience, related verb | `barista cleaning` / `barista weighing beans` | `designer sketching` / `designer choosing colors` |
   | 3. Detail / object close-up | Topical object, no people | `portafilter shot` / `espresso shot pour` | `button mockup` / `colorful interface element` |
   | 4. Setting + topical marker | Topical location, named | `coffee shop` / `coffee shop bar` | `design studio` / `ui designer desk` |
   | 5. Adjacent activity / item | Related thing, different action | `latte art` / `coffee bean grinder` | `color swatch` / `figma wireframe sketch` |

   **Per-axis loop — repeat for each axis until commit or all 5 axes attempted:**

   **Step 1 — Search construction.** `WebSearch query="site:pexels.com/photo <axis phrase>"` using the current axis's phrase per the **Axes** table. NOT `site:pexels.com/search` (403 on agent runtime). NOT `wide`/`landscape`/`horizontal` (Pexels indexes those as title/tag terms, not orientation). **2-3 words. Every word must carry topic information** — no filler ("the", "a"), no redundant adjectives, no contradictions. 2 words when the noun is already specific (`"pilates reformer"` — "reformer" disambiguates); 3 words when the noun is ambiguous (`"pasta plate restaurant"` — bare "pasta plate" returns dishware). 1 word is banned (pure noise pool).
   - Cross-vertical examples: ✓ `"fitness race competition"` (3, events/sport), ✓ `"professional conference audience"` (3, events/corporate), ✓ `"pilates reformer"` (2, blog/fitness — already specific), ✗ `"beautiful red pasta"` ("beautiful" is filler), ✗ `"plate"` (banned).
   - If results return mostly `/search/` URLs instead of `/photo/<slug>-<id>/`, treat as zero topic-fits → switch to the next axis.

   **Step 2 — Topic-fit gate** (identify up to 5 strong topic-fits from the ~10 results):
   - Title must align with the spirit of the post's primary topic. Sharing one keyword is not enough. Wrong vertical (karate for a judo post) always fails.
   - **Broad-aesthetic topics** (fitness, food, real estate, design, etc.) — any photo within the category aesthetic counts as topic-fit. Don't demand niche-specific props (sled, kettlebell) when category-aesthetic shots (athlete running, athlete lifting) work.
   - Generic titles or wrong-context matches fail. `WebFetch` the `/photo/<slug>-<id>/` detail page when the title is ambiguous, or skip the candidate.
   - Title keyword salads (4+ unrelated nouns, e.g. `"People Rope Sport Rustic"`) are inherently ambiguous — WebFetch verify or skip; never commit on the assumption the title describes the image.
   - **If zero strong topic-fits in this pool → switch to the next axis.**

   **Step 3 — Extension filter (before any tool call).** Only consider candidate URLs ending in `.jpg`, `.jpeg`, or `.png` (case-insensitive). If a Pexels page only resolves to `.webp` / `.gif` / `.avif` / anything else, skip it. Move to the next candidate.

   **Step 4 — Dimension check (batch in parallel).** For the surviving JPG/JPEG/PNG topic-fits (up to 5), construct each canonical URL `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg` and call `getImageDimensions` on all of them. Per candidate:
   - **status=success + `orientation === "landscape"`** → landscape survivor, proceed to dedup.
   - **status=success + portrait OR square** → drop.
   - **status=error** (404, timeout, parse fail, "unsupported image format") → drop.
   - **If zero landscape survivors → switch to the next axis.**

   **Step 5 — Dedup (one batched call via `in` CSV).** Run corpus `Rule: Image dedup` — one `list*` call (matching the write tool) with `property=original_image_url`, `property_value=<URL1,URL2,...,URL5>`, `property_operator=in`. Response rows include `original_image_url`. Commit ONE survivor — the first whose URL is NOT in the response.
   - **If all survivors are in the response (all dupes) → switch to the next axis.**
   - **If a response row's `post_title` semantic-matches the candidate's topic** → drop candidate per **Candidate pool discipline (universal pattern)**. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.
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
- Section present without source data to support it? Remove.
- Any fabricated detail? Remove.
- Does the body open with `<p>` intro paragraph(s)? It must — never start with `<h2>` or any heading.
- Are H2 headings marking topic shifts, not fact transitions? Each H2 introduces meaningfully different content. Vary section length naturally — some sections one paragraph, some several, some with a bulleted list. Do NOT trim source-supported depth just to keep sections compact.
- Are all headings (H2 and H3) in **title case**, not sentence case? `"Where to Fly a Kite"`, not `"Where to fly a kite"`.
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is reader-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.
- Pexels image picked: does the search-result title name the post's primary subject AND match its defining context (activity vs generic scene, urban vs trail, indoor vs outdoor, season, beginner vs elite, etc.)? Generic title or wrong-context match = re-pick or WebFetch verify.

## Universal post fields

Field rules that apply across ALL post types via `createSingleImagePost` (and `createMultiImagePost`). Per-type SKILL.md files reference these universally and add only type-specific examples or additions.

| Field | Rule |
|---|---|
| `post_image` | Feature image URL per Stage 5 image strategy. Pass `auto_image_import=1` for external images. Pexels via `Rule: Image URLs`, or omit. |
| `post_category` | Best-matched category name, verbatim from the resolved post type's `feature_categories`. No fabrication. Skip if no ≥70% confidence match (autonomous mode). |
| `post_meta_title` | SEO `<title>` tag, ~80-120 chars. Expand on `post_title` with long-tail keyword modifiers — audience qualifier, geographic context, use case, related terms — that didn't fit the title's tight cap. Per-type SKILL.md gives type-specific examples. |
| `post_meta_description` | SEO meta description, ~150-160 chars. One-sentence value proposition. Not a verbatim repeat of `post_title`. Per-type SKILL.md adds type-specific flavor (events: include date + city; blogs: value proposition for the reader's situation). |
| `post_meta_keywords` | Pass the same exact CSV value as `post_tags`. |

## Tags

Universal `post_tags` field constraints — applies to ALL post types (single-image and multi-image alike):

- **Format:** comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`).
- **Hard 100-char total cap on the CSV.** BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.
- **Strategy:** aim for ~6 tags per post — roughly 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short, don't join words with hyphens. Per-type SKILL.md may refine tag emphasis for the type (e.g. blogs may favor topical keywords over location).
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
