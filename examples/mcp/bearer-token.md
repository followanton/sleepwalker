# MCP Bearer Token Setup

For custom or local MCP clients, create an MCP bearer token in the Sleepwalker
Sleepwalker app.

Hosted MCP endpoint:

```text
https://mcp.sleepwalker.ai/mcp
```

Authorization header:

```http
Authorization: Bearer sw_mcp_live_...
```

Keep bearer tokens private. Do not commit them to source control.

Example MCP client config shape:

```json
{
  "mcpServers": {
    "sleepwalker": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.sleepwalker.ai/mcp",
        "--header",
        "Authorization:${SLEEPWALKER_MCP_AUTH_HEADER}"
      ],
      "env": {
        "SLEEPWALKER_MCP_AUTH_HEADER": "Bearer sw_mcp_live_..."
      }
    }
  }
}
```

Prefer environment variables or a local secret store instead of hardcoding the
token in a shared config file.
