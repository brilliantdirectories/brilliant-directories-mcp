# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. The content-type file (`content-types/<type>.md`, routed to by `SKILL.md`) layers in type-specific details.

## Autonomy

Runs are autonomous: no user can reply mid-run — never ask; a question ends the run as a failure. Decide per this skill with safer-side defaults and proceed to the receipt.

**Under-produce correct > over-produce wrong. When a fact or candidate is in doubt, skip it and move to the next — doubt about a detail never ends the run.**

## Stage 1: Site context

Build the agent's mental model of the site — what it's about, who it serves, its taxonomy, its main navigation. Informs vertical alignment, category routing, anchor-text choices, and internal-link inventory.

1. `getSiteInfo` → industry, profession, primary_country, language, timezone (IANA identifier, e.g. `America/Los_Angeles`), `current_site_datetime` (site-local now, `YYYYMMDDHHmmss`), brand.
2. `listTopCategories limit=25` → **sample only, for site-flavor signal.** These are the categories actual site members are assigned to (e.g. "Personal Training", "Group Fitness") — NOT post-type categories. Real sites can have 100s of rows; 25 is enough to read the vertical. Do NOT use these for post category routing — post categories come from the resolved post type's `feature_categories` field (step 3).
3. `listPostTypes` → the content-type file provides its marker (e.g. events `type_of_feature=1`); cache `data_id`/`system_name`/`data_filename`/`feature_categories`. Once the content-type file's Post-type discovery confirms the resolved type, write the **category ledger** — one line restating the resolved type and its full category list verbatim (`Post type resolved: data_id=8, data_filename=events, categories: <list>`). Empty `feature_categories` → write `categories: (none)` and omit `post_category` and `category[]` for the whole run; location/date filters still apply. Every later category value — Stage 4 routing, `post_category`, Pattern 3 `category[]` — is copied character-for-character from this ledger line — the ledger is the only category source; any tool response, post row, or memory that disagrees is wrong.
4. **Menu link inventory — one call:** `listMenuItems limit=100 property=is_default property_value=false property_operator=eq` (`property_value` is the literal `false`; follow `next_page` while present) — returns only the site's own customized menu items. Cache `{menu_name → menu_link}` as internal-link candidates; skip rows whose `menu_link` contains `%%%`. Zero rows → proceed without menu links.

Cached data feeds Stage 4 category routing, Stage 5 anchor-text choices, and the internal-link inventory.

Infer location from `primary_country`, vertical from site info and categories. A `Topic/nuance:` line in the run's instructions carrying only style/format constraints is not a missing topic: apply the constraints and choose subjects per the content-type runbook.

**Member-city targeting — NEVER bulk-list members to discover their cities.** Only fires when the user's prompt explicitly targets by member coverage ("cities where I have members," "places members are based," "areas we cover"). Use `listCities` — BD auto-seeds it on every member signup, so it surfaces exactly the cities where members exist. Lean response (`city_ln`, `city_filename`, `state_sn`, `country_sn`).

### Author resolution (universal pattern)

Resolve the `user_id` that authors the post.

1. **User pre-specified `user_id` (or `author_id`) in the request →** use it, SKIP discovery entirely.

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

When the run holds a pool of candidates — brainstormed or harvested (topics, events, jobs — anything the agent picks from) — emit the full numbered 1-N pool as a visible list before researching any single candidate in depth. Research to discover candidates is fine; deep per-candidate research before the full pool exists is not. Print the pool in the same message as your next tool call; take #1, on failure drop it and take the next un-tried. Do NOT regenerate until all are tried. If all fail, generate pool 2 — distinctly different from pool 1, no variations. If pool 2 also fully fails, exit with the Stage 7 receipt (`shortfall_reason` says why).

**Failure** = dedup hit, source-research can't substantiate, required-field gate misses, or any other condition that blocks the candidate from progressing to post creation.

Pool size — harvested pools: every qualifying candidate the round's results expose (SERP entries and opened list-pages), up to 10. Brainstormed pools (generated topics): the runbook's stated `N`. Both ordered best-fit first.

