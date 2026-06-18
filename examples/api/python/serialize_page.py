import json
import os
import urllib.request


api_key = os.environ.get("SLEEPWALKER_API_KEY")
if not api_key:
    raise SystemExit("Set SLEEPWALKER_API_KEY first.")

payload = json.dumps({
    "url": "https://www.sleepwalker.ai",
    "max_chars": 2000,
}).encode("utf-8")

request = urllib.request.Request(
    "https://api.sleepwalker.ai/v1/pages/content/serialize",
    data=payload,
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
    method="POST",
)

with urllib.request.urlopen(request, timeout=60) as response:
    print(json.dumps(json.load(response), indent=2))
