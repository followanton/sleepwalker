# MCP

Hosted MCP endpoint:

```text
https://mcp.sleepwalker.ai/mcp
```

Use MCP when you want an agent or MCP-capable client to inspect Sleepwalker
reports or run Sleepwalker actions.

## OAuth

If your client supports hosted MCP OAuth, connect directly to:

```text
https://mcp.sleepwalker.ai/mcp
```

You will be redirected to Sleepwalker to sign in and authorize access.
The exact tools available depend on the scopes granted by the connection. The
hosted connector flow is designed to request both read and action scopes so
agents can inspect reports and run Sleepwalker actions when credits are
available.

## Bearer Token

For custom or local clients, create a bearer token in the Sleepwalker app
and pass it as:

```http
Authorization: Bearer sw_mcp_live_...
```

## Tool Surface

Sleepwalker MCP exposes tools for:

- listing saved tests and reports;
- reading run results and prompt responses;
- serializing page content;
- suggesting AI Visibility prompts;
- creating AI Visibility runs;
- running Content Intelligence actions;
- checking queued run status.

Billable actions use prepaid Sleepwalker credits.

## More Documentation

See the hosted MCP docs:

```text
https://www.sleepwalker.ai/docs/mcp/
```
