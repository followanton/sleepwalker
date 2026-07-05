import { getApiBaseUrl, getApiKey, getApiKeySource, readConfig } from "./config.js";

export class SleepwalkerApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "SleepwalkerApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function createApiClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This Node.js runtime does not expose fetch. Use Node 18.17 or newer.");
  }
  const config = readConfig(env);
  const baseUrl = getApiBaseUrl(env, config);
  const apiKey = getApiKey(env, config);
  const apiKeySource = getApiKeySource(env, config).source;

  async function request(method, pathname, { query, body, requireAuth = true } = {}) {
    if (requireAuth && !apiKey) {
      throw new SleepwalkerApiError(
        "No API key configured. Set SLEEPWALKER_API_KEY or run `sleepwalker auth key set <key>`.",
        { status: 401 },
      );
    }

    const url = new URL(pathname, `${baseUrl}/`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      const detail = payload && payload.detail ? payload.detail : payload;
      let message = typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && detail.error
          ? detail.error
          : `Sleepwalker API returned HTTP ${response.status}`;
      if (message === "API key is missing required scope") {
        message = "This API key cannot run the requested action. Create a new key in Sleepwalker Console > API; new keys include the full API action surface.";
      }
      throw new SleepwalkerApiError(message, { status: response.status, payload });
    }

    return payload;
  }

  return {
    baseUrl,
    apiKeySource,
    request,
    get: (pathname, options) => request("GET", pathname, options),
    post: (pathname, body, options = {}) => request("POST", pathname, { ...options, body }),
  };
}
