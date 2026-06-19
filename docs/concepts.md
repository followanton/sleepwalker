# Concepts

A short, standalone primer. Enough to use Sleepwalker well without digging through the full reference.

## One engine, four surfaces

Sleepwalker has a single engine. You reach it four ways:

- **Console** for visual review, credits, keys, and full result drilldowns.
- **API** for scripts, products, and scheduled jobs.
- **MCP** for agents and MCP-capable clients.
- **CLI** for terminal workflows, built on the public API.

They are not four products. They are four doors into the same governed actions, so a run created by an agent reads back the same way in the Console or the API.

## AI Visibility

The question: when people ask AI about your category, does your brand show up?

- A **prompt** is one question, like "best ai visibility platform 2026".
- A **platform** is one AI answer surface: Perplexity, ChatGPT, Grok, or Gemini.
- A **probe** is one prompt sent to one platform for one target. A run with 3 prompts across 4 platforms is 12 probes.
- A **run** groups probes together and saves the results.

For each probe, Sleepwalker captures the full answer, the citations, and where your brand appeared: in the body of the answer, in a cited URL, or in the cited domain. That mention type matters. Being cited is stronger than being mentioned in passing.

## Content Intelligence

The question: why does AI search reward some pages and ignore others?

- **Serialize** turns a URL into clean, normalized content, the way an engine reads it.
- **Discover trends** finds the demand a page should be answering.
- **Score** rates the page against that demand and returns ranked, specific recommendations.
- A **run** persists the whole analysis as a report you can revisit and share.

You can run these as quick one-off actions or as saved runs, depending on whether you want a fast answer or a durable report.

## Credits

Sleepwalker is pay as you go. No subscriptions, no seats.

- Reads, lists, and status polling are free.
- Actions that do real work spend prepaid credits: visibility runs (priced per probe), serialization, trend discovery, content scoring, and persisted runs.
- If a run cannot complete (a blocked page, a failed probe), the credits for the work that did not happen are released.
- Credits behave identically across Console, API, MCP, and CLI. One run, one bill, wherever you started it.

New verified accounts begin with a small credit balance so you can try real actions before topping up.

## Governed actions

Every action passes through one policy layer before it touches the engine. That layer checks who you are, what your key or connection is allowed to do, whether the URL is safe to fetch, and whether you have the credits to proceed. Then it queues the work and records an audit event.

This is why the same key behaves the same everywhere, and why handing an agent write access is safe: it can only do what its scope and credits allow, and you can see everything it did.

## Where to go next

- [Agents](agents.md) for the MCP tool catalog and a real walkthrough.
- [Cookbook](cookbook.md) for runnable workflows.
- [Full hosted docs](https://www.sleepwalker.ai/docs/) for the complete API and reference.
