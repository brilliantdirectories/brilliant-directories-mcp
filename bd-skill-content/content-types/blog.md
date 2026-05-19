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
2. **Site context discovery** (METHODOLOGY Stage 1): `getSiteInfo`, `listTopCategories limit=25` (site-flavor sample only), `listPostTypes`, menus (`main%`/`top%`/`header%`/`footer%` sequence). Cache `data_filename` for the resolved blog post type.
3. **Post-type discovery (blogs-specific, this file).** Run the `Post-type discovery` section.
4. **Author resolution.** If the user pre-specified a `user_id` (or `author_id`) — use it, SKIP discovery. Otherwise pick the highest-`admin_level` user via `listUsers order_column=admin_level order_type=desc limit=1`. Blogs typically run under one designated content author; no per-plan permission filter (METHODOLOGY's events-style plan check does not apply).
5. **Topic resolution (blogs-specific, this file).** Run the `Topic resolution` section. Three input shapes: user-specified topic, vertical SEO seed, viral-content brainstorm.
6. **Source research per topic** (METHODOLOGY Stage 2): brainstorm 5-10 candidate authoritative sources (industry trade publications, expert blogs, recognized research/data sources). `WebSearch` per candidate. `WebFetch` top 3-5. Apply all 6 quality gates EXCEPT date sanity (blogs are evergreen — no future-date requirement). Land N source-supported angles BEFORE drafting.
7. **Duplicate detection** (METHODOLOGY Stage 3). BD's `like` only supports single-anchor wildcards — use `X%` (starts-with) or `%X` (ends-with), NEVER bidirectional `%X%` (the WAF strips one `%` and the query silently returns wrong results). Run THREE scoped queries to surface title-prefix overlaps AND topic-keyword overlaps from either side:
    - **Title prefix:** `listSingleImagePosts property=post_title property_operator=like property_value=<first-3-distinctive-words>% limit=10` (catches articles with the same opening phrase)
    - **Topic keyword (starts-with):** `listSingleImagePosts property=post_title property_operator=like property_value=<core-topic-noun>% limit=10` (catches titles that lead with the core noun)
    - **Topic keyword (ends-with):** `listSingleImagePosts property=post_title property_operator=like property_value=%<core-topic-noun> limit=10` (catches titles ending with the core noun — e.g. "How to Pick a Personal Trainer" vs "How to Choose a Personal Trainer" share zero first-3-words but both end with `personal trainer`)

    Merge results client-side. Apply title-similarity AND topic-angle-overlap (semantic match, not string-exact). Date does not factor (blogs are evergreen). **If ANY match is found, pivot to a different topic angle BEFORE proceeding to Stage 8.** Don't run Stage 8+ on a topic that overlaps an existing post — wastes Pexels search + image dedup cycles on work that will be discarded.

    **Never bulk-pull the blog feed** — no unfiltered `listSingleImagePosts` calls on the blog post type, no "let me see what exists" scans. Sites with hundreds of blogs make that pattern wasteful and slow.
8. **Category routing** (METHODOLOGY Stage 4). Best-existing category at ≥70% confidence, or skip.
9. **Image selection — FEATURE image only at this step** (METHODOLOGY Stage 5 image strategy). Pick the `post_image` URL via the Pexels workflow before drafting body content — locking the feature image first avoids re-doing the post if it fails dedup. Inline body images are opt-in only — see the `Inline body images` section.
10. **Image dedup (FEATURE, mandatory, executes tool calls).** Run these three calls verbatim — DO NOT paraphrase the field name or operator. The chosen Pexels URL goes in `property_value` exactly as it will be stored (`https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`):
    - `listSingleImagePosts property=original_image_url property_value=<exact URL> property_operator==`
    - `listMultiImagePostPhotos property=original_image_url property_value=<exact URL> property_operator==`
    - `listUserMeta database=list_seo key=hero_image value=<exact URL>` (single-call form — returns 0-or-1 row directly)

    Exactly these three calls must appear in your turn before step 12 — no more, no fewer, no substitutes. Any hit on any of the three = pick a different feature image and re-run all three. Full protocol in corpus `Rule: Image dedup`.
11. **Content manufacture (blogs-specific, this file).** Proceed straight from Step 10 — no extra lookups. Follow METHODOLOGY Stage 5 universal rules; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density). Inline body images are NOT default; only apply per the `Inline body images` section when the user explicitly requests them.
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

