const apiKey = process.env.SLEEPWALKER_API_KEY;

if (!apiKey) {
  throw new Error("Set SLEEPWALKER_API_KEY first.");
}

const response = await fetch("https://api.sleepwalker.ai/v1/visibility/runs", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://www.sleepwalker.ai",
    target_entity: "Sleepwalker",
    prompts: ["What are the best AI visibility tools?"],
    platforms: ["perplexity"],
    idempotency_key: "visibility-sleepwalker-example-001",
  }),
});

if (!response.ok) {
  throw new Error(`Sleepwalker API error: ${response.status} ${await response.text()}`);
}

console.log(JSON.stringify(await response.json(), null, 2));
