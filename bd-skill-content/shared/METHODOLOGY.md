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
4. `listMenus property=menu_name property_value=main% property_operator=like` (try `top%`/`footer%` next if no match — BD's `like` only supports single-anchor wildcards) → if a row matches, `listMenuItems property=menu_id property_value=<id> property_operator=eq` → cache `{menu_name → menu_link}` map of internal nav links as supplementary internal-link candidates. If no main-nav match, skip — site lacks a conventional main menu, fall back to URL-PATTERNS.md Patterns 1-3 for internal linking.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Interactive: ask the user for location, category, author, and whether to publish live or save as drafts (one question at a time).
Autonomous: infer location from `primary_country`, vertical from site info and categories. Author resolution is per-type — see the per-type SKILL.md (e.g. events.md Stage 4) for the algorithm. Publish status defaults to draft unless the user's routine prompt explicitly authorized publishing live.

**Universal short-circuit for author:** if the user pre-specified a `user_id` (or `author_id`) in their request — interactive or autonomous, any content type — use it and skip per-type author resolution entirely. No discovery calls.

**Member-city targeting — NEVER bulk-list members to discover their cities.** Only fires when the user's prompt explicitly targets by member coverage ("cities where I have members," "places members are based," "areas we cover"). Use `listCities` — BD auto-seeds it on every member signup, so it surfaces exactly the cities where members exist. Lean response (`city_ln`, `city_filename`, `state_sn`, `country_sn`).

## Stage 2: Source research

**2a.** Brainstorm 5-10 candidate sources for vertical+location. Per-type SKILL.md provides candidate categories. Be specific (real domain names, not "some sites").

**2b.** `WebSearch site:<domain> <keywords> <location>` per candidate. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:image, og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:

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

## Stage 3: Duplicate detection

Run AFTER research lands viable candidates, not before. Per-candidate scoped query — never bulk-list a site's existing posts (token-budget blowup).

For each candidate, query the relevant `list*` tool filtered by the candidate's distinctive title prefix:

```
listSingleImagePosts property=post_title property_operator=like property_value=<first-3-distinctive-words>% limit=10
```

(Substitute `listSingleImagePosts` for the post-type the skill targets — events use single-image, jobs/properties/blog may use other tools per their SKILL.md.) BD's WAF strips one `%` from bidirectional `%foo%`, so use single-anchor prefix `foo%` only. Returns 0-1 matching rows in normal use.

**"Distinctive" means: the first 3 words that meaningfully fingerprint THIS event.** If the title starts with throwaway leaders that don't uniquely identify it — articles (`The`), years (`2026`), ordinals (`5th`, `Annual`, `Inaugural`) — skip them and pick the next 3 words that do. Example: `"The 5th Annual Austin Tech Summit"` → use `Austin Tech Summit%`, not `The 5th Annual%`.

Match each returned row against the candidate:

- Title: semantic, not string-exact
- Date: per-type tolerance from SKILL.md (events ±24h, jobs ±7d, properties ±14d)
- Location: same city OR same venue/employer/address

Title-similar AND date-close AND location-match → duplicate → skip the candidate.

Always SKIP existing records — no auto-edit of live posts.

## Stage 4: Category routing

Interactive: ask user when ambiguous. Autonomous: fuzzy-match source category vs BD `feature_categories`. ≥70% confidence → use match. <70% → SKIP the record (do NOT auto-create categories).

Per-type SKILL.md may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that competes for long-tail queries the source's thin listing doesn't target. Better depth, real internal-linking, structured info, honest source-grounded content. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different.

### Required outcomes (any structure achieves these)

Good posts leave the reader genuinely informed: core facts, practical considerations, useful context, honest comparisons, deeper insights on the location/category/focus where the source supports them. Read like a knowledgeable friend, not a press release. Bulleted lists where scannability helps; vary paragraph rhythm; section length scales to source depth (tighter when the source is thin, expanded when source data + confident knowledge support more).

1. **Load-bearing facts up front.** A reader can answer the core question for THIS post type ("what is it, when/where, how do I get it / attend / apply / use it") within the first paragraph or first FAQ block. Per-type SKILL.md specifies which facts are load-bearing for the data type.
2. **Every claim source-supported.** No fabrication. Adaptive depth based on what source data + confident AI knowledge support. Source-supported depth beats both padding and stubs — short because the source is thin is fine; short because you skipped multi-angle context, comparison, useful perspective, or related information the source supports is not.
3. **Casual inline source reference.** At least one mention of the source(s) in flowing prose, linked with external link attributes. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals. NOT a forced "Source: X" footer — natural and conversational.
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

### Image strategy

Prefer the real source image when one is clearly usable. Fall through to Pexels otherwise. The fallback order:

1. **Source image** — prefer the real image from the source page. Check four patterns, in this order:

   **Image-source patterns:**
   - `<meta property="og:image" content="...">` (canonical; usually present)
   - JSON-LD `"image": "..."` inside `<script type="application/ld+json">` (canonical; present on most events)
   - `<img>` element `src`/`srcset` (traditional hero)
   - CSS `background-image: url(...)` on hero container divs (common on modern event sites — Eventbrite, Squarespace, Webflow templates; if the AI scans only `<img>` tags it misses this)

   **Extraction discipline:**
   - Check raw HTML, NOT WebFetch's model-summarized markdown. Name `og:image`, `JSON-LD image`, and `background-image` explicitly in your WebFetch prompt, or the summary may strip them.
   - The presence of any of the four patterns above indicates the source IS an image, not a video, regardless of how the page renders it.

   **CDN proxy decode:** if the URL is a known proxy wrapper, decode the embedded real URL before downstream checks. Common proxies: Next.js `/_next/image?url=...`, Cloudinary `/image/fetch/...`, Jetpack `i0.wp.com/...`.

   **Verification before commit:**
   - HTTP 200 on the decoded URL.
   - `Content-Type: image/*`.
   - Format is one of `png` / `jpg` / `jpeg` / `webp`. Other formats (`gif`/`svg`/`avif`/`heic`/`bmp`) cause `auto_image_import` to silently fail — fall through to Pexels.
   - Width ≥ 600px (600 exactly passes). Check `srcset` 2x descriptors, `?w=N` query params, or stated OG image dimensions — NOT the rendered `<img width>` attribute (display size, not asset size).

   **Signed CDN URLs** (`img.evbuc.com` with `s=...`, Cloudinary signed delivery, etc.) lock to their baked-in `w=` value — the signed width IS the asset width, don't try to escalate.

   Pass the decoded URL to BD with `auto_image_import=1`.
2. **Pexels** — follow corpus `Rule: Image URLs` exactly.

   **Search construction:**
   - Query shape: `WebSearch query="site:pexels.com/photo <topic>"`. NOT `site:pexels.com/search` (403 on agent runtime). NOT `wide`/`landscape`/`horizontal` (Pexels indexes those as title/tag terms, not orientation).
   - **Exactly 3 words.** Count spaces BEFORE sending: 2 spaces = 3 words. Applies to the first search and all retries.
   - Cross-vertical examples: `"fitness race competition"` (events/sport), `"professional conference audience"` (events/corporate), `"wedding photographer working"` (blog/services), `"plant living room"` (blog/lifestyle).
   - If results return mostly `/search/` URLs instead of `/photo/<slug>-<id>/`, re-pick three different words.

   **Topic-fit gate** (every candidate before commit):
   - Title must name the post's primary subject AND match its defining context. Sharing one keyword is not enough.
   - Generic titles or wrong-context matches fail. `WebFetch` the `/photo/<slug>-<id>/` detail page when the title is ambiguous, or skip the candidate.
   - Title keyword salads (4+ unrelated nouns, e.g. `"People Rope Sport Rustic"`) are inherently ambiguous — WebFetch verify or skip; never commit on the assumption the title describes the image.
   - Orientation cannot be verified from agent runtime — accept whatever orientation the candidate has.

   **Rejection logging:**
   - When rejecting a candidate under the gate, name the rejected title and the rejection reason (generic / wrong-context / season / etc.) in your chat response.
   - One short line per rejection, max.
   - Place rejection lines under a labeled `**Image selection notes:**` block during the selection step, before the Stage 7 audit summary. The audit summary stays clean.

   **Vary phrasing if results are sparse or irrelevant:** broader/simpler ("5k race" → "group race outdoors"), narrower ("yoga class" → "vinyasa studio mat"), synonyms, adjacent contexts — all still 3 words.

   **Fallback exhaustion:** after gate rejects every candidate, re-search with broadened phrasing once more — then if still nothing fits, fall through to site default, then omit. Don't loop on perfect.

   **URL output + liveness probe (mandatory before BD):** drill to individual `/photo/<slug>-<id>/` URLs, construct the bare canonical `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`, then `WebFetch` that exact URL. `"HTTP 404 Not Found"` response → drop and re-pick from the search results. Image-analysis response (JPEG/PNG/WebP content) → send to BD.

   **Dedup before committing:** run corpus `Rule: Image dedup` — all three list-tool calls must appear in your turn; any hit, pick another candidate and re-run. Every replacement candidate must pass the topic-fit gate above before its own dedup run — the gate is not skippable on retries.
3. **Site-config default** for this post type, if defined.
4. **Omit `post_image`** entirely.

**Orientation preference for feature image slots.** Feature slots (`post_image`, `hero_image`, `cover_photo`, multi-image album photos) prefer landscape (`w > h`). For **source images** (the original event/article/listing page), use the page's OG `og:image:width`/`og:image:height` meta tags or `srcset` 2x descriptors when available; prefer landscape but accept any orientation. For **Pexels candidates**, orientation cannot be reliably verified from the agent runtime — accept whatever orientation the candidate has. The topic-fit gate above applies first; image-on-post is the goal only after a candidate passes topic fit.

**Multiple inline body images** (`post_content`, `group_desc`). Long-form posts (blogs especially) often weave 2-5 inline body images alongside the feature image. Each inline image goes through the Pexels workflow above. **Dedup scope:** cross-table dedup (corpus `Rule: Image dedup`) applies to the feature image only. Inline body URLs require intra-post uniqueness — no URL repeats within the post, no body URL equals the feature URL. Inline body images are NOT checked against other posts site-wide.

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
| `post_image` | Feature image URL per Stage 5 image strategy. Pass `auto_image_import=1` for external images. Source > Pexels > site default > omit. |
| `post_category` | Best-matched category name, verbatim from the resolved post type's `feature_categories`. No fabrication. Skip if no ≥70% confidence match (autonomous mode). |
| `post_meta_title` | SEO `<title>` tag, ~80-120 chars. Expand on `post_title` with long-tail keyword modifiers — audience qualifier, geographic context, use case, related terms — that didn't fit the title's tight cap. Per-type SKILL.md gives type-specific examples. |
| `post_meta_description` | SEO meta description, ~150-160 chars. One-sentence value proposition. Not a verbatim repeat of `post_title`. Per-type SKILL.md adds type-specific flavor (events: include date + city; blogs: value proposition for the reader's situation). |

## Tags

Universal `post_tags` field constraints — applies to ALL post types (single-image and multi-image alike):

- **Format:** comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`).
- **Hard 100-char total cap on the CSV.** BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.
- **Strategy:** aim for ~6 tags per post — roughly 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short, don't join words with hyphens. Per-type SKILL.md may refine tag emphasis for the type (e.g. blogs may favor topical keywords over location).
- **Tags live ONLY in the post's `post_tags` field.** Do NOT call `listTags`, `createTag`, or any Tags-resource tool — those manage a separate global tag taxonomy unrelated to per-post `post_tags`.

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