Resolve by user intent first, then canonical markers, then semantic match.

1. **User named a post type explicitly** (e.g., "post to my 'Tips for Homeowners' section"). Match the user's phrase against `data_name`, `system_name`, `form_name` on `listPostTypes`. Single confident match wins — skip steps 2-3.

2. **User didn't specify** — look for the site-owner blog in this order. Server-side filter via `listPostTypes` — do NOT `getPostType` per-candidate:
   - `system_name=website_blog_article` (BD canonical)
   - `form_name=blog_article_fields` (canonical blog form)
   - `data_type=20` + semantic match on `data_name`/`system_name` (blog, news, journal, insights, resources, articulo, noticia, nachrichten, artikel)

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

## Topic resolution (Stage 5 of runbook)

Blog skill accepts three input shapes. Detect by the user's request shape; if ambiguous in interactive mode, ask.

### Shape A — User-specified topic

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. Run source research for that exact topic.

### Shape B — Vertical SEO seed

User said "write articles for SEO traffic," "boost organic search," or similar. Derive 3-5 topic candidates from:
- `getSiteInfo.industry` + `getSiteInfo.profession` (site identity)
- `listTopCategories limit=25` sample from Stage 1 — reveals what the site's members serve (the consumer audience the directory exists to help). Topic ideas should resonate with that audience.
- The resolved blog post type's `feature_categories` (cached from Stage 1 `listPostTypes`) — these ARE the post categories the blog will route to. Use as taxonomy hints for topic shape.
- LLM judgment for long-tail SEO opportunities in that vertical that are evergreen, search-volume-friendly, and where existing top results are thin, AI-generated, or missing concrete specifics that an EEAT-rich post could beat. Don't hunt for "low-competition keywords nobody covers" — in 2026 those are mostly low-competition because nobody searches them. Pick real reader queries and beat existing coverage on depth.

Surface the 3-5 candidates to the user in interactive mode; pick top 1-2 in autonomous mode.

### Shape C — Viral-content brainstorm

User said "write articles that will go viral for my industry," "trending content," or similar. Derive topic candidates from:
- Site vertical from `getSiteInfo`
- `WebSearch` for trending discussions / news in that vertical (last 30-60 days)
- LLM judgment for emotional-hook potential (surprise, contrarian, useful-and-rare, deeply practical)

Same surfacing logic as Shape B.

**Topic bar (Shapes B and C).** Frame the topic for a non-expert outside the niche while keeping specific qualifiers (audience segment, geographic context, use case, life stage). Compounded specificity, not one. **Specific ≠ jargon** — the qualifier should be a real audience or scenario a reader outside the niche can picture (marathon runner, ACL recovery, desk worker), not insider terminology or acronym strings (mid-cycle loading, conjugate periodization, eccentric utilization ratio, NASM vs ACE vs NSCA). Pivot examples: "TPO vs EPDM Roof Membranes" → "The Best Roofing Materials for Residential Homeowners in Cold Climates". "IRC §179 vs §168(k) Deductions" → "Which 2026 Tax Deductions Save Sole Proprietors the Most?"

**Topic depth (Shapes B and C) — go specific, not safe.** Default LLM move is the broadest possible framing ("How Much Protein to Build Muscle"). That competes against millions of existing articles and ranks for nothing. Go two or three specificity layers deeper:

**Bad Broad Topic EXAMPLES versus Good Specific Topic EXAMPLES**
| Too broad (Bad LLM default) | Good topics with depth |
|---|---|
| How Much Protein to Build Muscle | How Much Protein a 160lb Lifter Needs When Losing Fat vs Gaining Muscle |
| Best Stretches for Runners | 6 Calf Stretches That Work After a Marathon |
| Bench Press Tips for Lifters | Why Most Lifters Stall at 225lb Bench Press and How to Push Past It |
| Beginner Strength Training | First-Week Strength Routine When Coming Back After ACL Surgery |

