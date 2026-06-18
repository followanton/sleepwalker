# CLI

The Sleepwalker CLI is a thin command-line client over the public API.

It does not run Sleepwalker analysis locally. It sends requests to the hosted
Sleepwalker API and prints human-friendly or JSON output.

## Local Developer Preview

```bash
cd packages/cli
npm ci
node ./bin/sleepwalker.js --help
node ./bin/sleepwalker.js init
```

Set an API key:

```bash
node ./bin/sleepwalker.js auth key set sw_api_live_...
node ./bin/sleepwalker.js doctor
```

Open the interactive menu:

```bash
node ./bin/sleepwalker.js menu
```

## Examples

```bash
node ./bin/sleepwalker.js page serialize https://www.sleepwalker.ai
node ./bin/sleepwalker.js reports by-url https://www.sleepwalker.ai
node ./bin/sleepwalker.js visibility run https://www.sleepwalker.ai \
  --brand Sleepwalker \
  --prompt "What are the best AI visibility tools?" \
  --platform perplexity \
  --watch
node ./bin/sleepwalker.js ci score https://www.sleepwalker.ai
```

Add `--json` for automation.
