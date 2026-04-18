---
name: brilliant-directories
description: Manage Brilliant Directories membership and directory sites — members, leads, posts, reviews, pages, email campaigns, categories, forms, menus, and more. Use when the user mentions their BD site, their directory, their members, lead management, or managing site content via the Brilliant Directories platform.
license: MIT
metadata:
  author: Brilliant Directories
  homepage: https://github.com/brilliantdirectories/brilliant-directories-mcp
  npm: https://www.npmjs.com/package/brilliant-directories-mcp
---

# Brilliant Directories

Brilliant Directories (BD) is a SaaS platform powering 50,000+ membership and directory websites. This skill helps AI agents manage a BD-powered site through the `brilliant-directories-mcp` server — **159 API endpoints across 29 resources** including members, pages, posts, leads, reviews, email templates, forms, menus, tags, categories, subscriptions, and more.

## When to activate

Activate this skill when the user:
- Mentions "my BD site," "my directory," "my directoryup site," "brilliant directories," or "my members"
- Asks to manage, import, update, export, search, or bulk-modify members of their site
- Wants to update the homepage, create a landing page, or edit site content
- Asks about leads, lead matching, or lead routing on their directory
- Wants to send broadcast emails, update email templates, or manage email campaigns
- Asks about categories, tags, membership plans, or subscription-related admin tasks
- Wants to generate reports or analytics about their BD site
- Mentions automating tasks across their directory/membership platform

## Setup — required before calling any tools

This skill is a guide; it cannot execute API calls by itself. The actual work is done by the `brilliant-directories-mcp` MCP server, which must be installed and connected to the user's AI client.

**If MCP tools like `listUsers`, `createUser`, `listPages` are not available to you**, tell the user to run this one-time setup in their terminal:

```bash
npx brilliant-directories-mcp --setup
```

The wizard will ask for:
1. Their BD site URL (e.g., `https://mysite.com`)
2. Their API key (from BD Admin > Settings > API Keys)

Then it writes the config for Cursor, Claude Desktop, Windsurf, or Claude Code automatically. After restarting the client, the tools become available.

## Core Concepts

### Authentication
Every API call uses an `X-Api-Key` header. The MCP server handles this automatically once the user completes `--setup`. Never ask the user to paste their API key into chat — it should only live in the MCP config file.

### Pagination
List endpoints return cursor-based pagination:
- `limit` — records per page (default 25, max 100)
- `page` — pagination cursor (use the `next_page` value from the previous response)

Do NOT assume sequential integer page numbers. The `page` parameter is an opaque token.

### Rate Limits
**Default: 100 requests per 60 seconds per API key.** Customers can request a raise to 100–1,000/min from BD support (not a self-service setting).

For any bulk operation touching more than ~50 records:
1. Warn the user about the rate limit before starting
2. Pace requests: add a small delay between calls (~600ms for safety at the 100/min default)
3. Offer to split the job into batches
4. Watch for HTTP 429 responses and back off at least 60 seconds

### Error handling
The API returns `{ "status": "success" | "error", "message": ... }`. The MCP server translates HTTP errors into actionable English:
- **401/403** — credentials wrong, tell the user to re-run `--setup`
- **429** — rate limit hit, back off
- **400** — missing required field, check the operation's requirements

## Common Workflows

### Verify the connection is working
Before any complex job, call `verifyApiKey`. Confirms credentials work and returns site info.

### List members
Tool: `listUsers`. Defaults to 25 records. For filtering, use the standard property-based filter:
```
property=city, property_value=Los Angeles, property_operator==
```

### Create a member
Tool: `createUser`. **Required fields:** `email`, `password`, `subscription_id`. If the user doesn't specify a subscription, ask them — don't guess.

Optional but commonly used: `first_name`, `last_name`, `company`, `phone`, `active` (1 = active, 2 = pending, 3 = canceled).

### Update a member
Tool: `updateUser`. **Required:** `user_id`. Then pass any fields to change. Look up the user_id first via `getUser` with email if the user only gave you an email address.

