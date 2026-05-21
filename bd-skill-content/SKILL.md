---
name: bd-skill-content
description: Create SEO-rich content posts on a Brilliant Directories (BD) website. Use when the user wants to populate or grow their BD site with event posts, job listings, property listings, or blog articles. The skill researches publicly-available sources, applies quality gates, manufactures EEAT-rich post content, deduplicates against existing posts, and prints an audit summary. Works on any BD-powered site via the public hosted MCP at brilliantmcp.com or the npm-installed MCP wrapper. Requires a BD API key and site URL configured in the user's MCP connection. Designed so the user can invoke with a one-sentence goal and get a complete, correct run.
---

# BD Content Skill: Multi-type content creation for Brilliant Directories sites

## What this skill does

Create content posts on a Brilliant Directories (BD) site. Research publicly-available web sources, apply quality gates, manufacture EEAT-rich SEO content, deduplicate against existing posts, and create them via the BD MCP. Works for events, jobs, properties, blog articles.

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
| Job listings | Not yet available. Tell the user this content type is coming in a future release. |
| Property listings (real estate) | Not yet available. Tell the user this content type is coming in a future release. |
| Something else | Ask the user to clarify which content type from this table their request maps to. |

If the user's intent is ambiguous, ask. If they say "create some posts" with no content type, ask which type.

## Top-to-bottom run protocol

The universal protocol in `shared/METHODOLOGY.md` sets the framework; the content-type file in `content-types/` lays out the end-to-end runbook for that type.

The user can invoke this skill with as little as a one-sentence goal ("create posts on my site"). The skill should:

1. Confirm the content type if not clear.
2. Detect mode (interactive vs autonomous — interactive if the user is in this chat).
3. Run the content-type runbook end-to-end without prompting unless genuinely ambiguous.

**Hard gate, every post type:** image dedup per corpus `Rule: Image dedup` MUST execute its `list*` call before any `create*Post` write. Never claim-without-executing.

## Required preconditions

Before running, confirm the user has a BD site URL connected to their MCP (check by calling `mcp__brilliant-directories__getSiteInfo` — if it returns a site, the connection works). The content-type file then verifies any per-type post-type requirements during its discovery step.

If `getSiteInfo` returns no site or errors out, tell the user the MCP isn't connected to a BD site and link them to https://brilliantmcp.com setup instructions.

## What this skill does NOT do

- Job and property content types (coming in future releases)
- Editing existing posts (only creates new ones)
- Auto-creating BD categories in autonomous mode
- Auto-publishing in autonomous mode (drafts only unless the user explicitly authorizes live publishing)
- Calling paid third-party services
- Bypassing source ToS, robots.txt, paywalls, or auth walls
- Any action outside the target post type (no member writes, no site config changes, no theme edits)

## Output guarantees

Every run ends with a brief summary listing what was created — title, `post_id`, admin edit URL per post. Customers can review and delete anything they don't want via the relevant `delete*` tool for the post type. Internal process details (candidates probed, gates failed, retries) stay out of the user-facing summary.

