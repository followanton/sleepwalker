# Sleepwalker MCP

Sleepwalker MCP is a hosted remote MCP server for AI Visibility and Content Intelligence.

```text
https://mcp.sleepwalker.ai/mcp
```

Use it when an MCP-capable client or agent needs to read Sleepwalker reports, serialize public pages, suggest visibility prompts, create AI Visibility runs, score content, discover trends, or create Content Intelligence runs.

## Authentication

Sleepwalker supports hosted OAuth and bearer-token setups.

- OAuth is recommended for clients that support remote MCP authorization.
- Bearer tokens are available for custom and local clients.
- Billable action tools use prepaid Sleepwalker credits.
- Read, list, status, and report lookup tools are normally unmetered.

See:

- [OAuth setup](../examples/mcp/oauth.md)
- [Bearer-token setup](../examples/mcp/bearer-token.md)
- [Hosted MCP docs](https://www.sleepwalker.ai/docs/mcp/)

## Registry Files

- [`server.json`](server.json) describes the remote Streamable HTTP MCP endpoint.
- [`tools.json`](tools.json) lists the public tool surface, required scopes, and credit behavior.

`tools.json` is generated from the public catalog script. Push/PR CI checks that
the committed file matches the script. A separate scheduled and manual workflow
checks that the public tool names still match the live hosted MCP root.

```bash
node scripts/generate-mcp-tools.mjs
node scripts/generate-mcp-tools.mjs --check
node scripts/generate-mcp-tools.mjs --check-live
```

The richer fields in `tools.json` such as scopes and credit behavior are public
catalog metadata maintained in this repository.

## Boundary

This repository contains public setup material, examples, and the CLI. The hosted MCP implementation, engine, billing internals, database schema, and provider integrations are private.

Report security issues through [SECURITY.md](../SECURITY.md).
