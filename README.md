# Brilliant Directories API — Universal AI Integration

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp?color=blue&label=npm)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/github/license/brilliantdirectories/brilliant-directories-mcp?color=green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

Give any AI agent full access to your Brilliant Directories site with one API key.

Manage **members, posts (single-image and multi-image), leads, reviews, top and sub categories, email templates, pages (homepage, landing pages), 301 redirects, smart lists, widgets, menus, forms, tags, membership plans**, and more — across every resource BD exposes via its REST API.

## Before you start — 2 things you need

1. **Node.js installed.** If you've never run a terminal command before, install it from [nodejs.org](https://nodejs.org) (pick the "LTS" version, click through the installer). This is a one-time setup.
2. **Your BD API key.** In your BD admin: sidebar → **Developer Hub** → **Generate API Key** → copy it.

You'll also need your BD site URL — use the FULL url with `https://` and NO trailing slash. Example: `https://mysite.com` (correct). Not `mysite.com`, not `https://mysite.com/`.

## 30-Second Quickstart

Open a terminal (Mac: Terminal.app · Windows: PowerShell · Linux: your shell). Paste:

```bash
npx brilliant-directories-mcp --setup
```

The wizard asks for your BD site URL and API key, tests the connection, asks which app you use (Cursor / Claude Desktop / Windsurf / Claude Code), and writes the config for you. No JSON editing.

**Fully quit and reopen your AI app** (not just close the window — fully quit: Mac `Cmd+Q`, Windows right-click taskbar → Quit). Then ask your AI:

> "List members on my BD site"

