# METHODOLOGY: BD growth-skills protocol

Read first. Every `/bd:*` skill follows this. Per-type SKILL.md layers in type-specific details.

## Mode detection (first step)

`--autonomous` flag absent → interactive (ask user when stuck). Present → autonomous (no prompts; safer-side defaults).

**Both modes: under-produce correct > over-produce wrong. When in doubt, skip.**

## Stage 1: Site context

1. `getSiteInfo` → industry, language, timezone, country.
2. `getWebPage seo_id=1` → homepage voice.
3. `listMenus` + `listMenuItems` → vertical focus.
4. `listTopCategories` → taxonomy.
5. `listPostTypes` → cache; per-type SKILL.md provides its post-type marker.

Interactive: ask the user for location, category, author, and whether to publish live or save as drafts (one question at a time).
Autonomous: infer location from `primary_country`, vertical from homepage+menu, author from highest-admin via `listUsers --order_column=admin_level --order_type=desc --limit=5`. Publish status defaults to draft unless the user's routine prompt explicitly authorized publishing live.

## Stage 2: Source research

**2a.** Brainstorm 5-10 candidate sources for vertical+location. Per-type SKILL.md provides candidate categories. Be specific (real domain names, not "some sites").

**2b.** `WebSearch site:<domain> <keywords> <location>` per candidate. Drop dead/empty/archive pages.

**2c.** `WebFetch` top 3-5 candidates. Every extracted record must pass all 5 gates:

| Gate | Rule |
|---|---|
| Date sanity | Primary date > today AND < today+window. Window defaults to 30 days if `--window=` arg not passed. Past/year-only/quarter-only fails. |
| SPA / empty | <500 chars of meaningful text OR script-shell page → skip. |
| Required fields | Per-type SKILL.md specifies. Missing any → skip. No synthesis. |
| Confidence | Self-rate 1-10. Auto: <8 skip. Interactive: 6-7 flag for user, <6 always skip. |
| Source credibility | Gov/association/university/established trade = high (1 source OK). Random blog/aggregator = low (autonomous needs 2-source confirmation). |

**2d.** Cross-reference: 2 sources confirm → merge details, boost confidence.

**2e.** Stop at ~10-20 verified records or no new candidates. **Realistic run time: 30-60 min for 10-20 records.**

## Stage 3: Duplicate detection

Pull existing posts via `list*` filtered to relevant post type (include drafts). For each candidate, match against existing:

- Title: semantic, not string-exact
- Date: per-type tolerance from SKILL.md (events ±24h, jobs ±7d, properties ±14d)
- Location: same city OR same venue/employer/address

Title-similar AND date-close AND location-match → duplicate → skip.

### Embedded HTML-comment metadata (every created post)

```html
<!-- bd-{skill-name}-skill-meta v1
source_id={source's stable id or empty}
source_url={scrape URL}
source_name={human-readable name}
record_fingerprint={<title-slug>:<YYYY-MM-DD>:<city-slug>}
skill_run_id={<YYYYMMDDHHMMSS>-<6-char alphanumeric>}
-->
```

- `record_fingerprint`: deterministic plain-text concat (NOT a hash, LLM has no hash function). Lowercase title → hyphenate, plus ISO date, plus lowercase city. Example: `austin-tech-summit-2026:2026-06-15:austin`. Truncate to 120 chars.
- `skill_run_id`: timestamp + 6 random alphanumeric chars. Example: `20260517143022-k3m9pw`. Generate once at skill start.

Comment goes at END of `post_content`, AFTER attribution footer. Browsers strip HTML comments at render. Round-trip via `list*`/`get*`.

**Why HTML comment, not `users_meta`:** wrapper hides `createUserMeta` from agents (spec marks `DELIBERATELY HIDDEN`). One write per post, no extra calls.

Match priority on re-runs: `source_id` → `record_fingerprint` → semantic similarity.

v0.1 always SKIPS existing records. v0.2 adds `--update-existing`.

## Stage 4: Category routing

Interactive: ask user when ambiguous. Autonomous: fuzzy-match source category vs BD `feature_categories`. ≥70% confidence → use match. <70% → SKIP the record (do NOT auto-create categories).

Per-type SKILL.md may specify a fallback category.

## Stage 5: Content manufacture (universal)

