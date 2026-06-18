#!/usr/bin/env bash
set -euo pipefail

: "${SLEEPWALKER_API_KEY:?Set SLEEPWALKER_API_KEY first}"

curl -s https://api.sleepwalker.ai/v1/pages/content/serialize \
  -H "Authorization: Bearer ${SLEEPWALKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.sleepwalker.ai",
    "max_chars": 2000
  }'
