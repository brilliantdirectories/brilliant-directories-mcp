# Official Brilliant Directories MCP Server — Setup Guide

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp?color=blue&label=npm)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/github/license/brilliantdirectories/brilliant-directories-mcp?color=green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

Universal AI integration for your BD site. Give any AI agent full access to your Brilliant Directories site with one API key.

Manage **members, posts (single-image and multi-image), leads, reviews, top and sub categories, email templates, pages (homepage, landing pages), 301 redirects, smart lists, widgets, menus, forms, tags, membership plans**, and more — across every resource BD exposes via its REST API.

This guide walks you through connecting your AI of choice (Claude, Cursor, etc.) to your BD site. Pick your AI app below, paste two things, restart. Most setups take under 5 minutes.

## ⚠️ REQUIREMENTS — Before you start

1. **Your BD site URL.** Use the full canonical URL exactly as it loads in a browser — include `https://` (or `http://` if your site has no SSL), include `www.` if your site uses it, no trailing slash.
   - ✅ `https://www.mysite.com` (most BD sites)
   - ✅ `https://mysite.com` (only if your site has no `www.`)
   - ✅ `http://mysite.com` (HTTP-only sites — protocol respected)
   - ❌ `mysite.com` (missing protocol)
   - ❌ `https://mysite.com/` (trailing slash)
   - ❌ `https://mysite.com` if the site actually serves at `www.mysite.com` — use the form your site canonically responds at
2. **Your BD API key.**

   BD Admin → **Developer Hub** → **Generate API Key** → copy it.

   <a href="https://support.brilliantdirectories.com/support/solutions/articles/12000088768" target="_blank" rel="noopener noreferrer">Full walkthrough: How to Create an API Key</a>.

3. **Node.js — only for the Advanced path** (see below). Not needed for the Easy path. If you need it, one-time install from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — double-click the downloaded file to install, Next through the prompts).

### 🚨 API PERMISSIONS — DO NOT SKIP THIS

**New BD API keys ship locked down — only member read/write is enabled by default.**

Every other resource (web pages, forms, menus, tags, email templates, reviews, leads, categories, post types, widgets, etc.) lives behind an **"Advanced Endpoints"** toggle and returns `403 API Key does not have permission to access this endpoint` until you flip it on.

**This catches almost every first-time user.** If your AI can list members but can't create a page or update a form, stop debugging — it's this.

**Turn on Advanced Endpoints:**

