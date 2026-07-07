import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runCli } from "../src/cli.js";

function memoryIo({ env = {}, responses = [] } = {}) {
  const isolatedEnv = {
    SLEEPWALKER_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-test-")),
    ...env,
  };
  let responseIndex = 0;
  const stdoutChunks = [];
  const stderrChunks = [];
  const requests = [];
  const sleeps = [];
  return {
    io: {
      env: isolatedEnv,
      stdout: { write: (chunk) => stdoutChunks.push(String(chunk)) },
      stderr: { write: (chunk) => stderrChunks.push(String(chunk)) },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetch: async (url, options = {}) => {
        requests.push({ url: String(url), options });
        const next = responses[responseIndex] || { status: 200, body: {} };
        responseIndex += 1;
        return {
          ok: next.status >= 200 && next.status < 300,
          status: next.status,
          text: async () => JSON.stringify(next.body),
        };
      },
    },
    stdout: () => stdoutChunks.join(""),
    stderr: () => stderrChunks.join(""),
    requests,
    sleeps,
  };
}

function interactiveIo({ env = {}, responses = [], idempotencyKeyFactory } = {}) {
  const isolatedEnv = {
    SLEEPWALKER_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-test-")),
    ...env,
  };
  let responseIndex = 0;
  const stdin = new PassThrough();
  const stdoutStream = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdoutChunks = [];
  const requests = [];
  stdoutStream.isTTY = true;
  stdoutStream.on("data", (chunk) => stdoutChunks.push(String(chunk)));
  return {
    stdin,
    io: {
      env: isolatedEnv,
      stdin,
      stdout: stdoutStream,
      stderr: { write: () => {} },
      idempotencyKeyFactory,
      fetch: async (url, options = {}) => {
        requests.push({ url: String(url), options });
        const next = responses[responseIndex] || { status: 200, body: {} };
        responseIndex += 1;
        return {
          ok: next.status >= 200 && next.status < 300,
          status: next.status,
          text: async () => JSON.stringify(next.body),
        };
      },
      sleep: async () => {},
    },
    stdout: () => stdoutChunks.join(""),
    requests,
  };
}

test("prints help", async () => {
  const { io, stdout } = memoryIo();
  await runCli(["--help"], io);
  assert.match(stdout(), /Sleepwalker CLI/);
  assert.match(stdout(), /Start here/);
  assert.match(stdout(), /sleepwalker init/);
  assert.match(stdout(), /sleepwalker commands/);
  assert.doesNotMatch(stdout(), /sleepwalker visibility run <url>/);
});

test("prints full command reference separately", async () => {
  const { io, stdout } = memoryIo();
  await runCli(["commands"], io);
  assert.match(stdout(), /command reference/);
  assert.match(stdout(), /sleepwalker menu/);
  assert.match(stdout(), /sleepwalker visibility run <url>/);
  assert.match(stdout(), /sleepwalker ci run <url>/);
});

test("interactive menu requires a TTY", async () => {
  const { io } = memoryIo();
  await assert.rejects(
    () => runCli(["menu"], io),
    /Interactive menu requires a terminal/,
  );
});

test("prints version without falling through to help", async () => {
  const { io, stdout } = memoryIo();
  await runCli(["--version"], io);
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(stdout(), `${pkg.version}\n`);
});

test("init guides setup before API key is configured", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-"));
  const { io, stdout, requests } = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["init"], io);
  assert.equal(requests.length, 0);
  assert.match(stdout(), /Sleepwalker CLI setup/);
  assert.match(stdout(), /API key\s+not configured/);
  assert.match(stdout(), /sleepwalker auth key set sw_api_live_/);
});

test("init detects stored API key without calling API", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ apiKey: "test_api_key_not_real" }));
  const { io, stdout, requests } = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["init"], io);
  assert.equal(requests.length, 0);
  assert.match(stdout(), /API key\s+configured/);
  assert.match(stdout(), /sleepwalker doctor/);
});

test("supports forced color and NO_COLOR", async () => {
  const colored = memoryIo({ env: { FORCE_COLOR: "1" } });
  await runCli(["--help"], colored.io);
  assert.match(colored.stdout(), /\u001b\[/);

  const plain = memoryIo({ env: { FORCE_COLOR: "1", NO_COLOR: "1" } });
  await runCli(["--help"], plain.io);
  assert.doesNotMatch(plain.stdout(), /\u001b\[/);
});

test("stores and masks API key", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-"));
  const { io, stdout } = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["auth", "key", "set", "test_api_key_not_real_abcdefghijklmnopqrstuvwxyz"], io);
  assert.match(stdout(), /Stored API key test_api_key/);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  assert.equal(stored.apiKey, "test_api_key_not_real_abcdefghijklmnopqrstuvwxyz");
  assert.equal(fs.statSync(path.join(dir, "config.json")).mode & 0o777, 0o600);
});