**Success looks like:** the AI returns a table or list of member names/emails.
**Failure looks like:** the AI says "I don't have access to that" or "no tools available." If that happens, jump to [Troubleshooting](#troubleshooting) below.

### Updates are automatic

Once set up, you get new MCP versions automatically the next time you fully-quit-and-reopen your AI app. No reinstall needed.

### What you can ask the AI to do

Once connected, your AI can READ and WRITE to your BD site. Examples: *"list all members who signed up this month"*, *"create a new member named Jane Doe with email jane@…"*, *"add a blog post by member 42 titled Welcome"*, *"show me unpaid invoices"*, *"add Jane to the VIP tag"*. 164 operations across members, posts, leads, reviews, pages, menus, widgets, and more.

> ⚠️ **The AI can also DELETE and MODIFY live data** — members, posts, pages, tags, etc. Writes go directly to your live site with no undo. Before running bulk or destructive operations, test on ONE record first, and consider taking a backup. If you're unsure, ask the AI to *preview* (list/show) before it *acts*.

### For AI agents / scripts (non-interactive)

If an AI agent is guiding you, it can have you paste a single command with everything prefilled:

```bash
npx brilliant-directories-mcp --setup --url https://your-site.com --api-key YOUR_KEY --client cursor
```

This runs the full setup end-to-end with no prompts. Replace `cursor` with `claude-desktop`, `windsurf`, `claude-code`, or `print` (prints the JSON config instead of writing a file).

---

## Setup by Platform

### Claude Code / Cursor / Windsurf / Cline (MCP)

**Easiest path: use the wizard** from the [30-Second Quickstart](#30-second-quickstart) above — it handles all of this automatically.

If you prefer to wire things up by hand, here's how per app. Replace `YOUR_KEY` with your BD API key and `https://your-site.com` with your BD site URL (include `https://`, no trailing slash).

**Claude Code** — paste this one line in your terminal (Mac: Terminal.app · Windows: PowerShell):

```bash
claude mcp add bd-api -- npx brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
```

Then fully quit and reopen Claude Code.

**Cursor** — open the MCP config file at `~/.cursor/mcp.json` (create it if missing: on Mac/Linux `mkdir -p ~/.cursor && touch ~/.cursor/mcp.json`; on Windows that path is `%USERPROFILE%\.cursor\mcp.json`). Paste the block below into the file, then save. Fully quit and reopen Cursor.

**Windsurf** — same JSON format; the file is `~/.codeium/windsurf/mcp_config.json` on Mac/Linux, `%USERPROFILE%\.codeium\windsurf\mcp_config.json` on Windows.

**Cline** — same JSON format; the file is `~/Library/Application Support/Cline/MCP/cline_mcp_settings.json` on Mac, `%APPDATA%\Cline\MCP\cline_mcp_settings.json` on Windows.

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

After saving, **fully quit and reopen** the app (not just close the window — Mac `Cmd+Q`; Windows right-click taskbar → Quit).

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

Paste these in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `YOUR_KEY` and `https://your-site.com` with real values.

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

**Verify your setup with one command.** Paste in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `YOUR_KEY` and `https://your-site.com` with real values:
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
- **AI says "no tools" or "I don't have access"** — you didn't fully quit and reopen your AI app after setup. Fully quit (Mac `Cmd+Q`; Windows right-click taskbar → Quit), then reopen.
- **`401 Unauthorized`** — API key is wrong, revoked, or lacks permission for the endpoint. Regenerate in BD Admin → Developer Hub.
- **`403 API Key does not have permission to access this endpoint`** — this specific endpoint isn't granted on your key. Edit the key in BD Admin → Developer Hub and enable the missing endpoint (the error names it).
- **`404 Not Found`** — your site URL is wrong. Must include `https://` and NO trailing slash. Correct: `https://mysite.com`. Wrong: `mysite.com` or `https://mysite.com/`.
- **`429 Too Many Requests`** — rate limit hit (100 req/60s default). Wait 60 seconds, or email BD support to raise your site's limit up to 1,000/min.
- **`Unknown tool` (from Claude)** — the MCP server didn't load the OpenAPI spec; reinstall with `npm install -g brilliant-directories-mcp`.
- **`npx: command not found`** — Node.js isn't installed. Install from [nodejs.org](https://nodejs.org) (pick LTS).

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

Operators: `=`, `>`, `<`, `>=`, `<=`. Additional operators (`LIKE`, `!=`, `in`, `not_in`, `not_like`, `is_null`, `is_not_null`, `between`) are in QA and rolling out across endpoints shortly. For now, stick with `=` for string match, or enumerate and filter client-side.

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
| Single-Image Posts | `/api/v2/data_posts/` | listSingleImagePosts, getSingleImagePost, createSingleImagePost, updateSingleImagePost, deleteSingleImagePost, searchSingleImagePosts, getSingleImagePostFields |
| Multi-Image Posts | `/api/v2/users_portfolio_groups/` | listMultiImagePosts, getMultiImagePost, createMultiImagePost, updateMultiImagePost, deleteMultiImagePost, searchMultiImagePosts, getMultiImagePostFields |
| Multi-Image Post Photos | `/api/v2/users_portfolio/` | listMultiImagePostPhotos, getMultiImagePostPhoto, createMultiImagePostPhoto, updateMultiImagePostPhoto, deleteMultiImagePostPhoto |
| Post Types | `/api/v2/data_categories/` | list, get, create, update, delete, custom_fields |
| Top Categories | `/api/v2/list_professions/` | listTopCategories, getTopCategory, createTopCategory, updateTopCategory, deleteTopCategory |
| Sub Categories | `/api/v2/list_services/` | listSubCategories, getSubCategory, createSubCategory, updateSubCategory, deleteSubCategory |
| Member ↔ Sub Category Links | `/api/v2/rel_services/` | listMemberSubCategoryLinks, getMemberSubCategoryLink, createMemberSubCategoryLink, updateMemberSubCategoryLink, deleteMemberSubCategoryLink |
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
| Web Pages (SEO/static) | `/api/v2/list_seo/` | listWebPages, getWebPage, createWebPage, updateWebPage, deleteWebPage |
| Redirects (301) | `/api/v2/redirect_301/` | list, get, create, update, delete |
| Data Types | `/api/v2/data_types/` | list, get, create, update, delete |
| Website Settings | `/api/v2/website_settings/` | refreshCache |

## Field Discovery

Some endpoints support dynamic field discovery:

```bash
# Get all available user fields
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/data_posts/fields?form_name=my-form
```

## Stable asset URLs

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

## FAQ

**Does this cost anything?**
The MCP server is free (MIT license, open source). Your AI agent's subscription (Claude, Cursor, etc.) is separate. API calls to your BD site count against your site's rate limit but don't cost extra.

**Is my data sent to Anthropic / OpenAI / third parties?**
Your BD site data passes from your BD site directly to the AI client on your machine, then to the AI provider you use (Anthropic, OpenAI, etc.) as part of your conversation with the AI. The MCP server itself doesn't relay data anywhere else — no telemetry, no third-party servers in between.

**Can I connect more than one BD site?**
Yes. Add multiple entries under `mcpServers` with different names (e.g. `bd-site-a`, `bd-site-b`), each with its own API key and URL. Your AI will see tools from both.

**Can my team share one key, or should everyone have their own?**
Each person should generate their own API key (BD Admin → Developer Hub). Keys are per-user so revoking one doesn't break anyone else.

**How do I disconnect / remove the MCP?**
- Claude Code: `claude mcp remove bd-api`
- Cursor / Windsurf / Cline: delete the `bd-api` entry from the MCP config JSON file, save, fully quit and reopen the app.

**How do I undo something the AI did?**
BD's API doesn't have a universal undo. For members, prefer `updateUser active=3` (Canceled) over `deleteUser` — it's reversible. For destructive operations, back up first or test on one record.

**Can I try this safely on a test site before production?**
Yes. Generate a separate API key on a BD staging/dev site, set that URL + key in your MCP config. Once you trust the workflow, switch to production.

**How do I know which endpoints my API key has permission for?**
Check your key in BD Admin → Developer Hub. When you hit `403 API Key does not have permission to access this endpoint`, the error names the denied endpoint — enable it on the key, save, retry.

## Support

- **Bug reports / feature requests:** https://github.com/brilliantdirectories/brilliant-directories-mcp/issues
- **BD Support:** https://support.brilliantdirectories.com
- **API Docs:** https://support.brilliantdirectories.com/support/solutions/articles/12000108045