Specificity layers: audience segment + scenario + format. The qualifiers ARE the specificity — broad reader-appeal framing AND specific qualifiers are not opposites. Each narrows the long-tail query. Broad topics still ship occasionally — but the default is specific.

**Pick qualifiers from where real readers are stuck or searching** — the question they already type into Google ("why am I stuck at 225 bench press," "calves sore after marathon"). Not a narrowing that sounds clever to a strategist ("for tall lifters," "for career switchers").

**Skill always runs one shape per invocation.** Do not mix. If the user request crosses shapes ("specific article AND viral"), ask which one to prioritize.

**Never bulk-list existing posts to "understand coverage" before picking a topic.** The Stage 7 per-candidate dedup query catches real overlaps; pre-scanning the feed adds nothing and burns reads on sites with hundreds of posts. Pick topics from vertical/category signals (Shapes B and C above), then let dedup do its job at the per-candidate stage.

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

## Category routing (Stage 8 of runbook)

Per METHODOLOGY Stage 4. Blogs use the post type's `feature_categories` (cached from Stage 1).

Authorization:
- Interactive grant ("yes, create new blog categories") → skill respects for the run.
- User-specified default category in their request → every post in the run goes to that category.
- Default: best-existing match at ≥70% confidence, or SKIP.

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
6. **List shape per ANTI-SLOP `Bullets rule`.** Numbered for sequence (how-to steps), bulleted for parallel items (listicle entries, comparison criteria).
7. **FAQ block before conclusion.** H2 "Frequently Asked Questions" (or per-language equivalent) with 3-5 H3 questions, each answered in 40-60 words. High AI-citation density per word.
8. **Conclusion 100-150 words.** Advance the reader to a next step or a fresh specific that wasn't in the body — never restate the body's load-bearing answer. Close with ONE internal link (CTA shape — "Browse {Category} listings on {site}" or "See more {topic} resources" — anchor text reads as part of a sentence).

### Internal-link strategy

Blog posts link broadly across BD resources — this is where the SEO compounding lives. Budget **5-10 internal links per 2000 words**, distributed:

| Section | Recommended links |
|---|---|
| Direct-answer opening | 0-1 |
| Body H2 sections | 3-6 spread across sections (1-2 per major section, max) |
| FAQ block | 1-2 (answer text may include a link) |
| Conclusion | 1 (always — the CTA-shape closer) |

**Link targets — all valid for blog posts:**

- **Specific member profile** (Pattern 4): `/<user.filename>` — resolve via `searchUsers` or `listUsers property=email property_value=<email> property_operator=eq` only when the agent has a specific known person to deep-link to. No bulk-listing members.
- **Member directory landing** (Pattern 5): `/search_results` — links to the entire directory of members with no location or category filter applied. Location- + category-filtered member-search URLs are slug-hierarchy paths (out of scope for content skills, deferred to `/bd:seo`).
- **Specific post of any type** (Pattern 1): `/<post_filename>` — resolve via title-filtered `listSingleImagePosts` when the agent has a specific known post to deep-link to. No bulk-listing.
- **Post search results of any type** (Pattern 3): `/<post_type_data_filename>?category[]=<cat>&...` — for "more {category} {posts}" style anchors.
- **Post-type main listing** (Pattern 2): `/<data_filename>` — bare listing of all posts of that type.

Pick targets by **contextual relevance to the body sentence**. If the paragraph mentions finding a local pro, link to the member search filtered by the site's relevant category + the city named in the paragraph. If the paragraph references a related concept covered by another article on the site, deep-link to that article via Pattern 1 (but only if the agent has confirmed the article exists). Never fabricate URLs.

**Anchor text:** reads as part of the sentence. The linked phrase is a noun or noun phrase that belongs naturally in the surrounding prose ("certified personal trainers in Boston" not "click here for personal trainers"). Not a standalone CTA in the middle of paragraphs.

