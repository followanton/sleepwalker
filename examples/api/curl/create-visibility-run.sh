#!/usr/bin/env bash
set -euo pipefail

: "${SLEEPWALKER_API_KEY:?Set SLEEPWALKER_API_KEY first}"

curl -s https://api.sleepwalker.ai/v1/visibility/runs \
  -H "Authorization: Bearer ${SLEEPWALKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sleepwalker.ai",
    "target_entity": "Sleepwalker",
    "prompts": ["What are the best AI visibility tools?"],
    "platforms": ["perplexity"],
    "idempotency_key": "visibility-sleepwalker-example-001"
  }'
