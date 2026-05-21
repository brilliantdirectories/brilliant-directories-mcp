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
5. **Topic resolution.** Run the `Topic resolution` section.
6. **Source research per topic** (METHODOLOGY Stage 2). Run the `Source research` section. Land 3-5 source-supported angles BEFORE drafting.
7. **Duplicate detection.** Run METHODOLOGY `Stage 3: Duplicate detection`. Run the `Dedup` section for blog-specific match criteria.
8. **Category routing.** Run METHODOLOGY `Stage 4: Category routing`. Run the `Category routing` section for blog-specific authorization.
9. **Image selection — FEATURE image only at this step.** Run METHODOLOGY Stage 5 image strategy end-to-end: Topic-fit gate → extension filter → `getImageDimensions` orientation gate (landscape only) → dedup. The sequencing rules + retry behavior are defined there; follow them exactly. Lock the feature image first — re-doing body content when an image fails dedup is the expensive path. Inline body images are opt-in only — see the `Inline body images` section.
10. **Image dedup (FEATURE).** Per METHODOLOGY Stage 5 dedup step. For blog: `listSingleImagePosts property=original_image_url property_value=<URL1,URL2,URL3> property_operator=in`.
11. **Content manufacture.** Proceed straight from Step 10 — no extra lookups. Follow METHODOLOGY Stage 5 universal rules; this file adds blog-specific shape (post-format templates, answer-first H2s, FAQ block, internal-link density). Inline body images are NOT default; only apply per the `Inline body images` section when the user explicitly requests them.
12. **Create the post** via `createSingleImagePost` with the field set in the `BD Blog field reference` section.
13. **Audit summary** (METHODOLOGY Stage 7).

### Interactive-mode question order

When running interactive, ask the user in this canonical order. One question at a time. Wait for each answer:

1. **Post-type** (if Stage 3 found multiple blog-flavored post-type candidates)
2. **Topic input** ("What's the article about? Or do you want me to suggest topics for SEO traffic in your vertical, or write a piece designed to go viral for your industry?")
3. **Author** — per METHODOLOGY `Author resolution (universal pattern)`
4. **Categories / vertical filter** (if not pre-specified)
5. **Post format** ("How-to, listicle, pillar/comprehensive, news/announcement?" — or autonomous default by topic shape)
6. **Publish vs draft** ("Publish live, or save as drafts for your review?")

Skip any question the user already answered in the original request.

---

## Post-type discovery (Stage 3 of runbook)

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

## Topic resolution (Stage 5 of runbook)

Apply METHODOLOGY's `Candidate pool discipline (universal pattern)` when brainstorming candidates. Pool size `N=5`.

### Shape A — User-specified topic

User said "write about XYZ" or "draft an article on ABC." Use the topic verbatim. Skip vertical brainstorming. Run source research for that exact topic.

### Shape B — Vertical-derived (user picks no topic)

User said "write articles for SEO traffic," "organic search," "viral content," "industry news," "related to a topic," "trending content," or similar — anything that means "you pick the topic." Brainstorm `N` distinctly different topic candidates cached from **Site context discovery**.

**If user signaled viral/trending intent**, also pull `WebSearch` for trending discussions/news in the vertical (last 30-60 days).

**Topic bar (Shape B).** Frame the topic for a non-expert outside the niche while keeping specific qualifiers (audience segment, geographic context, use case, life stage). Compounded specificity, not one. **Specific ≠ jargon** — the qualifier should be a real audience or scenario a reader outside the niche can picture (marathon runner, ACL recovery, desk worker), not insider terminology or acronym strings (mid-cycle loading, conjugate periodization, eccentric utilization ratio, NASM vs ACE vs NSCA). Pivot examples: "TPO vs EPDM Roof Membranes" → "The Best Roofing Materials for Residential Homeowners in Cold Climates". "IRC §179 vs §168(k) Deductions" → "Which 2026 Tax Deductions Save Sole Proprietors the Most?"

