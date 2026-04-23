# Contributing

Thanks for considering a contribution to the Brilliant Directories MCP server.

This project is maintained by Brilliant Directories. Community contributions — bug reports, small fixes, documentation improvements — are welcome.

## Reporting bugs

Open an issue at https://github.com/brilliantdirectories/brilliant-directories-mcp/issues and include:

- What you were trying to do
- What happened vs. what you expected
- The exact MCP client you were using (Claude Code, Cursor, ChatGPT, n8n, etc.)
- Your Node.js version (`node --version`)
- Relevant error output (redact your API key and site URL)

## Suggesting new endpoints or fields

The server is generated from [`mcp/openapi/bd-api.json`](mcp/openapi/bd-api.json). If an endpoint is missing or a field is wrong, open an issue or a PR that updates the OpenAPI spec — the MCP server picks up new tools automatically.

## Pull requests

1. Fork the repo and create a topic branch
2. Keep changes focused — one logical change per PR
3. Update [`CHANGELOG.md`](CHANGELOG.md) under the `[Unreleased]` section
4. If you touched the OpenAPI spec, validate it:
   ```
   npx @redocly/cli lint mcp/openapi/bd-api.json
   ```
5. Open the PR against `main` with a clear description of the problem and the fix

## Local development

```bash
git clone https://github.com/brilliantdirectories/brilliant-directories-mcp.git
cd brilliant-directories-mcp/mcp
npm install

# run the server with your BD credentials
BD_API_URL=https://your-site.com \
BD_API_KEY=your-key-here \
node index.js
```

Test against a non-production BD site. Never commit credentials.

## Code of conduct

Be respectful. Keep discussion technical. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) standard.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
