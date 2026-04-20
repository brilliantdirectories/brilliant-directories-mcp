# Brilliant Directories API — Universal AI Integration

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp?color=blue&label=npm)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/github/license/brilliantdirectories/brilliant-directories-mcp?color=green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

Give any AI agent full access to your Brilliant Directories site with one API key.

Manage **members, posts (single-image and multi-image), leads, reviews, top and sub categories, email templates, pages (homepage, landing pages), 301 redirects, smart lists, widgets, menus, forms, tags, membership plans**, and more — across every resource BD exposes via its REST API.

## Before you start — 3 things you need

1. **Node.js installed.** MCP runs on Node — it's a one-time install from [nodejs.org](https://nodejs.org) (pick the "LTS" version, double-click the installer, click Next through the prompts). 60 seconds.
2. **Your BD API key (with the right permissions).** BD Admin → **Developer Hub** → **Generate API Key** → copy it.

   > ⚠️ **Enable advanced endpoint permissions, or the AI hits 403s on most writes.** Fresh keys have only baseline endpoints enabled.
   >
   > Developer Hub → find your key → **Actions** → **Permissions** → **Advanced Endpoints** tab → **ALL ON** → **Save Permissions**.
   >
   > Skip this and the agent works for basic member read/write but fails on pages, forms, menus, tags, templates, reviews, leads, etc.
3. **Your BD site URL.** Include `https://`, no trailing slash.
   - ✅ `https://mysite.com`
   - ❌ `mysite.com` (missing `https://`)
   - ❌ `https://mysite.com/` (trailing slash)

## Table of Contents

