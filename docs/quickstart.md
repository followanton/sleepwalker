# Quickstart

## 1. Try it without an account

One CLI command is free and runs entirely on your machine:

```bash
npx -y @sleepwalkerai/cli okf export https://www.sleepwalker.ai
```

It turns a public page into an agent-ready markdown bundle in a local
folder. No account, no API key, no credits. See [cli.md](cli.md) for
details.

## 2. Create a Sleepwalker account

Create an account in the hosted app:

```text
https://app.sleepwalker.ai
```

The app is where you manage credits, API keys, MCP access, and saved
results.

## 3. Choose an access path

| Path | Use when |
|---|---|
| App | You want visual reports and human review. |
| API | You want scripts, product integrations, or scheduled jobs. |
| MCP | You want an agent or MCP client to run Sleepwalker actions. |
| CLI | You want terminal workflows. |

## 4. Create an API key

Open the Sleepwalker app, go to API, and create a key.

Use it from your shell:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
```

## 5. Try the CLI

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

## 6. Try the API

```bash
curl -s https://api.sleepwalker.ai/v1/tests \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY"
```

## 7. Try MCP

Use this hosted MCP endpoint in an MCP-capable client:

```text
https://mcp.sleepwalker.ai/mcp
```

OAuth is the normal hosted connector flow. Bearer tokens are available for
custom clients.
