const apiKey = process.env.SLEEPWALKER_API_KEY;

if (!apiKey) {
  throw new Error("Set SLEEPWALKER_API_KEY first.");
}

const response = await fetch("https://api.sleepwalker.ai/v1/pages/content/serialize", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://www.sleepwalker.ai",
    max_chars: 2000,
  }),
});

if (!response.ok) {
  throw new Error(`Sleepwalker API error: ${response.status} ${await response.text()}`);
}

console.log(JSON.stringify(await response.json(), null, 2));