test("stores API base URL override", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-"));
  const { io, stdout } = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["config", "set", "api-base-url", "https://api.example.com/"], io);
  assert.match(stdout(), /https:\/\/api\.example\.com/);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  assert.equal(stored.apiBaseUrl, "https://api.example.com");

  const shown = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["config", "show"], shown.io);
  assert.match(shown.stdout(), /https:\/\/api\.example\.com/);
});

test("allows HTTP API base URL only for loopback hosts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-"));
  const local = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: dir } });
  await runCli(["config", "set", "api-base-url", "http://127.0.0.1:8010/"], local.io);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  assert.equal(stored.apiBaseUrl, "http://127.0.0.1:8010");

  const remote = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-")) } });
  await assert.rejects(
    () => runCli(["config", "set", "api-base-url", "http://api.example.com"], remote.io),
    /HTTP API base URLs are only allowed for localhost/,
  );

  const fakeLoopback = memoryIo({ env: { SLEEPWALKER_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-cli-")) } });
  await assert.rejects(
    () => runCli(["config", "set", "api-base-url", "http://127.example.com"], fakeLoopback.io),
    /HTTP API base URLs are only allowed for localhost/,
  );
});

test("calls usage endpoint for credits", async () => {
  const { io, stdout, requests } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        credits: {
          available_credit_units: "42.00",
          used_credit_units: "3.00",
          active_grant_count: 1,
        },
      },
    }],
  });
  await runCli(["credits"], io);
  assert.equal(new URL(requests[0].url).pathname, "/v1/usage");
  assert.equal(requests[0].options.headers.Authorization, "Bearer sw_api_live_test");
  assert.match(stdout(), /Available credits\s+42\.00/);
});

test("doctor checks API key and usage endpoint", async () => {
  const { io, stdout, requests } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        credits: {
          available_credit_units: "42.00",
          used_credit_units: "3.00",
        },
      },
    }],
  });
  await runCli(["doctor"], io);
  assert.equal(new URL(requests[0].url).pathname, "/v1/usage");
  assert.match(stdout(), /Sleepwalker CLI is ready/);
  assert.match(stdout(), /Available credits\s+42\.00/);
  assert.match(stdout(), /Next/);
  assert.match(stdout(), /sleepwalker reports by-url https:\/\/www\.sleepwalker\.ai/);
  assert.match(stdout(), /scope error/);
});

test("creates visibility run with repeated prompts and platforms", async () => {
  const { io, requests } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        run_id: "vis_123",
        status: "queued",
        estimated_credits: "2.00",
        reserved_credits: "2.00",
      },
    }],
  });
  await runCli([
    "visibility",
    "run",
    "https://example.com",
    "--brand",
    "Example",
    "--prompt",
    "first prompt",
    "--prompt",
    "second prompt",
    "--platform",
    "perplexity",
  ], io);
  assert.equal(new URL(requests[0].url).pathname, "/v1/visibility/runs");
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(body.prompts, ["first prompt", "second prompt"]);
  assert.deepEqual(body.platforms, ["perplexity"]);
  assert.equal(body.target_entity, "Example");
});

test("visibility run human output includes next status commands", async () => {
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        run_id: "vis_123",
        status: "queued",
        url: "https://example.com",
        target_entity: "Example",
        platforms: ["perplexity"],
        prompt_count: 2,
        probe_count: 2,
        billing: {
          status: "reserved",
          estimated_credits: "2.00",
          reserved_credits: "2.00",
        },
      },
    }],
  });
  await runCli([
    "visibility",
    "run",
    "https://example.com",
    "--brand",
    "Example",
    "--prompt",
    "first prompt",
    "--prompt",
    "second prompt",
    "--platform",
    "perplexity",
  ], io);
  assert.match(stdout(), /AI Visibility/);
  assert.match(stdout(), /Run ID\s+vis_123/);
  assert.match(stdout(), /Prompts\s+2/);
  assert.match(stdout(), /Probes\s+2/);
  assert.match(stdout(), /Reserved credits\s+2\.00/);
  assert.match(stdout(), /sleepwalker visibility status 'vis_123' --results/);
});

