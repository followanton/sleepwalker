# Changelog

Notable changes to the public developer tools. The hosted engine ships on its own cadence.

## 2026-07-13

### Added
- `@sleepwalkerai/cli` 0.3.0: pick the AI model per visibility run.
  `sleepwalker visibility models` lists the selectable models per platform
  with credit prices, and `--model` pins one (a model id, or the keywords
  `latest`, `prior`, and `default`; scope per platform with
  `--model openai=latest`). The interactive run flow gained a model step.
  Each model has its own per-probe credit price; default models stay at
  1 credit.

## 2026-07-07 (later)

### Fixed
- `@sleepwalkerai/cli` 0.2.3: `--version` and the `cli_version` field in
  exported bundles now read the real package version instead of a stale
  hardcoded string. Removed em dashes from CLI output (`okf export` summary
  and `--help`).

## 2026-07-07

### Changed
- `@sleepwalkerai/cli` 0.2.2 (docs only, no code changes): the README now
  leads with the free, local `okf export`, uses sentence-case headings, and
  reads in plainer language. Local usage paths corrected.

## 2026-07-05 (later)

### Fixed
- `okf export` (`@sleepwalkerai/cli` 0.2.1): pages with control characters
  between block elements no longer produce long runs of blank lines in the
  bundle. Content is now sanitized before whitespace is collapsed.

## 2026-07-05

### Added
- `sleepwalker okf export <url>` (`@sleepwalkerai/cli` 0.2.0): build an
  [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
  bundle from a web page: free, local, no account or credits. Dependency-free
  local extraction to agent-ready markdown (`index.md`, `log.md`, one concept
  per page). See `docs/cli.md`.

### Security
- OKF export sanitizes extracted page content (control characters, ANSI
  escapes, bidirectional overrides) and quotes YAML frontmatter values so a
  hostile page cannot inject terminal escapes or corrupt a bundle.

## 2026-06-19

### Added
- Published `@sleepwalkerai/cli` to npm.
- Architecture, AI Visibility, and terminal visuals in the README.
- `docs/agents.md`: MCP tool catalog and an end-to-end agent walkthrough.
- `docs/cookbook.md`: runnable recipes, including a GitHub Action that fails a build when AI visibility drops.
- `docs/concepts.md`: a standalone primer on runs, probes, scoring, and credits.
- Zero-dependency client helpers for JavaScript and Python with run polling and pagination.

## 2026-06-18

### Added
- First public release of the Sleepwalker developer tools.
- CLI package (`@sleepwalkerai/cli`): `menu`, `init`, `doctor`, AI Visibility and Content Intelligence runs, serialization, reports, usage, and activity.
- API examples in curl, JavaScript, and Python.
- MCP OAuth and bearer-token setup guides.

### Security
- Terminal output sanitized against escape-sequence injection.
- `http://` API base URLs restricted to loopback.
- Local config written with tight file permissions.
- CI gates on a full-history secret scan.
