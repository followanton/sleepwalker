# Cookbook

Real workflows you can run today. Each one uses only the public API and CLI. Install the CLI and set your key first:

```bash
npm install -g @sleepwalkerai/cli
export SLEEPWALKER_API_KEY=sw_api_live_...
```

- [Track your brand against a competitor](#track-your-brand-against-a-competitor)
- [Find what a page is missing](#find-what-a-page-is-missing)
- [Fail your build when AI visibility drops](#fail-your-build-when-ai-visibility-drops)

---

## Track your brand against a competitor

Run the same prompts for two entities and compare who AI search talks about.

```bash
# Your brand
sleepwalker visibility run https://yourbrand.com \
  --brand YourBrand \
  --prompt "best ai visibility platform 2026" \
  --prompt "how to track brand mentions in chatgpt" \
  --platform perplexity,openai,grok,gemini \
  --watch --json > yourbrand.json

# A competitor, same prompts
sleepwalker visibility run https://competitor.com \
  --brand Competitor \
  --prompt "best ai visibility platform 2026" \
  --prompt "how to track brand mentions in chatgpt" \
  --platform perplexity,openai,grok,gemini \
  --watch --json > competitor.json
```

Both runs land in the Sleepwalker app with full evidence: the exact answers, the citations, and the mention type for each platform. The `--json` files give you the raw numbers to diff or chart however you like.

---

## Find what a page is missing

Serialize a page, score it against live demand, and read the fixes.

```bash
# 1. See what an AI engine actually reads on the page
sleepwalker page serialize https://yourbrand.com/pricing

# 2. Score it and get ranked recommendations
sleepwalker ci score https://yourbrand.com/pricing
```

`ci score` returns an overall score and band, the page type it detected, and the top recommendations. For a saved, persisted report you can revisit and share, use a run instead:

```bash
sleepwalker ci run https://yourbrand.com/pricing --depth full --watch
```

The serialized content is also the cleanest way to feed a page to your own model or pipeline, since it strips the noise and keeps the structure.

---

## Fail your build when AI visibility drops

Treat brand presence in AI search like any other check. This GitHub Action runs a visibility check on a schedule and fails if your mention rate falls below a threshold, so a regression shows up as a red build instead of a surprise.

```yaml
# .github/workflows/ai-visibility.yml
name: AI Visibility

on:
  schedule:
    - cron: "0 9 * * 1"   # Mondays, 09:00 UTC
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run visibility check
        env:
          SLEEPWALKER_API_KEY: ${{ secrets.SLEEPWALKER_API_KEY }}
        run: |
          npx -y @sleepwalkerai/cli visibility run https://yourbrand.com \
            --brand YourBrand \
            --prompt "best ai visibility platform 2026" \
            --platform perplexity,openai,grok,gemini \
            --watch --json > run.json

      - name: Enforce threshold
        run: |
          node -e '
            const run = require("./run.json");
            const probes = run.probes || [];
            const hits = probes.filter(p => p.brand_mentioned).length;
            const rate = probes.length ? hits / probes.length : 0;
            console.log(`mention rate: ${(rate * 100).toFixed(0)}%`);
            if (rate < 0.5) {
              console.error("AI visibility below 50%. Failing build.");
              process.exit(1);
            }
          '
```

Store your key as the `SLEEPWALKER_API_KEY` repository secret. Adjust the prompts, platforms, and threshold to fit your category.

> [!TIP]
> The exact field names in `run.json` are whatever the API returns. Run the command once with `--json` and read the shape before you wire up the threshold logic.
