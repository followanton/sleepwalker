# Sleepwalker CLI

Developer-preview command-line client for the Sleepwalker API.

This package is intentionally a thin API client. It does not run Sleepwalker
analysis locally.

Provisional public package target:

```text
@sleepwalker/cli
```

The package remains private until the npm scope and release process are
finalized. Use the local checkout flow below during the developer preview.

## Local Usage

From this repository:

```bash
node sleepwalker-cli/bin/sleepwalker.js
node sleepwalker-cli/bin/sleepwalker.js menu
node sleepwalker-cli/bin/sleepwalker.js init
node sleepwalker-cli/bin/sleepwalker.js commands
```

The npm install and `npx` flow will be documented after the package is
published under the final package name.

With an API key:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
node sleepwalker-cli/bin/sleepwalker.js credits
```

Or store the key locally:

```bash
node sleepwalker-cli/bin/sleepwalker.js auth key set sw_api_live_...
node sleepwalker-cli/bin/sleepwalker.js doctor
```

To point the CLI at a non-production API base:

```bash
node sleepwalker-cli/bin/sleepwalker.js config set api-base-url https://api.sleepwalker.ai
node sleepwalker-cli/bin/sleepwalker.js config show
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
```

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

## Smoke Tests

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

## Terminal Color

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
env -u NO_COLOR FORCE_COLOR=1 node sleepwalker-cli/bin/sleepwalker.js --help
```
