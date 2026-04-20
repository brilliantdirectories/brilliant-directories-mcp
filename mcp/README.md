# Brilliant Directories API — Universal AI Integration

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp?color=blue&label=npm)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/github/license/brilliantdirectories/brilliant-directories-mcp?color=green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

Give any AI agent full access to your Brilliant Directories site with one API key.

Manage **members, posts (single-image and multi-image), leads, reviews, top and sub categories, email templates, pages (homepage, landing pages), 301 redirects, smart lists, widgets, menus, forms, tags, membership plans**, and more — across every resource BD exposes via its REST API.

## Before you start — 3 things you need

1. **Node.js installed.** MCP runs on Node — it's a one-time install from [nodejs.org](https://nodejs.org) (pick the "LTS" version, double-click the installer, click Next through the prompts). 60 seconds.
2. **Your BD API key.** BD Admin sidebar → **Developer Hub** → **Generate API Key** → copy it.
3. **Your BD site URL.** Include `https://`, no trailing slash. ✅ `https://mysite.com` · ❌ `mysite.com` · ❌ `https://mysite.com/`

## Table of Contents

- [Setup by Platform](#setup-by-platform)
  - [Cursor](#cursor-recommended-path)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [Windsurf](#windsurf)
  - [Cline (VS Code extension)](#cline-vs-code-extension)
  - [ChatGPT (GPT Actions)](#chatgpt-gpt-actions)
  - [n8n](#n8n)
  - [Make / Zapier](#make--zapier)
  - [curl / any HTTP client](#curl--any-http-client)
- [What you can ask the AI](#what-you-can-ask-the-ai)
- [Updates are automatic](#updates-are-automatic)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Authentication, Rate Limits, Pagination, Filtering, Sorting, Resources](#authentication)
- [Support](#support)

## 30-Second Quickstart (try this first)

Open a terminal (Mac: **Terminal.app** · Windows: **PowerShell** · Linux: your shell). Paste:

```bash
npx brilliant-directories-mcp --setup
```

A wizard asks for your URL + API key, tests the connection, asks which app you use, and writes the config file automatically. If it works, **fully quit and reopen your AI app** and [skip to "What you can ask the AI"](#what-you-can-ask-the-ai).

If the wizard errors, hangs, or your AI still says "no tools available" after restart, use the per-platform step-by-step below — it's the same outcome, just done by hand.

---

## Setup by Platform

Every method below uses this config block — keep it handy. Replace `YOUR_KEY` and `https://your-site.com` with your values:

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

---

### Cursor (recommended path)

**GUI method (easiest — no terminal needed):**

1. Open Cursor.
2. **Settings menu**:
   - Mac: menu bar → **Cursor → Settings → Cursor Settings**
   - Windows / Linux: **File → Preferences → Cursor Settings**
   - (Or Command Palette: `Cmd/Ctrl + Shift + P` → type "Open MCP Settings")
3. Click **Tools & MCP** in the left sidebar.
4. Click **New MCP Server**.
5. Paste the config block above. Replace `YOUR_KEY` and `https://your-site.com` with your values.
6. Click Save.
7. **Fully quit and reopen Cursor** (menu bar → Quit; or Mac `Cmd+Q`; or Windows right-click the taskbar icon → Quit).

**File method (fallback):** edit `~/.cursor/mcp.json` (Mac/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows). Paste the config block, save, fully quit and reopen Cursor.

---

### Claude Desktop

**GUI method:**

1. Open Claude Desktop.
2. From the **menu bar** (top of screen on Mac, top of app window on Windows): **Settings → Developer tab → Edit Config**. (This opens the config file in your default text editor.)
3. Paste the config block above into the file. Save.
4. **Fully quit and reopen Claude Desktop** (Mac `Cmd+Q`; Windows right-click taskbar icon → Quit).
5. **Verify:** open a new chat. Look at the bottom-right of the input box for a hammer 🔨 icon with a number. That's the tool count. Click it to see the BD tools listed.

Config file path (in case you want to edit directly): `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

---

### Claude Code

Terminal only (Claude Code has no MCP GUI). Paste in **Terminal.app** (Mac) or **PowerShell** (Windows):

```bash
claude mcp add bd-api -- npx brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com
```

Replace `YOUR_KEY` and `https://your-site.com` with your values. Then close and reopen Claude Code.

---

### Windsurf

**GUI method:**

1. Open Windsurf.
2. Click **Windsurf - Settings** at bottom-right (or Command Palette: `Cmd/Ctrl + Shift + P` → "Open Windsurf Settings").
3. Go to **Cascade** section → find **Model Context Protocol (MCP)** → enable it.
4. In the **Cascade panel**, click the **MCPs icon** (top-right) → **Configure** (opens the config file).
5. Paste the config block above. Save.
6. **Fully quit and reopen Windsurf.**

---

### Cline (VS Code extension)

**GUI method:**

1. Open VS Code with Cline installed.
2. Click the **Cline icon** in the sidebar to open the Cline panel.
3. Click the **MCP Servers icon** in Cline's top navigation bar.
4. Click **Configure MCP Servers** (opens the config file in VS Code).
5. Paste the config block above. Save.
6. Back in the MCP Servers panel, you should see `bd-api` — toggle it **on** if not already.
7. Reload the Cline panel (or close/reopen VS Code) if the tools don't appear.

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

## What you can ask the AI

Once connected, your AI can **read AND write** to your BD site. Example prompts:

- *"List all members who signed up this month"*
- *"Create a new member named Jane Doe with email jane@example.com"*
- *"Add a blog post by member 42 titled 'Welcome to our directory'"*
- *"Show me unpaid invoices"*
- *"Add Jane to the VIP tag"*
- *"Set up a new landing page at /promo with a hero section"*

164 operations across members, posts, leads, reviews, pages, menus, widgets, email templates, categories, and more.

**What success looks like:** the AI returns the data you asked for, or confirms the action with a new ID.
**What failure looks like:** the AI says "I don't have access to that," "no tools available," or "unknown function." → jump to [Troubleshooting](#troubleshooting).

> ⚠️ **The AI can also DELETE and MODIFY live data.** Writes go directly to your live site — no undo. Before running bulk or destructive operations, test on ONE record first. Consider a backup. If unsure, ask the AI to *preview* (list/show) before it *acts*.

## Updates are automatic

Once set up, you get new MCP versions automatically the next time you fully quit and reopen your AI app. No reinstall needed.

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
