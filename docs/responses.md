# Example outputs

The fastest way to understand Sleepwalker is to see what comes back.

These examples use `https://docs.npmjs.com/` as the target URL and `npm` as the brand. Real answers vary by page, prompt, platform, and timing, but the examples show the kind of output Sleepwalker returns through the CLI, API, and MCP.

## Output map

| Work | CLI command or tool | Full example |
|---|---|---|
| Credits and recent usage | `sleepwalker doctor`, `sleepwalker credits`, `sleepwalker usage` | [`usage.json`](../examples/responses/usage.json) |
| Page serialization | `sleepwalker page serialize` / `serialize_sleepwalker_page_content` | [`page-serialization.json`](../examples/responses/page-serialization.json) |
| Prompt suggestions | `sleepwalker visibility suggest-prompts` / `suggest_sleepwalker_visibility_prompts` | [`visibility-prompts.json`](../examples/responses/visibility-prompts.json) |
| AI Visibility run | `sleepwalker visibility run`, `sleepwalker visibility status` / `create_sleepwalker_visibility_run` | [`visibility-run.completed.json`](../examples/responses/visibility-run.completed.json) |
| Content trends | `discover_sleepwalker_content_trends` | [`content-trends.json`](../examples/responses/content-trends.json) |
| Content score | `sleepwalker ci score` / `score_sleepwalker_content` | [`content-score.json`](../examples/responses/content-score.json) |
| Content Intelligence run | `sleepwalker ci run`, `sleepwalker ci status` / `create_sleepwalker_content_run` | [`content-run.completed.json`](../examples/responses/content-run.completed.json) |
| Reports by URL | `sleepwalker reports by-url` / `get_sleepwalker_reports_by_url` | [`reports-by-url.json`](../examples/responses/reports-by-url.json) |

## Connection and credits

Command:

```bash
sleepwalker doctor
sleepwalker credits --json
```

Human output:

```text
Sleepwalker CLI is ready.

ok  API base: https://api.sleepwalker.ai (default)
ok  API key: configured
ok  API reachability: authenticated

Available credits  96.00
Used credits       4.00

Next
  sleepwalker reports by-url https://www.sleepwalker.ai
  sleepwalker commands
```

Full JSON example: [`examples/responses/usage.json`](../examples/responses/usage.json)

## Page serialization

Command:

```bash
sleepwalker page serialize https://docs.npmjs.com/ --json
```

What you get:

- Clean page markdown;
- Title, description, headings, and links;
- A page view an agent can read without scraping the site itself.

Full JSON example: [`examples/responses/page-serialization.json`](../examples/responses/page-serialization.json)

## AI Visibility prompt suggestions

Command:

```bash
sleepwalker visibility suggest-prompts https://docs.npmjs.com/ --brand npm --json
```

What you get:

- Suggested prompts for the brand and category;
- The search intent behind each prompt;
- A short reason why the prompt is useful.

Full JSON example: [`examples/responses/visibility-prompts.json`](../examples/responses/visibility-prompts.json)

## AI Visibility run

Command:

```bash
sleepwalker visibility run https://docs.npmjs.com/ \
  --brand npm \
  --prompt "What is the best package manager for JavaScript projects?" \
  --prompt "How do teams securely publish JavaScript packages?" \
  --platform perplexity,openai \
  --watch \
  --json
```

What you get:

- The completed run;
- Every prompt and platform probe;
- Full AI answers;
- Citation URLs and domains;
- Competitors mentioned in the responses;
- Mention and citation rates for the run.

Full JSON example: [`examples/responses/visibility-run.completed.json`](../examples/responses/visibility-run.completed.json)

## Content trend discovery

API and MCP action:

```text
discover_sleepwalker_content_trends
```

What you get:

- Demand trends relevant to the page;
- The gap each trend exposes;
- The action a content team should consider.

Full JSON example: [`examples/responses/content-trends.json`](../examples/responses/content-trends.json)

## Content score

Command:

```bash
sleepwalker ci score https://docs.npmjs.com/ --json
```

What you get:

- Overall score and band;
- Content depth and freshness;
- Per-trend coverage;
- Ranked recommendations with expected impact.

Full JSON example: [`examples/responses/content-score.json`](../examples/responses/content-score.json)

## Content Intelligence run

Command:

```bash
sleepwalker ci run https://docs.npmjs.com/ --depth full --watch --json
```

What you get:

- A saved Content Intelligence report;
- Full score summary;
- Content depth and freshness;
- Top trends;
- Recommendations that can be opened later in the Sleepwalker app.

Full JSON example: [`examples/responses/content-run.completed.json`](../examples/responses/content-run.completed.json)

## Reports by URL

Command:

```bash
sleepwalker reports by-url https://docs.npmjs.com/ --json
```

What you get:

- AI Visibility runs for the URL;
- Content Intelligence runs for the URL;
- Run IDs, status, dates, and compact summaries.

Full JSON example: [`examples/responses/reports-by-url.json`](../examples/responses/reports-by-url.json)

## Same outputs through MCP

MCP clients expose the same actions as tools. The wording changes by client, but the result shape is the same:

- `serialize_sleepwalker_page_content` returns the serialization output.
- `suggest_sleepwalker_visibility_prompts` returns prompt suggestions.
- `create_sleepwalker_visibility_run` returns a queued run that can be polled until completion.
- `discover_sleepwalker_content_trends` returns demand trends, gaps, and actions for a page.
- `score_sleepwalker_content` returns the Content Intelligence score.
- `create_sleepwalker_content_run` returns a saved Content Intelligence run.

Connect through:

```text
https://mcp.sleepwalker.ai/mcp
```