test("visibility run --json returns untouched API payload", async () => {
  const body = {
    run_id: "vis_json",
    status: "queued",
    nested: { ok: true },
  };
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{ status: 200, body }],
  });
  await runCli([
    "visibility",
    "run",
    "https://example.com",
    "--brand",
    "Example",
    "--prompt",
    "first prompt",
    "--platform",
    "perplexity",
    "--json",
  ], io);
  assert.deepEqual(JSON.parse(stdout()), body);
});

test("suggested visibility command shell-quotes untrusted values", async () => {
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        prompts: ["What's the best package registry? $(say bad)\u001b[31m"],
      },
    }],
  });
  await runCli([
    "visibility",
    "suggest-prompts",
    "https://example.com/path?a=$(say bad)",
    "--brand",
    "NPM'; rm -rf / #",
  ], io);
  assert.doesNotMatch(stdout(), /\u001b/);
  assert.match(stdout(), /sleepwalker visibility run 'https:\/\/example\.com\/path\?a=\$\(say bad\)' --brand 'NPM'\\''; rm -rf \/ #'/);
  assert.match(stdout(), /--prompt 'What'\\''s the best package registry\? \$\(say bad\)\[31m'/);
});

test("colors run status in human output when color is forced", async () => {
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test", FORCE_COLOR: "1" },
    responses: [{
      status: 200,
      body: {
        run_id: "vis_123",
        status: "queued",
        estimated_credits: "2.00",
        reserved_credits: "2.00",
      },
    }],
  });
  await runCli([
    "visibility",
    "run",
    "https://example.com",
    "--brand",
    "Example",
    "--prompt",
    "first prompt",
    "--platform",
    "perplexity",
  ], io);
  assert.match(stdout(), /\u001b\[/);
  assert.match(stdout(), /queued/);
});

test("watch treats partially completed visibility run as terminal", async () => {
  const { io, stdout, requests, sleeps } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [
      {
        status: 200,
        body: {
          run_id: "vis_123",
          status: "queued",
        },
      },
      {
        status: 200,
        body: {
          run_id: "vis_123",
          status: "running",
        },
      },
      {
        status: 200,
        body: {
          run_id: "vis_123",
          status: "partially_completed",
          settled_credits: "1.00",
          skipped_probe_count: 2,
        },
      },
    ],
  });
  await runCli([
    "visibility",
    "run",
    "https://example.com",
    "--brand",
    "Example",
    "--prompt",
    "first prompt",
    "--platform",
    "perplexity",
    "--watch",
  ], io);
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[1].url).pathname, "/v1/visibility/runs/vis_123");
  assert.deepEqual(sleeps, [5000]);
  assert.match(stdout(), /partially_completed/);
});

test("watch timeout returns structured JSON payload", async () => {
  const { io, stdout, sleeps } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [
      {
        status: 200,
        body: {
          run_id: "vis_123",
          status: "queued",
        },
      },
      {
        status: 200,
        body: {
          run_id: "vis_123",
          status: "running",
        },
      },
    ],
  });
  await assert.rejects(
    () => runCli([
      "visibility",
      "run",
      "https://example.com",
      "--brand",
      "Example",
      "--prompt",
      "first prompt",
      "--platform",
      "perplexity",
      "--watch",
      "--json",
      "--max-wait-seconds",
      "1",
    ], io),
    /still running after 1s/,
  );
  assert.deepEqual(sleeps, [5000]);
  const parsed = JSON.parse(stdout());
  assert.equal(parsed.timed_out, true);
  assert.equal(parsed.run_id, "vis_123");
  assert.equal(parsed.last_status, "running");
});

test("accepts --url for action commands", async () => {
  const { io, stdout, requests } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        url: "https://example.com",
        overall_score: 81,
        overall_band: "Good",
      },
    }],
  });
  await runCli(["ci", "score", "--url", "https://example.com"], io);
  assert.equal(new URL(requests[0].url).pathname, "/v1/content-intelligence/content/score");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.url, "https://example.com");
  assert.match(stdout(), /81 - Good/);
});

