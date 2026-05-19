# Blog content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create blog post(s). Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a goal like "write blog articles for SEO," "write a viral piece for my industry," or "write an article about XYZ." Run in order; on per-post failure continue to the next post.

1. **Mode detection** (METHODOLOGY Stage 1). User in chat → interactive. Cron/programmatic → autonomous.
2. **Site context discovery** (METHODOLOGY Stage 1): `getSiteInfo`, `listPostTypes`. Cache `data_filename` for the resolved blog post type AND the Member Listings post type (`data_type=10`, `system_name=member_listings`) — needed for internal-link construction in Stage 9.
3. **Post-type discovery (blogs-specific, this file).** Run the `Post-type discovery` section.
4. **Author resolution.** If the user pre-specified a `user_id` (or `author_id`) — use it, SKIP discovery. Otherwise pick the highest-`admin_level` user via `listUsers order_column=admin_level order_type=desc limit=1`. Blogs typically run under one designated content author; no per-plan permission filter (METHODOLOGY's events-style plan check does not apply).
5. **Topic resolution (blogs-specific, this file).** Run the `Topic resolution` section. Three input shapes: user-specified topic, vertical SEO seed, viral-content brainstorm.
6. **Source research per topic** (METHODOLOGY Stage 2): brainstorm 5-10 candidate authoritative sources (industry trade publications, expert blogs, recognized research/data sources). `WebSearch` per candidate. `WebFetch` top 3-5. Apply all 5 quality gates EXCEPT date sanity (blogs are evergreen — no future-date requirement). Land N source-supported angles BEFORE drafting.
7. **Duplicate detection** (METHODOLOGY Stage 3). For each topic angle, scope-query the blog post type: `listSingleImagePosts property=post_title property_operator=like property_value=<first-3-distinctive-words>% limit=10`. Match: title-similar AND topic-angle-overlap. Date does not factor (blogs are evergreen). Skip duplicates.
8. **Category routing** (METHODOLOGY Stage 4). Best-existing category at ≥70% confidence, or skip.
9. **Image selection — FEATURE image only at this step** (METHODOLOGY Stage 5 image strategy). Pick the `post_image` URL via the Pexels workflow before drafting body content — locking the feature image first avoids re-doing the post if it fails dedup. Inline body images are selected during content manufacture (Step 11), not here.
10. **Image dedup (FEATURE, mandatory, executes tool calls).** Run these three calls verbatim — DO NOT paraphrase the field name or operator. The chosen Pexels URL goes in `property_value` exactly as it will be stored (`https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`):
    - `listSingleImagePosts property=original_image_url property_value=<exact URL> property_operator==`
    - `listMultiImagePostPhotos property=original_image_url property_value=<exact URL> property_operator==`
    - `listUserMeta database=list_seo key=hero_image value=<exact URL>` (single-call form — returns 0-or-1 row directly)

    Exactly these three calls must appear in your turn before step 11 — no more, no fewer, no substitutes. Any hit on any of the three = pick a different feature image and re-run all three. Full protocol in corpus `Rule: Image dedup`.
11. **Content manufacture (blogs-specific, this file).** Proceed straight from Step 10 — no extra lookups. Follow METHODOLOGY Stage 5 universal rules; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density). Inline body images selected and applied during this step per the `Inline body images` section.
12. **Create the post** via `createSingleImagePost` with the field set in the `BD Blog field reference` section.
13. **Audit summary** (METHODOLOGY Stage 7).

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer:

1. **Post-type** (if Stage 3 found multiple blog-flavored post-type candidates)
2. **Topic input** ("What's the article about? Or do you want me to suggest topics for SEO traffic in your vertical, or write a piece designed to go viral for your industry?")
3. **Author** ("Which member should author these blog posts?" — only if not pre-specified)
4. **Categories / vertical filter** (if not pre-specified)
5. **Post format** ("How-to, listicle, pillar/comprehensive, news/announcement?" — or autonomous default by topic shape)
6. **Publish vs draft** ("Publish live, or save as drafts for your review?")

Skip any question the user already answered in the original request.

---

## Post-type discovery (Stage 3 of runbook)

A BD site does not necessarily have a post type literally named "Blog." Owners rename, translate, or run multiple article-flavored post types ("News," "Resources," "Articles," "Insights").

**Primary marker:** blog-flavored post types have `data_type=20` (single-image classification) AND are NOT event-flavored (`type_of_feature != 1`). Call `listPostTypes property=type_of_feature property_value=2 property_operator=eq` for the formal blog marker. If no `type_of_feature=2` rows exist, fall back to: filter `data_type=20`, then semantic-match `data_name`/`system_name` against blog terms (`blog`, `article`, `news`, `journal`, `post`, `insights`, `resources`, `articulo`, `artículo`, `noticia`, `nachrichten`, `artikel`, etc.).

