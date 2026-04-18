# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.3] - 2026-04-18

### Documentation — important BD behavior caveat

- **Pages created via API require one manual admin step to become publicly accessible.** When `createPage` or `updatePage` writes a page record, BD's URL router / site cache doesn't pick it up automatically — the public URL 404s until the user goes to **BD Admin → Manage Pages → click Save** on the record once. This triggers BD's internal side-effects (URL registration, cache rebuild).
- This is a BD API limitation (BD's admin UI runs side-effects the API doesn't), not an MCP bug. We've now documented it in three places so agents always warn users about it:
  - `docs/api-pages.md` — visible warning callout at the top
  - `SKILL.md` — added generalized rule #9 "Warn when API writes don't fully propagate"
  - `openapi/bd-api.json` — the `createPage` operation description now includes the warning, so any consumer reading the spec (ChatGPT Actions, n8n, LangChain, custom agents) sees it
- **No code change** — this is a documentation-only release to close a UX gap discovered in real testing.

### Future work
If BD adds an API cache-flush endpoint (e.g., `POST /api/v2/site/rebuild-cache`), we can surface it as a tool and have agents call it automatically after writes that need propagation.

## [1.4.2] - 2026-04-18

### Fixed
- Republish to force npm to re-extract the README for the package page. v1.4.1 shipped the README inside the tarball correctly, but npm's registry failed to populate the per-version `readme` metadata field, causing the npm package page to show "This package does not have a README" despite the file being present. No code changes — same content as 1.4.1, just a fresh publish to trigger README re-indexing.

## [1.4.1] - 2026-04-18

### Fixed — CRITICAL
- **`openapi/bd-api.json` was missing from the published npm tarball** in v1.0.0–v1.4.0, causing the MCP server to crash on startup for every user who installed via `npm install` or `npx` with the error `Error: OpenAPI spec not found`. The spec lived at the repo root's `openapi/` folder, sibling to `mcp/` — which isn't reachable from inside the published package. **Every npm install since v1.0.0 was broken.**
- **Fix:** the spec is now bundled inside the package at `mcp/openapi/bd-api.json` (which ships via the `files` allowlist). `loadSpec()` in `index.js` now checks the in-package path first, then falls back to the monorepo-relative path for local development.

### How this slipped through
The spec file was present locally (monorepo structure resolves the `../openapi/` path correctly from `mcp/`), and `npm pack --dry-run` was run from a working directory that had the file on disk at the relative path — which made the tarball look fine without actually testing what an installer would see.

**Added pre-publish smoke test to the release checklist:** extract the tarball and run `node index.js --help` from the extracted copy before publishing. Any "spec not found" error there blocks publish.

### Apologies to anyone who tried v1.3.0 or earlier
If your setup failed with "OpenAPI spec not found," upgrade to v1.4.1 and retry. The MCP server itself, the `--setup` wizard, and `--verify` all work — only the full MCP startup path was broken by the missing file.

## [1.4.0] - 2026-04-18

### Added
- **Non-interactive `--setup` mode** — the wizard now runs end-to-end without any prompts when `--url`, `--api-key`, and `--client` are all provided as flags. This unblocks AI-agent-driven installs: an agent can guide the user to paste a single command into their terminal, and the MCP config writes itself. Example:
  ```
  npx brilliant-directories-mcp --setup --url https://mysite.com --api-key KEY --client cursor
  ```
- New `--client` flag accepts `cursor`, `claude-desktop`, `windsurf`, `claude-code`, or `print`. The `print` value outputs the JSON config without writing any file — safest default for agents that want to show the config to the user instead of modifying disk.
- New `--yes` / `-y` flag auto-confirms the "continue anyway?" prompt that fires when the connection test fails (e.g., a key typo). Implicit when all three setup flags are provided.