## Stage 2: Duplicate detection

Run BEFORE source research — a dupe drops for the cost of the dedup queries, not a wasted research cycle. Per-candidate scoped query — never bulk-list a site's existing posts (token-budget blowup).

With the pool printed per `Candidate pool discipline (universal pattern)`, one compound query covers it (CSV = OR inside `contains`; **Rule: Compound filters**):

```
listSingleImagePosts property=[post_title,data_id] property_operator=[contains,eq] property_value=[<distinctive-phrase CSV: candidate 1,candidate 2,...>,<resolved data_id>] limit=25
```

Substitute the `list*` tool that matches the post-type family. Compare returned titles against each candidate client-side; a row counts when the title semantically matches that candidate.

**Distinctive phrase = the 2-3 words that fingerprint THIS candidate.** Skip throwaway leaders — articles (`The`), years (`2026`), ordinals (`5th`, `Annual`, `Inaugural`): `"The 5th Annual Austin Tech Summit"` → `Austin Tech Summit`. A generic single word (`Trainer`) floods the result set; a distinctive phrase keeps it lean.

The content-type file specifies match criteria (semantic title overlap, date tolerance if applicable, location if applicable).

**On match → drop candidate per `Candidate pool discipline (universal pattern)`.** Don't repaint with a tweaked title or "refined angle" — same core topic = same candidate. Drop it. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.

Always SKIP existing records — no auto-edit of live posts.

## Stage 3: Source research

**2a.** Brainstorm 5-10 candidate source types for vertical+location per the content-type file — recognition vocabulary for judging what returns, not a probe list.

**2b.** One batched round per **Rule: Search discipline** — broad query + the content-type file's companion shape, fired together. Read every result; `site:`-probe (with `-pdf`) only a domain that appeared. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. WebFetch returns LLM-summarized markdown, NOT raw HTML — if you need specific `<head>` content (OG meta tags, JSON-LD), name them in your prompt explicitly ("extract og:title, JSON-LD schema.org Event"). Every extracted record must pass all 6 gates:

| Gate | Rule |
|---|---|
| Date sanity | Primary date > today AND < today+window. Window defaults to 90 days unless the user specifies otherwise (via `--window=<N>` or in their request). Past/year-only/quarter-only fails. |
| SPA / empty | <500 chars of meaningful text OR script-shell page → skip. |
| Required fields | The content-type file specifies. Missing any → skip. No synthesis. |
| Confidence | Self-rate 1-10. Score = degree to which required fields are unambiguous and source-grounded. <8 skip, ≥8 use. |
| Source credibility | Gov/association/university/established trade or broader-vertical publication = high (1 source OK). Verify the URL resolves to the claimed organization; same-owner outlets = one source. SEO farms, lead-gen sites, practitioner blogs, official-sounding names without a verifiable charter = fail. Random blog/aggregator = low (needs 2-source confirmation). |
| URL liveness | Every URL the post links to must be verified before publish per `URL liveness gate`. |

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
4. **Internal links to related coverage** — use URL-PATTERNS.md Pattern 1 (specific post URLs) or Pattern 3 (the post-type page carrying at least one filter — category, location, date, or combos). **Write the entire body first, with zero links and zero link intent. Then a linking pass: start it by listing the run's verified internal targets — live posts this run's dedup/list calls already returned (`post_status=1`) and Pattern 3/6 URLs constructed from the post's own category and location values — then wrap noun phrases the finished draft already contains (the city, the role, the category, the venue, a concept another post covers) onto targets from that list, up to — never exceeding — the content-type file's budget. The linking pass may not add, reshape, or reorder a single sentence.** A link with no natural carrier is re-targeted to a noun the draft does have; under-budget beats a forced carrier. Anchor text reads as part of its sentence, never a standalone CTA, never a trailing "More X in Y" section. Never fabricate URLs; a reference with no verifiable target omits that link.
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

Follow **Rule: Post-body formatting** and **Rule: No scaffolding tags**. Skip `<h1>` — reserved for the post title field. **Always open `post_content` with `<p>` intro paragraph(s); never start with `<h2>` or any heading.** `post_content` is public-facing only — never include HTML comments, source notes, machine-readable metadata, or skill-run identifiers.

