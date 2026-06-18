#!/usr/bin/env bash
set -euo pipefail

: "${SLEEPWALKER_API_KEY:?Set SLEEPWALKER_API_KEY first}"
: "${SLEEPWALKER_RUN_ID:?Set SLEEPWALKER_RUN_ID first}"

curl -s "https://api.sleepwalker.ai/v1/visibility/runs/${SLEEPWALKER_RUN_ID}?include_results=true" \
  -H "Authorization: Bearer ${SLEEPWALKER_API_KEY}"