- [Setup by Platform](#setup-by-platform)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
    - [Using Claude CLI inside Cursor](#using-claude-cli-inside-cursor)
  - [OpenAI (ChatGPT / Codex)](#openai-chatgpt--codex)
  - [Windsurf](#windsurf)
  - [Cline (VS Code extension)](#cline-vs-code-extension)
  - [Cursor](#cursor)
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

Run our one-command wizard in a **terminal** (a text-only app for running commands).

**Open a terminal:**
- **Mac:** `Cmd+Space` → type `Terminal` → Enter.
- **Windows:** Windows key → type `PowerShell` → Enter.
- **Linux:** `Ctrl+Alt+T`.

**Paste this, press Enter:**

```bash
npx brilliant-directories-mcp --setup
```

> **Paste shortcut:** `Cmd+V` (Mac). `Ctrl+Shift+V` or right-click (Windows/Linux).

The wizard asks for your URL + API key, tests the connection, asks which AI app you use, and writes its config.

**Then fully quit and reopen the AI app** (not just close the window):
- **Mac:** `Cmd+Q`, or menu bar → app name → **Quit**.
- **Windows:** right-click the app in the system tray (bottom-right by the clock; may be under `^`) → **Quit**.
- **Linux:** `Ctrl+Q`, or File → Quit.

Working? [Skip to "What you can ask the AI"](#what-you-can-ask-the-ai).

If the wizard errors or tools still don't show up after restart, use the per-platform steps below — same outcome, done by hand.

---

## Setup by Platform

<a id="the-config-block"></a>

Every method below uses **the config block** — keep it handy. Replace `ENTER_API_KEY` and `https://your-site.com` with your values:

```json
{
  "mcpServers": {
    "bd-api": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

---

### Claude Desktop

> ⚠️ **Skip Settings → Connectors.** That's for remote MCP servers (public URLs like `https://mcp.stripe.com`). Ours runs locally via `npx`. Use **Settings → Developer → Edit Config** instead.
>
> ⚠️ **New chat isn't enough — fully quit and reopen the app** after editing the config. Claude loads MCP servers only at app launch.
> - **Windows:** right-click Claude in the system tray (bottom-right, near the clock; may be under `^`) → **Quit**. Closing the window isn't enough.
> - **Mac:** `Cmd+Q`, or menu bar → **Claude** → **Quit Claude**. Red-dot close isn't enough.

**Steps (no terminal):**

1. Open Claude Desktop.
2. Menu bar → **Settings → Developer tab → Edit Config**. This opens `claude_desktop_config.json` in TextEdit (Mac) or Notepad (Windows).
3. Pick your scenario:

#### Scenario A — file is empty `{}` or has no `mcpServers` entry

Select all (`Cmd+A` / `Ctrl+A`), delete, paste:

```json
{
  "mcpServers": {
    "bd-api": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` and the URL. Save.

#### Scenario B — file already has content (preferences, Google connectors, other MCP servers)

Merge — don't overwrite. Two rules:
- Comma between top-level entries.
- Final `}` at the bottom stays one brace.

**Before:**

```json
{
  "preferences": {
    "menuBarEnabled": false,
    "legacyQuickEntryEnabled": false
  }
}
```

**After:**

```json
{
  "preferences": {
    "menuBarEnabled": false,
    "legacyQuickEntryEnabled": false
  },
  "mcpServers": {
    "bd-api": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Two changes: `,` added after the `preferences` closing `}`, and the `mcpServers` block added before the final `}`. Replace `ENTER_API_KEY` and the URL. Save.

> **Paste your final file into [jsonlint.com](https://jsonlint.com) before restarting.** Missing commas silently break the MCP — a validator flags them instantly.

---

4. **Fully quit Claude Desktop:**
   - **Mac:** `Cmd+Q`, or menu bar → **Claude** → **Quit Claude**. Red-dot close doesn't quit.
   - **Windows:** right-click Claude in the system tray (bottom-right, near the clock; may be under `^`) → **Quit**. If it's not there, Task Manager (`Ctrl+Shift+Esc`) → `Claude` → right-click → **End task**.
5. **Reopen Claude. Start a new chat.**
6. **Verify:** look bottom-right of the chat input for a **🔨 hammer icon with a number**. That's your tool count. Click to see BD tools listed.

> **No hammer?** **Settings → Developer → Local MCP servers** shows `bd-api` with an error status. Common causes: JSON typo (run through [jsonlint.com](https://jsonlint.com)), wrong API key, URL missing `https://` or has trailing slash, Node.js not installed.

**Direct config file path** (if you skip Settings):
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

---

### Claude Code

Terminal only (Claude Code has no MCP GUI). Paste in any terminal — **Terminal.app** (Mac), **PowerShell** (Windows), or the **built-in terminal inside Cursor / VS Code** (``Ctrl+` `` on Windows/Linux, ``Cmd+` `` on Mac, or **View → Terminal**):

```bash
claude mcp add bd-api -- npx brilliant-directories-mcp --api-key ENTER_API_KEY --url https://your-site.com
```

Replace `ENTER_API_KEY` and `https://your-site.com` with your values. Then close and reopen Claude Code.

> **That command is where you give your credentials.** The `--api-key` and `--url` flags are baked into the MCP server config (stored in `~/.claude.json`). You do NOT need to paste them again anywhere — Claude passes them automatically to the BD MCP on every tool call. To rotate or change them later, run `claude mcp remove bd-api` then re-run the `claude mcp add` command with the new values.

#### Using Claude CLI inside Cursor

Running the Claude extension / Claude CLI **inside Cursor** (instead of — or alongside — Cursor's native agent)? Install BD MCP into **Claude's** config, not Cursor's. They're two separate MCP hosts that happen to live in the same editor window:

| Host | Config file | Panel that shows its MCPs |
|---|---|---|
| **Claude CLI / extension** | `~/.claude.json` | Claude's own tool list (visible when you ask it what tools it has) |
| **Cursor's native agent** | `~/.cursor/mcp.json` | Cursor **Settings → Tools & MCP** |

Setup:

1. **Open a terminal inside Cursor** (``Ctrl+` `` on Windows/Linux, ``Cmd+` `` on Mac, or **View menu → Terminal**) — you don't need to leave Cursor. Run the **Claude Code** install command above (`claude mcp add bd-api -- npx brilliant-directories-mcp --api-key ... --url ...`). Credentials are included in that one command — no separate step. This writes to `~/.claude.json` globally; Claude-in-Cursor will see BD tools on next launch. Verify with `claude mcp list` in the same terminal — you should see `bd-api` listed.
2. **Cursor's Tools & MCP panel will still show nothing. That's expected** — it only reflects `~/.cursor/mcp.json`, a separate host. Claude's MCPs don't appear there.
3. If you ALSO want BD MCP available to Cursor's native agent (not only Claude), follow the [Cursor section](#cursor) below as well. The two configs don't cross-pollinate — each install gets its own `--api-key` + `--url`.

> **How to tell which host is serving your MCP tools:** ask your agent to list its available tools. If you see `mcp__brilliant-directories__*` functions but Cursor's Tools & MCP panel is empty, the tools are coming from Claude's host, not Cursor's.

---

### OpenAI (ChatGPT / Codex)

> ⚠️ **OpenAI support is CLI-only for this MCP today.** Here's the honest landscape:
>
> | OpenAI surface | Works with the full BD MCP? |
> |---|---|
> | ChatGPT web (`chatgpt.com`) | ❌ No — Custom GPT Actions cap at **30 operations per GPT**; our MCP has 175 |
> | ChatGPT Desktop app | ❌ No — same 30-op cap (loads the same Custom GPTs) |
> | Codex Cloud app | ❌ No — uses OpenAI's App Server architecture; MCP support is partial/evolving |
> | **Codex CLI** (terminal) | ✅ **Yes — full MCP support, no op cap** |
>
> If you want full BD automation through OpenAI: use **Codex CLI**. For Custom GPTs with Actions (narrow-scope use cases where 30 ops is enough), see the fallback section at the bottom.
>
> Users who want a GUI experience should use Claude Desktop / Cursor / Windsurf / Cline instead — all MCP-native with no op cap and no terminal required.

#### Codex CLI setup (recommended OpenAI path)

Codex CLI is OpenAI's terminal-based agent, similar to Claude Code. It supports local stdio MCP servers natively.

**1. Install Codex CLI** (requires Node 18+ which you already have from the quickstart prereqs):

```bash
npm install -g @openai/codex
```

**2. Verify install:**

```bash
codex --version
```

**3. Sign in** (opens a browser to link your ChatGPT account — requires ChatGPT Plus, Pro, Team, or Enterprise):

```bash
codex
```

Follow the sign-in prompt on first run. After sign-in, exit with `Ctrl+C` — we're going to add BD before using it.

**4. Edit the Codex config** to add BD MCP. Codex CLI uses **TOML format** (not JSON like Claude Desktop / Cursor).

Config file path:
- **Mac/Linux:** `~/.codex/config.toml`
- **Windows:** `%USERPROFILE%\.codex\config.toml`

Open it in any text editor. If the file doesn't exist yet, create it. Add this block:

```toml
[mcp_servers.bd-api]
command = "npx"
args = ["-y", "brilliant-directories-mcp", "--api-key", "ENTER_API_KEY", "--url", "https://your-site.com"]
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

**5. Start Codex:**

```bash
codex
```

Ask it *"list my first 5 members on my BD site"*. It'll invoke the BD MCP tools and return data.

> **`.toml` vs `.json` gotcha** — Codex CLI uses TOML syntax (square brackets for sections, `key = value` pairs, quoted strings). Don't paste a JSON config into `config.toml` — it won't parse. The block above is already in TOML format; copy it verbatim.

---

#### Fallback: ChatGPT Custom GPT with Actions (narrow scope only)

If you're already in ChatGPT Plus/Team/Enterprise and want a browser-based GPT for a small slice of BD functionality (30 ops or fewer), you can build a Custom GPT with our OpenAPI spec. Our spec is **well over 30 operations**, so this path **requires manually trimming the OpenAPI spec down to ≤30 operations before importing** — advanced JSON editing, not covered here. For full integration, use Codex CLI above.

> ⚠️ **Different setup from every other AI app.** ChatGPT doesn't support local MCP servers. You build a **Custom GPT with Actions** that calls our REST API directly using our OpenAPI spec. **Requires ChatGPT Plus, Team, or Enterprise** (Custom GPTs aren't on the free tier).
>
> 🔒 **CRITICAL: always set the GPT to `Only me` at the final sharing step.** Your BD API key gets embedded in the Action. `Anyone with the link` lets anyone you share the URL with invoke your BD API on your site — create members, delete pages, anything. `GPT Store` publishes it to the world. **Never pick either for a GPT with a real BD key.**

**1. Create the GPT**

- Go to **chatgpt.com** → click your profile → **My GPTs** → **+ Create a GPT** (exact path varies by ChatGPT version; look for a `+ Create` button, usually top-right).
- A two-tab editor opens. Click the **Configure** tab.

**2. Basic info (top of the Configure form)**

- **Name:** anything (e.g. `BD Assistant`).
- **Description:** one-liner (e.g. `Manages my Brilliant Directories site`).
- **Instructions:** optional. Leave blank, or add a behavior note like `Use the BD Actions to manage members, pages, forms, and posts. Ask before any destructive change.`
- **Conversation starters / Knowledge / Upload files / Capabilities:** skip all. None are needed.

**3. Add the Action** (this is where the BD integration lives)

Scroll to the bottom of the Configure form → click **Create new action**. A new sub-form opens with `Authentication` / `Schema` / `Privacy policy` fields.

**4. Schema — paste + hand-edit (cannot use "Import from URL")**

⚠️ ChatGPT Actions rejects the `{bd_site_url}` template variable in our spec with the error `Could not find a valid URL in 'servers'`. You MUST paste the spec directly and hand-edit the servers block — Import from URL won't work.

- Open [the raw OpenAPI spec](https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/openapi/bd-api.json) in your browser. `Ctrl+A` → `Ctrl+C` to copy everything.
- In ChatGPT, paste into the **Schema** text box.
- Near the top of the pasted JSON, find the `"servers"` block. It looks like:
  ```json
  "servers": [
    {
      "url": "{bd_site_url}",
      "description": "Your Brilliant Directories website",
      "variables": { "bd_site_url": { "default": "https://your-site.com", "description": "..." } }
    }
  ]
  ```
- Replace the ENTIRE block with a hard-coded URL to your BD site:
  ```json
  "servers": [
    { "url": "https://your-site.com" }
  ]
  ```
- Use YOUR actual BD site URL, no trailing slash. Delete everything else — `description`, `variables`, all of it.
- Wait a moment after the edit — the red `Could not find a valid URL in 'servers'` error should disappear, and the **Available actions** list populates with ~175 BD tools.

**5. Authentication**

- Click the gear icon in the Authentication section.
- **Authentication Type:** `API Key`
- **API Key:** paste your BD API key (from BD Admin → Developer Hub). Make sure Advanced Endpoint permissions are ALL ON — see the [prerequisites](#before-you-start--3-things-you-need).
- **Auth Type:** `Custom` (NOT Basic, NOT Bearer)
- **Custom Header Name:** `X-Api-Key` (exact case)
- Click **Save**.

**6. Privacy policy**

Required field — ChatGPT won't let you save the Action without a URL. For a private `Only me` GPT, use:

```
https://brilliantdirectories.com/privacy-policy
```

**7. Back out + save the GPT**

- Click back-arrow or **Save** at the top of the Action sub-form to return to the main Configure screen.
- Click **Create** in the top-right.

**8. Sharing — `Only me` only** 🔒

A `Share GPT` dialog opens with three options:

- ✅ **`Only me`** — private to your account. **Pick this.**
- ❌ `Anyone with the link` — anyone with the URL can invoke BD API calls on your site using your embedded key.
- ❌ `GPT Store` — publishes to the public ChatGPT store.

Click **`Only me`** → **Save**.

**9. Test**

Open the GPT from your `My GPTs` list. Ask *"list my first 5 members"*. First Action call prompts for permission — click **Allow**. You should see BD data come back.

> **What won't work:** the default ChatGPT assistant (no Actions support), ChatGPT free tier (no Custom GPTs), ChatGPT mobile apps (can't add Actions), or any ChatGPT use case that requires the MCP protocol specifically. For those, use Claude Desktop / Claude Code / Cursor / Windsurf / Cline / VS Code instead.

---

### Windsurf

Windsurf's AI pane is called **Cascade**. MCP servers plug into Cascade.

1. Open Windsurf.
2. Open settings: click **Windsurf - Settings** at the bottom-right of the window, OR Command Palette (`Cmd/Ctrl+Shift+P`) → type `Open Windsurf Settings`.
3. In settings, find the **Cascade** section → **Model Context Protocol (MCP)** → enable it.
4. In the Cascade panel on the right of your window, click the **MCPs icon** (top-right of the panel) → **Configure**. This opens the MCP config file.
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` and the URL. Save.
6. **Fully quit and reopen Windsurf** (`Cmd+Q` on Mac; on Windows right-click in the taskbar or system tray → Quit).

---

### Cline (VS Code extension)

1. Open VS Code with the **Cline** extension installed.
2. Click the **Cline icon** in the VS Code sidebar to open the Cline panel.
3. In Cline's top nav, click the **MCP Servers icon**.
4. Click **Configure MCP Servers** — opens the Cline MCP config file in VS Code.
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` and the URL. Save.
6. Back in the MCP Servers panel, confirm `bd-api` appears — toggle it **on** if not already.
7. Reload the Cline panel, or close/reopen VS Code, if tools don't show up.

---

### Cursor

**GUI method (easiest — no terminal needed):**

1. Open Cursor.
2. Open settings:
   - **Mac:** menu bar → **Cursor** → **Settings** → **Cursor Settings**
   - **Windows / Linux:** **File** → **Preferences** → **Cursor Settings**
   - Or: Command Palette (`Cmd/Ctrl+Shift+P`) → type `Open MCP Settings`
3. In the sidebar, click **Tools & MCP**.
4. Click **New MCP Server**.
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` and the URL.
6. Click **Save**.
7. **Fully quit and reopen Cursor.** `Cmd+Q` on Mac, or right-click Cursor in the Windows system tray → Quit. Closing the window isn't enough.

<details>
<summary><strong>Last resort: file method</strong> — only if the GUI above fails (click to expand)</summary>

Use this if Settings doesn't show "Tools & MCP", the "New MCP Server" button silently fails, or you just prefer editing files. Same result as the GUI method.

Cursor reads from `mcp.json` in a hidden `.cursor` folder in your home directory. Same file the GUI writes to.

#### Mac / Linux

1. Open **Finder** (Mac) or your file manager (Linux).
2. `Cmd+Shift+G` (Mac) or `Ctrl+L` (Linux) to open a "Go to Folder" input.
3. Type `~/.cursor` → Enter.
   - If "Folder doesn't exist": navigate to `~/` and create a new folder named exactly `.cursor` (leading dot). Retry.
4. Inside `.cursor`, open `mcp.json` in TextEdit / any text editor. If missing: create it. TextEdit users: File → New → Format menu → **Make Plain Text** first, then save as `mcp.json` (not `mcp.json.txt`).
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` and the URL. Save.
6. **Fully quit Cursor** (`Cmd+Q`, or menu bar → **Cursor** → **Quit Cursor**). Red-dot close doesn't quit.

#### Windows

1. Windows key → type `File Explorer` → Enter.
2. Click the address bar at the top. Type `%USERPROFILE%\.cursor` → Enter.
   - If "Windows can't find": go to `%USERPROFILE%`, right-click → **New** → **Folder** → name it exactly `.cursor` (leading dot). Retry.
3. Inside `.cursor`, open `mcp.json` in Notepad. If missing: right-click empty area → **New** → **Text Document** → rename to `mcp.json` (click Yes to the extension warning).
   - Can't see `.txt` / `.json` extensions? File Explorer → **View** menu → check **File name extensions**.
4. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` and the URL. Save.
5. **Fully quit Cursor** — right-click Cursor in the system tray (bottom-right, near the clock; may be under `^`) → **Quit**. If not in tray, window X is enough.

</details>

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
   - Header: `X-Api-Key: ENTER_API_KEY`

---

### Make / Zapier

**Make:** Create a custom app using the OpenAPI spec, or use HTTP module with `X-Api-Key` header.

**Zapier:** If you already have the BD Zapier app, it uses the same underlying API. For new endpoints, use Webhooks by Zapier with the `X-Api-Key` header.

---

### curl / Any HTTP Client

Paste these in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` and `https://your-site.com` with real values.

```bash
# Verify your API key
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/token/verify

# List members
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/user/get?limit=10

# Create a member
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "email=new@example.com&password=secret123&subscription_id=1&first_name=Jane&last_name=Doe" \
  https://your-site.com/api/v2/user/create

# Search members
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "q=dentist&address=Los Angeles&limit=10" \
  https://your-site.com/api/v2/user/search

# Update a member
curl -X PUT -H "X-Api-Key: ENTER_API_KEY" \
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

Comprehensive coverage across members, posts, leads, reviews, pages, forms, menus, widgets, email templates, tags, redirects, smart lists, categories, membership plans, and more.

**What success looks like:** the AI returns the data you asked for, or confirms the action with a new ID.
**What failure looks like:** the AI says "I don't have access to that," "no tools available," or "unknown function." → jump to [Troubleshooting](#troubleshooting).

> ⚠️ **The AI can also DELETE and MODIFY live data.** Writes go directly to your live site — no undo. Before running bulk or destructive operations, test on ONE record first. Consider a backup. If unsure, ask the AI to *preview* (list/show) before it *acts*.

## Updates are automatic

Once set up, you get new MCP versions automatically the next time you fully quit and reopen your AI app. No reinstall needed.

---

## Troubleshooting

**Verify your setup with one command.** Paste in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` and `https://your-site.com` with real values:
```bash
npx brilliant-directories-mcp --verify --api-key ENTER_API_KEY --url https://your-site.com
```
Prints `OK` if credentials work, `FAIL` with the error otherwise. Good first step for any connectivity issue.

**Debug mode — see exactly what's happening:**
```bash
npx brilliant-directories-mcp --debug --verify --api-key ENTER_API_KEY --url https://your-site.com
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
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/data_posts/fields?form_name=my-form
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
