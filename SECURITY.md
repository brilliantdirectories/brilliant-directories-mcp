# Security Policy

## Reporting a vulnerability

Email **security@brilliantdirectories.com**. Do not open a public GitHub issue, pull request or discussion for a vulnerability.

Include:

- **Summary:** what the vulnerability is and which component it affects: the npm package (`brilliant-directories-mcp`), the hosted server (`https://brilliantmcp.com`), or the OpenAPI spec and instructions in this repository.
- **Affected version:** the npm version, or the date and time you tested the hosted server.
- **Steps to reproduce:** exact requests, tool calls or configuration, in order, with a proof of concept if you have one.
- **Impact:** what an attacker could read, change or execute, and under what conditions.
- **Severity:** your assessment (critical, high, medium or low), with a CVSS v3.1 vector if you have one.
- **Your contact details**, so we can follow up and credit you.

## What to expect

- We aim to acknowledge your report within 3 business days.
- We will confirm whether the issue is valid, keep you updated while we work on a fix, and tell you when it is released.
- With your permission, we will credit you in the release notes.

Please give us reasonable time to release a fix before you disclose the issue publicly.

## Scope

In scope:

- The npm package `brilliant-directories-mcp`
- The hosted MCP server at `https://brilliantmcp.com`
- The code, spec and release workflow in this repository

Out of scope:

- Vulnerabilities in Brilliant Directories websites themselves, unless they are reachable through this MCP server
- Issues that require a leaked or stolen API key, or full control of the user's machine or MCP client
- Denial of service, rate-limit testing, spam or social engineering
- Reports from automated scanners without a demonstrated impact

## Testing guidelines

- Test only against a Brilliant Directories site and API key that you own.
- Do not access, change or delete data that is not yours.
- Stop testing and report immediately if you reach data that is not yours.

We will not pursue legal action against research that follows this policy in good faith.

## Supported versions

Only the latest release on npm and the current hosted server receive security fixes.
