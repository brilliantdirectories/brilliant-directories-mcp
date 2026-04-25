# Official Brilliant Directories MCP Server — Setup Guide

[![npm version](https://img.shields.io/npm/v/brilliant-directories-mcp?color=blue&label=npm)](https://www.npmjs.com/package/brilliant-directories-mcp)
[![license](https://img.shields.io/github/license/brilliantdirectories/brilliant-directories-mcp?color=green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

Universal AI integration for your BD site. Give any AI agent full access to your Brilliant Directories site with one API key.

Manage **members, posts (single-image and multi-image), leads, reviews, top and sub categories, email templates, pages (homepage, landing pages), 301 redirects, smart lists, widgets, menus, forms, tags, membership plans**, and more — across every resource BD exposes via its REST API.

This guide walks you through connecting your AI of choice (Claude, Cursor, etc.) to your BD site. Pick your AI app below, paste two things, restart. Most setups take under 5 minutes.

## ⚠️ REQUIREMENTS — Before you start

1. **Your BD site URL.** Include `https://`, no trailing slash.
   - ✅ `https://mysite.com`
   - ❌ `mysite.com` (missing `https://`)
   - ❌ `https://mysite.com/` (trailing slash)
2. **Your BD API key.**

   BD Admin → **Developer Hub** → **Generate API Key** → copy it.

   <a href="https://support.brilliantdirectories.com/support/solutions/articles/12000088768" target="_blank" rel="noopener noreferrer">Full walkthrough: How to Create an API Key</a>.

3. **Node.js — only for the Advanced path** (see below). Not needed for the Easy path. If you need it, one-time install from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — double-click the downloaded file to install, Next through the prompts).

### 🚨 API PERMISSIONS — DO NOT SKIP THIS

**New BD API keys ship locked down — only member read/write is enabled by default.**

Every other resource (web pages, forms, menus, tags, email templates, reviews, leads, categories, post types, widgets, etc.) is **opt-in** and lives behind an "Advanced Endpoints" toggle. Until you flip it, the AI will appear to work for member queries, then fail with `403 API Key does not have permission to access this endpoint` the moment it touches anything else.

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
    - [Using Claude extension inside Cursor](#using-the-claude-extension-inside-cursor)
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
- [Authentication](#authentication)
- [Rate Limits](#rate-limits)
- [Pagination](#pagination)
- [Filtering](#filtering)
- [Sorting](#sorting)
- [Available Resources](#available-resources)
- [Support](#support)

## Setup by Platform

<a id="the-config-block"></a>

Each platform has **two options**:

- **🚀 Easy config block** — points at our hosted MCP at `https://brilliantmcp.com`. No Node.js, no install, no terminal. Starts working the moment you save and restart your AI app.
- **🛠️ Advanced config block** — spawns the MCP as a `npx` child process on your machine. **Needs Node.js installed first** — get it from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it) and reboot before continuing. Use when you want the MCP on your own hardware.

**Both give the full BD tool surface, same instructions, same lean shapers, same safety guards.**

### 🚀 Easy config block (recommended — 30-second install)

In your AI client's MCP config (Claude Desktop, Cursor, Windsurf, Cline, etc.), add this entry:

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "url": "https://brilliantmcp.com",
      "headers": {
        "X-Api-Key": "ENTER_API_KEY",
        "X-BD-Site-URL": "https://your-site.com"
      }
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL.

The `X-BD-Site-URL` accepts the URL with or without `https://` — our Worker normalizes it.

Save. Fully quit and reopen the AI app. Done. Working? [Skip to "What you can ask the AI"](#what-you-can-ask-the-ai).

Need a client-specific walkthrough? Jump to your platform's section below.

### 🛠️ Advanced config block (requires Node.js install)

> **STEP 1 — Install Node.js BEFORE pasting the config below.** The Advanced path runs an `npx` command on your machine. If Node.js isn't installed, you'll get `spawn npx ENOENT` and the AI will show "no MCP servers" with no helpful error. Install from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> — click the green `Get Node.js®` button to download, then on the download page click `Windows Installer (.msi)` (Mac: `macOS Installer`), then DOUBLE-CLICK the downloaded file to RUN the installer, click Next through every prompt (defaults are correct). **Reboot your computer after install** — Windows needs the restart for Node to be available to your AI app.
>
> Verify Node works: open Command Prompt (Windows: `Win+R` → type `cmd` → Enter) or Terminal (Mac), then run `node --version`. Should print `v18.x` or higher. If it says "command not found", Node didn't install — try again.

> **Why `brilliant-directories-mcp@latest` and not just `brilliant-directories-mcp`?** The `@latest` tag forces `npx` to pull the newest published version on every agent launch. We ship frequent updates; pinning `@latest` keeps your agent on the freshest guardrails.

**STEP 2 — Paste this config:**

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

**STEP 3 — Fully quit the AI app, then reopen.** On Windows, closing the window with the X button keeps the app running in the system tray (bottom-right corner of taskbar). Right-click the app's tray icon → **Quit**. Then reopen. The AI loads MCP servers only at fresh launch — without a true quit, it keeps the old config.

---

### Claude Desktop

> **Seeing "Tool result could not be submitted. The request may have expired or the connection was interrupted" in Claude Desktop?** That's a known Claude Desktop UI bug affecting every MCP connector (not just BD) — Anthropic is tracking it at <a href="https://github.com/anthropics/claude-code/issues/51874" target="_blank" rel="noopener noreferrer">anthropics/claude-code issue #51874</a>. **Your tools still work** — the banner is cosmetic and fires before the tool result renders. Safe to ignore; will resolve on Claude's next update. If the banner bothers you, use the Easy path below — it skips the `npx` subprocess spawn and the latency that triggers it.

> ⚠️ **Do NOT use Settings → Connectors** (that's the OAuth UI — our MCP uses header auth, not OAuth).
>
> ✅ Go to **Settings → Developer → Edit Config** instead — works for both Easy and Advanced paths.
>
> **After initial connection, fully quit and reopen the app after editing the config.**
>
> Claude loads MCP servers only at app launch.

> ⚠️ **Windows users — install Claude Desktop from <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">claude.ai/download</a>, not the Microsoft Store.** The Microsoft Store version puts your config in a sandboxed location that can silently reject the Easy (hosted) config with "not valid MCP server configurations." The direct .exe install from `claude.ai/download` doesn't have this issue and is the version we test against.

**Steps (no terminal):**

1. Open Claude Desktop.
2. Menu bar → **Settings**.

   **Developer tab → Edit Config**.

   This opens `claude_desktop_config.json` in TextEdit (Mac) or Notepad (Windows).
3. Pick your scenario:

#### Scenario A — file is empty `{}` or has no `mcpServers` entry

Select all (`Cmd+A` / `Ctrl+A`) and delete.

Paste one of these into the file (Easy is recommended):

**🚀 Easy (recommended — no Node.js install required):**

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "url": "https://brilliantmcp.com",
      "headers": {
        "X-Api-Key": "ENTER_API_KEY",
        "X-BD-Site-URL": "https://your-site.com"
      }
    }
  }
}
```

**🛠️ Advanced (runs on your machine, needs Node.js):**

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. Without Node + reboot, the AI will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

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
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Two changes: `,` added after the `preferences` closing `}`, and the `mcpServers` block added before the final `}`. Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

> **Paste your final file into <a href="https://jsonlint.com" target="_blank" rel="noopener noreferrer">jsonlint.com</a> before restarting to ensure correct formatting.**
>
> Missing commas silently break the MCP — a validator flags them instantly.

---

4. **Fully quit and reopen Claude Desktop.** Start a new chat.

   > **"Fully quit" means more than closing the window.** On Windows: right-click the Claude icon in the system tray (bottom-right, may be hidden under `^`) → **Quit**. On Mac: `Cmd+Q` or menu bar → **Claude** → **Quit Claude**. Then relaunch.
5. **Verify:** look bottom-right of the chat input for a **🔨 hammer icon with a number**.

   That's your tool count. Click to see BD tools listed.

> **No hammer?** **Settings → Developer → MCP servers** shows `brilliant-directories` with an error status. Common causes: JSON typo (run through <a href="https://jsonlint.com" target="_blank" rel="noopener noreferrer">jsonlint.com</a>), wrong API key, URL missing `https://` or has trailing slash. For the Advanced path also: Node.js not installed. For the Easy path also: firewall blocking outbound to `brilliantmcp.com` (unlikely — it's HTTPS to a Cloudflare edge).

**Direct config file path** (if you skip Settings):
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

---

### Claude Code

Claude Code has no MCP GUI — install via terminal. Works in:

- **Terminal.app** (Mac)
- **PowerShell** (Windows)
- **Cursor / VS Code's built-in terminal** — open with ``Ctrl+` `` (Win/Linux), ``Cmd+` `` (Mac), or **View → Terminal**

**Prerequisites:** the `claude` CLI must be installed (it's itself an npm package, so Node.js is required for the CLI). One-time install:

1. **Node.js** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — double-click the downloaded file to install, Next through the prompts). Verify with `node --version` (should print `v18.x` or higher).
2. **The `claude` CLI:**

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

   Close and reopen your terminal so PATH updates. Verify with `claude --version`.

Once the CLI is installed, you've got the same two options as every other client:

#### 🚀 Easy path — hosted Worker (no BD MCP subprocess, no additional install)

```bash
claude mcp add brilliant-directories --transport http https://brilliantmcp.com \
  --header "X-Api-Key: ENTER_API_KEY" \
  --header "X-BD-Site-URL: https://your-site.com"
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Verify with `claude mcp list` — `brilliant-directories` should appear. Close and reopen Claude Code.

No `npx` child process, no BD MCP install on your machine. Claude Code hits our hosted Worker over HTTP.

#### 🛠️ Advanced path — BD MCP runs as an `npx` child process on your machine

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. Without Node + reboot, the AI will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

```bash
claude mcp add brilliant-directories -- npx -y brilliant-directories-mcp@latest --api-key ENTER_API_KEY --url https://your-site.com
```

Same command shape as the Easy path, but runs the MCP server locally. Replace the placeholders. Verify with `claude mcp list`. Close and reopen Claude Code. The `-y` flag auto-accepts the first-time npx install prompt so the spawn doesn't hang.

> **Credentials live in that one command.**
>
> The header / flag values are baked into the MCP server config in your user-level Claude config file — passed automatically to BD on every tool call, no separate step.
>
> To rotate: `claude mcp remove brilliant-directories`, then re-run `claude mcp add` with new values.

#### Using the Claude extension inside Cursor

If you chat with Claude inside Cursor (the Anthropic "Claude" extension you install into Cursor from the extension marketplace), that extension has its OWN MCP config — **separate from Cursor's native agent.** Installing in one doesn't install in the other.

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

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. This config spawns `npx` as a child process; without Node + reboot, the AI will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

1. **Open the file.** Paste the path into File Explorer's address bar (Windows) or Finder's Go → Go to Folder (Mac). If it doesn't exist yet, create a new empty text file at that path named exactly `.claude.json`.
2. **Paste this inside** (if the file already has content with a `mcpServers` key, merge the `"brilliant-directories": {...}` entry into the existing `mcpServers` object — don't overwrite other entries):

   ```json
   {
     "mcpServers": {
       "brilliant-directories": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "brilliant-directories-mcp@latest"],
         "env": {
           "BD_API_URL": "https://your-site.com",
           "BD_API_KEY": "ENTER_API_KEY"
         }
       }
     }
   }
   ```

3. Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL (include `https://`, no trailing slash). **Save the file.**
4. **Fully quit and reopen Cursor** so the Claude extension picks up the new config.
5. Chat with Claude and ask "what tools do you have?" — you should see `brilliant-directories` tools listed.

> **Cursor's Tools & MCP panel will stay empty — that's expected.** Claude's extension uses `~/.claude.json`, which is a separate host from the one Cursor's panel shows. That panel only reflects `~/.cursor/mcp.json`. If you want BD tools in BOTH surfaces, do the [Cursor section](#cursor) install too.

**Alternative — if you have the `claude` CLI installed** (most users don't — skip this if you don't know what it is):

Run this in any terminal (PowerShell, Terminal.app, Cursor's built-in terminal — any works):

```bash
claude mcp add brilliant-directories -- npx -y brilliant-directories-mcp@latest --api-key ENTER_API_KEY --url https://your-site.com
```

The CLI writes the same JSON to `~/.claude.json` for you — same end result as editing the file by hand. If `claude` isn't installed (`command not found`), just use the Notepad method above — you don't need the CLI.

---

### OpenAI (ChatGPT / Codex)

OpenAI's MCP support is narrow. The honest landscape:

| OpenAI surface | Supported? |
|---|---|
| ChatGPT web / desktop / mobile | ❌ No — no MCP support; Custom GPT Actions cap at 30 ops (BD MCP has many more than 30) |
| Codex Cloud app | ❌ No — partial/evolving MCP support |
| **Codex CLI** (terminal) | ✅ **Yes — full MCP** |

For full BD automation in the OpenAI ecosystem, use **Codex CLI**.

For GUI alternatives, use Claude Desktop / Cursor / Windsurf / Cline instead — all MCP-native with no op cap.

#### Codex CLI setup (the only supported OpenAI path)

Requires Node 18+ and a ChatGPT Plus/Pro/Business/Edu/Enterprise account for sign-in.

**1. Install + sign in:**

```bash
npm install -g @openai/codex
codex
```

Follow the browser sign-in prompt on first run. `Ctrl+C` to exit after sign-in.

**2. Edit config** at `~/.codex/config.toml` (Mac/Linux) or `%USERPROFILE%\.codex\config.toml` (Windows). Codex uses **TOML, not JSON**:

```toml
[mcp_servers.brilliant-directories]
command = "npx"
args = ["-y", "brilliant-directories-mcp@latest", "--api-key", "ENTER_API_KEY", "--url", "https://your-site.com"]
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

**3. Run `codex`.** Ask it *"list my first 5 members on my BD site"* — tools invoke, data comes back.

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
        "X-BD-Site-URL": "https://your-site.com"
      }
    }
  }
}
```

**🛠️ Advanced (runs on your machine, needs Node.js):**

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. Without Node + reboot, the AI will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

6. **Fully quit and reopen Windsurf.**

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
        "X-BD-Site-URL": "https://your-site.com"
      }
    }
  }
}
```

**🛠️ Advanced (runs on your machine, needs Node.js):**

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. Without Node + reboot, the AI will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

```json
{
  "mcpServers": {
    "brilliant-directories": {
      "command": "npx",
      "args": [
        "-y",
        "brilliant-directories-mcp@latest",
        "--api-key", "ENTER_API_KEY",
        "--url", "https://your-site.com"
      ]
    }
  }
}
```

Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.

6. Back in the MCP Servers panel, confirm `brilliant-directories` appears — toggle it **on** if not already.
7. Reload the Cline panel, or close/reopen VS Code, if tools don't show up.

---

### Cursor

> **Fastest path (no install, 30 seconds):** open Cursor Settings → **MCP** (or **Model Context Protocol**) → **Add new MCP server** → paste the [Easy config block](#setup-by-platform) with your API key + site URL. Fully quit + reopen. Tools appear in the chat.
>
> Or edit `~/.cursor/mcp.json` directly and paste the block. Either way works.
>
> Prefer the local install? Keep reading — the Cursor Directory installer below sets up the Advanced path (runs as an npx child process).

**Cursor Directory one-click install for the Advanced path (no terminal, no file editing):**

> ⚠️ **Install Node.js FIRST** — from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then click `Windows Installer (.msi)` — Mac: `macOS Installer` — and DOUBLE-CLICK the downloaded file to install it), then **reboot your computer**. The Cursor Directory installer wires up an `npx` child process; without Node + reboot, Cursor will show "no MCP servers" and the log will say `spawn npx ENOENT`. Verify with `node --version` in Command Prompt before continuing.

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
   | `BD_API_URL` | `https://your-site.com` — include `https://`, no trailing slash |

   - API key → BD Admin → **Developer Hub** → **Generate API Key** (BD shows it once; if lost, generate a new one).
   - Advanced endpoint permissions must be enabled on the key or most writes 403. See [Before you start](#requirements--before-you-start).

4. Click **Install**.
5. **Fully quit and reopen Cursor.**
6. Tools appear in **Settings → Tools & MCP**.

> **Pro tip — multi-site management:** you can install the BD MCP *multiple times* with different API keys + URLs, one per BD site you manage. Give each install a unique Name (e.g. `brilliant-directories-60031`, `brilliant-directories-81245`, `brilliant-directories-marketing`). Cursor will load them as separate servers, each with their own tool set. You can then tell Cursor things like *"on brilliant-directories-60031, list the top categories"* or *"compare member counts between the two sites"* or *"copy these 3 email templates from brilliant-directories-60031 to brilliant-directories-81245"* — Cursor routes each tool call to the correct site. Works the same way in Claude Desktop / Claude Code (each install gets its own server entry in the config). Useful for agencies, multi-brand operators, or anyone running a portfolio of BD sites.

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
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL.
6. Click **Save**.
7. **Fully quit and reopen Cursor.**

### Alternative B — Edit the config file directly

Use this if the GUI doesn't show "Tools & MCP" or the "New MCP Server" button silently fails. Same result as the GUI method.

Cursor reads from `mcp.json` in a hidden `.cursor` folder in your home directory.

#### Mac / Linux

1. Open **Finder** (Mac) or your file manager (Linux).
2. `Cmd+Shift+G` (Mac) or `Ctrl+L` (Linux) to open a "Go to Folder" input.
3. Type `~/.cursor` → Enter.
   - If "Folder doesn't exist": navigate to `~/` and create a new folder named exactly `.cursor` (leading dot). Retry.
4. Inside `.cursor`, open `mcp.json` in TextEdit / any text editor. If missing: create it. TextEdit users: File → New → Format menu → **Make Plain Text** first, then save as `mcp.json` (not `mcp.json.txt`).
5. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.
6. **Fully quit and reopen Cursor.**

#### Windows

1. Windows key → type `File Explorer` → Enter.
2. Click the address bar at the top. Type `%USERPROFILE%\.cursor` → Enter.
   - If "Windows can't find": go to `%USERPROFILE%`, right-click → **New** → **Folder** → name it exactly `.cursor` (leading dot). Retry.
3. Inside `.cursor`, open `mcp.json` in Notepad. If missing: right-click empty area → **New** → **Text Document** → rename to `mcp.json` (click Yes to the extension warning).
   - Can't see `.txt` / `.json` extensions? File Explorer → **View** menu → check **File name extensions**.
4. Paste [the config block](#the-config-block). Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL. Save.
5. **Fully quit and reopen Cursor.**

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
| **Header 2** | Name: `X-BD-Site-URL` · Value: `https://your-site.com` |

Save the node. Click the **Tool** dropdown — should populate with every BD tool. Pick any tool, click Execute.

> **Why "SSE (Deprecated)" and not "HTTP Streamable"?** The MCP spec deprecated legacy SSE in favor of Streamable HTTP. n8n's SSE client works today against our server; n8n's Streamable HTTP client has <a href="https://github.com/n8n-io/n8n/issues/28924" target="_blank" rel="noopener noreferrer">known upstream bugs</a> we filed. Our server supports BOTH transports — when n8n fixes their Streamable HTTP client, customers can optionally switch to `https://brilliantmcp.com` (no `/sse` path) with Transport = `HTTP Streamable`. No server changes needed on our side.

> **Why `brilliantmcp.com`?** The main `brilliantdirectories.com` domain has zone-level security rules (bot challenges, geo blocks) that protect our marketing site but silently blocked n8n's SSE handshake. `brilliantmcp.com` is a dedicated zone with no inherited security posture — n8n connects cleanly. It's the single canonical URL for the hosted MCP endpoint.

**Don't want MCP? Alternative paths for n8n:**

**✅ HTTP Request node + OpenAPI import** — n8n has native OpenAPI support. Import this spec URL as a custom API:
```
https://raw.githubusercontent.com/brilliantdirectories/brilliant-directories-mcp/main/mcp/openapi/bd-api.json
```
n8n generates a node for every BD operation automatically. Prompts for your BD site URL and API key on import. Every BD operation available, zero MCP protocol involved.

**✅ Plain HTTP Request node** — point a single HTTP Request node at `https://your-site.com/api/v2/user/get` with header `X-Api-Key: ENTER_API_KEY`. Chain multiple nodes for workflows touching several BD endpoints. Simplest possible setup.

**Want to verify the server is healthy yourself?** Install the official <a href="https://github.com/modelcontextprotocol/inspector" target="_blank" rel="noopener noreferrer">MCP Inspector</a> (`npx @modelcontextprotocol/inspector`) and point it at `https://brilliantmcp.com/sse`. Inspector is the reference implementation of MCP's client spec.

---

### Make / Zapier

**Make:** Create a custom app using the OpenAPI spec, or use the HTTP module with `X-Api-Key` + `X-BD-Site-URL` headers against `https://your-site.com/api/v2/*`.

**Zapier:** The "MCP Client by Zapier" app only supports OAuth / Bearer Token — it has no custom-headers field, so it cannot authenticate against our Worker.

Use one of these paths instead:
- **BD's existing Zapier app** (if it covers what you need) — same underlying API, same API key.
- **Webhooks by Zapier** against `https://your-site.com/api/v2/*`, with Custom Headers `X-Api-Key: <your key>` and `X-BD-Site-URL: https://your-site.com`. This hits BD's REST API directly and skips MCP entirely — every BD operation reachable.

---

### curl / Any HTTP Client

Paste these in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL.

```bash
# Verify your API key
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/token/verify

# List members
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/user/get?limit=10

# Create a member
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "email=new@example.com&password=secret123&subscription_id=1&first_name=Jane&last_name=Doe" \
  https://your-site.com/api/v2/user/create

# Search members (spaces in values need URL-encoding as + or %20)
curl -X POST -H "X-Api-Key: ENTER_API_KEY" \
  -d "q=dentist&address=Los+Angeles&limit=10" \
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

**Verify your setup with one command.** Paste in a terminal (Mac: Terminal.app · Windows: PowerShell). Replace `ENTER_API_KEY` with your BD API key and `https://your-site.com` with your BD site URL:
```bash
npx brilliant-directories-mcp@latest --verify --api-key ENTER_API_KEY --url https://your-site.com
```
Prints `OK` if credentials work, `FAIL` with the error otherwise. Good first step for any connectivity issue.

**Debug mode — see exactly what's happening:**
```bash
npx brilliant-directories-mcp@latest --debug --verify --api-key ENTER_API_KEY --url https://your-site.com
```
Logs every API request and response to stderr (your API key is automatically redacted), then exits. Useful when something isn't working and you want to share output with BD support.

> Drop `--verify` to start the full MCP stdio server with debug logging — it will appear to hang in a regular terminal because MCP servers run forever over stdio, waiting for an AI client to connect. Use `--debug --verify` for one-shot debugging from a shell.

**Common issues:**
- **AI says "no tools" or "I don't have access"** — you didn't fully quit and reopen your AI app after setup. Fully quit (Mac `Cmd+Q`; Windows right-click taskbar → Quit), then reopen.
- **`401 Unauthorized`** — API key is wrong, revoked, or lacks permission for the endpoint. Regenerate in BD Admin → Developer Hub.
- **`403 API Key does not have permission to access this endpoint`** — this specific endpoint isn't granted on your key. Edit the key in BD Admin → Developer Hub and enable the missing endpoint (the error names it).
- **`404 Not Found`** — your site URL is wrong. Must include `https://` and NO trailing slash. Correct: `https://mysite.com`. Wrong: `mysite.com` or `https://mysite.com/`.
- **`429 Too Many Requests`** — rate limit hit (100 req/60s default). Wait 60 seconds, or email BD support to raise your site's limit up to 1,000/min.
- **`Unknown tool` (from Claude)** — the MCP server didn't load the OpenAPI spec. Usually fixed by fully quitting the AI app (not just closing the window) and reopening. If that doesn't fix it, your npx cache may have a broken install — delete the cache and try again:
  - **Windows PowerShell:** `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"`
  - **Mac/Linux Terminal:** `rm -rf ~/.npm/_npx`
  - Then fully quit + reopen the AI app. On next launch `npx` will re-download `brilliant-directories-mcp@latest` automatically (that's what the `-y` in your config means — no manual install needed).
  - You do NOT need to run `npm install -g brilliant-directories-mcp` — the MCP installs itself when the AI app launches it via `npx`. That command is only for developers who want a standalone CLI.
- **`npx: command not found` OR `spawn npx ENOENT`** — Node.js isn't installed (or installed but not on your system PATH). Install from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> (click `Get Node.js®` to download, then `Windows Installer (.msi)` or `macOS Installer`, then double-click the downloaded file to install). **Reboot Windows after install** — without a reboot, your AI app won't see the new PATH. Verify with `node --version` in Command Prompt; should print `v18.x` or higher.
- **"not valid MCP server configurations" (Windows, Microsoft Store Claude Desktop)** — the Microsoft Store version of Claude Desktop sandboxes the config and may reject the Easy (hosted) config syntax. **Fix:** uninstall the Microsoft Store version, then install the direct .exe from <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">claude.ai/download</a>. The direct .exe accepts both Easy and Advanced configs without sandbox issues.

---

## Authentication

Two credentials, sent as HTTP headers on every request. No OAuth, no Bearer tokens, no signing.

| Header | Value | Required | Notes |
|---|---|---|---|
| `X-Api-Key` | your BD API key | Yes | Admin → **Developer Hub** → **Generate API Key**. Permissions are scoped per key — you choose which endpoints it can reach. |
| `X-BD-Site-URL` | `https://your-site.com` | Yes (Remote path only) | Tells our Worker which BD site to proxy to. Accepts the URL with or without `https://` — the Worker normalizes it. Not needed for the npx/Advanced path (already in the `--url` flag). |

### Universal MCP Client Reference

Any generic MCP client (LibreChat, custom agents, etc.) asks the same four questions. Use this table to fill any of them in.

| Field the client asks for | What to enter |
|---|---|
| **MCP Server URL** / Endpoint URL / Remote Server URL | `https://brilliantmcp.com` (no `/sse`, no trailing path) |
| **Transport** | `Streamable HTTP` (also called "HTTP Streamable"). **NOT** SSE. **NOT** WebSocket. |
| **Custom / Multiple Headers** | Two entries: `X-Api-Key: <your key>` and `X-BD-Site-URL: https://your-site.com` |
| **OAuth** | Off / No / disabled — we don't use OAuth |
| **Bearer Token** | Leave empty — we don't use Bearer auth |

> **n8n is the exception.** n8n's Streamable HTTP client has upstream bugs, so n8n users must use Transport = `Server Sent Events (Deprecated)` + URL `https://brilliantmcp.com/sse` (with the `/sse` path). See the [n8n section](#n8n) for the exact field values. Our server supports both transports — n8n just happens to need the legacy one today.

### MCP Client Compatibility

| Client | Remote HTTP MCP | Status | Notes |
|---|---|---|---|
| **Claude Desktop** (v0.8+) | ✅ | Works | Settings → Developer → Edit Config. See [Claude Desktop setup](#claude-desktop). |
| **Cursor** | ✅ | Works | Settings → MCP → Add Server. See [Cursor setup](#cursor). |
| **Claude Code CLI** | ✅ | Works | `claude mcp add --transport http ...`. See [Claude Code setup](#claude-code). |
| **Windsurf** | ✅ | Works | Uses `serverUrl` (not `url`). See [Windsurf setup](#windsurf). |
| **Cline** (VS Code) | ✅ | Works | Settings → MCP → Add Remote Server. See [Cline setup](#cline-vs-code-extension). |
| **n8n MCP Client Tool node** | ✅ | Works via SSE | n8n's Streamable HTTP client has [upstream bugs](https://github.com/n8n-io/n8n/issues/28924), so use Transport = `Server Sent Events (Deprecated)` + URL `https://brilliantmcp.com/sse`. See [n8n setup](#n8n) for exact field values. |
| **Zapier MCP Client by Zapier** | ❌ | Not supported | Zapier's MCP Client UI only exposes **OAuth** + **Bearer Token**. No custom-headers field. Our Worker requires `X-Api-Key` + `X-BD-Site-URL` custom headers, so Zapier MCP cannot authenticate. Use **Webhooks by Zapier** with `X-Api-Key` + `X-BD-Site-URL` headers against `https://your-site.com/api/v2/*` instead (bypasses MCP entirely, hits BD's REST API directly). |
| **ChatGPT (web / desktop / mobile)** | ❌ | Not supported | OpenAI hasn't shipped MCP connector support in consumer ChatGPT. Codex CLI works — see [OpenAI section](#openai-chatgpt--codex). |
| **ChatGPT Custom GPTs** | ❌ | Not possible | Custom GPTs speak OpenAPI Actions, not MCP. Import the OpenAPI spec directly as a Custom Action. |

> **Why Zapier doesn't work and how to know if a client will:** the blocker is always "can this client send custom HTTP headers to an MCP server?" If the UI shows a **Custom Headers** / **Multiple Headers** / **HTTP Headers** field — you're good, plug in our two headers. If the UI only offers OAuth or Bearer Token — that client cannot reach our Worker today. We evaluate OAuth/Bearer support on request.

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

| Resource | Base Path | Operations |
|----------|-----------|------------|
| Users/Members | `/api/v2/user/` | list, get, create, update, delete, search, login, transactions, subscriptions, fields |
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
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: ENTER_API_KEY" https://your-site.com/api/v2/data_posts/fields?form_name=my-form
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