**Topic depth (Shape B) — go specific, not safe.** Default LLM move is the broadest possible framing ("How Much Protein to Build Muscle"). That competes against millions of existing articles and ranks for nothing. Go two or three specificity layers deeper:

**Bad Broad Topic EXAMPLES versus Good Specific Topic EXAMPLES**
| Too broad (Bad LLM default) | Good topics with depth |
|---|---|
| How Much Protein to Build Muscle | How Much Protein a 160lb Lifter Needs When Losing Fat vs Gaining Muscle |
| Best Stretches for Runners | 6 Calf Stretches That Work After a Marathon |
| Bench Press Tips for Lifters | Why Most Lifters Stall at 225lb Bench Press and How to Push Past It |
| Beginner Strength Training | First-Week Strength Routine When Coming Back After ACL Surgery |

Specificity layers: audience segment + scenario + format. The qualifiers ARE the specificity — broad reader-appeal framing AND specific qualifiers are not opposites. Each narrows the long-tail query. Broad topics still ship occasionally — but the default is specific.

**Within-pool diversity — no shared anchor noun.** The `N` pool candidates must span distinct subjects, not variations of one. If pool 1 has two topics anchored on the same primary noun, regenerate pool 1 with broader subject spread before taking #1.

**Pick qualifiers from where real readers are stuck or searching** — the question they already type into Google ("why am I stuck at 225 bench press," "calves sore after marathon"). Not a narrowing that sounds clever to a strategist ("for tall lifters," "for career switchers").

**Never bulk-list existing posts to "understand coverage" before picking a topic.** The Stage 7 per-candidate dedup query catches real overlaps; pre-scanning the feed adds nothing and burns reads on sites with hundreds of posts. Pick topics from vertical/category signals (Shape B above), then let dedup do its job at the per-candidate stage.

---

## Source research (Stage 6 of runbook)

Per METHODOLOGY Stage 2, with one adjustment: the **Date sanity gate does NOT apply** to blog source research. Blogs are evergreen; sources can be from any date.

**Blog-specific source candidate buckets:**

- Industry trade publications, professional association sites
- Established expert blogs / personal sites in the vertical
- Mainstream press and vertical-relevant culture/lifestyle magazines
- Government / academic research, public health/data agencies, university extension publications
- Peer-reviewed studies / official journal sites (for science/medical/legal topics)
- Reputable podcast transcripts, interview shows, popular vertical Substacks
- Real practitioner interviews / case studies on public-facing pages

---

## Dedup (Stage 7 of runbook)

Per METHODOLOGY Stage 3. Blog-specific match criteria:
- Title: semantic match (not string-exact).
- Topic angle: semantic overlap on the core thesis/angle, not just shared keywords.
- Date: NOT a dedup factor (blogs are evergreen).

---

## Category routing (Stage 8 of runbook)

Per METHODOLOGY Stage 4. Blogs use the post type's `feature_categories` (cached from Stage 1).

Authorization:
- Interactive grant ("yes, create new blog categories") → skill respects for the run.
- User-specified default category in their request → every post in the run goes to that category.

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

### Inline body images

**Opt-in only — do NOT include inline body images by default.** Only apply this section when the user explicitly requests inline images in their prompt (e.g. "with inline images", "include body images", "add photos throughout"). Default blog runs ship with the feature image only — prose carries the post.

When opted in: 1 inline body image per 300-500 words (excluding the feature image). Image float: `class="fr-dib fr-fil img-rounded"` (left) or `class="fr-dib fr-fir img-rounded"` (right) + inline `style="width: 350px;"` on the `<img>`. Source URLs use the retina variant: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=700`. Per corpus `Rule: Post-body formatting`.

**Inline body image dedup (intra-post only):**
- No URL repeats within the same `post_content`.
- No body URL equals the post's own `post_image` (feature) URL.
- NO site-wide dedup on inline body URLs.

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
