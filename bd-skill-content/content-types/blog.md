# Blog content-type protocol

The router (`SKILL.md`) routed you here because the user wants to create blog post(s). Follow this file plus the shared protocol files.

## Required reading first

1. `../shared/METHODOLOGY.md`: universal protocol.
2. `../shared/ANTI-SLOP.md`: voice + pattern bans + self-check.
3. `../shared/URL-PATTERNS.md`: internal URL construction.

---

## End-to-end runbook

The user invoked the skill with a goal like "write blog articles for SEO," "write a viral piece for my industry," or "write an article about XYZ." Execute the runbook steps in order. Once a step is resolved, move immediately to the next step. **Only make the tool calls each step specifies — no extras.** On per-post failure, continue to the next post.

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
13. **Create the post** via `createSingleImagePost` with the field set in the `BD Blog field reference` section.
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

**Never bulk-list existing posts to "understand coverage" before picking a topic.** The per-candidate query in the `Dedup` section catches real overlaps; pre-scanning the feed adds nothing and burns reads on sites with hundreds of posts. Pick topics from vertical/category signals (Shape B), then let dedup do its job at the per-candidate stage.

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

Universal field rules in **METHODOLOGY `Universal post fields`** (post_image, post_live_date, post_meta_title length, post_meta_description length). `post_category`: re-read the **category ledger** line and copy one value from it verbatim. Universal tags rule in **METHODOLOGY `Tags`**. Blog-specific additions and examples:

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
