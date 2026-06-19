"""A tiny, dependency-free Sleepwalker client for Python 3.8+.

Copy it into your project, or run the demo:
    SLEEPWALKER_API_KEY=sw_api_live_... python client.py

It handles auth, errors, run polling, and cursor pagination with the
standard library only. No requests, no SDK.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

TERMINAL = {"completed", "partially_completed", "failed", "cancelled"}


class SleepwalkerError(Exception):
    def __init__(self, message, status=None, payload=None):
        super().__init__(message)
        self.status = status
        self.payload = payload


class SleepwalkerClient:
    def __init__(self, api_key=None, base_url="https://api.sleepwalker.ai"):
        self.api_key = api_key or os.environ.get("SLEEPWALKER_API_KEY")
        if not self.api_key:
            raise ValueError("Set SLEEPWALKER_API_KEY or pass api_key.")
        self.base_url = base_url.rstrip("/")

    def request(self, method, path, query=None, body=None):
        url = self.base_url + path
        if query:
            clean = {k: v for k, v in query.items() if v not in (None, "")}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8")
            payload = json.loads(text) if text else None
            detail = payload.get("detail", payload) if isinstance(payload, dict) else payload
            message = detail if isinstance(detail, str) else (detail or {}).get("error", f"HTTP {exc.code}")
            raise SleepwalkerError(message, status=exc.code, payload=payload) from exc

    # Actions
    def serialize_page(self, url, **opts):
        return self.request("POST", "/v1/pages/content/serialize", body={"url": url, **opts})

    def create_visibility_run(self, **body):
        return self.request("POST", "/v1/visibility/runs", body=body)

    def get_visibility_run(self, run_id, **query):
        return self.request("GET", f"/v1/visibility/runs/{run_id}", query=query)

    def score_content(self, url, **opts):
        return self.request("POST", "/v1/content-intelligence/content/score", body={"url": url, **opts})

    # Reads
    def usage(self, **query):
        return self.request("GET", "/v1/usage", query=query)

    def wait_for_run(self, run_id, interval=5.0, timeout=900.0, **query):
        started = time.time()
        while True:
            run = self.get_visibility_run(run_id, **query)
            if str(run.get("status", "")).lower() in TERMINAL:
                return run
            if time.time() - started > timeout:
                raise SleepwalkerError(f"Run {run_id} still {run.get('status')} after {timeout}s", payload=run)
            time.sleep(interval)

    def paginate(self, path, query=None, page_size=50):
        after = None
        while True:
            page = self.request("GET", path, query={**(query or {}), "limit": page_size, "starting_after": after})
            for item in page.get("runs") or page.get("items") or page.get("tests") or []:
                yield item
            if not page.get("has_more"):
                return
            after = page.get("next_starting_after")


if __name__ == "__main__":
    sw = SleepwalkerClient()
    run = sw.create_visibility_run(
        url="https://www.sleepwalker.ai",
        target_entity="Sleepwalker",
        prompts=["best ai visibility platform 2026"],
        platforms=["perplexity"],
    )
    print("queued:", run["run_id"])
    done = sw.wait_for_run(run["run_id"], include_results=True)
    print("status:", done["status"])
