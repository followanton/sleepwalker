import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_API_BASE_URL = "https://api.sleepwalker.ai";

export function configDir(env = process.env) {
  if (env.SLEEPWALKER_CONFIG_DIR) {
    return env.SLEEPWALKER_CONFIG_DIR;
  }
  return path.join(os.homedir(), ".sleepwalker");
}

export function configPath(env = process.env) {
  return path.join(configDir(env), "config.json");
}

export function readConfig(env = process.env) {
  const file = configPath(env);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Could not read Sleepwalker config at ${file}: ${error.message}`);
  }
}

export function writeConfig(config, env = process.env) {
  const dir = configDir(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const file = configPath(env);
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(file, 0o600);
}

export function getApiBaseUrl(env = process.env, config = readConfig(env)) {
  return String(env.SLEEPWALKER_API_BASE_URL || config.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export function getApiKey(env = process.env, config = readConfig(env)) {
  return String(env.SLEEPWALKER_API_KEY || config.apiKey || "").trim();
}

export function getApiKeySource(env = process.env, config = readConfig(env)) {
  const envKey = String(env.SLEEPWALKER_API_KEY || "").trim();
  if (envKey) {
    return { source: "env", key: envKey };
  }
  const configKey = String(config.apiKey || "").trim();
  if (configKey) {
    return { source: "config", key: configKey };
  }
  return { source: "missing", key: "" };
}

export function getApiBaseUrlSource(env = process.env, config = readConfig(env)) {
  if (env.SLEEPWALKER_API_BASE_URL) {
    return { source: "env", value: getApiBaseUrl(env, config) };
  }
  if (config.apiBaseUrl) {
    return { source: "config", value: getApiBaseUrl(env, config) };
  }
  return { source: "default", value: DEFAULT_API_BASE_URL };
}

export function maskApiKey(key) {
  const value = String(key || "");
  if (!value) {
    return "";
  }
  if (value.length <= 14) {
    return `${value.slice(0, 5)}...`;
  }
  return `${value.slice(0, 12)}...${value.slice(-4)}`;
}
