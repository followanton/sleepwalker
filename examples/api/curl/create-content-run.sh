#!/usr/bin/env bash
set -euo pipefail

: "${SLEEPWALKER_API_KEY:?Set SLEEPWALKER_API_KEY first}"

curl -s https://api.sleepwalker.ai/v1/content-intelligence/runs \
  -H "Authorization: Bearer ${SLEEPWALKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sleepwalker.ai",
    "analysis_depth": "full",
    "idempotency_key": "ci-sleepwalker-example-001"
  }'