**Decision:**

| Match count | Action |
|---|---|
| Zero | Skill cannot run. Surface clean message, exit. |
| One | Use it. Cache `data_id`, `data_name`, `system_name`, `form_name`. |
| Multiple, interactive | Ask the user. List by data_id + data_name. |
| Multiple, autonomous | If the user pre-specified a post-type id, use it. Else exit with clear audit message. |

User's explicit post-type pick always wins.

---

## Topic resolution (Stage 5 of runbook)

Blog skill accepts three input shapes. Detect by the user's request shape; if ambiguous in interactive mode, ask.

### Shape A — User-specified topic

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. Run source research for that exact topic.

### Shape B — Vertical SEO seed

User said "write articles for SEO traffic," "boost organic search," or similar. Derive 3-5 topic candidates from:
- `getSiteInfo.industry` + `getSiteInfo.profession` (site identity)
- `listTopCategories` lean (top-level taxonomy hints)
- LLM judgment for long-tail SEO opportunities in that vertical that are evergreen, search-volume-friendly, and not heavily covered by big competitors

Surface the 3-5 candidates to the user in interactive mode; pick top 1-2 in autonomous mode.

### Shape C — Viral-content brainstorm

User said "write articles that will go viral for my industry," "trending content," or similar. Derive topic candidates from:
- Site vertical from `getSiteInfo`
- `WebSearch` for trending discussions / news in that vertical (last 30-60 days)
- LLM judgment for emotional-hook potential (surprise, contrarian, useful-and-rare, deeply practical)

Same surfacing logic as Shape B.

**Skill always runs one shape per invocation.** Do not mix. If the user request crosses shapes ("specific article AND viral"), ask which one to prioritize.

---

## Source research (Stage 6 of runbook)

Per METHODOLOGY Stage 2, with one adjustment: the **Date sanity gate does NOT apply** to blog source research. Blogs are evergreen; sources can be from any date. All other gates (SPA/empty, required fields, confidence, source credibility) apply normally.

**Blog-specific source candidates:**

- Industry trade publications, professional association sites
- Established expert blogs in the vertical
- Government/academic research, public health/data agencies, university extension publications
- Peer-reviewed studies (Google Scholar, official journal sites)
- Authoritative reference works (encyclopedias, definitive guides)
- Real practitioner interviews / case studies on public-facing pages

Be specific. Brainstorm real domain names, not "some sites."

---

## Dedup (Stage 7 of runbook)

Per METHODOLOGY Stage 3. Blog-specific match criteria:
- Title: semantic match (not string-exact).
- Topic angle: semantic overlap on the core thesis/angle, not just shared keywords.
- Date: NOT a dedup factor (blogs are evergreen).

If a published blog post on the site already covers the same angle, SKIP. Never auto-edit existing posts.

---

## Content manufacture (Stage 11 of runbook)

Follow METHODOLOGY Stage 5 (universal): EEAT goal, Froala-safe HTML allowlist (from MCP corpus), link policy, image strategy, voice via ANTI-SLOP, self-check. Blog posts additionally follow the per-format and per-section rules in this section.

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
6. **Bulleted lists where scannability helps.** Numbered for sequence, bulleted for parallel items. Don't bullet everything.
7. **FAQ block before conclusion.** H2 "Frequently Asked Questions" (or per-language equivalent) with 3-5 H3 questions, each answered in 40-60 words. High AI-citation density per word.
8. **Conclusion 100-150 words.** Recap the load-bearing answer, then close with ONE internal link (CTA shape — "Browse {Category} listings on {site}" or "See more {topic} resources" — anchor text reads as part of a sentence).

### Internal-link strategy

Blog posts link broadly across BD resources — this is where the SEO compounding lives. Budget **5-10 internal links per 2000 words**, distributed:

| Section | Recommended links |
|---|---|
| Direct-answer opening | 0-1 |
| Body H2 sections | 3-6 spread across sections (1-2 per major section, max) |
| FAQ block | 1-2 (answer text may include a link) |
| Conclusion | 1 (always — the CTA-shape closer) |

**Link targets — all valid for blog posts:**

