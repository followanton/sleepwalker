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
```

Add `--json` for automation.
