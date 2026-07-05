# CLI

The Sleepwalker CLI is a thin command-line client over the public API.

It does not run Sleepwalker analysis locally. It sends requests to the hosted
Sleepwalker API and prints human-friendly or JSON output.

## Install

```bash
npm install -g @sleepwalkerai/cli
sleepwalker init
```

Set an API key:

```bash
sleepwalker auth key set sw_api_live_...
sleepwalker doctor
```

Open the interactive menu:

```bash
sleepwalker menu
```

Run one command without installing:

```bash
npx -y @sleepwalkerai/cli doctor
```

## Examples

```bash
sleepwalker page serialize https://www.sleepwalker.ai
sleepwalker reports by-url https://www.sleepwalker.ai
sleepwalker visibility run https://www.sleepwalker.ai \
  --brand Sleepwalker \
  --prompt "What are the best AI visibility tools?" \
  --platform perplexity \
  --watch
sleepwalker ci score https://www.sleepwalker.ai
sleepwalker okf export https://www.sleepwalker.ai
```

Add `--json` for automation.

## OKF export (free, local, no account)

`sleepwalker okf export <url>` turns a web page into an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
bundle — a small directory of agent-ready markdown (`index.md`, `log.md`, and
one concept file per page) that any AI agent can read directly.

It runs **entirely on your machine**: it fetches the URL and extracts content
locally, so it makes no Sleepwalker API call, needs no account or API key, and
costs zero credits. This is the open-source, free-for-everyone on-ramp; the
paid, engine-grade extraction and scoring live in the API and MCP tools.

```bash
sleepwalker okf export https://example.com
sleepwalker okf export https://example.com --out ./my-bundle --force
sleepwalker okf export https://example.com --json
```

| Flag | Meaning |
| --- | --- |
| `--out <dir>` | Output directory (default `./<host>-okf`) |
| `--force` | Overwrite a non-empty output directory |
| `--json` | Print a machine-readable summary of what was written |

Hostile page content is sanitized (control characters, ANSI escapes, and
bidirectional overrides are stripped), fetches time out after 30 seconds, and
oversized pages are truncated with a note recorded in `log.md`.
