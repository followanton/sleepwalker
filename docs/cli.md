# CLI

The Sleepwalker CLI is a thin command-line client over the public API.

Most commands send requests to the hosted Sleepwalker API and print
human-friendly or JSON output. The exception is `okf export`, which runs
entirely on your machine.

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
bundle: a small directory of agent-ready markdown (`index.md`, `log.md`, a
content concept, and a technical snapshot concept) that any AI agent can
read directly. Both concepts are exported by default; `--content` and
`--technical` narrow the bundle to one of them.

It runs **entirely on your machine**: it fetches the URL and extracts content
locally, so it makes no Sleepwalker API call, needs no account or API key, and
costs zero credits. This is the open-source, free-for-everyone on-ramp; the
paid, engine-grade extraction and scoring live in the API and MCP tools.

```bash
sleepwalker okf export https://example.com
sleepwalker okf export https://example.com --content
sleepwalker okf export https://example.com --technical
sleepwalker okf export https://example.com --out ./my-bundle --force
sleepwalker okf export https://example.com --json
```

| Flag | Meaning |
| --- | --- |
| `--content` | Only the content concept |
| `--technical` | Only the technical snapshot concept (see below) |
| `--out <dir>` | Output directory (default `./<host>-okf`) |
| `--force` | Overwrite a non-empty output directory |
| `--json` | Print a machine-readable summary of what was written |

Put flags after the URL. Hostile page content is sanitized (control
characters, ANSI escapes, and bidirectional overrides are stripped), fetches
time out after 30 seconds, and oversized pages are truncated with a note
recorded in `log.md`. Fetches identify themselves with the user agent
`SleepwalkerCLI-OKF/<cli version> (+https://github.com/followanton/sleepwalker)`.

### The technical snapshot

Most AI crawlers do not run JavaScript. The technical snapshot captures what
they actually see: a concept file (`<page>-technical.md`) that reconstructs
the technical layer of the page exactly as served. It is part of every
export by default; `--technical` exports it alone and `--content` skips it.

It records, in document order and with duplicates preserved:

- the redirect chain (per-hop status, https to http downgrades flagged) and
  the fetched HTML size
- curated HTTP headers (content type, `X-Robots-Tag`, security, cache, server)
- the `<html>` lang and dir attributes, meta tags, title tags, canonical
  links, `<base href>`, icon links, and feed links
- headings, hreflang alternates, Open Graph, Twitter, and article tags
- head script tags, plus every JSON-LD block on the page (parsed and
  re-emitted from the parsed data; invalid JSON is flagged with an excerpt)
- a microdata and RDFa summary, links, and images
- the robots directives the page and response carry: meta robots and
  `X-Robots-Tag`

Everything comes from the one page fetch; the snapshot makes no other
requests. Oversized sections are capped with counts, and every cap is
recorded in `log.md`.

Like the rest of `okf export`, this runs locally: no account, no API key, and
zero credits. The only network request is fetching the page itself.
