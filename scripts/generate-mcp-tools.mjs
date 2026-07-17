#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outputPath = join(repoRoot, "mcp", "tools.json");
const liveRootUrl = process.env.SLEEPWALKER_MCP_ROOT_URL || "https://mcp.sleepwalker.ai/";

const tools = [
  {
    name: "list_sleepwalker_tests",
    title: "List Sleepwalker tests",
    description: "List saved Content Intelligence and AI Visibility tests for the authenticated account.",
    required_scope: "tests:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_test_results",
    title: "Get Sleepwalker test results",
    description: "Read compact latest run history for a known saved test.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_reports_by_url",
    title: "Get Sleepwalker reports by URL",
    description: "Find recent owned reports for a URL across supported Sleepwalker workflows.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_run_result",
    title: "Get Sleepwalker run result",
    description: "Fetch one full structured Content Intelligence or AI Visibility run.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_prompt_response",
    title: "Get Sleepwalker prompt response",
    description: "Fetch one capped AI Visibility prompt response and optional citations.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_summaries",
    title: "Get Sleepwalker summaries",
    description: "Read compact run summaries before drilling into full results.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_consistent_recommendations",
    title: "Get Sleepwalker consistent recommendations",
    description: "Find recurring Content Intelligence recommendations across recent runs.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "list_sleepwalker_visibility_runs",
    title: "List Sleepwalker visibility runs",
    description: "List saved AI Visibility runs for the authenticated account.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_visibility_run_status",
    title: "Get Sleepwalker visibility run status",
    description: "Read AI Visibility run status, summary, and results when available.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "list_sleepwalker_visibility_models",
    title: "List Sleepwalker visibility models",
    description: "List the AI models selectable per platform for visibility runs, with credit prices and role keywords.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "list_sleepwalker_content_runs",
    title: "List Sleepwalker Content Intelligence runs",
    description: "List saved Content Intelligence runs for the authenticated account.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "get_sleepwalker_content_run_status",
    title: "Get Sleepwalker Content Intelligence run status",
    description: "Read Content Intelligence run status and result when available.",
    required_scope: "runs:read",
    category: "read",
    read_only: true,
    billable: false,
    creates_run: false,
    credit_behavior: "Free read action.",
  },
  {
    name: "serialize_sleepwalker_page_content",
    title: "Serialize Sleepwalker page content",
    description: "Extract one URL into normalized page content for agents and workflows.",
    required_scope: "pages:content:serialize",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: false,
    credit_behavior: "Uses prepaid credits when billable content is returned.",
  },
  {
    name: "suggest_sleepwalker_visibility_prompts",
    title: "Suggest Sleepwalker visibility prompts",
    description: "Generate AI Visibility prompt ideas for a URL and target entity.",
    required_scope: "visibility:prompts:suggest",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: false,
    credit_behavior: "Uses prepaid credits when suggestions are returned.",
  },
  {
    name: "create_sleepwalker_visibility_run",
    title: "Create Sleepwalker visibility run",
    description: "Queue a saved AI Visibility run from prompts and platforms or explicit probes.",
    required_scope: "visibility:runs:create",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: true,
    credit_behavior: "Uses prepaid credits per queued probe.",
  },
  {
    name: "cancel_sleepwalker_visibility_run",
    title: "Cancel Sleepwalker visibility run",
    description: "Cancel the queued remainder of an AI Visibility run. Probes no worker has picked up never run; probes already executing finish and settle normally.",
    required_scope: "visibility:runs:create",
    category: "action",
    read_only: false,
    billable: false,
    creates_run: false,
    credit_behavior: "Free to call. Releases the reserved credits of probes that did not run.",
  },
  {
    name: "discover_sleepwalker_content_trends",
    title: "Discover Sleepwalker content trends",
    description: "Find relevant content and market trends for one URL.",
    required_scope: "content_intelligence:trends:discover",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: false,
    credit_behavior: "Uses prepaid credits when trends are returned.",
  },
  {
    name: "score_sleepwalker_content",
    title: "Score Sleepwalker content",
    description: "Score a page and return prioritized Content Intelligence recommendations.",
    required_scope: "content_intelligence:content:score",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: false,
    credit_behavior: "Uses prepaid credits when scoring completes.",
  },
  {
    name: "create_sleepwalker_content_run",
    title: "Create Sleepwalker Content Intelligence run",
    description: "Queue a saved Content Intelligence run for one URL.",
    required_scope: "content_intelligence:runs:create",
    category: "action",
    read_only: false,
    billable: true,
    creates_run: true,
    credit_behavior: "Uses prepaid credits based on analysis depth.",
  },
];

const catalog = {
  generated_from: "Sleepwalker hosted MCP tool contract",
  endpoint: "https://mcp.sleepwalker.ai/mcp",
  authentication: ["OAuth", "Bearer token"],
  tools,
};

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;

function sortedToolNames(source) {
  return source.map((tool) => tool.name).sort();
}

function compareSets(label, expected, actual) {
  const missing = expected.filter((item) => !actual.includes(item));
  const extra = actual.filter((item) => !expected.includes(item));
  if (missing.length || extra.length) {
    console.error(`${label} mismatch`);
    if (missing.length) {
      console.error(`Missing: ${missing.join(", ")}`);
    }
    if (extra.length) {
      console.error(`Extra: ${extra.join(", ")}`);
    }
    process.exit(1);
  }
}

function checkStaticCatalog() {
  const existing = readFileSync(outputPath, "utf8");
  if (existing !== serialized) {
    console.error("mcp/tools.json is out of date. Run: node scripts/generate-mcp-tools.mjs");
    process.exit(1);
  }
}

async function checkLiveToolNames() {
  const response = await fetch(liveRootUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    console.error(`Could not read live MCP root at ${liveRootUrl}: HTTP ${response.status}`);
    process.exit(1);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.tools)) {
    console.error(`Live MCP root at ${liveRootUrl} did not include a tools array.`);
    process.exit(1);
  }
  compareSets("Live MCP tool catalog", sortedToolNames(tools), [...payload.tools].sort());
}

async function main() {
  if (process.argv.includes("--check")) {
    checkStaticCatalog();
  }
  if (process.argv.includes("--check-live")) {
    await checkLiveToolNames();
  }
  if (!process.argv.includes("--check") && !process.argv.includes("--check-live")) {
    writeFileSync(outputPath, serialized);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
