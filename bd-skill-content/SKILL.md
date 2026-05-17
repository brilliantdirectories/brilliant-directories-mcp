---
name: bd-skill-content
description: Create SEO-rich content posts on a Brilliant Directories (BD) website. Use when the user wants to populate or grow their BD site with event posts, job listings, property listings, or blog articles. The skill researches publicly-available sources, applies quality gates, manufactures EEAT-rich post content, deduplicates against existing posts, and prints an audit summary. Works on any BD-powered site via the public hosted MCP at brilliantmcp.com or the npm-installed MCP wrapper. Requires a BD API key and site URL configured in the user's MCP connection. Designed so the user can invoke with a one-sentence goal ("create event posts for upcoming local fitness events") and get a complete, correct run.
---

# BD Content Skill: Multi-type content creation for Brilliant Directories sites

## What this skill does

You are running on behalf of a BD site owner. Their site is a Brilliant Directories website (a 50,000+-website SaaS platform for directories and membership sites). The user wants to create content posts on their site without writing them manually.

The skill researches publicly-available web sources for real-world data, runs that data through quality gates, manufactures EEAT-rich SEO content, and creates the posts via the BD MCP. Works for multiple content types: events, jobs, property listings, blog articles.

## Required reading (in this order)

1. `shared/METHODOLOGY.md` — universal protocol: mode detection, site context discovery, 7-stage research-and-publish pipeline, quality gates, deduplication, audit summary, hard rules.
2. `shared/ANTI-SLOP.md` — writing voice and pattern bans. Mandatory before generating any prose.
3. `shared/URL-PATTERNS.md` — internal URL construction for the user's site.

Then read the content-type-specific file from `content-types/` based on what the user wants (see routing below).

The MCP wrapper's own corpus (loaded automatically with every MCP tool) documents rate limits, force-injected fields, lean response shapes, EAV routing, `_clear_fields`, PATCH semantics, HTTP codes. Don't re-document those.

## Content-type routing

Read the user's request and route to the correct content-type protocol:

| User wants to create | Route to |
|---|---|
| Event posts (concerts, conferences, workshops, fairs, open houses, meetups, auctions, any time-bound happening) | `content-types/events.md` |
| Job listings | NOT AVAILABLE in v0.1. Tell user this content type is coming in a future release. |
| Property listings (real estate) | NOT AVAILABLE in v0.1. Tell user this content type is coming in a future release. |
| Blog articles | NOT AVAILABLE in v0.1. Tell user this content type is coming in a future release. |
| Something else | Ask the user to clarify which of the above their request maps to. |

If the user's intent is ambiguous, ask. If they say "create some posts" with no content type, ask which type.

## Top-to-bottom run protocol

Whichever content type the user picks, the run protocol is the same 12 steps documented in `shared/METHODOLOGY.md`. The content-type file in `content-types/` provides the type-specific details (post-type marker, source candidates, load-bearing facts, dedup tolerance, field reference).

The user can invoke this skill with as little as "create event posts on my site." The skill should:

1. Confirm the content type if not clear.
2. Detect mode (interactive vs autonomous — interactive if the user is in this chat).
3. Run all 12 stages of METHODOLOGY without prompting unless genuinely ambiguous.
4. Print a complete audit summary at the end.

## Required preconditions

Before running, confirm the user has:
- A BD site URL connected to their MCP (check by calling `mcp__brilliant-directories__getSiteInfo` — if it returns a site, the connection works).
- At least one event-flavored post type configured on their site (the content-type file's discovery step will verify this).

If `getSiteInfo` returns no site or errors out, tell the user the MCP isn't connected to a BD site and link them to https://brilliantmcp.com setup instructions.

## What this skill does NOT do (v0.1)

- Job, property, blog content types (coming in future releases)
- Editing existing posts (only creates new ones)
- Auto-creating BD categories in autonomous mode
- Auto-publishing in autonomous mode (drafts only unless the user explicitly authorizes live publishing)
- Calling paid third-party services
- Bypassing source ToS, robots.txt, paywalls, or auth walls
- Any action outside the target post type (no member writes, no site config changes, no theme edits)

## Output guarantees

Every run prints an audit summary listing:
- What content type was created
- Which sources were probed and which were blocked
- Per-gate skip counts
- Dedup results
- Category routing decisions
- Geocoding outcomes (for location-bound types)
- Every created post with `post_id`, title, and admin edit URL

The user can review and `deleteSingleImagePost <post_id>` (or the equivalent for other post types) anything they don't want.

## Distribution

This skill is distributed as a zip file uploaded to claude.ai/settings/customize. Source files live in the BD MCP repo at https://github.com/brilliantdirectories/brilliant-directories-mcp under `bd-skill-content/`.

The underlying MCP server is required (https://brilliantmcp.com for hosted, or `npm install brilliant-directories-mcp` for local). The skill assumes the MCP is connected before invocation.