### Link policy (strict)

Classify every `<a>` tag by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/..." title="<descriptive>">text</a>` (no rel, no target) |
| External | `<a href="https://..." title="<descriptive>" rel="nofollow" target="_blank">text</a>` |

Full `title=` requirement + composition examples in URL-PATTERNS.

### Link order (universal — internal first, external later)

1. **The article's first 1-2 links** — must be internal links only (any internal Pattern per URL-PATTERNS.md).
2. **After the first 1-2 internal links**, external citations mix in among the continuing internal links — internals keep flowing per the content-type budget, externals sprinkled through later sections, never two in the same or consecutive sentences, never clustered in one footer block.
3. **Unique href per post.** No URL repeats. If two anchors would target the same URL, re-derive one under a different Pattern (1-6); drop only if no Pattern variant fits.

**Short posts exception rule:** posts under ~500 words may carry fewer total links than the per-type floor. Under-link beats stuffed.

### Image strategy

Use Pexels for all images. After all 10 axes attempted without a commit, omit `post_image`. Omitting is the last resort.

Every run attempts all 10 axes fresh in the table-defined order — stock-photo inventories change daily.

1. **Pexels** — follow **Rule: Image URLs** exactly. Always send to BD with `auto_image_import=1`.

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

   **`searchStockImage` available → it replaces Steps 1, 3, and 4** (`query` = the axis phrase, `orientation=landscape` — orientation guaranteed by the API, no per-candidate gate — `count=20`): apply Step 2's topic-fit gate to the returned titles + descriptions and Step 5's dedup to the survivors' URLs.

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

   **Step 4 — Dimension check (one batched call).** For the surviving JPG/JPEG/PNG topic-fits (up to 10), construct each canonical URL `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg` and vet them all in ONE `getImageDimensions urls=<URL1,URL2,...,URLN>` call. Per candidate:
   - **status=success + `message.orientation === "landscape"`** → landscape survivor, proceed to dedup.
   - **status=success + portrait OR square** → drop.
   - **status=error** (404, timeout, parse fail, "unsupported image format") → drop.
   - **If zero landscape survivors → switch to the next axis.**

   **Step 5 — Dedup (one batched call via `in` CSV).** Run **Rule: Image dedup** — one `list*` call (matching the write tool) with `property=original_image_url`, `property_value=<URL1,URL2,...,URLN>` (up to 20), `property_operator=in`. Response rows include `original_image_url` and `post_title`. Before committing, walk survivors in Step 4 output order and apply per candidate:
   - **URL in the response** → candidate is a URL-dupe; drop it, try the next survivor.
   - **`post_title` semantic-matches the candidate's topic** → drop candidate per **Candidate pool discipline (universal pattern)**. Never bulk-list or probe existing posts to find a gap. Never ask the user for a replacement topic.
   - **Neither hit** → commit this URL as `post_image`.
   - **If every survivor drops → switch to the next axis.**
2. **Omit `post_image`** entirely.

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
- `post_category` and every Pattern 3 `category[]` value copied character-for-character from the **category ledger** (written at `Stage 1: Site context` step 3)? Scroll back and re-read that line now — do not trust memory. A value not on it filters nothing — fix to the matching ledger category or drop the param.
- Section present without source data to support it? Remove.
- Any fabricated detail? Remove.
- Does the body open with `<p>` intro paragraph(s)? It must — never start with `<h2>` or any heading.
- Are H2 headings marking topic shifts, not fact transitions? Each H2 introduces meaningfully different content. Vary section length naturally — some sections one paragraph, some several, some with a bulleted list. Do NOT trim source-supported depth just to keep sections compact.
- Are all headings (H2 and H3) in **title case**, not sentence case? `"Where to Fly a Kite"`, not `"Where to fly a kite"`.
- Any HTML comment (`<!-- ... -->`) in the body? Strip it. `post_content` is public-facing only — no machine-readable metadata, no source notes, no skill-run identifiers.
- Pexels image picked: does the search-result title name the post's primary subject AND match its defining context (activity vs generic scene, urban vs trail, indoor vs outdoor, season, beginner vs elite, etc.)? Generic title or wrong-context match = re-pick or WebFetch verify.