**External links:** authoritative sources (industry studies, government/academic, official organization pages) get `rel="nofollow" target="_blank"`. 1-3 external links per 2000 words is healthy; more risks linking away too much, fewer loses EEAT signal.

### Inline body images

**Opt-in only — do NOT include inline body images by default.** Only apply this section when the user explicitly requests inline images in their prompt (e.g. "with inline images", "include body images", "add photos throughout"). Default blog runs ship with the feature image only — prose carries the post.

When opted in: 1 inline body image per 300-500 words (excluding the feature image). Image float: `class="fr-dib fr-fil img-rounded"` (left) or `class="fr-dib fr-fir img-rounded"` (right) + inline `style="width: 350px;"` on the `<img>`. Source URLs use the retina variant: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=700`. Per corpus `Rule: Post-body formatting`.

**Inline body image dedup (intra-post only):**
- No URL repeats within the same `post_content`.
- No body URL equals the post's own `post_image` (feature) URL.
- NO cross-table site-wide dedup on inline body URLs.

Each inline image is sourced via the Pexels workflow (corpus `Rule: Image URLs`). Vary the search topic per image so candidates differ naturally.

### Title shape

Blog titles run different from event titles. Clickbait-flavored but anti-slop-disciplined:

| Pattern | Example |
|---|---|
| How-to | "How Spin Training Keeps You Feeling Younger" |
| Listicle | "7 Pilates Studios in Austin With Reformer Classes" |
| Question | "Do You Need a Lawyer to Form an LLC?" |
| Comparison | "Reformer Pilates vs Mat Pilates for Faster Toning" |
| News | "Major Property Tax Reform Takes Effect Across Texas in 2026" |

Caps: ~70 chars where SEO matters (Google truncates title tags around there). Keep punchy. No clickbait that overpromises ("This One Trick Will Change Your Life"). No throat-clearing. No fabricated curiosity. **Single statement only — no `X: Y`, no `X (Y)`, no `X? Y`.**

---

## BD Blog field reference (Stage 12 of runbook)

What `createSingleImagePost` receives.

### Required

| Field | Value |
|---|---|
| `post_type` | `"Account"` (literal — legacy classification field, kept as insurance; BD doesn't strictly require it but harmless to pass) |
| `data_type` | `20` (single-image classification, always for blogs) |
| `data_id` | resolved blog post-type id from Stage 3 |
| `post_title` | per the `Title shape` section — clickbait-flavored, anti-slop, ~70 char target |
| `post_status` | `0` (draft, default) or `1` (publish, only if user explicitly authorized) |
| `post_live_date` | now in site timezone, `YYYYMMDDHHmmss` |
| `user_id` | resolved author from Stage 4 |

### Recommended (include when source data supports)

Universal field rules in **METHODOLOGY `## Universal post fields`** (post_image, post_category, post_meta_title length, post_meta_description length). Universal tags rule in **METHODOLOGY `## Tags`**. Blog-specific additions and examples below:

| Field | Blog-specific note |
|---|---|
| `post_content` | Assembled HTML body per "Content manufacture" — direct-answer opening + question H2s + answer-first paragraphs + FAQ + conclusion. Inline body images only when user explicitly requested. |
| `post_meta_title` | Type-specific example: `"Reformer Pilates vs Mat Pilates for Beginners Working Out at Home in a Small Apartment"` — audience qualifier (beginners) + use case (home workouts) + scenario (small apartment) expanded from the shorter `post_title`. |
| `post_meta_description` | Blog-specific flavor: one-sentence value proposition for the reader's decision-stage situation (e.g. "Comparing reformer and mat Pilates for beginners working out at home: calorie burn per 45-minute session, equipment cost, and which style fits a small apartment."). |

### Do NOT pass

- `post_start_date`, `post_expire_date` — events-only; blogs do not have a scheduled date semantic.
- `post_venue`, `post_location`, `lat`, `lon`, `country_sn`, `state_sn` — geo fields; blogs do not have a place anchor.
- `auto_geocode` — geo-only; not applicable to blogs.
- `revision_timestamp` — BD-managed.
