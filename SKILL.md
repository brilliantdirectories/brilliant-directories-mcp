---
name: brilliant-directories
description: Manage a Brilliant Directories (BD) membership or directory website via its REST API. Use when the user mentions their BD site, their directory, their members/leads/posts, managing site content, or automating anything on their Brilliant Directories platform.
license: MIT
metadata:
  author: Brilliant Directories
  homepage: https://github.com/brilliantdirectories/brilliant-directories-mcp
  npm: https://www.npmjs.com/package/brilliant-directories-mcp
  openapi: https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
---

# Brilliant Directories

Brilliant Directories (BD) is a SaaS platform powering 50,000+ membership and directory websites. This skill helps any AI agent manage a BD-powered site using the live BD REST API.

**The authoritative source of truth for every available operation is the OpenAPI spec:**
`https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json`

If anything in this skill appears stale, **the spec wins.** Always prefer reading the spec at runtime over trusting enumerations in this document.

## When to activate

Activate this skill when the user:
- Mentions "my BD site," "my directory," "my directoryup site," "brilliant directories," or "my members"
- Asks to manage, import, update, export, search, or bulk-modify members/leads/posts/pages
- Wants to update the homepage, create a landing page, edit site content, or change SEO
- Wants to send emails, manage templates, configure forms, categories, tags, menus, or membership plans
- Mentions automating tasks across their directory/membership platform
- Asks something that sounds like an admin-panel task on a BD-powered site

## Two ways to reach the API (agent-agnostic)

This skill works with any AI agent. Two integration paths — use whichever the agent supports:

### Path A — MCP (preferred for Claude Desktop / Cursor / Windsurf / Cline / Claude Code)

The user installs the MCP server once; it exposes every BD operation as a tool. To check if it's active, look at your available tools for names like `verifyApiKey`, `listUsers`, `createUser`, `listPages`, etc.

**If MCP tools are NOT available**, tell the user to run:
```bash
npx brilliant-directories-mcp --setup
```
The wizard asks for their BD site URL and API key, then configures their AI client automatically. After a client restart, the tools become available.

