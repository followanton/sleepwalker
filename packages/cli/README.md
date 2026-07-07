# Sleepwalker CLI

Command-line client for the Sleepwalker API.

Most commands are a thin client over the hosted API and do not run
Sleepwalker analysis locally. The exception is `okf export`, which is free
and runs entirely on your machine.

Public package:

```text
@sleepwalkerai/cli
```

## Install

```bash
npm install -g @sleepwalkerai/cli
sleepwalker init
sleepwalker auth key set sw_api_live_...
sleepwalker menu
sleepwalker doctor
sleepwalker commands
```

One-off usage:

```bash
npx @sleepwalkerai/cli doctor
```

## Local usage

From the root of this repository:

```bash
node packages/cli/bin/sleepwalker.js
node packages/cli/bin/sleepwalker.js menu
node packages/cli/bin/sleepwalker.js init
node packages/cli/bin/sleepwalker.js commands
```

With an API key:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
node packages/cli/bin/sleepwalker.js credits
```

Or store the key locally:

```bash
node packages/cli/bin/sleepwalker.js auth key set sw_api_live_...
node packages/cli/bin/sleepwalker.js doctor
```

To point the CLI at a non-production API base:

```bash
node packages/cli/bin/sleepwalker.js config set api-base-url https://api.sleepwalker.ai
node packages/cli/bin/sleepwalker.js config show
```

## Examples

```bash
sleepwalker init
sleepwalker menu
sleepwalker doctor
sleepwalker page serialize https://www.sleepwalker.ai
sleepwalker reports by-url https://www.sleepwalker.ai
sleepwalker visibility run https://www.sleepwalker.ai --brand Sleepwalker --prompt "What are the best AI visibility tools?" --platform perplexity --watch
sleepwalker ci score https://www.sleepwalker.ai
sleepwalker ci run https://www.sleepwalker.ai --depth full --watch
sleepwalker activity list
sleepwalker okf export https://www.sleepwalker.ai
```

`okf export` is free, open source (MIT, like the rest of this CLI), and runs
entirely on your machine. It fetches the page and writes an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
bundle (agent-ready markdown) to a local directory. No account, no API key, no
credits. Use `--out <dir>` to choose the destination and `--force` to overwrite.
Hostile page content is sanitized (control characters, ANSI escapes, and bidi
overrides are stripped), fetches time out after 30 seconds, and oversized pages
are truncated with a note in `log.md`.

Add `--json` to print raw API responses.

For retryable scripts, pass your own idempotency key on persisted run creation:

```bash
sleepwalker visibility run https://www.sleepwalker.ai \
  --brand Sleepwalker \
  --prompt "What are the best AI visibility tools?" \
  --platform perplexity \
  --idempotency-key visibility-sleepwalker-homepage-001
```

`--watch` polls for completion and stops after 15 minutes by default. Override
that with `--max-wait-seconds <seconds>` when a workflow needs a shorter or
longer wait.

## Smoke tests

Local command smoke:

```bash
npm run smoke
```

Read-only live smoke with a real API key:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
npm run smoke:live
```

The live smoke does not run billable actions by default. To include one
intentional serialization action:

```bash
SLEEPWALKER_CLI_SMOKE_WRITE=1 npm run smoke:live
```

## Terminal color

Human output uses Sleepwalker-inspired terminal color when the terminal supports
it:

- green for successful AI Visibility / completed states;
- purple for Content Intelligence;
- cyan/blue for IDs, URLs, and API paths;
- yellow/red for queued, blocked, or failed work.

Colors are never added to `--json` output. Set `NO_COLOR=1` to disable styling
or `FORCE_COLOR=1` to force it in supported terminals.

If your current shell exports `NO_COLOR`, remove it while previewing:

```bash
env -u NO_COLOR FORCE_COLOR=1 node packages/cli/bin/sleepwalker.js --help
```
