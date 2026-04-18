# Brilliant Directories API — Universal AI Integration

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp.svg)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/npm/l/brilliant-directories-mcp.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

Give any AI agent full access to your BD site with one API key.

**154 endpoints** across 28 resources: members, leads, posts, reviews, categories, email templates, smart lists, widgets, menus, forms, membership plans, and more.

## 30-Second Quickstart

```bash
# 1. Verify your credentials work (no install — uses npx)
npx brilliant-directories-mcp --verify --api-key YOUR_KEY --url https://your-site.com

# 2. Connect to Claude Code
claude mcp add bd-api -- npx brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com

# 3. Ask Claude: "List all members on my BD site"
```

That's it. Get your API key from **BD Admin > Settings > API Keys > Create New Key**.

---

## Setup by Platform

### Claude Code / Cursor / Windsurf / Cline (MCP)

**Option A — `npx` (recommended, no install needed):**

```bash
claude mcp add bd-api -- npx brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
```

**Option B — Global install:**

```bash
npm install -g brilliant-directories-mcp
claude mcp add bd-api -- brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
```

**Cursor / Windsurf / Cline** — add to your MCP config file (`~/.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "bd-api": {
      "command": "npx",
      "args": ["-y", "brilliant-directories-mcp", "--api-key", "YOUR_KEY", "--url", "https://your-site.com"]
    }
  }
}
```

Then ask your AI: *"List all members on my BD site"* or *"Create a new member with email john@example.com"*

---

### ChatGPT (GPT Actions)

1. In your GPT: **Configure > Actions > Create new action**
2. Under **Schema**, choose **Import from URL** and paste:
   ```
   https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
   ```
3. When prompted for `bd_site_url`, enter your BD site (e.g., `https://mysite.com`)
4. Set Authentication: **API Key**, Auth Type: **Custom**, Header Name: `X-Api-Key`, paste your key

---

### n8n

**Option A — Import OpenAPI spec (recommended):**

Import the spec URL as a custom API definition:
```
https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
```
n8n will prompt for your BD site URL and API key on import. No file editing required.

**Option B — Plain HTTP Request node:**

1. Create a new workflow, add an **HTTP Request** node
2. Set:
   - Method: `GET`
   - URL: `https://your-site.com/api/v2/user/get`
   - Header: `X-Api-Key: YOUR_KEY`

---

### Make / Zapier

**Make:** Create a custom app using the OpenAPI spec, or use HTTP module with `X-Api-Key` header.

**Zapier:** If you already have the BD Zapier app, it uses the same underlying API. For new endpoints, use Webhooks by Zapier with the `X-Api-Key` header.

---

### curl / Any HTTP Client

```bash
# Verify your API key
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/token/verify

# List members
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/user/get?limit=10

# Create a member
curl -X POST -H "X-Api-Key: YOUR_KEY" \
  -d "email=new@example.com&password=secret123&subscription_id=1&first_name=Jane&last_name=Doe" \
  https://your-site.com/api/v2/user/create

# Search members
curl -X POST -H "X-Api-Key: YOUR_KEY" \
  -d "q=dentist&address=Los Angeles&limit=10" \
  https://your-site.com/api/v2/user/search

# Update a member
curl -X PUT -H "X-Api-Key: YOUR_KEY" \
  -d "user_id=42&company=New Company Name" \
  https://your-site.com/api/v2/user/update
```

---

## Troubleshooting

**Verify your setup with one command:**
```bash
npx brilliant-directories-mcp --verify --api-key YOUR_KEY --url https://your-site.com
```
Prints `OK` if credentials work, `FAIL` with the error otherwise. Good first step for any connectivity issue.

**Debug mode — see exactly what's happening:**
```bash
npx brilliant-directories-mcp --debug --verify --api-key YOUR_KEY --url https://your-site.com
```
Logs every API request and response to stderr (your API key is automatically redacted), then exits. Useful when something isn't working and you want to share output with BD support.

> Drop `--verify` to start the full MCP stdio server with debug logging — it will appear to hang in a regular terminal because MCP servers run forever over stdio, waiting for an AI client to connect. Use `--debug --verify` for one-shot debugging from a shell.

**Common issues:**
- `401 Unauthorized` — API key is wrong, revoked, or lacks permission for the endpoint
- `404 Not Found` — site URL is wrong (check for typos; `https://` is auto-added if missing)
- `429 Too Many Requests` — rate limit hit (100 req/60s default); back off or increase limit in BD admin
- `Unknown tool` (from Claude) — the MCP server didn't load the OpenAPI spec; reinstall with `npm install -g brilliant-directories-mcp`

---

## Authentication

All requests require the `X-Api-Key` header:

```
X-Api-Key: your-api-key-here
```

API keys are scoped by permission — you control which endpoints each key can access.

## Rate Limits

**Default:** 100 requests per 60 seconds per API key.
**On request:** up to 1,000 requests per minute — contact the Brilliant Directories support team to have your site's limit raised (any value between 100 and 1,000/min).

> The limit is set server-side by BD, not a self-service setting in your admin. If you expect heavy API usage, email BD support before bulk operations and ask for a temporary or permanent increase.

When exceeded, the API returns `HTTP 429 Too Many Requests`. The MCP server surfaces this as an actionable error for your AI agent — it will know to back off or recommend requesting a higher limit.

**Plan bulk operations:** if you're asking your agent to import/update hundreds of records, either (a) request a higher limit from BD support first, or (b) tell the agent to pace itself (e.g., *"import these 500 members, pausing to respect the 100/min rate limit"*).

## Pagination

All list endpoints support pagination:

| Parameter | Description |
|-----------|-------------|
| `limit` | Records per page (default 25, max 100) |
| `page` | Cursor token from `next_page` in previous response |

Response includes: `total`, `current_page`, `total_pages`, `next_page`, `prev_page`

## Filtering

All list endpoints support filtering:

```
GET /api/v2/user/get?property=city&property_value=Los Angeles&property_operator==
```

Multiple filters:
```
GET /api/v2/user/get?property[]=city&property_value[]=Los Angeles&property[]=state_code&property_value[]=CA
```

Operators: `=`, `LIKE`, `>`, `<`, `>=`, `<=`

## Sorting

```
GET /api/v2/user/get?order_column=last_name&order_type=ASC
```

## Available Resources

| Resource | Base Path | Operations |
|----------|-----------|------------|
| Users/Members | `/api/v2/user/` | list, get, create, update, delete, search, login, transactions, subscriptions |
| Reviews | `/api/v2/users_reviews/` | list, get, create, update, delete, search |
| Clicks | `/api/v2/users_clicks/` | list, get, create, update, delete |
| Leads | `/api/v2/leads/` | list, get, create, match, update, delete |
| Lead Matches | `/api/v2/lead_matches/` | list, get, create, update, delete |
| Posts | `/api/v2/data_posts/` | list, get, create, update, delete, search, fields |
| Portfolio Groups | `/api/v2/users_portfolio_groups/` | list, get, create, update, delete, search, fields |
| Portfolio Photos | `/api/v2/users_portfolio/` | list, get, create, update, delete |
| Post Types | `/api/v2/data_categories/` | list, get, create, update, delete, custom_fields |
| Categories | `/api/v2/category/` | list, get, create, update, delete |
| Category Groups | `/api/v2/category_group/` | list, get, create, update, delete |
| Services | `/api/v2/list_services/` | list, get, create, update, delete |
| User Services | `/api/v2/rel_services/` | list, get, create, update, delete |
| User Photos | `/api/v2/users_photo/` | list, get, create, update, delete |
| User Metadata | `/api/v2/users_meta/` | list, get, create, update, delete |
| Tags | `/api/v2/tags/` | list, get, create, update, delete |
| Tag Groups | `/api/v2/tag_groups/` | list, get, create, update, delete |
| Tag Types | `/api/v2/tag_types/` | list, get, create, update, delete |
| Tag Relationships | `/api/v2/rel_tags/` | list, get, create, update, delete |
| Widgets | `/api/v2/data_widgets/` | list, get, create, update, delete, render |
| Email Templates | `/api/v2/email_templates/` | list, get, create, update, delete |
| Forms | `/api/v2/form/` | list, get, create, update, delete |
| Form Fields | `/api/v2/form_fields/` | list, get, create, update, delete |
| Membership Plans | `/api/v2/subscription_types/` | list, get, create, update, delete |
| Menus | `/api/v2/menus/` | list, get, create, update, delete |
| Menu Items | `/api/v2/menu_items/` | list, get, create, update, delete |
| Unsubscribe | `/api/v2/unsubscribe_list/` | list, get, create, update, delete |
| Smart Lists | `/api/v2/smart_lists/` | list, get, create, update, delete |

## Field Discovery

Some endpoints support dynamic field discovery:

```bash
# Get all available user fields
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/data_posts/fields?form_name=my-form
```

## Files

| File | Purpose |
|------|---------|
| [`openapi/bd-api.json`](openapi/bd-api.json) | OpenAPI 3.1 spec (single source of truth) |
| [`mcp/index.js`](mcp/index.js) | MCP server for Claude/Cursor |
| [`mcp/package.json`](mcp/package.json) | npm package definition |
| [`docs/*.md`](docs/) | Raw API endpoint documentation |
| [`LICENSE`](LICENSE) | MIT License |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history |

### Stable asset URLs

For tools that import specs by URL (ChatGPT Actions, n8n, Postman):

```
https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json
```

## Security

- API keys are never embedded in the package
- All requests go directly from the user's machine to their BD site
- No data passes through third-party servers
- API key permissions control which endpoints are accessible
- Treat your API key like a password

## Support

- BD Support: https://support.brilliantdirectories.com
- API Docs: https://support.brilliantdirectories.com/support/solutions/articles/12000108045
