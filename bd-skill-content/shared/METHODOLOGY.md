# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. Per-type SKILL.md layers in type-specific details.

## Mode detection (first step)

`--autonomous` flag absent → interactive (ask user when stuck). Present → autonomous (no prompts; safer-side defaults).

**Both modes: under-produce correct > over-produce wrong. When in doubt, skip.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation. Informs vertical alignment, category routing, anchor-text choices, and internal-link inventory.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone, brand.
2. `listTopCategories` → top-level taxonomy.
3. `listPostTypes` → per-type SKILL.md provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`.
4. `listMenus property=menu_name property_value=main% property_operator=like` (try `top%`/`header%`/`primary%` next if no match — BD's `like` only supports single-anchor wildcards) → if a row matches, `listMenuItems property=menu_id property_value=<id> property_operator=eq` → cache `{menu_name → menu_link}` map of internal nav links as supplementary internal-link candidates. If no main-nav match, skip — site lacks a conventional main menu, fall back to URL-PATTERNS.md Patterns 1-3 for internal linking.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Interactive: ask the user for location, category, author, and whether to publish live or save as drafts (one question at a time).
Autonomous: infer location from `primary_country`, vertical from site info and categories. Author resolution is per-type — see the per-type SKILL.md (e.g. events.md Stage 4) for the algorithm. Publish status defaults to draft unless the user's routine prompt explicitly authorized publishing live.

**Universal short-circuit for author:** if the user pre-specified a `user_id` (or `author_id`) in their request — interactive or autonomous, any content type — use it and skip per-type author resolution entirely. No discovery calls.

**Location targeting hints — use `listCities`, NEVER bulk-list members.** If the user's prompt references targeting based on member coverage (e.g. "cities where I have members listed," "places members are based," "areas we cover"), use `listCities` — BD auto-seeds this table on every member signup, so it surfaces exactly the cities where members exist. Lean response (`city_ln`, `city_filename`, `state_sn`, `country_sn`).

## Stage 2: Source research

**2a.** Brainstorm 5-10 candidate sources for vertical+location. Per-type SKILL.md provides candidate categories. Be specific (real domain names, not "some sites").

**2b.** `WebSearch site:<domain> <keywords> <location>` per candidate. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:image, og:title, JSON-LD schema.org Event"). Every extracted record must pass all 5 gates:

| Gate | Rule |
|---|---|
| Date sanity | Primary date > today AND < today+window. Window defaults to 60 days unless the user specifies otherwise (via `--window=<N>` or in their request). Past/year-only/quarter-only fails. |
| SPA / empty | <500 chars of meaningful text OR script-shell page → skip. |
| Required fields | Per-type SKILL.md specifies. Missing any → skip. No synthesis. |
| Confidence | Self-rate 1-10. Auto: <8 skip. Interactive: 6-7 flag for user, <6 always skip. |
| Source credibility | Gov/association/university/established trade = high (1 source OK). Random blog/aggregator = low (autonomous needs 2-source confirmation). |

**2d.** Cross-reference: 2 sources confirm → merge details, boost confidence.

**2e.** Stop at ~10-20 verified records or no new candidates.

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
| Internal | `<a href="/...">text</a>` (no rel, no target) |
| External | `<a href="https://..." rel="nofollow" target="_blank">text</a>` |

### Image strategy

Prefer the real source image when one is clearly usable. Fall through to Pexels otherwise. The fallback order:

1. **Source image** — check FOUR patterns, not just `<img>` tags:
   - `<meta property="og:image" content="...">` (canonical; usually present)
   - JSON-LD `"image": "..."` inside `<script type="application/ld+json">` (canonical; present on most events)
   - `<img>` element src/srcset (traditional hero)
   - **CSS `background-image: url(...)` on hero container divs** (common on modern event sites like Eventbrite, Squarespace, Webflow templates; if the AI scans only `<img>` tags it misses this)
   **Check raw HTML, not WebFetch's model-summarized markdown** — name "og:image", "JSON-LD image", and "background-image" explicitly in your WebFetch prompt, or the summary may strip them. If the URL is a known CDN proxy (Next.js `/_next/image?url=...`, Cloudinary `/image/fetch/...`, Jetpack `i0.wp.com/...`, etc.), decode the embedded real URL. The presence of OG image / JSON-LD image / background-image-url all indicate the source IS an image, not a video, regardless of how the page renders it. Confirm the decoded URL returns HTTP 200, has `image/*` content-type, is one of **`png` / `jpg` / `jpeg` / `webp`** (other formats like `gif`/`svg`/`avif`/`heic`/`bmp` cause `auto_image_import` to silently fail — fall through to Pexels in that case), and is **≥ 600px wide** (600 exactly counts as pass). Check `srcset` 2x descriptors, `?w=N` query params, or stated OG image dimensions — NOT the rendered `<img width>` attribute, which is display size. **Signed CDN URLs** (`img.evbuc.com` with `s=...`, Cloudinary signed delivery, etc.) lock to their baked-in `w=` value — the signed width IS the asset width, don't try to escalate. Use with `auto_image_import=1`.
2. **Pexels** — follow **Rule: Image URLs** in the MCP corpus (loaded with every MCP tool) exactly. Short version: `WebSearch query="site:pexels.com/photo <topic>"` (NOT `site:pexels.com/search` — 403 on agent runtimes; and NOT `wide`/`landscape`/`horizontal` keywords in the query — Pexels searches those as photo title/tag terms, not orientation), drill to individual `/photo/<slug>-<id>/` URLs, send the bare canonical `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg` to BD. Landscape is preferred but cannot be reliably verified from the agent runtime — take the candidate. Image-on-post matters more than perfect orientation. Search topic uses per-type keywords (events: `"5k race outdoors"`, `"music festival crowd"`, `"yoga class studio"`, etc.). If the first topic returns sparse or irrelevant results, vary the phrasing — broader/simpler ("5k race" → "group race outdoors"), narrower ("yoga class" → "vinyasa studio mat"), synonyms, adjacent contexts — anything still contextually relevant to the post.
3. **Site-config default** for this post type, if defined.
4. **Omit `post_image`** entirely.

**Orientation preference for feature image slots.** Feature slots (`post_image`, `hero_image`, `cover_photo`, multi-image album photos) prefer landscape (`w > h`). For **source images** (the original event/article/listing page), use the page's OG `og:image:width`/`og:image:height` meta tags or `srcset` 2x descriptors when available; prefer landscape but accept any orientation. For **Pexels candidates**, orientation cannot be reliably verified from the agent runtime — take the candidate. Image-on-post is the goal; perfect orientation is the nice-to-have.

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
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is reader-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.

## Stage 6: Post creation

Call per-type `create*` tool with assembled fields. Pace BD writes ~600ms apart. On failure: continue to next record. Do not retry blindly.

## Stage 7: Audit summary (always printed)

Brief. Customer-facing receipt of deliverables — what got created, where to find it. Do NOT narrate the process (candidates probed, gates failed, retries, geocode tier landed). That's internal noise; the customer cares about results. Build `<admin_edit_url>` per the MCP corpus `Rule: Post admin URLs` — never invent the URL shape.

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
