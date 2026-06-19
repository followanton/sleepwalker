// A tiny, dependency-free Sleepwalker client for Node 18+.
// Copy it into your project, or run the demo at the bottom:
//   SLEEPWALKER_API_KEY=sw_api_live_... node client.mjs
//
// It handles auth, errors, run polling, and cursor pagination so your
// own code does not have to.

const TERMINAL = new Set(["completed", "partially_completed", "failed", "cancelled"]);

export class SleepwalkerError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "SleepwalkerError";
    this.status = status;
    this.payload = payload;
  }
}

export class SleepwalkerClient {
  constructor({ apiKey = process.env.SLEEPWALKER_API_KEY, baseUrl = "https://api.sleepwalker.ai" } = {}) {
    if (!apiKey) throw new Error("Set SLEEPWALKER_API_KEY or pass { apiKey }.");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = payload?.detail ?? payload;
      const message = typeof detail === "string" ? detail : detail?.error || `HTTP ${res.status}`;
      throw new SleepwalkerError(message, { status: res.status, payload });
    }
    return payload;
  }

  // Actions
  serializePage(url, opts = {}) {
    return this.request("POST", "/v1/pages/content/serialize", { body: { url, ...opts } });
  }
  createVisibilityRun(body) {
    return this.request("POST", "/v1/visibility/runs", { body });
  }
  getVisibilityRun(runId, query = {}) {
    return this.request("GET", `/v1/visibility/runs/${runId}`, { query });
  }
  scoreContent(url, opts = {}) {
    return this.request("POST", "/v1/content-intelligence/content/score", { body: { url, ...opts } });
  }

  // Reads
  usage(query = {}) {
    return this.request("GET", "/v1/usage", { query });
  }

  // Poll a run until it reaches a terminal status.
  async waitForRun(runId, { intervalMs = 5000, timeoutMs = 900000, query = {} } = {}) {
    const started = Date.now();
    for (;;) {
      const run = await this.getVisibilityRun(runId, query);
      if (TERMINAL.has(String(run.status || "").toLowerCase())) return run;
      if (Date.now() - started > timeoutMs) {
        throw new SleepwalkerError(`Run ${runId} still ${run.status} after ${timeoutMs}ms`, { payload: run });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Walk every page of a cursor-paginated list endpoint.
  async *paginate(path, { query = {}, pageSize = 50 } = {}) {
    let after;
    for (;;) {
      const page = await this.request("GET", path, { query: { ...query, limit: pageSize, starting_after: after } });
      const items = page.runs || page.items || page.tests || [];
      for (const item of items) yield item;
      if (!page.has_more) return;
      after = page.next_starting_after;
    }
  }
}

// Demo
if (import.meta.url === `file://${process.argv[1]}`) {
  const sw = new SleepwalkerClient();
  const run = await sw.createVisibilityRun({
    url: "https://www.sleepwalker.ai",
    target_entity: "Sleepwalker",
    prompts: ["best ai visibility platform 2026"],
    platforms: ["perplexity"],
  });
  console.log("queued:", run.run_id);
  const done = await sw.waitForRun(run.run_id, { query: { include_results: true } });
  console.log("status:", done.status);
}
