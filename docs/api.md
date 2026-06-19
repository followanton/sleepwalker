# API

Base URL:

```text
https://api.sleepwalker.ai
```

Authentication:

```http
Authorization: Bearer sw_api_live_...
```

Use API keys from the Sleepwalker app. Store them in environment variables,
not in source files.

## Common Actions

### Serialize A Page

```bash
curl -s https://api.sleepwalker.ai/v1/pages/content/serialize \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.sleepwalker.ai","max_chars":2000}'
```

### Create An AI Visibility Run

```bash
curl -s https://api.sleepwalker.ai/v1/visibility/runs \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sleepwalker.ai",
    "target_entity": "Sleepwalker",
    "prompts": ["What are the best AI visibility tools?"],
    "platforms": ["perplexity"],
    "idempotency_key": "visibility-sleepwalker-example-001"
  }'
```

### Check Run Status

```bash
curl -s https://api.sleepwalker.ai/v1/visibility/runs/<run_id> \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY"
```

### Create A Content Intelligence Run

```bash
curl -s https://api.sleepwalker.ai/v1/content-intelligence/runs \
  -H "Authorization: Bearer $SLEEPWALKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sleepwalker.ai",
    "analysis_depth": "full",
    "idempotency_key": "ci-sleepwalker-example-001"
  }'
```

## More Documentation

See the hosted API docs:

```text
https://www.sleepwalker.ai/docs/api/
```