**Goal:** an EEAT-rich landing page that competes for long-tail queries the source's thin listing doesn't target. Better depth, real internal-linking, structured info, honest source-grounded content. No prescriptive template — design structure to fit THIS record. A music festival, a CME workshop, an open-house, and a software-engineer job listing all look different. Trust your judgment.

### Required outcomes (any structure achieves these)

1. **Load-bearing facts up front.** A reader can answer "what is this, when/where, how do I attend or apply" within the first paragraph or first FAQ block. Per-type SKILL.md tells you which facts are load-bearing for THIS data type.
2. **Every claim source-supported.** No fabrication. Adaptive depth: 400-1500 words based on what source data + confident AI knowledge support. Better shorter and honest than longer and padded.
3. **Casual inline source reference.** At least one mention of the source(s) in flowing prose, linked with external link attributes. Helps Google EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals. NOT a forced "Source: X" footer — natural and conversational.
4. **Internal links to relevant on-site content** — only if the target pages exist per URL-PATTERNS.md discovery. Use Pattern 1 (specific post URLs), Pattern 3 (filtered listing URLs by category/location/date), or Pattern 4 (category-landing WebPages). Examples: "More music events in Austin", "Other workshops this weekend", "Browse all open houses in 78704". Never fabricate URLs. If no target exists, omit the section.
5. **External links to sources, ticket/registration vendors, official pages** — with `rel="nofollow" target="_blank"`.

### Froala HTML safety

Follow Froala safety rules from the MCP corpus (`mcp/openapi/mcp-instructions.md`, loaded with every MCP tool). Skip `<h1>` — reserved for the post title field. HTML comments `<!-- ... -->` ARE preserved by Froala (used for dedup metadata at end of `post_content`).

### Link policy (strict)

Classify every `<a>` tag by host comparison against `getSiteInfo.full_url`. Relative URLs (start with `/`) are always internal.

| Type | Format |
|---|---|
| Internal | `<a href="/...">text</a>` (no rel, no target) |
| External | `<a href="https://..." rel="nofollow" target="_blank">text</a>` |

### Image strategy

1. Source image > 600px wide AND not paywalled → use it. Pass `auto_image_import=1` for BD to store locally.
2. Else Pexels landscape (bare URL ending in `.jpg`/`.jpeg`/`.png`/`.webp`). Search by per-type keywords.
3. Else site-config default for this post type, if defined.
4. Else omit `post_image` entirely.

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

## Stage 6: Post creation

Call per-type `create*` tool with assembled fields. Pace BD writes ~600ms apart. On failure: log in audit, continue to next record. Do not retry blindly.

## Stage 7: Audit summary (always printed)

```
=== /bd:<skill> run summary ===
Mode | Site | Post type | Author | Skill run ID

Research: N candidates probed, N blocked, N extracted
Gates: per-gate skip counts (date, SPA, required, confidence, credibility)
Dedup: N already posted
Category: N skipped (no ≥70% match)
Created: N posts with post_id + title + admin_edit_url per line
Time: <wall-clock>
```

Per-type SKILL.md may add type-specific lines (geocoding for events, salary parsing for jobs, etc.).

## Failure modes

| Failure | Action |
|---|---|
| WebSearch empty | Next candidate |
| WebFetch timeout/5xx | Next candidate; max 1 retry |
| MCP 429 | Wait 60s, retry once, move on |
| MCP other error | Log, continue |
| Context limit nearing | Stop research, generate for what you have, print audit |
| Mid-run mistake | Finish, print audit clearly, user rolls back |

## Hard rules (every BD growth skill, forever)

- **Scrape facts, not content.** Extract facts from publicly-available avenues. Reword everything in BD-site voice. Never paste source paragraphs verbatim.
- **No fabrication.** If source lacks a data point, omit it from the post. Never invent details to fill a template slot. Adaptive depth: a shorter honest post beats a padded fabricated one.
- **Source references are optional + casual, not forced attribution.** When natural, reference the source inline in flowing prose (helps Google EEAT signals). Do not require a forced attribution footer.
- **Publication default is draft unless user explicitly asked to publish live.** In autonomous mode the user usually pre-specified this in the routine prompt; if not, default to draft.
- **Never auto-create BD categories in autonomous mode.** User's taxonomy is curated; grow it deliberately.
- **Never auto-edit existing live posts** (v0.1).
- **Never silently swallow errors.** Audit shows everything.
- **Never write content failing the anti-slop self-check.**