test("page serialize summarizes human output and preserves JSON payload", async () => {
  const dangerousContent = "## Page: Example\u001b]52;c;Y2xpcGJvYXJk\u0007\n\nUseful\u001b[2J content\r\u202E for agents.";
  const body = {
    serialization: {
      url: "https://example.com",
      http_status: 200,
      content_view: dangerousContent,
      content_view_chars: dangerousContent.length,
      billing: {
        status: "settled",
        settled_credits: "1.00",
      },
    },
  };
  const human = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{ status: 200, body }],
  });
  await runCli(["page", "serialize", "https://example.com"], human.io);
  assert.match(human.stdout(), /Page serialized/);
  assert.match(human.stdout(), /Preview/);
  assert.match(human.stdout(), /Useful\[2J content for agents/);
  assert.doesNotMatch(human.stdout(), /\u001b|\u0007|\r|\u202E/);
  assert.match(human.stdout(), /sleepwalker page serialize 'https:\/\/example\.com' --json/);

  const json = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{ status: 200, body }],
  });
  await runCli(["page", "serialize", "https://example.com", "--json"], json.io);
  assert.deepEqual(JSON.parse(json.stdout()), body);
  assert.match(json.stdout(), /\\u001b|\\u0007/);
});

test("ci score human output includes recommendations and next commands", async () => {
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        overall_score: 81,
        overall_band: "Good",
        page_type: "Homepage",
        trend_source: "generated",
        freshness_score: 78,
        sufficiency_score: 82,
        top_recommendations: ["Add clearer proof points\u001b[31m", "Show benchmark views"],
        billing: {
          status: "settled",
          settled_credits: "3.00",
        },
      },
    }],
  });
  await runCli(["ci", "score", "https://example.com"], io);
  assert.match(stdout(), /Content score/);
  assert.match(stdout(), /81 - Good/);
  assert.match(stdout(), /Top recommendations/);
  assert.doesNotMatch(stdout(), /\u001b/);
  assert.match(stdout(), /Settled credits\s+3\.00/);
  assert.match(stdout(), /sleepwalker ci run 'https:\/\/example\.com' --depth full/);
});

test("interactive visibility run includes generated idempotency key", async () => {
  const { io, stdin, requests } = interactiveIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    idempotencyKeyFactory: (prefix) => `idem-${prefix}`,
    responses: [{
      status: 200,
      body: {
        run_id: "vis_menu",
        status: "queued",
      },
    }],
  });

  const run = runCli(["menu"], io);
  setTimeout(() => stdin.write("\x1B[B\x1B[B\x1B[B\r"), 5);
  setTimeout(() => stdin.write("https://example.com\n"), 15);
  setTimeout(() => stdin.write("Example\n"), 25);
  setTimeout(() => stdin.write("What is Example?\n"), 35);
  setTimeout(() => stdin.write("\r"), 45);
  setTimeout(() => stdin.write("n\n"), 55);
  setTimeout(() => stdin.write("y\n"), 65);
  setTimeout(() => stdin.write("\n"), 75);
  setTimeout(() => stdin.write("q"), 85);

  await run;
  assert.equal(new URL(requests[0].url).pathname, "/v1/visibility/runs");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.idempotency_key, "idem-visibility-run");
});

test("finds reports by URL", async () => {
  const { io, stdout, requests } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 200,
      body: {
        url: "https://example.com",
        days: 30,
        match_count: 1,
        matches: [{
          test: {
            id: "test_123",
            test_type: "ai_citations",
            name: "Homepage",
            url: "https://example.com",
          },
          runs: [{
            id: "run_123",
            status: "completed",
            overall_band: "Good",
          }],
        }],
      },
    }],
  });
  await runCli(["reports", "by-url", "https://example.com", "--type", "ai_citations", "--days", "30"], io);
  const requestUrl = new URL(requests[0].url);
  assert.equal(requestUrl.pathname, "/v1/reports/by-url");
  assert.equal(requestUrl.searchParams.get("url"), "https://example.com");
  assert.equal(requestUrl.searchParams.get("test_type"), "ai_citations");
  assert.equal(requestUrl.searchParams.get("days"), "30");
  assert.match(stdout(), /Homepage/);
});

test("prints JSON errors for API failures", async () => {
  const { io, stdout } = memoryIo({
    env: { SLEEPWALKER_API_KEY: "sw_api_live_test" },
    responses: [{
      status: 402,
      body: { detail: { error: "insufficient_credits" } },
    }],
  });
  await assert.rejects(
    () => runCli(["ci", "run", "https://example.com", "--json"], io),
    /insufficient_credits/,
  );
  assert.match(stdout(), /"error": "insufficient_credits"/);
});