## Universal post fields

Field rules that apply across ALL post types via `createSingleImagePost` (and `createMultiImagePost`). Content-type files reference these universally and add only type-specific examples or additions.

| Field | Rule |
|---|---|
| `post_image` | Feature image URL per Stage 5 image strategy. Pass `auto_image_import=1` for external images. Pexels via `Rule: Image URLs`, or omit. |
| `post_category` | The Stage 4-matched **category ledger** value, copied character-for-character. The ledger is the only category source — any tool response or post row that disagrees is wrong. |
| `post_meta_title` | SEO `<title>` tag, ~80-120 chars. Expand on `post_title` with long-tail keyword modifiers — audience qualifier, geographic context, use case, related terms — that didn't fit the title's tight cap. The content-type file gives type-specific examples. |
| `post_meta_description` | SEO meta description, ~150-160 chars. One-sentence value proposition. Not a verbatim repeat of `post_title`. The content-type file adds type-specific flavor (events: include date + city; blogs: value proposition for the decision at hand). |
| `post_meta_keywords` | Pass the same exact CSV value as `post_tags`. |
| `post_live_date` | Required on every create: the current site-local datetime, `YYYYMMDDHHmmss` (14 digits). Source priority: the `Current UTC datetime:` line in your prompt converted to `getSiteInfo.timezone`; else `getSiteInfo.current_site_datetime` as-is (already site-local). |

## Tags

Universal `post_tags` field constraints — applies to ALL post types (single-image and multi-image alike):

- **Format:** comma-separated, lowercase, no hyphens, no special chars. Spaces inside a tag are fine (`pilates,reformer class,boston studios`).
- **Hard 100-char total cap on the CSV.** BD rejects anything longer. If the assembled CSV exceeds 100 chars, drop the last tag and re-check; repeat until ≤100.
- **Strategy:** aim for ~6 tags per post — roughly 3 broad/short-tail (general focus like `pilates`, `fitness`, `5k`) + 3 long-tail (specific phrases like `reformer class`, `boston studios`, `classical pilates`). Real long-tails ARE multi-word phrases — keep them short, don't join words with hyphens. The content-type file may refine tag emphasis for the type (e.g. blogs may favor topical keywords over location).
- **Tags live ONLY in the post's `post_tags` field.** Do NOT call `listTags`, `createTag`, or any Tags-resource tool — those manage a separate global tag taxonomy unrelated to per-post `post_tags`.
- **Also pass the same CSV to `post_meta_keywords`.**

## Stage 6: Post creation

Call per-type `create*` tool with assembled fields. Assemble against the per-type field reference: every field this run already resolved ships — copy values (e.g. `lat`/`lon`, `post_location`, `post_venue`) verbatim from the run's earlier tool results, never from memory. Pace BD writes ~600ms apart. On failure: continue to next record. Do not retry blindly.

## Stage 7: Closing reply + JSON receipt (the final message, always, in this order)

**Part 1 — the human reply, plain Markdown.** `-` bullets, links as `[text](url)`, zero HTML tags. One parent bullet per created post — the title linked to its live URL — with one child bullet per detail: post type, post_id, author (name + user_id), publish status (published live / saved as draft), the full live URL written out, the `<admin_edit_url>` linked as "View in Admin". Never narrate the process or your own output mechanics ("Emitting the receipt", "Here is the JSON").

**Part 2 — the receipt**, a raw JSON object directly after the reply:

