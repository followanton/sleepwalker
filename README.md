<p align="center">
  <img src="assets/banner.svg" alt="Sleepwalker" width="100%">
</p>

<p align="center">
  <a href="https://github.com/followanton/sleepwalker/actions/workflows/ci.yml"><img src="https://github.com/followanton/sleepwalker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/npm/v/@sleepwalkerai/cli?color=a78bfa&label=cli&style=flat-square" alt="CLI npm version">
  <img src="https://img.shields.io/badge/dependencies-zero-22c55e?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/MCP-ready-a78bfa?style=flat-square" alt="MCP ready">
</p>

<p align="center">
  <b>AI Visibility and Content Intelligence infrastructure.</b><br>
  Measure AI visibility. Find content trends and optimization opportunities.<br>
  From your terminal, your code, or your agents.
</p>

<p align="center">
  <a href="https://www.sleepwalker.ai/docs/">Docs</a> ·
  <a href="https://app.sleepwalker.ai">Console</a> ·
  <a href="docs/agents.md">Agents</a> ·
  <a href="docs/cookbook.md">Cookbook</a> ·
  <a href="examples/">Examples</a>
</p>

---

Sleepwalker does two things. It **measures AI visibility**: it runs the prompts your audience actually asks AI, captures every answer and citation, and tells you whether your brand shows up. And it gives you **Content Intelligence**: it finds the content trends in your category and the optimization opportunities on your pages, with specific fixes. You drive all of it from the Console, the API, MCP, or the CLI.

Same engine. Same governed actions. One credit ledger.

This repository is the public developer surface: the CLI, runnable examples, agent setups, and short guides. It does not contain the hosted engine or any secrets. See [What is in this repo](#what-is-in-this-repo).

## Quickstart

```bash
npm install -g @sleepwalkerai/cli
sleepwalker init
```

Or run one command without installing:

```bash
npx -y @sleepwalkerai/cli doctor
```

Add a key from the [Console](https://app.sleepwalker.ai) (API tab), then run your first check:

```bash
sleepwalker auth key set sw_api_live_...
sleepwalker doctor
sleepwalker visibility run https://yourbrand.com \
  --brand YourBrand \
  --prompt "best ai visibility platform 2026" \
  --platform perplexity,openai,grok,gemini \
  --watch
```

<p align="center">
  <img src="assets/terminal.svg" alt="Sleepwalker CLI running an AI Visibility check" width="92%">
</p>

Reads are normally unmetered. You only spend credits on actions that do real work, and the CLI always tells you what a run cost and what to run next.

## What you can measure

<p align="center">
  <img src="assets/visibility.svg" alt="Sample AI Visibility result across platforms" width="92%">
</p>

- **AI Visibility.** Send real prompts to ChatGPT, Perplexity, Grok, and Gemini. See whether your brand appears in the answer and the citations, who appears instead, and how that moves over time.
- **Content Intelligence.** Score a page against live AI-search demand, find the gaps, and get concrete recommendations back.
- **Serialization.** Turn any public URL into clean, normalized content that an agent or a pipeline can read.

## How it works

Everything Sleepwalker does is a small, governed action. Your agent can call it, your code can call it, and you can click it in the Console. Same auth, same limits, same results, and every run is saved once and readable from any surface.

<p align="center">
  <img src="assets/architecture.svg" alt="Sleepwalker architecture: surfaces, governed actions, engine, results" width="62%">
</p>

## Use it from anywhere

Start the same visibility run four ways.

**CLI**

```bash
sleepwalker visibility run https://yourbrand.com \
  --brand YourBrand \
  --prompt "best ai visibility platform 2026" \
  --platform perplexity,openai,grok,gemini \
  --watch
```

**API**

```bash
curl -s https://api.sleepwalker.ai/v1/visibility/runs \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourbrand.com",
    "target_entity": "YourBrand",
    "prompts": ["best ai visibility platform 2026"],
    "platforms": ["perplexity","openai","grok","gemini"]
  }'
```

**MCP** (Claude and other MCP clients)

```
Connect once:  https://mcp.sleepwalker.ai/mcp
Then ask:      "Check how YourBrand shows up across AI search this week."
```

**Console**: [app.sleepwalker.ai](https://app.sleepwalker.ai) for the visual version.

Full examples in [`examples/`](examples/). A typed client helper for [JavaScript](examples/api/javascript/client.mjs) and [Python](examples/api/python/client.py) handles polling and pagination for you.

## Built for agents

The difference: Sleepwalker is not a dashboard with an API bolted on. It is agent-native. Connect it to Claude or any MCP client and your agent can serialize pages, run visibility checks, score content, and read results back, all through governed tools with prepaid credits and a full audit trail.

See **[docs/agents.md](docs/agents.md)** for the tool catalog and a real "ask Claude to watch my brand" walkthrough.

## Examples

| Path | What it shows |
|---|---|
| [`examples/api/curl`](examples/api/curl) | One-call examples for every action |
| [`examples/api/javascript`](examples/api/javascript) | Raw `fetch` plus a zero-dependency client |
| [`examples/api/python`](examples/api/python) | Raw `urllib` plus a small client class |
| [`examples/mcp`](examples/mcp) | OAuth and bearer-token setup for MCP clients |
| [`docs/cookbook.md`](docs/cookbook.md) | End-to-end recipes, including a CI check |

## Credits

Pay as you go. No subscriptions, no seats. Reads, lists, and status polling are free. Billable actions (visibility runs, content scoring, serialization) use prepaid credits and behave the same across Console, API, MCP, and CLI. New verified accounts start with a small credit balance to try things. Details in [docs/credits.md](docs/credits.md).

## What is in this repo

This is client tooling and documentation, nothing more.

| In this repo | Stays private |
|---|---|
| CLI, examples, agent setups, docs | Hosted engine and Console source |
| Public API request shapes | MCP server implementation |
| MCP client connection guides | Database schema and billing internals |
| Credit model, in plain terms | Provider integrations and routing |

Do not put secrets here. Keys belong in environment variables:

```bash
export SLEEPWALKER_API_KEY=sw_api_live_...
```

## Links

- Console: [app.sleepwalker.ai](https://app.sleepwalker.ai)
- Docs: [sleepwalker.ai/docs](https://www.sleepwalker.ai/docs/)
- Security policy: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- License: [MIT](LICENSE)