### Why
Claude / Cursor / other AI agents couldn't drive the interactive wizard from their Bash tools (subprocess stdin ≠ a real TTY). With these flags, an agent can now tell the user *"paste this into your terminal"* and have a complete install in one command — no back-and-forth prompts, no JSON editing, no security compromise (the key is typed by the user, not echoed through chat).

### Backward compatibility
Running `--setup` with no flags still launches the original interactive wizard. Partial flags (e.g., only `--url` provided) falls back to prompting for the missing values. Zero breaking changes.

## [1.3.0] - 2026-04-18

### Added
- **Redirects resource (`redirect_301`)** — 5 new endpoints for managing 301 permanent redirect rules. AI agents can now create/update/delete URL redirects to preserve SEO and inbound links after profile renames, post slug changes, category restructuring, or custom rules.
  - `GET /api/v2/redirect_301/get` → `listRedirects`
  - `GET /api/v2/redirect_301/get/{redirect_id}` → `getRedirect`
  - `POST /api/v2/redirect_301/create` → `createRedirect` (required: `type`, `old_filename`, `new_filename`)
  - `PUT /api/v2/redirect_301/update` → `updateRedirect` (required: `redirect_id`)
  - `DELETE /api/v2/redirect_301/delete` → `deleteRedirect` (required: `redirect_id`)
- `docs/api-redirects.md` with full field reference. Source: BD support article 12000108112.

### Changed
- Total endpoint count: 159 → **164** across **30** resource groups (up from 29).
- README resource table + headline updated to reflect Redirects support.

## [1.2.1] - 2026-04-18

### Fixed
- Corrected BD admin navigation path in `--help` text, `--setup` wizard, and README: the API key is generated under **Developer Hub > Generate API Key**, not "Settings > API Keys." Source: BD support article 12000088768.
- SKILL.md now deep-links to the BD Generate-API-Key article for screenshots.

### Notes
- No functional changes to the MCP server or OpenAPI operations. 1.2.1 behaves identically to 1.2.0 at runtime — this is a docs/copy correction only.

## [1.2.0] - 2026-04-18

### Added
- **Pages resource (`list_seo`)** — 5 new endpoints for managing static and SEO-enabled pages: the homepage, custom landing pages, about/contact pages, category pages, profile templates, and search result pages. AI agents can now update homepage copy, create new landing pages, change meta tags, configure hero sections, etc.
  - `GET /api/v2/list_seo/get` → `listPages`
  - `GET /api/v2/list_seo/get/{seo_id}` → `getPage`
  - `POST /api/v2/list_seo/create` → `createPage` (required: `seo_type`, `filename`)
  - `PUT /api/v2/list_seo/update` → `updatePage` (required: `seo_id`)
  - `DELETE /api/v2/list_seo/delete` → `deletePage` (required: `seo_id`)
- `docs/api-pages.md` with full field reference (70+ fields: SEO metadata, content body, hero section config, social sharing, access control, custom CSS, etc.)

### Changed
- Total endpoint count: 154 → **159** across **29** resource groups (up from 28).
- README resource table + headline updated to reflect Pages support.

## [1.1.0] - 2026-04-18

### Added
- **`--setup` interactive wizard** — new zero-friction onboarding. Run `npx brilliant-directories-mcp --setup` and answer 2 questions (site URL, API key). The wizard:
  - Normalizes the URL (adds `https://` if missing, strips trailing slashes)
  - Masks API key entry with asterisks
  - Tests the connection against `/api/v2/token/verify` before writing config
  - Asks which MCP client you use (Cursor / Claude Desktop / Windsurf / Claude Code / Other)
  - Writes the correct config file at the correct OS-specific path automatically
  - For Claude Code, prints the `claude mcp add` command to run
  - For Other, prints the JSON config to paste manually
- Existing configs are preserved — the wizard merges into existing `mcpServers` rather than overwriting.

### Changed
- `--help` output now leads with the `--setup` command as the recommended first-time path.

## [1.0.2] - 2026-04-18