- **Specific member profile** (Pattern 1): `/<user.filename>` — resolve via `searchUsers` or `listUsers property=email property_value=<email> property_operator=eq` only when the agent has a specific known person to deep-link to. No bulk-listing members.
- **Member search results** (Pattern 3 on Members post type's `data_filename`): `/<members_data_filename>?category[]=<cat>&lat=...&lng=...&location_value=...&location_type=locality` — for "find a {profession} in {city}" style anchors. Use the cached Members `data_filename` from Stage 2.
- **Specific post of any type** (Pattern 1): `/<post_filename>` — resolve via title-filtered `listSingleImagePosts` when the agent has a specific known post to deep-link to. No bulk-listing.
- **Post search results of any type** (Pattern 3): `/<post_type_data_filename>?category[]=<cat>&...` — for "more {category} {posts}" style anchors.
- **Post-type main listing** (Pattern 2): `/<data_filename>` — bare listing of all posts of that type.

Pick targets by **contextual relevance to the body sentence**. If the paragraph mentions finding a local pro, link to the member search filtered by the site's relevant category + the city named in the paragraph. If the paragraph references a related concept covered by another article on the site, deep-link to that article via Pattern 1 (but only if the agent has confirmed the article exists). Never fabricate URLs.

**Anchor text:** reads as part of the sentence. The linked phrase is a noun or noun phrase that belongs naturally in the surrounding prose ("certified personal trainers in Boston" not "click here for personal trainers"). Not a standalone CTA in the middle of paragraphs.

**External links:** authoritative sources (industry studies, government/academic, official organization pages) get `rel="nofollow" target="_blank"`. 1-3 external links per 2000 words is healthy; more risks linking away too much, fewer loses EEAT signal.

### Inline body images

Long-form blogs benefit from 1 inline body image per 300-500 words (excluding the feature image). Image float: `class="fr-dib fr-fil img-rounded"` (left) or `class="fr-dib fr-fir img-rounded"` (right) + inline `style="width: 350px;"` on the `<img>`. Source URLs use the retina variant: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=700`. Per corpus `Rule: Post-body formatting`.

**Inline body image dedup (intra-post only):**
- No URL repeats within the same `post_content`.
- No body URL equals the post's own `post_image` (feature) URL.
- NO cross-table site-wide dedup on inline body URLs.

Each inline image is sourced via the Pexels workflow (corpus `Rule: Image URLs`). Vary the search topic per image so candidates differ naturally.

### Title shape

Blog titles run different from event titles. Clickbait-flavored but anti-slop-disciplined:

| Pattern | Example |
|---|---|
| How-to | "How to Pick a CPA for Your Small Business" |
| Listicle | "7 Pilates Studios in Austin That Match Real Athletes" |
| Question | "When Do You Actually Need a Personal Trainer?" |
| Comparison | "Reformer vs Mat Pilates: Which Fits Your Goals?" |
| News | "Texas Marathon Series Adds Half-Marathon Distance for 2026" |

Caps: ~60-65 chars where SEO matters (Google truncates title tags around there). Keep punchy. No clickbait that overpromises ("This One Trick Will Change Your Life"). No throat-clearing. No fabricated curiosity.

---

## Tags

Per **METHODOLOGY Tags** (universal rules — comma-separated CSV, 100-char cap, no Tags-resource tools).

---

## BD Blog field reference (Stage 12 of runbook)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, not user-facing) |
| `data_type` | `20` (single-image classification, always for blogs) |
| `data_id` | resolved blog post-type id from Stage 3 |
| `post_title` | per the `Title shape` section — clickbait-flavored, anti-slop, ~60-65 char target |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `post_live_date` | now in site timezone, `YYYYMMDDHHmmss` |
| `user_id` | resolved author from Stage 4 |

### Recommended (include when supported)

| Field | Value |
|---|---|
| `post_content` | assembled HTML body per "Content manufacture" — direct-answer opening + question H2s + answer-first paragraphs + inline body images + FAQ + conclusion |
| `post_image` | feature image URL per image strategy. Pass `auto_image_import=1` for external images. |
| `post_category` | best-matched category name (verbatim from `feature_categories`) |
| `post_tags` | per **METHODOLOGY Tags** |
| `post_meta_title` | SEO `<title>` tag (~50-60 chars). May be near-identical to `post_title` for blogs, or expanded with one or two long-tail keyword modifiers. |
| `post_meta_description` | SEO meta description (~150-160 chars). One-sentence value proposition of the article. Not a verbatim repeat of `post_title`. |

### Do NOT pass

- `post_start_date`, `post_expire_date` — events-only; blogs do not have a scheduled date semantic. (BD will silently store but BD's blog templates ignore.)
- `post_venue`, `post_location`, `lat`, `lon`, `country_sn`, `state_sn` — geo fields; blogs do not have a place anchor.
- `auto_geocode` — geo-only; not applicable to blogs.
- `revision_timestamp` — BD-managed.
