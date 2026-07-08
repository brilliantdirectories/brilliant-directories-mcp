---
name: bd-skill-content
description: Create SEO-rich content posts on a Brilliant Directories (BD) website. Use when the user wants to populate or grow their BD site with event posts, job listings, or blog articles. The skill researches publicly-available sources, applies quality gates, manufactures EEAT-rich post content, deduplicates against existing posts, and prints an audit summary. Works on any BD-powered site via the public hosted MCP at brilliantmcp.com or the npm-installed MCP wrapper. Requires a BD API key and site URL configured in the user's MCP connection. Designed so the user can invoke with a one-sentence goal and get a complete, correct run.
---

# BD Content Skill: Multi-type content creation for Brilliant Directories sites

## What this skill does

Create content posts on a Brilliant Directories (BD) site. Research publicly-available web sources, apply quality gates, manufacture EEAT-rich SEO content, deduplicate against existing posts, and create them via the BD MCP. Works for events, jobs, blog articles.

## Required reading (in this order)

1. `shared/METHODOLOGY.md` — universal protocol.
2. `shared/ANTI-SLOP.md` — writing voice and pattern bans. Mandatory before generating any prose.
3. `shared/URL-PATTERNS.md` — internal URL construction for the user's site.

Then read the content-type-specific file from `content-types/` based on what the user wants (see the `Content-type routing` section).

## Content-type routing

Read the user's request and route to the correct content-type protocol:

| User wants to create | Route to |
|---|---|
| Event posts (concerts, conferences, workshops, fairs, open houses, meetups, auctions, any time-bound happening) | `content-types/events.md` |
| Blog articles (how-to, listicle, pillar guide, news, comparison — any evergreen long-form article) | `content-types/blog.md` |
| Job listings (job postings, open positions, hiring, careers — any "we're hiring for this role" listing) | `content-types/jobs.md` |

Request maps to no row → end the run with the Stage 7 receipt; `shortfall_reason` names the unsupported content type.

## Top-to-bottom run protocol

The universal protocol in `shared/METHODOLOGY.md` sets the framework; the content-type file in `content-types/` lays out the end-to-end runbook for that type.

The user can invoke this skill with as little as a one-sentence goal ("create posts on my site"). The skill should:

1. Resolve the content type from the request.
2. Run the content-type runbook end-to-end without prompting.

**Hard gate, every post type:** image dedup per METHODOLOGY **Rule: Image dedup** MUST execute its `list*` call before any `create*Post` write. Never claim-without-executing.

## Required preconditions

Before running, verify the MCP connection by calling `mcp__brilliant-directories__getSiteInfo` — a returned site means it works. The content-type file then verifies any per-type post-type requirements during its discovery step.

If `getSiteInfo` errors or returns no site, retry once; still failing → end the run with the tool's error as the shortfall reason.

## What this skill does NOT do

- Editing existing posts (only creates new ones)
- Calling paid third-party services
- Bypassing source ToS, robots.txt, paywalls, or auth walls
- Any action outside the target post type (no member writes, no site config changes, no theme edits)