### Changed
- Expanded npm keywords for discoverability: added `brilliantdirectories` (unhyphenated brand spelling), `online-directory`, `onlinedirectory`, `online-directories`, `onlinedirectories` (what non-technical users call BD-built sites), `member-management`, `members`, plus `anthropic`, `agent`, `automation`. Users searching npm for any of these now find the package.

## [1.0.1] - 2026-04-18

### Fixed
- `bin` path in `package.json` — removed `./` prefix so npm 11+ accepts the CLI entry (`brilliant-directories-mcp` command now installs properly on `npm install -g` and `npx`).
- License badge in README — switched from `shields.io/npm/l/...` to `shields.io/github/license/ORG/REPO` endpoint to bypass GitHub camo's aggressive cache of the stale "package not found" image from the brief window between first push and first publish.
- npm version badge URL — dropped `.svg` extension and added color params to force fresh fetch through image proxies.

### Notes
- No functional changes to the MCP server or OpenAPI spec; 1.0.0 and 1.0.1 behave identically at runtime.

## [1.0.0] - 2026-04-17

### Added
- Initial release: Model Context Protocol server wrapping the Brilliant Directories REST API.
- OpenAPI 3.1 specification (`openapi/bd-api.json`) covering **154 endpoints across 28 resources**: users/members, reviews, clicks, leads, lead matches, posts, portfolio groups, portfolio photos, post types, categories, category groups, services, user services, user photos, user metadata, tags, tag groups, tag types, tag relationships, widgets, email templates, forms, form fields, membership plans, menus, menu items, unsubscribe list, and smart lists.
- MCP server entrypoint (`mcp/index.js`) — thin wrapper that reads the OpenAPI spec and exposes each operation as an MCP tool.
- Setup guides for Claude Code, Cursor, Windsurf, Cline, ChatGPT (GPT Actions), n8n, Make/Zapier, and raw curl.
- Raw endpoint documentation for all 28 resource groups in `docs/`.
- `--verify` flag: test credentials against `/api/v2/token/verify` and exit (connectivity smoke test without starting MCP).
- `--help` / `-h` flag: inline usage documentation.
- `--debug` flag (or `BD_DEBUG=1` env var): logs every HTTP request + response to stderr for troubleshooting. API key is redacted in logs. Safe to use with MCP since logs go to stderr, not the stdio protocol channel.
- `User-Agent` header on all outbound requests: `brilliant-directories-mcp/{version} (node/{version})` — lets BD's server logs distinguish MCP traffic from other API clients.
- Duplicate `operationId` detection at startup: if the OpenAPI spec has two endpoints with the same operationId, the server fails loudly with a clear error instead of silently overwriting tool definitions.
- Package version derived from `package.json` at runtime (no more hardcoded version strings that could drift out of sync).
- URL normalization: accepts sites with or without `https://` prefix; strips trailing slashes automatically.
- `npx brilliant-directories-mcp` support (no global install required).
- Templated OpenAPI server URL (`{bd_site_url}` variable) so ChatGPT Actions, n8n, and Postman prompt for the site URL at import rather than requiring file editing.
- Rate-limit awareness for AI agents:
  - OpenAPI `info.description` documents default (100/60s), request-for-raise path (contact BD support for 100–1,000/min), and 429 handling — every platform consuming the spec (ChatGPT, n8n, Postman) sees this.
  - MCP server ships rate-limit + bulk-op guidance in its `instructions` field, seen by agents on connect.
  - Structured error responses for HTTP 429 and 401/403 — agent gets an actionable English message (back off / raise limit / verify key) instead of raw JSON.
- MIT License.

### Authentication
- All requests authenticated via `X-Api-Key` header.
- Rate limit: 100 requests per 60 seconds (default). Customers may request a raised limit from BD support — any value between 100 and 1,000/min. Not self-service.

[Unreleased]: https://github.com/brilliantdirectories/brilliant-directories-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/brilliantdirectories/brilliant-directories-mcp/releases/tag/v1.0.0
