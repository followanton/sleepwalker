# Sleepwalker

Public developer tools and examples for Sleepwalker AI.

Sleepwalker gives developers, agents, and SEO teams a shared way to run AI
Visibility and Content Intelligence workflows through a hosted Console, API,
MCP, and CLI.

This repository contains public client tooling and examples only. The hosted
engine, Console source, MCP server implementation, database schema, billing
systems, provider integrations, and deployment operations are proprietary and
are not part of this repository.

## What Is Here

```text
sleepwalker/
  packages/
    cli/                 Sleepwalker CLI
  examples/
    api/                 curl, JavaScript, and Python examples
    mcp/                 OAuth and bearer-token setup examples
  docs/                  Short developer guides
```

## Access Points

| Surface | Use it for |
|---|---|
| Console | Human review, credits, API keys, MCP access, and full result views. |
| API | Product integrations, scripts, scheduled jobs, and custom workflows. |
| MCP | Agent access from MCP-capable clients and connector platforms. |
| CLI | Terminal workflows built on the public API. |

Public docs:

- [API docs](https://www.sleepwalker.ai/docs/api/)
- [MCP docs](https://www.sleepwalker.ai/docs/mcp/)
- [CLI docs](https://www.sleepwalker.ai/docs/cli/)
- [Billing and credits](https://www.sleepwalker.ai/docs/billing/credits/)

## CLI

Install the CLI from npm:

```bash
npm install -g @sleepwalkerai/cli
sleepwalker init
sleepwalker auth key set sw_api_live_...
sleepwalker doctor
sleepwalker menu
```

Or run one command without installing:

```bash
npx @sleepwalkerai/cli doctor
```

To work from this repository:

```bash
git clone https://github.com/followanton/sleepwalker.git
cd sleepwalker/packages/cli
npm ci
npm test
node ./bin/sleepwalker.js --help
```

Authenticate with an API key from the Sleepwalker Console:

```bash
node ./bin/sleepwalker.js auth key set sw_api_live_...
node ./bin/sleepwalker.js doctor
node ./bin/sleepwalker.js menu
```

## API Quick Example

```bash
curl -s https://api.sleepwalker.ai/v1/pages/content/serialize \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.sleepwalker.ai","max_chars":2000}'
```

See `examples/api/` for curl, JavaScript, and Python examples.

## MCP Quick Example

Hosted MCP endpoint:

```text
https://mcp.sleepwalker.ai/mcp
```

MCP clients that support OAuth can connect directly to that URL. Custom/local
clients can use a bearer token created in the Sleepwalker Console.

See `examples/mcp/` for setup examples.

## Credits

Read actions are normally unmetered. Billable actions use prepaid Sleepwalker
credits and follow the same backend credit behavior across Console, API, MCP,
and CLI.

## Security Boundary

Do not put secrets in this repository. Use environment variables for API keys:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
```

This repository intentionally does not include private infrastructure code or
deployment configuration.