1. BD Admin → **Developer Hub**
2. Find your API key in the list → **Actions** dropdown → **Permissions**
3. Click the **Advanced Endpoints** tab
4. Toggle everything **ON** (or cherry-pick only the resources you'll use — but ALL ON is the fastest way to stop tripping over this)
5. Click **Save Permissions**

The change is immediate — no key rotation, no AI restart needed. Re-run the failed request and it'll succeed.

> **Want to stop the AI from deleting anything?** Uncheck every `delete` action under Advanced Endpoints. The AI will still be able to read, create, and update — but any `delete*` tool call will return 403 instead of wiping data. Good baseline for production sites where the AI shouldn't be trusted with destructive operations.

> **Why BD locks it down by default:** least-privilege. A leaked key with baseline-only permissions can only read/write members on your site, not rewrite your whole directory. Once you've decided which endpoints your agent actually needs, you can pare the permissions back down to just those.

## Table of Contents

- [Setup by Platform](#setup-by-platform)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [Claude extension inside Cursor](#claude-extension-inside-cursor)
  - [OpenAI (Codex Desktop)](#openai-codex-desktop)
  - [Windsurf](#windsurf)
  - [Cline (VS Code extension)](#cline-vs-code-extension)
  - [Cursor](#cursor)
  - [n8n](#n8n)
  - [Make.com](#makecom)
  - [Zapier](#zapier)
  - [curl / any HTTP client](#curl--any-http-client)
- [What you can ask the AI](#what-you-can-ask-the-ai)
- [Updates are automatic](#updates-are-automatic)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Authentication](#authentication)
- [Rate Limits](#rate-limits)
- [Pagination](#pagination)
- [Filtering](#filtering)
- [Sorting](#sorting)
- [Available Resources](#available-resources)
- [Field Discovery](#field-discovery)
- [Stable asset URLs](#stable-asset-urls)
- [Security](#security)
- [Support](#support)

## Setup by Platform

<a id="the-config-block"></a>

Each platform has **two options**:

- **🚀 Easy config block** — points at our hosted MCP at `https://brilliantmcp.com`. No Node.js, no install, no terminal. Starts working the moment you save and restart your AI app.
- **🛠️ Advanced config block** — spawns the MCP as a `npx` child process on your machine. Use when you want the MCP on your own hardware.

  **Needs Node.js installed first** — get it from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it).

**Both give the full BD tool surface, same instructions, same lean shapers, same safety guards.**

### 🚀 Easy config block (recommended — 30-second install)

In your AI client's MCP config (Cursor, Windsurf, Cline, Codex, n8n, etc.), add this entry:

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "url": "https://brilliantmcp.com",
      "headers": {
        "X-Api-Key": "ENTER_API_KEY",
        "X-BD-Site-URL": "https://www.your-site.com"
      }
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL (full canonical form — `https://`, exact host, no trailing slash, see [Requirements](#requirements--before-you-start)).

> ⚠️ **Claude Desktop doesn't accept the Easy block** — use the Advanced block in the [Claude Desktop section](#claude-desktop).

**Save, then fully quit and reopen the AI app.** Saving alone is not enough — every AI client loads MCP servers only at fresh launch, not on hot-reload. Done. Working? [Skip to "What you can ask the AI"](#what-you-can-ask-the-ai).

Need a client-specific walkthrough? Jump to your platform's section below.

### 🛠️ Advanced config block (requires Node.js install)

> ⚠️ **STEP 1 — Install Node.js FIRST** (the Advanced path runs an `npx` command on your machine):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

> **Why `--prefer-online` + `@latest`?** Forces npm to revalidate against the registry on every launch so you always pull the newest version. Prevents the `ETARGET No matching version found` error that hits when your local npm cache is stale.

**STEP 2 — Paste this config:**

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://www.your-site.com"
      ]
    }
  }
}
```

**STEP 3 — Fully quit the AI app, then reopen.** Closing the window is NOT enough — the AI loads MCP servers only at a true relaunch:
- **Windows:** right-click the app's icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
- **Mac:** `Cmd+Q` or menu bar → **<App>** → **Quit <App>**, then reopen

---

### Claude Desktop

> ⚠️ **Claude Desktop requires Node.js + the Advanced (npm) config.** It doesn't accept the Easy `url`-shaped block — only stdio (`command` + `args`).

> ⚠️ **Windows users:** install Claude Desktop from <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">claude.ai/download</a>, NOT the Microsoft Store (the Store version sandboxes the config file).

> **Banner saying "Tool result could not be submitted… connection interrupted"?** Cosmetic UI bug across every MCP connector ([anthropics/claude-code #51874](https://github.com/anthropics/claude-code/issues/51874)) — your tools still work. Safe to ignore.

> ⚠️ **STEP 1 — Install Node.js FIRST** (before pasting the config below):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

**Steps (no terminal):**

1. Open Claude Desktop.
2. Menu bar → **Settings**.

   **Developer tab → Edit Config**.

   This opens `claude_desktop_config.json` in TextEdit (Mac) or Notepad (Windows).
3. Pick your scenario:

#### Scenario A — file is empty `{}` or has no `mcpServers` entry

Select all (`Cmd+A` / `Ctrl+A`) and delete. Paste this:

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://www.your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen Claude Desktop.** Saving alone is not enough — Claude loads MCP servers only at fresh launch.

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
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://www.your-site.com"
      ]
    }
  }
}
```

Two changes: `,` added after the `preferences` closing `}`, and the `mcpServers` block added before the final `}`. Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen Claude Desktop.**

> **Paste your final file into <a href="https://jsonlint.com" target="_blank" rel="noopener noreferrer">jsonlint.com</a> before restarting to ensure correct formatting.**
>
> Missing commas silently break the MCP — a validator flags them instantly.

---

4. **Fully quit and reopen Claude Desktop.** Start a new chat.

   > **"Fully quit" means more than closing the window** — Claude loads MCP servers only at a true relaunch:
   > - **Windows:** right-click the Claude icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
   > - **Mac:** `Cmd+Q` or menu bar → **Claude** → **Quit Claude**, then reopen
5. **Verify the BD MCP loaded.** The exact UI varies by Claude Desktop version:
   - In any chat, ask **"what tools do you have?"** — you should see `brilliant-directories` tools listed.
   - OR check **Settings → Developer → MCP servers** — `brilliant-directories` should show as connected (no error status).
   - Older builds also show a **🔨 hammer icon** with a tool count near the chat input — click it to see the tools.

> **Not connected?** Check **Settings → Developer → MCP servers** for the error. Common causes:
> - JSON typo — paste your file into <a href="https://jsonlint.com" target="_blank" rel="noopener noreferrer">jsonlint.com</a>
> - Wrong API key, or URL missing `https://` / has trailing slash
> - Node.js not installed (Claude Desktop spawns `npx`)
> - Saw *"not valid MCP server configurations"*? You pasted a `url`-shaped block — Claude Desktop only accepts the stdio (`command` + `args`) shape shown above.

**Direct config file path** (if you skip Settings):
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

---

### Claude Code

Claude Code has no MCP GUI — install via terminal. Works in Terminal.app (Mac), PowerShell (Windows), or Cursor / VS Code's built-in terminal (open with ``Ctrl+` `` / ``Cmd+` `` or **View → Terminal**).

**Prerequisites — one-time install:**

1. **Node.js** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` → `Windows Installer (.msi)` or `macOS Installer` → double-click to install, click Next through the prompts).
2. **The `claude` CLI** — in any terminal, run:

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

   Close and reopen the terminal. Verify with `claude --version`.

Three options below — pick whichever fits.

#### ⚡ Plugin (one-line install, recommended if your Claude Code supports it)

Inside an active `claude` session, run these two slash commands:

```text
/plugin marketplace add brilliantdirectories/brilliant-directories-mcp
/plugin install brilliant-directories@brilliant-directories-mcp
```

Claude Code fetches the plugin manifest, registers the BD MCP server, and tools become available immediately. You'll be prompted for `BD_API_KEY` and `BD_SITE_URL` on first use, or set them as environment variables before launching `claude`. (The Easy and Advanced paths below take credentials inline in the `claude mcp add` command instead — different paths, same end result.)

> **Don't see `/plugin` commands?** Plugin support requires a recent build. Run `npm install -g @anthropic-ai/claude-code@latest` and restart the terminal. If still missing, use the Easy or Advanced path below.

#### 🚀 Easy (hosted Worker — no local BD MCP subprocess)

```bash
claude mcp add brilliant-directories --transport http https://brilliantmcp.com \
  --header "X-Api-Key: ENTER_API_KEY" \
  --header "X-BD-Site-URL: https://www.your-site.com"
```

Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. Verify with `claude mcp list` — `brilliant-directories` should show `✓ Connected`. Close and reopen Claude Code.

#### 🛠️ Advanced (BD MCP runs locally via `npx`)

```bash
claude mcp add brilliant-directories -- npx -y --prefer-online brilliant-directories-mcp@latest --api-key ENTER_API_KEY --url https://www.your-site.com
```

Same shape, but runs the MCP server as an `npx` child process on your machine. Replace the placeholders. Verify with `claude mcp list`. Close and reopen Claude Code. The `-y` flag auto-accepts the first-time npx install prompt so the spawn doesn't hang.

> **Credentials live inside the `claude mcp add` command.** They're written into your user-level Claude config file and passed to BD automatically on every tool call. To rotate: `claude mcp remove brilliant-directories`, then re-run `claude mcp add` with new values.

---

### Claude extension inside Cursor

If you chat with Claude inside Cursor (the Anthropic "Claude" extension installed from the Cursor extension marketplace), that extension has its OWN MCP config — **separate from Cursor's native agent.** Installing in one doesn't install in the other.

> **Note:** the Claude extension and the Claude Code CLI both read the SAME file — `~/.claude.json` (Windows: `C:\Users\<you>\.claude.json`). If you've already set up Claude Code per the section above, the BD MCP is already loaded for the Claude extension too. This section covers customers who only use the Claude extension and don't have the CLI installed.

**Two different MCP configs. Two different places the tools show up.**

**1. Claude extension (inside Cursor or Claude Code CLI)**
- Config file (Windows): `C:\Users\<you>\.claude.json`
- Config file (Mac / Linux): `~/.claude.json`
- Tools appear: when you chat with Claude — ask *"what tools do you have"* or type `/mcp`

**2. Cursor's native agent**
- Config file (Windows): `C:\Users\<you>\.cursor\mcp.json`
- Config file (Mac / Linux): `~/.cursor/mcp.json`
- Tools appear: Cursor **Settings → Tools & MCP**

**Easiest setup — edit the JSON file in Notepad (NO terminal, NO `claude` CLI needed):**

> ⚠️ **STEP 1 — Install Node.js FIRST** (before editing the config below):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

1. **Open the file.** Paste the path into File Explorer's address bar (Windows) or Finder's **Go → Go to Folder** (Mac). If it doesn't exist yet, create a new empty text file at that path named exactly `.claude.json`.
2. **Paste this inside.** If the file already has content with an `mcpServers` key, merge the `"brilliant-directories": {...}` entry into the existing `mcpServers` object — don't overwrite other entries.

   ```json
   {
     "mcpServers": {
       "brilliant-directories": {
         "command": "npx",
         "args": [
           "-y",
           "--prefer-online",
           "brilliant-directories-mcp@latest",
           "--api-key", "ENTER_API_KEY",
           "--url", "https://www.your-site.com"
         ]
       }
     }
   }
   ```

3. Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL (include `https://`, no trailing slash).
4. **Save the file, then fully quit and reopen Cursor** so the Claude extension picks up the new config. Saving alone is not enough.
5. Chat with Claude and ask *"what tools do you have?"* — you should see `brilliant-directories` tools listed.

> **Cursor's Tools & MCP panel will stay empty — that's expected.** Claude's extension reads `~/.claude.json`; Cursor's panel only reflects `~/.cursor/mcp.json`. If you want BD tools in BOTH surfaces, also do the [Cursor section](#cursor) install.

**Alternative — if you have the `claude` CLI installed** (most users don't — skip if you don't know what it is): run this in any terminal:

```bash
claude mcp add brilliant-directories -- npx -y --prefer-online brilliant-directories-mcp@latest --api-key ENTER_API_KEY --url https://www.your-site.com
```

The CLI writes the same JSON to `~/.claude.json` for you — same end result as editing by hand.

---

### OpenAI (Codex Desktop)

| OpenAI surface | Supported? |
|---|---|
| **Codex Desktop** (the desktop app) | ✅ **Yes — full MCP, both transports** |
| ChatGPT web / desktop / mobile | ❌ No — no MCP connector support in consumer ChatGPT |

For BD automation in the OpenAI ecosystem, use **Codex Desktop**. ChatGPT itself can't speak MCP yet; for GUI alternatives if you don't want Codex, use Claude Desktop / Cursor / Windsurf / Cline.

#### Codex Desktop setup

**1. Download Codex Desktop** from <a href="https://chatgpt.com/codex/get-started/" target="_blank" rel="noopener noreferrer">chatgpt.com/codex/get-started</a> and install it.

**2. Open Codex Desktop** → **File** → **Settings** → **MCP Servers** → **+ Add Server**.

A "Connect to a custom MCP" form opens with two tabs: **STDIO** (Advanced — runs locally, needs Node.js) and **Streamable HTTP** (Easy — hosted Worker, no Node.js). Either works — pick one.

**🚀 Easy (Streamable HTTP — recommended, no Node.js install required):**

Click the **Streamable HTTP** tab. Fill the form top-to-bottom:

| Field (as shown in Codex) | Value |
|---|---|
| **Name** | `Brilliant Directories` (or any label) |
| **URL** | `https://brilliantmcp.com` |
| **Bearer token env var** | *leave empty — don't touch* |
| **Headers** — Key | `X-Api-Key` |
| **Headers** — Value | your BD API key |
| *Click **+ Add header** to add the second row* | |
| **Headers** — Key (row 2) | `X-BD-Site-URL` |
| **Headers** — Value (row 2) | `https://www.your-site.com` |
| **Headers from environment variables** | *leave empty — don't touch* |

**Click Save, then fully quit and reopen Codex.** Saving alone is not enough — Codex loads MCP servers only at fresh launch.

**🛠️ Advanced (STDIO — runs on your machine, needs Node.js):**

> ⚠️ **STEP 1 — Install Node.js FIRST** (before pasting the config below):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

Click the **STDIO** tab. Fill the form top-to-bottom:

| Field (as shown in Codex) | Value |
|---|---|
| **Name** | `Brilliant Directories` (or any label) |
| **Command to launch** | `npx` |
| **Arguments** — Row 1 | `-y` |
| *Click **+ Add argument** between each row below* | |
| **Arguments** — Row 2 | `brilliant-directories-mcp@latest` |
| **Arguments** — Row 3 | `--api-key` |
| **Arguments** — Row 4 | your BD API key |
| **Arguments** — Row 5 | `--url` |
| **Arguments** — Row 6 | `https://www.your-site.com` |
| **Environment variables** | *leave empty — don't touch* |
| **Environment variable passthrough** | *leave empty — don't touch* |
| **Working directory** | *leave empty — don't touch* |

**Click Save, then fully quit and reopen Codex.** Saving alone is not enough — Codex loads MCP servers only at fresh launch.

> **"Fully quit" means more than closing the window** — Codex loads MCP servers only at a true relaunch:
> - **Windows:** right-click the Codex icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
> - **Mac:** `Cmd+Q` or menu bar → **Codex** → **Quit Codex**, then reopen

**4. Test the connection:** in a new Codex chat, ask *"list my first 5 members on my BD site"*. Tools invoke, data comes back.

> **Pro tip — multi-site management:** repeat this setup with a different **Name** + credentials per BD site (e.g. `brilliant-directories-main` / `brilliant-directories-staging`). Then tell Codex *"on brilliant-directories-main, list the top categories"* or *"copy these email templates from -main to -staging"*. Useful for agencies and multi-brand operators.

---

### Windsurf

Windsurf's AI pane is called **Cascade**. MCP servers plug into Cascade.

> ⚠️ **Windsurf uses `serverUrl` (not `url`) for remote MCP servers.** The Easy config block below reflects that.

1. Open Windsurf.
2. Open settings: click **Windsurf - Settings** at the bottom-right of the window, OR Command Palette (`Cmd/Ctrl+Shift+P`) → type `Open Windsurf Settings`.
3. In settings, find the **Cascade** section → **Model Context Protocol (MCP)** → enable it.
4. In the Cascade panel on the right of your window, click the **MCPs icon** (top-right of the panel) → **Configure**. This opens the MCP config file.
5. Paste **one of these** (Easy is recommended):

**🚀 Easy (recommended — no Node.js install required):**

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "serverUrl": "https://brilliantmcp.com",
      "headers": {
        "X-Api-Key": "ENTER_API_KEY",
        "X-BD-Site-URL": "https://www.your-site.com"
      }
    }
  }
}
```

**🛠️ Advanced (runs on your machine, needs Node.js):**

> ⚠️ **STEP 1 — Install Node.js FIRST** (before pasting the config below):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://www.your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen Windsurf.** Saving alone is not enough — Windsurf loads MCP servers only at fresh launch.

   > **"Fully quit" means more than closing the window** — Windsurf loads MCP servers only at a true relaunch:
   > - **Windows:** right-click the Windsurf icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
   > - **Mac:** `Cmd+Q` or menu bar → **Windsurf** → **Quit Windsurf**, then reopen

---

### Cline (VS Code extension)

1. Open VS Code with the **Cline** extension installed.
2. Click the **Cline icon** in the VS Code sidebar to open the Cline panel.
3. In Cline's top nav, click the **MCP Servers icon**.
4. Click **Configure MCP Servers** — opens the Cline MCP config file in VS Code.
5. Paste **one of these** (Easy is recommended):

**🚀 Easy (recommended — no Node.js install required):**

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "url": "https://brilliantmcp.com",
      "headers": {
        "X-Api-Key": "ENTER_API_KEY",
        "X-BD-Site-URL": "https://www.your-site.com"
      }
    }
  }
}
```

**🛠️ Advanced (runs on your machine, needs Node.js):**

> ⚠️ **STEP 1 — Install Node.js FIRST** (before pasting the config below):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and you'll see *"no MCP servers"* with `spawn npx ENOENT` in the log.

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://www.your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen VS Code.** Saving alone is not enough — Cline loads MCP servers only at fresh launch, not on panel reload or toggle.

6. Back in the MCP Servers panel, confirm `brilliant-directories` appears — toggle it **on** if not already.

   > **"Fully quit" means more than closing the window** — Cline loads MCP servers only at a true VS Code relaunch:
   > - **Windows:** right-click the VS Code icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
   > - **Mac:** `Cmd+Q` or menu bar → **Code** → **Quit Visual Studio Code**, then reopen

---

### Cursor

> **Fastest path (no install, 30 seconds):** open Cursor Settings → **MCP** (or **Model Context Protocol**) → **Add new MCP server** → paste the [Easy config block](#setup-by-platform) with your API key + site URL. Fully quit + reopen. Tools appear in the chat.
>
> Or edit `~/.cursor/mcp.json` directly and paste the block. Either way works.
>
> Prefer the local install? Keep reading — the Cursor Directory installer below sets up the Advanced path (runs as an npx child process).

**Cursor Directory one-click install for the Advanced path (no terminal, no file editing):**

> ⚠️ **STEP 1 — Install Node.js FIRST** (the Cursor Directory installer wires up an `npx` child process):
> - Go to <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> → click **Get Node.js®**
> - Download: **Windows Installer (.msi)** or **macOS Installer**
> - Double-click the file → click Next through every prompt to fully install Node.js
>
> Skip this and Cursor will show *"no MCP servers"* with `spawn npx ENOENT` in the log.

1. **Open** → <a href="https://cursor.directory/plugins/brilliant-directories" target="_blank" rel="noopener noreferrer">cursor.directory/plugins/brilliant-directories</a>
2. Click **Install** / **Add to Cursor** → allow browser to open Cursor.
3. Cursor shows an **"Install MCP Server?"** prompt with most fields pre-filled. Two things you need to change:

   **Rename the Name field** (don't leave it as `server` — too generic):
   - `brilliant-directories-60031` — site-ID-based (recommended pattern)
   - `brilliant-directories-mysite` — site-name-based
   - `brilliant-directories-main` / `brilliant-directories-staging` / `brilliant-directories-client-acme` — nickname
   - Why: Cursor lists every MCP by this Name; if you later add a second BD site, you'll need to tell them apart.

   **Fill Environment Variables — RIGHT side only:**

   | Left (do NOT touch) | Right (paste your values) |
   |---|---|
   | `BD_API_KEY` | your BD API key |
   | `BD_SITE_URL` | `https://www.your-site.com` — include `https://`, no trailing slash |

   - API key → BD Admin → **Developer Hub** → **Generate API Key** (BD shows it once; if lost, generate a new one).
   - Advanced endpoint permissions must be enabled on the key or most writes 403. See [Before you start](#requirements--before-you-start).

4. Click **Install**.
5. **Fully quit and reopen Cursor.**

   > **"Fully quit" means more than closing the window** — Cursor loads MCP servers only at a true relaunch:
   > - **Windows:** right-click the Cursor icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**, then reopen
   > - **Mac:** `Cmd+Q` or menu bar → **Cursor** → **Quit Cursor**, then reopen
6. Tools appear in **Settings → Tools & MCP**.

> **Pro tip — multi-site management:** install the BD MCP multiple times with different API keys + URLs, each with a unique Name (e.g. `brilliant-directories-60031`, `brilliant-directories-marketing`). Then tell Cursor *"on brilliant-directories-60031, list the top categories"* or *"compare member counts between the two sites"*. Same pattern works in Claude Desktop and Claude Code. Useful for agencies and multi-brand operators.

---

<details>
<summary><strong>Alternative methods</strong> — if the directory link doesn't work, or you prefer manual setup (click to expand)</summary>

### Alternative A — Cursor Settings GUI (manual, no terminal)

1. Open Cursor.
2. Open settings:
   - **Mac:** menu bar → **Cursor** → **Settings** → **Cursor Settings**
   - **Windows / Linux:** **File** → **Preferences** → **Cursor Settings**
   - Or: Command Palette (`Cmd/Ctrl+Shift+P`) → type `Open MCP Settings`
3. In the sidebar, click **Tools & MCP**.
4. Click **New MCP Server**.
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL.
6. **Click Save, then fully quit and reopen Cursor.** Saving alone is not enough — Cursor loads MCP servers only at fresh launch.

### Alternative B — Edit the config file directly

Use this if the GUI doesn't show "Tools & MCP" or the "New MCP Server" button silently fails. Same result as the GUI method.

Cursor reads from `mcp.json` in a hidden `.cursor` folder in your home directory.

#### Mac / Linux

1. Open **Finder** (Mac) or your file manager (Linux).
2. `Cmd+Shift+G` (Mac) or `Ctrl+L` (Linux) to open a "Go to Folder" input.
3. Type `~/.cursor` → Enter.
   - If "Folder doesn't exist": navigate to `~/` and create a new folder named exactly `.cursor` (leading dot). Retry.
4. Inside `.cursor`, open `mcp.json` in TextEdit / any text editor. If missing: create it. TextEdit users: File → New → Format menu → **Make Plain Text** first, then save as `mcp.json` (not `mcp.json.txt`).
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen Cursor.**

#### Windows

1. Windows key → type `File Explorer` → Enter.
2. Click the address bar at the top. Type `%USERPROFILE%\.cursor` → Enter.
   - If "Windows can't find": go to `%USERPROFILE%`, right-click → **New** → **Folder** → name it exactly `.cursor` (leading dot). Retry.
3. Inside `.cursor`, open `mcp.json` in Notepad. If missing: right-click empty area → **New** → **Text Document** → rename to `mcp.json` (click Yes to the extension warning).
   - Can't see `.txt` / `.json` extensions? File Explorer → **View** menu → check **File name extensions**.
4. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL. **Save, then fully quit and reopen Cursor.**

</details>

---

### n8n

**✅ MCP Client Tool works — use the SSE transport + our dedicated URL.**

n8n's built-in **MCP Client Tool** node connects to our server and loads every BD tool. Configure like this:

| Field | Value |
|---|---|
| **Server Transport** | `Server Sent Events (Deprecated)` |
| **MCP Endpoint URL** | `https://brilliantmcp.com/sse` |
| **Authentication** | `Multiple Headers Auth` |
| **Header 1** | Name: `X-Api-Key` · Value: *your 32-char hex BD API key* |
| **Header 2** | Name: `X-BD-Site-URL` · Value: `https://www.your-site.com` |

Save the node. Click the **Tool** dropdown — should populate with every BD tool. Pick any tool, click Execute.

> **Why "SSE (Deprecated)" and not "HTTP Streamable"?**
> - The MCP spec deprecated SSE in favor of HTTP Streamable
> - n8n's SSE client works today against our server
> - n8n's HTTP Streamable client has <a href="https://github.com/n8n-io/n8n/issues/28924" target="_blank" rel="noopener noreferrer">known upstream bugs</a> we filed
> - Our server supports BOTH transports — when n8n fixes their HTTP Streamable client, you can switch to `https://brilliantmcp.com` (no `/sse` path) with Transport = `HTTP Streamable`. No server changes needed.

> **Why `https://brilliantmcp.com/sse`?** The main `brilliantdirectories.com` domain has zone-level security rules (bot challenges, geo blocks) that protect our marketing site but silently blocked n8n's SSE handshake. `brilliantmcp.com` is a dedicated zone with no inherited security posture — n8n connects cleanly. It's the single canonical URL for the hosted MCP endpoint.

**Don't want MCP? Alternative paths for n8n:**

**✅ HTTP Request node + OpenAPI import** — n8n has native OpenAPI support. Import this spec URL as a custom API:
```
https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/mcp/openapi/bd-api.json
```
n8n generates a node for every BD operation automatically. Prompts for your BD site URL and API key on import. Every BD operation available, zero MCP protocol involved.

**✅ Plain HTTP Request node** — point a single HTTP Request node at `https://www.your-site.com/api/v2/user/get` with header `X-Api-Key: ENTER_API_KEY`. Chain multiple nodes for workflows touching several BD endpoints. Simplest possible setup.

**Want to verify the server is healthy yourself?** Install the official <a href="https://github.com/modelcontextprotocol/inspector" target="_blank" rel="noopener noreferrer">MCP Inspector</a> (`npx @modelcontextprotocol/inspector`) and point it at `https://brilliantmcp.com/sse`. Inspector is the reference implementation of MCP's client spec.

---

### Make.com

Make.com ships an **MCP Client** app (currently Open Beta) that connects to remote MCP servers — see <a href="https://apps.make.com/mcp-client" target="_blank" rel="noopener noreferrer">Make's MCP Client docs</a>. To connect it to our Worker:

1. Add the **MCP Client** module to your scenario, click **Create a connection**.
2. Click **+ New MCP Server** (we're not yet on Make's verified-servers list).
3. **URL:** `https://brilliantmcp.com`
4. **API Key / Access token:** your 32-char BD API key.
5. **Save, then refresh the scenario** so Make picks up the new connection.

⚠️ **Known limitation as of Make's beta release:** the MCP Client UI exposes a single token field. Our Worker requires **two** custom headers (`X-Api-Key` AND `X-BD-Site-URL`). If Make sends only the API key, the Worker will reject with `Missing X-BD-Site-URL header`. Test the connection before building production scenarios — if it fails, fall back to the HTTP path below.

**Fallback path (works today, every BD operation):** use Make's standard **HTTP** module against `https://www.your-site.com/api/v2/*` with these headers:

```
X-Api-Key: <your 32-char BD API key>
X-BD-Site-URL: https://www.your-site.com
```

This hits BD's REST API directly. Skips MCP entirely; every endpoint reachable.

You can also build a custom Make app from our [OpenAPI spec](#stable-asset-urls) for a more polished UX.

---

### Zapier

The "MCP Client by Zapier" app only supports OAuth / Bearer Token — no custom-headers field, so it cannot authenticate against our Worker (same single-token limitation as Make).

Use one of these paths instead:
- **BD's existing Zapier app** (if it covers what you need) — same underlying API, same API key.
- **Webhooks by Zapier** against `https://www.your-site.com/api/v2/*`, with Custom Headers `X-Api-Key: <your key>` and `X-BD-Site-URL: https://www.your-site.com`. This hits BD's REST API directly and skips MCP entirely — every BD operation reachable.

---

### curl / Any HTTP Client

Paste these in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL.

> **Why these examples only need `X-Api-Key` (and not `X-BD-Site-URL`):** these calls go DIRECTLY to your BD site (`your-site.com/api/v2/...`), bypassing the MCP Worker. The `X-BD-Site-URL` header is only needed when calling the hosted Worker at `https://brilliantmcp.com` — the Worker uses it to route to the right BD site. When you call your BD site directly, the URL itself IS the routing.

```bash
# Verify your API key
curl -H "X-Api-Key: ENTER_API_KEY" https://www.your-site.com/api/v2/token/verify

# List members
curl -H "X-Api-Key: ENTER_API_KEY" https://www.your-site.com/api/v2/user/get?limit=10

# Create a member
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "email=new@example.com&password=secret123&subscription_id=1&first_name=Jane&last_name=Doe" \
  https://www.your-site.com/api/v2/user/create

# Search members (spaces in values need URL-encoding as + or %20)
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "q=dentist&address=Los+Angeles&limit=10" \
  https://www.your-site.com/api/v2/user/search

# Update a member
curl -X PUT -H "X-Api-Key: ENTER_API_KEY" \
  -d "user_id=42&company=New Company Name" \
  https://www.your-site.com/api/v2/user/update
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

## Growth-automation skills

The plugin bundles "skills" — high-level workflows that orchestrate the underlying tools into a single invocation. Each skill is invoked via `/bd:<verb>` in Claude Code.

### `/bd:events` — Research and post local events

Researches local events from public web sources (chamber sites, tourism boards, civic calendars, public Eventbrite pages, etc.), then creates SEO-rich event posts on your BD site. Each post includes a structured FAQ, internal links to related events, external attribution to the source, geocoded coordinates (via OpenStreetMap), and quality-gated content (date sanity, source credibility, no fabrication).

**Quick start (interactive):**
```
/bd:events
```
The skill asks you a few questions (which member should author the posts, which cities and categories to target, publish or save as drafts), then researches and creates.

**Autonomous (cron-style, no human present):**
```
/bd:events --autonomous --author-id=12 --cities="Austin" --categories="music,fitness" --limit=10 --status=draft
```
Researches Austin music + fitness events, creates up to 10 draft posts authored by user 12. Drafts let you review before publishing.

**Realistic expectations:**
- Run time: 30-60 minutes for 10-20 events (web research + geocoding + content generation take time)
- SEO payoff timeline: weeks to months (new BD subsite needs to age and gather indexing signals)
- The skill competes for long-tail queries the source's thin listing doesn't target — not day-one domain authority

**Defaults:**
- Drafts in autonomous mode (you review before publishing)
- Free to run (no API keys, no paid services required)
- Whitehat scraping (facts only, attribution always, public pages only)

### More skills coming

The same shared methodology will power upcoming skills:
- `/bd:jobs` — Research and post job listings
- `/bd:blog` — Generate industry-relevant blog posts
- `/bd:properties` — Research and post property listings
- `/bd:seo` — Walk category × location combos and create SEO landing pages

All built on the same foundation: shared research methodology, quality gates, dedup, anti-slop writing voice, whitehat sourcing.

## Updates are automatic

Once set up, you get new MCP versions automatically the next time you fully quit and reopen your AI app.

---

## Troubleshooting

**Verify your setup with one command.** Paste in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` with your BD API key and `https://www.your-site.com` with your BD site URL:
```bash
npx --prefer-online brilliant-directories-mcp@latest --verify --api-key ENTER_API_KEY --url https://www.your-site.com
```
Prints `OK` if credentials work, `FAIL` with the error otherwise. Good first step for any connectivity issue.

**Debug mode — see exactly what's happening:**
```bash
npx --prefer-online brilliant-directories-mcp@latest --debug --verify --api-key ENTER_API_KEY --url https://www.your-site.com
```
Logs every API request and response to stderr (your API key is automatically redacted), then exits. Useful when something isn't working and you want to share output with BD support.

> Drop `--verify` to start the full MCP stdio server with debug logging — it will appear to hang in a regular terminal because MCP servers run forever over stdio, waiting for an AI client to connect. Use `--debug --verify` for one-shot debugging from a shell.

**Common issues:**
- **AI says "no tools" or "I don't have access"** — you didn't fully quit and reopen your AI app after setup. Fully quit (Mac `Cmd+Q`; Windows right-click taskbar → Quit), then reopen.
- **`401 Unauthorized`** — API key is wrong, revoked, or lacks permission for the endpoint. Regenerate in BD Admin → Developer Hub.
- **`403 API Key does not have permission to access this endpoint`** — this specific endpoint isn't granted on your key. Edit the key in BD Admin → Developer Hub and enable the missing endpoint (the error names it).
- **`404 Not Found`** — your site URL is wrong. Must include `https://` and NO trailing slash, and match the canonical form your site responds at (include `www.` if your site uses it). Correct: `https://www.mysite.com`. Wrong: `mysite.com`, `https://mysite.com/`, or `https://mysite.com` when the site actually serves at `www.mysite.com`.
- **`429 Too Many Requests`** — rate limit hit (100 req/60s default). Wait 60 seconds, or email BD support to raise your site's limit up to 1,000/min.
- **`Unknown tool` (from Claude)** — the MCP server didn't load. Fully quit + reopen the AI app first. If still broken, the npx cache has a stale install:
  - **Windows PowerShell:** `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"`
  - **Mac/Linux Terminal:** `rm -rf ~/.npm/_npx`
  - Then fully quit + reopen. The `-y` in your config makes `npx` re-download automatically — you do NOT need `npm install -g brilliant-directories-mcp`.
- **`npx: command not found` or `spawn npx ENOENT`** — Node.js isn't installed (or your AI app started before Node was installed). Install from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a>, then fully quit and reopen your AI app. Still seeing it? Reboot your computer (rare, but fixes a Windows `PATH`-cache issue that occasionally lingers after install).
- **`ETARGET No matching version found`** — your local npm cache is stale. Adding `--prefer-online` to your config args (per the snippets above) prevents this; if your config doesn't have it yet, run `npm cache clean --force` and restart your AI app.
- **"not valid MCP server configurations" (Claude Desktop)** — `claude_desktop_config.json` doesn't accept `url`-shaped blocks. Use the Advanced (npm/stdio) config from the [Claude Desktop section](#claude-desktop). Windows users on the Microsoft Store version of Claude Desktop should also uninstall and reinstall from <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">claude.ai/download</a> (the Store version sandboxes the config in ways that can break MCP loading silently).

---

## Authentication

Two credentials, sent as HTTP headers on every request. No OAuth, no Bearer tokens, no signing.

| Header | Value | Required | Notes |
|---|---|---|---|
| `X-Api-Key` | your BD API key | Yes | Authenticates the request. Admin → **Developer Hub** → **Generate API Key**. |
| `X-BD-Site-URL` | `https://www.your-site.com` | Yes | Pairs the API key with its BD site. Full canonical URL (`https://`, exact host, no trailing slash). |

### Universal MCP Client Reference

Any generic MCP client (LibreChat, custom agents, etc.) asks the same four questions. Use this table to fill any of them in.

| Field the client asks for | What to enter |
|---|---|
| **MCP Server URL** / Endpoint URL / Remote Server URL | `https://brilliantmcp.com` (no `/sse`, no trailing path) |
| **Transport** | `Streamable HTTP` (also called "HTTP Streamable"). **NOT** SSE. **NOT** WebSocket. |
| **Custom / Multiple Headers** | Two entries: `X-Api-Key: <your key>` and `X-BD-Site-URL: https://www.your-site.com` |
| **OAuth** | Off / No / disabled — we don't use OAuth |
| **Bearer Token** | Leave empty — we don't use Bearer auth |

> **n8n is the exception.** n8n's Streamable HTTP client has upstream bugs, so n8n users must use Transport = `Server Sent Events (Deprecated)` + URL `https://brilliantmcp.com/sse` (with the `/sse` path). See the [n8n section](#n8n) for the exact field values. Our server supports both transports — n8n just happens to need the legacy one today.

> **How to tell if any other MCP client will work:** the blocker is always "can this client send custom HTTP headers?" If the UI shows a **Custom Headers** / **Multiple Headers** / **HTTP Headers** field, you're good — plug in our two headers. If the UI only offers OAuth or Bearer Token, that client cannot reach our Worker today.

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

All list endpoints support filtering. Your AI handles the syntax — just ask naturally ("members in Los Angeles added this month", "pages with `sale` in the title", etc.). If you need to filter via direct HTTP (curl, Postman, Zapier webhooks, etc.), the filter params are `property`, `property_value`, and `property_operator`, repeatable as `property[]` arrays for multi-condition queries. Full operator reference lives in the MCP tool descriptions + SKILL.md.

## Sorting

```
GET /api/v2/user/get?order_column=last_name&order_type=ASC
```

## Available Resources

> **About the `Operations` column:** short verbs like `list, get, create, update, delete` map to MCP tool names by prefixing the verb to the resource (e.g. Reviews → `listReviews`, `getReview`, `createReview`...). Where the same verb covers multiple resource sub-types (e.g. single-image posts vs multi-image posts share `/api/v2/data_posts/` and `/api/v2/users_portfolio_groups/` paths but are distinct tools), the full tool names are spelled out in this table so there's no ambiguity.

| Resource | Base Path | Operations |
|----------|-----------|------------|
| Users/Members | `/api/v2/user/` | list, get, create, update, delete, search, login, transactions, subscriptions, fields |
| Reviews | `/api/v2/users_reviews/` | list, get, create, update, delete |
| Clicks | `/api/v2/users_clicks/` | list, get, create, update, delete |
| Leads | `/api/v2/leads/` | list, get, create, match, update, delete |
| Lead Matches | `/api/v2/lead_matches/` | list, get, create, update, delete |
| Single-Image Posts | `/api/v2/data_posts/` | listSingleImagePosts, getSingleImagePost, createSingleImagePost, updateSingleImagePost, deleteSingleImagePost, getSingleImagePostFields |
| Multi-Image Posts | `/api/v2/users_portfolio_groups/` | listMultiImagePosts, getMultiImagePost, createMultiImagePost, updateMultiImagePost, deleteMultiImagePost, getMultiImagePostFields |
| Multi-Image Post Photos | `/api/v2/users_portfolio/` | listMultiImagePostPhotos, getMultiImagePostPhoto, createMultiImagePostPhoto, updateMultiImagePostPhoto, deleteMultiImagePostPhoto |
| Post Types | `/api/v2/data_categories/` | list, get, update, delete, custom_fields |
| Top Categories | `/api/v2/list_professions/` | listTopCategories, getTopCategory, createTopCategory, updateTopCategory, deleteTopCategory |
| Sub Categories | `/api/v2/list_services/` | listSubCategories, getSubCategory, createSubCategory, updateSubCategory, deleteSubCategory |
| Member ↔ Sub Category Links | `/api/v2/rel_services/` | listMemberSubCategoryLinks, getMemberSubCategoryLink, createMemberSubCategoryLink, updateMemberSubCategoryLink, deleteMemberSubCategoryLink |
| User Photos | `/api/v2/users_photo/` | list, get, create, update, delete |
| User Metadata | `/api/v2/users_meta/` | list, get, update, delete |
| Tags | `/api/v2/tags/` | list, get, create, update, delete |
| Tag Groups | `/api/v2/tag_groups/` | list, get, create, update, delete |
| Tag Types | `/api/v2/tag_types/` | list, get |
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
| Website Settings | `/api/v2/website_settings/` | refreshSiteCache |
| Site Info | `/api/v2/site_info/` | getSiteInfo |
| Brand Kit | `/api/v2/website_design_settings/` | getBrandKit |

## Field Discovery

Some endpoints support dynamic field discovery:

```bash
# Get all available user fields
curl -H "X-Api-Key: ENTER_API_KEY" https://www.your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: ENTER_API_KEY" https://www.your-site.com/api/v2/data_posts/fields?form_name=my-form
```

## Stable asset URLs

For tools that import specs by URL (ChatGPT Actions, n8n, Postman):

```
https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/mcp/openapi/bd-api.json
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
- Claude Code: `claude mcp remove brilliant-directories`
- Cursor / Windsurf / Cline: delete the `brilliant-directories` entry from the MCP config JSON file, save, fully quit and reopen the app.

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