**Getting an API key:** BD Admin > Developer Hub > Generate API Key (full walkthrough: https://support.brilliantdirectories.com/support/solutions/articles/12000088768).

### Path B — Direct HTTPS using the OpenAPI spec (for ChatGPT Actions, n8n, Make, Zapier, LangChain, custom agents)

If MCP isn't available but the agent can make authenticated HTTP requests:
- Base URL: the user's BD site (e.g., `https://mysite.com`) — never hardcode, always ask
- Auth: HTTP header `X-Api-Key: {user's API key}`
- All endpoints and schemas: the OpenAPI spec URL above. Read it to discover operations, required fields, response shapes.

Both paths hit the same underlying REST API and behave identically.

## Tool / operation discovery (future-proof rule)

**Never assume a tool exists based on this document.** BD's API grows over time and this skill can't be updated for every new resource. The correct pattern:

1. If using MCP: list your available tools. Use whatever the client exposes.
2. If using HTTP directly: GET the OpenAPI spec (URL above). Enumerate `paths` to see every endpoint. Each operation's `operationId` is the stable name.
3. To discover writable fields on any resource: many resources expose a `/fields` endpoint (e.g., `GET /api/v2/user/fields`, `GET /api/v2/data_posts/fields`) that returns field metadata including `required`, `type`, `choices`, and `helpText`.

If a user asks for something and no matching operation appears in the spec, say so honestly: "The BD API doesn't currently expose that operation — you'll need to do it in the BD admin panel."

## Core conventions (stable across all resources)

### Authentication
Every API call uses `X-Api-Key` as an HTTP header. Via MCP, the server handles this automatically. Never ask the user to paste their API key into chat.

### Base URL pattern
All endpoints live under `{site_url}/api/v2/{resource}/{action}` — e.g., `https://mysite.com/api/v2/user/get`.

### Pagination (cursor-based)
- Request: `limit` (default 25, max 100) + `page` (opaque cursor token from prior response's `next_page`)
- Response includes: `total`, `current_page`, `total_pages`, `next_page`, `prev_page`
- **Never assume sequential integer page numbers.** The `page` parameter is an opaque token.

### Filtering
All list endpoints support property-based filtering:
```
?property=city&property_value=Los Angeles&property_operator==
```
Operators: `=`, `LIKE`, `>`, `<`, `>=`, `<=`. Multiple filters via `property[]=...&property_value[]=...`.

### Sorting
```
?order_column=last_name&order_type=ASC
```

### Response shape
Success: `{ "status": "success", "message": [...records...] or {record}, ...pagination fields... }`.
Error: `{ "status": "error", "message": "human-readable reason" }` with standard HTTP status codes.

### Rate limits
**Default 100 requests per 60 seconds per API key.** Customers can request a raise to anywhere between 100 and 1,000/min by contacting Brilliant Directories support — this is NOT a self-service admin setting.

For bulk operations:
1. Warn the user about the limit before starting
2. Add pacing between writes (~600–700ms per call at the default limit)
3. Watch for HTTP 429 responses; if hit, back off at least 60 seconds before retrying
4. For known-large jobs (>500 records), suggest the user contact BD support to raise the limit first

### Template tokens in text fields
Many text fields (titles, meta tags, email subjects, page content) support BD template tokens:
- `%%%website_name%%%` — the site's configured name
- `%%Profession%%` — the user's profession/category
- Widget embeds: `[widget=Widget Name]`
Preserve these exactly as the user provides — do not "clean them up" or escape them.

## Canonical multi-step pattern

For any non-trivial task, follow this sequence:

1. **Verify** — call `verifyApiKey` (or `GET /api/v2/token/verify`) to confirm credentials and site are reachable
2. **Discover** — if unsure about field names/types, call the resource's `/fields` endpoint (e.g., `GET /api/v2/user/fields`)
3. **Scope** — if the task involves many records, count them first with a narrow list query; confirm count with the user before writing
4. **Confirm destructive operations** — summarize what you're about to change/delete and ask the user to confirm, especially for bulk writes
5. **Act** — execute calls, pacing writes per the rate-limit rules
6. **Report** — summarize what happened: X succeeded, Y failed with specific reasons, Z skipped

### Worked example: "Import 300 members from this CSV"

```
1. Call verifyApiKey → confirm credentials work
2. Call GET /api/v2/user/fields → confirm required fields: email, password, subscription_id
3. Parse the CSV, show the user "I found 300 records, first row looks like: {...}. Proceed?"
4. If >100, warn: "BD's default rate limit is 100/min — this will take ~3 minutes. Want to have BD support raise it first?"
5. For each row: call createUser with ~700ms delay. Track failures with reasons.
6. Report: "Created 287/300. 13 failed: 9 because email already exists, 4 invalid subscription_id."
```

## Things to always do

1. **Treat the OpenAPI spec as the source of truth.** If this skill and the spec disagree, trust the spec.
2. **Verify before bulk ops** — call the token-verify endpoint before any job touching >50 records.
3. **Respect rate limits** — warn the user, pace writes, back off on 429.
4. **Confirm destructive operations** — deletes, bulk updates, overwrites — always summarize and require explicit confirmation.
5. **Use pagination tokens, not page numbers.**
6. **Discover fields at runtime** when unsure — `/fields` endpoint or the spec's schema for the operation.
7. **Acknowledge when an operation doesn't exist** rather than inventing one.
8. **Consider downstream side-effects** — when an operation changes a URL-facing field (a slug, filename, category path), inbound links to the old URL break. Ask the user if they want a compensating action (e.g., a redirect rule). The same principle applies elsewhere: renaming a required category may leave orphan records; deleting a membership plan affects every member on it. Think one hop ahead and offer the user the safer workflow.
9. **Warn when API writes don't fully propagate.** BD's admin UI runs side-effects (cache rebuild, URL router refresh, sitemap regeneration) that API writes sometimes skip. If you just created or modified a resource that should be visible on the public site (a page, a post, a menu item, a category) and the user reports "I don't see it / it's 404," the fix is usually: BD Admin → find the record → click Save (no changes needed). Tell the user this proactively after any `createPage`, `createPost`, or `createMenuItem` operation: *"Created. Note: you may need to go to BD Admin → Manage [type] → Save on this record once for the change to fully propagate on the public site."* This is a documented BD API limitation, not a bug in the write itself.

## Things to never do

1. **Never ask the user to paste their API key into chat.** The key lives in their MCP config or their HTTP client's secret store. If they have to provide it, direct them to `--setup`.
2. **Never assume sequential page numbers** — pagination is cursor-based.
3. **Never run mass deletes without explicit user confirmation** — even if the user sounded confident. Summarize first.
4. **Never invent field names.** If unsure, call `/fields` on the resource or read the OpenAPI schema.
5. **Never retry indefinitely on 429** — back off at least 60s; offer to pace or raise the limit.
6. **Never hardcode the site URL** — it's per-customer; always ask or read from config.
7. **Never rely on memorized endpoint lists** — the API evolves; check the spec.

## BD terminology glossary

- **Member / user** — an account on a BD site. Core resource.
- **Subscription / plan / membership plan** — a tier a member belongs to. Referenced as `subscription_id`.
- **Category / profession** — the top-level taxonomy for member listings (e.g., "Dentists").
- **Service** — sub-category under a profession (e.g., "Cosmetic Dentistry").
- **Post / post type** — content items (events, classifieds, articles, deals) organized by type.
- **Page / SEO page / `list_seo`** — any static-ish page on the site: homepage (`seo_type=home`), about, contact, custom landing pages, profile/search result templates.
- **Widget** — reusable HTML component embeddable in pages/emails via `[widget=Name]` shortcode.
- **Lead** — an inbound contact/inquiry, can be routed/matched to relevant members.
- **Form** — a configurable form that collects inputs (signup, contact, quote request, etc.).
- **Redirect / `redirect_301`** — a 301 permanent redirect rule. Maps an old URL path to a new destination. Used after profile renames, post slug changes, category restructuring, or custom URL migrations to preserve SEO and inbound links.
- **Template token** — placeholder like `%%%website_name%%%` expanded at render time.
- **Active status** — most BD records have an `active` or `content_active` field where `1` = visible/live and `0` = hidden/draft. Members use a 3-state convention (`1` = not active, `2` = active, `3` = canceled, etc.) — always verify via `/fields` for the specific resource.

## Reference URLs

- **OpenAPI spec (live, authoritative):** https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
- **Full endpoint docs (human-readable):** https://github.com/brilliantdirectories/brilliant-directories-mcp/tree/main/docs
- **npm package (MCP server):** https://www.npmjs.com/package/brilliant-directories-mcp
- **Issues / bug reports:** https://github.com/brilliantdirectories/brilliant-directories-mcp/issues
- **BD's own API documentation:** https://support.brilliantdirectories.com/support/solutions/articles/12000108045
- **Generate an API key:** https://support.brilliantdirectories.com/support/solutions/articles/12000088768

## Installation recap for the user

If the user needs to set up the MCP server:

```bash
npx brilliant-directories-mcp --setup
```

Answer 2 questions (site URL, API key), pick their AI client, restart, done.

For non-MCP integrations (ChatGPT Actions, n8n, Make, Zapier, Postman, custom agents): import the OpenAPI spec URL directly and authenticate with the `X-Api-Key` header.
