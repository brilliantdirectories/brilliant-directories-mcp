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

Brilliant Directories (BD) is the SaaS platform behind 50,000+ membership and directory websites. This skill gives you programmatic control over a BD-powered site via its REST API.

## What having this skill active means for your user

You can do, without them opening the BD admin UI:

- **Member ops** — create, bulk import, update, search, delete members; auto-fetch profile photos/logos/cover images from external URLs (web-scrapes, CSVs, cross-site migrations); manage categories, credits, and tags
- **Content ops** — write blog articles, events, job listings, coupons, video posts, photo albums, property/product listings; edit the homepage, landing pages, about/contact, SEO meta tags, social Open Graph tags
- **Taxonomy ops** — build out the site's 3-tier category hierarchy (Top Category → Sub Category → Sub-Sub Category) from scratch or inline while creating members
- **Inbox & engagement** — read lead inbox, moderate reviews, trigger lead matching to send notification emails to eligible members
- **Site config** — edit navigation menus, form fields, email templates, widgets, smart lists, 301 redirects, membership plans
- **Billing introspection** — pull a member's invoice history and subscription status (read-only)

Typical outcome unlocks: "scrape 50 local businesses → create members with logos locally stored → write a blog post showcasing them → add redirects preserving SEO" — one agent run, zero admin clicks.

## Ground truth

**The authoritative source for every available operation is the OpenAPI spec:**
`https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json`

If this skill and the spec disagree, **the spec wins.** Scan the relevant tool description end-to-end before claiming a limit — BD exposes BD-specific capabilities (auto-image-import, auto-category-create, `parent=>child` sub-sub syntax, filename-is-full-path) that don't match typical REST API assumptions.

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

The user installs the MCP server once; it exposes every BD operation as a tool. To check if it's active, look at your available tools for names like `verifyApiKey`, `listUsers`, `createUser`, `listWebPages`, etc.

**Two install options** — both give the full tool surface + same agent directives:

1. **Remote (no Node.js install):** add an MCP server to the AI client's config pointing at `https://brilliantmcp.com` with two headers — `X-Api-Key` (user's BD API key) and `X-BD-Site-URL` (user's BD site URL). This hits our hosted Cloudflare Worker; the user does nothing on their machine beyond editing the config file.
2. **Local (runs as a child process on the user's machine, needs Node.js):** run the setup wizard:
   ```bash
   npx brilliant-directories-mcp@latest --setup
   ```
   The wizard asks for their BD site URL and API key, then configures their AI client automatically. After a client restart, the tools become available.

Both paths are documented in detail in the README's "Setup by Platform" section. Remote is the faster recommendation for non-technical users; Local is useful when the user wants the MCP on their own infrastructure.

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

### Worked example: "Set up a Restaurants category with Sushi sub-category and assign a member"

BD classifies members via a 3-tier hierarchy. Each tier is a different API resource with explicit TopCategory / SubCategory / MemberSubCategoryLink naming:

```
1. createTopCategory (backed by /api/v2/list_professions/create)
   with name="Restaurants", filename="restaurants"
   → returns profession_id (e.g. 42). Populates users_data.profession_id.

2. createSubCategory (backed by /api/v2/list_services/create)
   with name="Sushi", profession_id=42, filename="sushi"
   → returns service_id (e.g. 17)
   — Optional: pass master_id=<parent service_id> to make this a sub-sub-category
     nested under another SubCategory. master_id=0 (default) means directly under the TopCategory.

3. Assign a member — two options depending on whether you need per-link metadata:
   a) Simple (just tag them):
      updateUser with user_id=<Alice>, profession_id=42, services="17"
   b) With per-link metadata (price, specialty, completion count):
      createMemberSubCategoryLink with user_id=<Alice>, service_id=17, avg_price=29.99, specialty=1
```

Key rules:
- There is NO `createProfession` or `createService` tool — those are BD internal names. Use `createTopCategory` and `createSubCategory`.
- `listTopCategories` returns TOP-level only; `listSubCategories` returns SUB-level (filter by `profession_id` to scope to one parent).
- Sub-sub-categories are just SubCategories with `master_id` set to another SubCategory's `service_id`.
- A member can have ONE TopCategory (`profession_id`) but MANY SubCategories (`services` CSV or multiple `rel_services` rows).

## Things to always do

0. **Before claiming a limitation ("I can't do X", "the API doesn't support Y", "you'll need to manually..."), READ the relevant tool description first.** Don't assume limits based on typical REST APIs. This skill documents BD-specific capabilities that are NOT obvious from tool names alone — notably: external image URLs are auto-fetched (via `auto_image_import=1`), categories auto-create by name on `createUser`, `services` CSV supports `parent=>child` sub-sub-category syntax, and more. If the user asks for something you think you can't do, scan `createUser` / `updateUser` descriptions end-to-end before responding "I can't." 9 times out of 10 the capability exists and is documented.
1. **Treat the OpenAPI spec as the source of truth.** If this skill and the spec disagree, trust the spec.
2. **Verify before bulk ops** — call the token-verify endpoint before any job touching >50 records.
3. **Respect rate limits** — warn the user, pace writes, back off on 429.
4. **Confirm destructive operations** — deletes, bulk updates, overwrites — always summarize and require explicit confirmation.
5. **Use pagination tokens, not page numbers.**
6. **Discover fields at runtime** when unsure — `/fields` endpoint or the spec's schema for the operation.
7. **Acknowledge when an operation doesn't exist** rather than inventing one.
8. **Consider downstream side-effects** — when an operation changes a URL-facing field (a slug, filename, category path), inbound links to the old URL break. Ask the user if they want a compensating action (e.g., a redirect rule). The same principle applies elsewhere: renaming a required category may leave orphan records; deleting a membership plan affects every member on it. Think one hop ahead and offer the user the safer workflow.
9. **If a new/updated record isn't visible on the public site, check the fundamentals before assuming a cache bug.** BD's API writes take effect immediately when the inputs are correct. If the user reports 404 or "I don't see it," first verify: (a) the required fields were all provided, (b) any enum-typed fields (e.g., `seo_type`, `active`, `post_status`) received valid values, (c) active/status flags are set to the "visible" value (typically `content_active=1` for pages, `post_status=1` for posts, `active=2` for members). Only if those check out and the record is still invisible, suggest the user try re-saving the record in BD admin as a last-resort cache nudge — but this is rare.
10. **When supplying external image URLs to `createUser` or `updateUser`, include `auto_image_import=1` by default.** Fields that accept image URLs (`profile_photo`, `logo`, `cover_photo`) are stored as-is unless this flag is set — meaning the images will break if the source host goes down. Setting `auto_image_import=1` makes BD fetch and store the images locally. This is the right default for any web-scrape, CSV import, or cross-site migration flow. Only skip it when the user explicitly says "keep the external reference."
11. **Categories can be passed by ID or by NAME on `createUser` / `updateUser`.** BD accepts both: pass `profession_id` (numeric) or `profession_name` (string) for top-level, and `services` as a CSV mixing IDs and names. **Auto-create rules differ:** on `createUser`, unknown names are ALWAYS auto-created (hardcoded). On `updateUser`, unknown names are silently SKIPPED unless you pass `create_new_categories=1`. Verified live on the BD test site 2026-04-18. If the user says "create a member in a new Restaurants → Sushi category," just pass `profession_name="Restaurants", services="Sushi"` on `createUser` — no need to call `createTopCategory` / `createSubCategory` first. For deeper sub-sub nesting, fall back to `createSubCategory` with `master_id`.

## Things to never do

1. **Never ask the user to paste their API key into chat.** The key lives in their MCP config or their HTTP client's secret store. If they have to provide it, direct them to `--setup`.
2. **Never assume sequential page numbers** — pagination is cursor-based.
3. **Never run mass deletes without explicit user confirmation** — even if the user sounded confident. Summarize first.
4. **Never invent field names.** If unsure, call `/fields` on the resource or read the OpenAPI schema.
5. **Never retry indefinitely on 429** — back off at least 60s; offer to pace or raise the limit.
6. **Never hardcode the site URL** — it's per-customer; always ask or read from config.
7. **Never rely on memorized endpoint lists** — the API evolves; check the spec.
8. **Never invent URL prefixes when building a member's public profile link.** Every user record has a `filename` field — that IS the full relative path. The public profile URL is simply `<site-domain>/<user.filename>`. Do NOT prepend `/business/`, `/profile/`, `/member/`, `/listing/`, or any other segment. BD's router resolves `filename` verbatim. Same rule applies to post URLs (use the post's `filename` or `post_token` as documented in the post endpoints).

## BD terminology glossary

- **Member / user** — an account on a BD site. Core resource.
- **Subscription / plan / membership plan** — a tier a member belongs to. Referenced as `subscription_id`.
- **Top Category / Profession** — LEVEL 1 of the member taxonomy (e.g., "Restaurants"). Stored in `list_professions`. Use `createTopCategory`, `listTopCategories`, etc. Populates `users_data.profession_id`. A member has exactly one.
- **Sub Category / Service** — LEVEL 2, nested under a Top Category (e.g., "Sushi" under "Restaurants"). Stored in `list_services`. Use `createSubCategory` with `profession_id` = parent Top's ID. Members can have many — set via `users_data.services` CSV or via `createMemberSubCategoryLink`.
- **Sub-Sub Category** — LEVEL 3 (optional nesting). Just a SubCategory with `master_id` pointing at a parent SubCategory's `service_id`. Created via `createSubCategory` with non-zero `master_id`.
- **Member ↔ Sub Category link / rel_services** — join-table row linking a member to a SubCategory with per-link metadata (`avg_price`, `specialty`, `num_completed`). Use `createMemberSubCategoryLink` when metadata matters; otherwise the simpler `users_data.services` CSV field works.
- **Post Type** — a configuration row in `data_categories` that defines a category of user-publishable content (Blog, Event, Photo Album, Property, Product, etc.). Managed via `listPostTypes` / `getPostType` / `updatePostType` / `deletePostType`. Each post type has a `data_type` field (integer) that classifies its family. Post types are read/updated via API, but NOT creatable via the API (too admin-specific — create new post types in BD admin UI). Do NOT create posts via these tools — this is metadata only.
- **Single-Image Post** — a post record in the Single-Image family (one feature image per post). Post types with `data_type=9` (video) or `data_type=20` (article, event, blog, job, coupon, discussion) fall here. Managed via `listSingleImagePosts` / `createSingleImagePost` / etc. Backed by `data_posts` table.
- **Multi-Image Post** — a post record in the Multi-Image family (photo albums, galleries, property listings with multiple photos). Post types with `data_type=4` (Photo Album, Classified, Property, Product) fall here. Managed via `listMultiImagePosts` / `createMultiImagePost` / etc. Backed by `users_portfolio_groups` table. Individual photos within a Multi-Image Post are managed separately via `MultiImagePostPhoto` tools.
- **Multi-Image Post Photo** — individual photo within a Multi-Image Post. Added AFTER the parent Multi-Image Post via `createMultiImagePostPhoto` using the returned `group_id`. Backed by `users_portfolio` table.

  **Deciding Single vs. Multi:** look up the target post type via `getPostType` → read its `data_type` field → `data_type=4` means Multi-Image, any other value in {9,20} means Single-Image. Other `data_type` values ({10, 13, 21, 29}) are internal admin types (Member Listings, Reviews, Specialties, Favorites) — use the resource-specific endpoint instead.

  **Auto-image-import rule** (same as `createUser`): when any external image URL is supplied on a `createSingleImagePost` or `createMultiImagePost`, default `auto_image_import=1` so BD fetches the image and stores it locally. Skip only when the user explicitly wants external URL references kept.
- **Web Page / SEO page / `list_seo`** — any static-ish page on the site: homepage (`seo_type=home`), about, contact, custom landing pages (`seo_type=content`), profile/search result templates. Managed via `listWebPages`, `getWebPage`, `createWebPage`, `updateWebPage`, `deleteWebPage`. Note: several page fields have admin-UI labels that differ from the API field name (e.g., `show_form` is actually the "Apply NoIndex, NoFollow" toggle, NOT a contact-form toggle) — see `createWebPage`/`updateWebPage` tool descriptions for the full field→UI-label mapping.
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
npx brilliant-directories-mcp@latest --setup
```

Answer 2 questions (site URL, API key), pick their AI client, restart, done.

For non-MCP integrations (ChatGPT Actions, n8n, Make, Zapier, Postman, custom agents): import the OpenAPI spec URL directly and authenticate with the `X-Api-Key` header.