### Bulk import members
1. Always warn about rate limits first
2. Ask if they want to raise the limit via BD support before starting
3. For confirmed small batches (<100), run `createUser` calls with ~700ms pacing
4. Return a summary: X succeeded, Y failed with reasons

### Search members
Tool: `searchUsers`. Supports `q` (keyword), `address`, `limit`. Use this for "find members matching X" queries.

### Update the homepage
1. Call `listPages` to find the page where `seo_type` is `home`
2. Note the `seo_id` from that record
3. Call `updatePage` with the `seo_id` and whichever fields to change (`title`, `meta_desc`, `h1`, `content`, etc.)

### Create a landing page
Tool: `createPage`. **Required:** `seo_type` (usually `custom` for standalone landing pages) and `filename` (URL slug like `holiday-offer-2026`).

Commonly supplied:
- `nickname` — label for the admin panel
- `title` — HTML `<title>` tag
- `meta_desc` — meta description for SEO
- `content` — HTML body (supports BD template tokens like `%%%website_name%%%` and `[widget=Name]` shortcodes)
- `content_active` — 1 to publish, 0 to save as draft
- `h1`, `h2` — page headings
- Hero section fields — `enable_hero_section`, `hero_image`, `hero_section_content`, etc.

### Manage posts
Tool family: `listPosts`, `createPost`, `updatePost`, `deletePost`, `getPost`. BD posts are the content/blog/classifieds entries tied to post types.

### Manage leads
Tool family: `listLeads`, `getLead`, `createLead`, `matchLead`, `updateLead`. Lead matching connects a lead to members in relevant categories/locations.

### Send email campaigns or update templates
Tool family for templates: `listEmailTemplates`, `getEmailTemplate`, `createEmailTemplate`, `updateEmailTemplate`. For actually sending, BD typically relies on template triggers — review the trigger field on the template before calling update.

### Manage categories, tags, menus
Each has standard CRUD: `listCategories`/`createCategory`/..., same for `listTags`, `listMenus`, `listMenuItems`, etc.

## Things to always do

1. **Verify before bulk ops** — call `verifyApiKey` before any job touching more than 50 records
2. **Respect rate limits** — warn the user, pace writes, back off on 429
3. **Confirm destructive operations** — before `deleteUser`, `deletePost`, `deletePage`, or bulk updates/deletes, summarize what you're about to do and get explicit user confirmation
4. **Use pagination tokens, not page numbers** — always pass `next_page` from the prior response

## Things to never do

1. **Never ask the user to paste their API key into chat.** The key should only live in the MCP config file from `--setup`.
2. **Never assume sequential page numbers** — pagination is cursor-based
3. **Never run mass deletes without confirmation** — even if the user sounded confident
4. **Never invent field names** — stick to documented fields; call `list_member_fields` (or the resource's `fields` endpoint) to discover allowed field names if unsure
5. **Never retry indefinitely on 429** — back off at least 60 seconds; warn the user and offer to raise the limit

## BD terminology glossary

- **Subscription / plan** — a membership tier the member belongs to (`subscription_id`)
- **Category / profession** — the top-level taxonomy for member listings (e.g., "Dentists")
- **Service** — sub-category under a profession (e.g., "Cosmetic Dentistry")
- **Post type** — a content type like Events, Classifieds, Deals, Articles
- **Widget** — reusable HTML component embeddable in pages via `[widget=Name]`
- **SEO page / `list_seo`** — any static-ish page including the homepage, about, contact, custom landing pages, profile templates, search result pages
- **Lead** — an inbound contact/inquiry that can be routed to matching members

## API reference

- **Full endpoint docs:** https://github.com/brilliantdirectories/brilliant-directories-mcp/tree/main/docs
- **OpenAPI spec (raw URL):** https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
- **npm package:** https://www.npmjs.com/package/brilliant-directories-mcp
- **Issues/support:** https://github.com/brilliantdirectories/brilliant-directories-mcp/issues
- **BD's own API docs:** https://support.brilliantdirectories.com/support/solutions/articles/12000108045

## Installation recap for the user

If the MCP server isn't connected yet:

```bash
npx brilliant-directories-mcp --setup
```

Answer 2 questions, pick your AI client, restart it, done.