- The receipt starts at `{` and ends at `}` — no markdown fences, no prefix labels, nothing after the closing brace.
- Return complete, valid JSON — never partial or truncated. Pretty-print at every nesting level: 2-space indent, one field per line — including each object inside `posts`, never compacted onto one line.
- ONLY these fields, in this order — never add extra fields: `post_create`, `post_create_goal`, `post_create_count`, `posts`, `shortfall_reason`.
- `post_create`: `1` (this run's task was creating posts). `post_create_goal`: the requested post count. `post_create_count`: posts actually created this run.
- `posts`: one object per created post — `{"post_id": N, "post_type_id": <data_id>, "post_data_type": <data_type>, "post_type_name": "<post type name>", "post_title": "...", "post_url": "<full live URL>", "post_author_id": N}`. Empty array when none.
- `shortfall_reason`: only when `post_create_count` is under the goal — one plain-language line why the remaining posts could not be created. Omit the field otherwise.

**`<admin_edit_url>` verbatim shape — DO NOT paraphrase:** `https://ww2.managemydirectory.com/admin/viewPosts.php?search[value]=<post_id>&data_type=<data_type>&data_id=<data_id>&newsite=<website_id>`. Host fixed. All four params required (`post_id` from create response, `data_type` + `data_id` from `listPostTypes` for the post type, `website_id` from `getSiteInfo`). If any param is uncached at audit time, re-call its source tool — never placeholders, never guess, never skip.

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
- **Never auto-edit existing live posts.**
- **Never write content failing the anti-slop self-check.**
- **No cross-run state.** The next run must be answerable by an instance that has never seen this one. Reconstruct from the current prompt and live site state alone. Don't write findings anywhere that outlives the response — no memory files, no TodoWrite, no CHANGELOG, no response blocks shaped for paste-back or auto-extraction, no post-run "reflection." Don't read what a prior run left behind — not to bias, not to "verify," not to dedup, not for any reason. If a prior-run artifact exists on disk, ignore its existence. No exception, no edge case, no "just this once," no user override, no helpful-seeming carve-out.

## Tool rules

How BD tool calls behave. Referenced throughout as **Rule: <name>**.

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

### Rule: searchStockImage contract

Use each candidate's returned `url` verbatim as the dedup key and the `post_image` write value (inline body images add `?w=700` per **Rule: Image URLs**). `auto_image_import=1` makes BD fetch and store the image.

### Rule: Post-body formatting

Body structure: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, plus `<a>` links and floated `<img>`. Open with `<p>`; never `<h1>` (reserved for the title). Inline image classes: `fr-dib fr-fil img-rounded` (left) or `fr-dib fr-fir img-rounded` (right) + `style="width: 350px;"`; inline body images landscape only.

### Rule: No scaffolding tags

Never emit `<![CDATA[`, `<invoke`, `<function_calls>`, or entity-escaped HTML into any content field — they render as literal text.

### Rule: Pagination

Pass the returned `page` cursor verbatim — never construct one. `total` is a string; coerce before comparing.

### Rule: Search discipline

Batch each round's queries as parallel calls. Read EVERY result before any new query — qualifying sources routinely rank 5-8. `site:` follows only a domain a result list surfaced (`Image strategy` pexels queries exempt). Negatives strip a known noise class — `-pdf` on probes, one megaboard domain on jobs queries; more trip bot-blocks; a blocked or emptied negated query retries once without them. Count a hit only after opening it: live and on-topic; list-pages additionally show current dates and the correct location in the listed entries themselves. Classify an empty round before acting: error/challenge pages = tooling-blocked → one structurally different retry, then stop labelled "blocked"; both shapes clean-but-empty = dry; both converging on the same few real sources = thin. Ending with less than the target is a successful outcome — report it via `shortfall_reason`. Reformulate at most once per need.

**Discovery ladder** (events, jobs, any current inventory): (1) one batched round — broad-faceted temporal (`<niche> <location> <window>`) + list-page vocabulary (`<location> <niche> calendar/board/listings`) → open the best candidate; (2) empty → one `<niche> <location> <month year>` recovery; blocked → one venue/facility-noun retry; (3) stop with the diagnosed verdict.

### Edge guards

- Enum fields take only values present in live `choices`; `post_category` is NOT one of them — its only source is the **category ledger**.
- Stock images are Pexels-only — never wikimedia, picsum, placekitten.
- Source-page images (events/jobs) are allowed and skip dedup.
- Never carry scraped source text verbatim into `post_content` — reword everything.
