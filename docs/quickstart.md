# Quickstart

## 1. Create A Sleepwalker Account

Create an account in the hosted app:

```text
https://app.sleepwalker.ai
```

The app is where you manage credits, API keys, MCP access, and saved
results.

## 2. Choose An Access Path

| Path | Use when |
|---|---|
| App | You want visual reports and human review. |
| API | You want scripts, product integrations, or scheduled jobs. |
| MCP | You want an agent or MCP client to run Sleepwalker actions. |
| CLI | You want terminal workflows. |

## 3. Create An API Key

Open the Sleepwalker app, go to API, and create a key.

Use it from your shell:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
```

## 4. Try The CLI

```bash
npm install -g @sleepwalkerai/cli
sleepwalker init
sleepwalker auth key set sw_api_live_...
sleepwalker doctor
sleepwalker menu
```

Or run one command without installing:

```bash
npx -y @sleepwalkerai/cli doctor
```

## 5. Try The API

```bash
curl -s https://api.sleepwalker.ai/v1/tests \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY"
```

## 6. Try MCP

Use this hosted MCP endpoint in an MCP-capable client:

```text
https://mcp.sleepwalker.ai/mcp
```

OAuth is the normal hosted connector flow. Bearer tokens are available for
custom clients.
