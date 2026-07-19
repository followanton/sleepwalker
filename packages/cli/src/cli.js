import readline from "node:readline";
import net from "node:net";
import { readFileSync } from "node:fs";
import {
  configPath,
  getApiBaseUrlSource,
  getApiKeySource,
  maskApiKey,
  readConfig,
  writeConfig,
} from "./config.js";
import { createApiClient, SleepwalkerApiError } from "./http.js";
import {
  flagBool,
  flagList,
  flagNumber,
  flagString,
  parseFlags,
  readLinesFromFile,
} from "./args.js";
import { printJson, printKeyValue, printList, printNextCommands, printRunSummary } from "./format.js";
import { buildBundle, defaultOutDir, writeBundle, okfUserAgent } from "./okf.js";
import { createTheme, renderCommandsHelp, renderHelp, sanitizeTerminalText, styleStatus } from "./theme.js";

// Read the version from package.json so it can never drift from the published
// release. Falls back to a literal only if the file cannot be read.
const VERSION = resolveCliVersion();

function resolveCliVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version || "0.3.0";
  } catch {
    return "0.3.0";
  }
}
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_WAIT_SECONDS = 900;
const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);

const PLATFORM_CHOICES = [
  { label: "ChatGPT", value: "openai" },
  { label: "Perplexity", value: "perplexity" },
  { label: "Grok", value: "grok" },
  { label: "Gemini", value: "gemini" },
];

// Role keywords resolve server-side to the platform's current model for that
// slot. `sleepwalker visibility models` lists concrete ids and prices.
const MODEL_CHOICES = [
  { label: "Default model (priced per platform, see `visibility models`)", value: "" },
  { label: "Latest flagship (priced per model, see `visibility models`)", value: "latest" },
  { label: "Previous generation (priced per model, see `visibility models`)", value: "prior" },
];

function makeError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function requireArg(value, message) {
  if (!value) {
    throw makeError(message);
  }
  return value;
}

function urlArg(args, flags, usage) {
  return requireArg(args[0] || flagString(flags, "url", ""), usage);
}

function splitCsvValues(values) {
  return values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function promptsFromFlags(flags) {
  const prompts = splitCsvValues(flagList(flags, "prompt"));
  const promptFile = flagString(flags, "prompt-file", "");
  if (promptFile) {
    prompts.push(...readLinesFromFile(promptFile));
  }
  return prompts;
}

function createIdempotencyKey(prefix) {
  const random = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `cli:${prefix}:${random}`;
}

function interactiveIdempotencyKey(io, prefix) {
  if (typeof io.idempotencyKeyFactory === "function") {
    return io.idempotencyKeyFactory(prefix);
  }
  return createIdempotencyKey(prefix);
}

function shortPreview(value, maxChars = 700) {
  const text = sanitizeTerminalText(value).trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}\n...`;
}

function shellQuote(value) {
  const text = sanitizeTerminalText(value);
  if (!text) {
    return "''";
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function isLoopbackHost(hostname) {
  const value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value === "::1") {
    return true;
  }
  if (net.isIP(value) === 4) {
    return value.split(".")[0] === "127";
  }
  return false;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function hasNonZeroCreditValue(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) || numeric !== 0;
}

function billingDetailRows(payload, theme) {
  const billing = payload && typeof payload.billing === "object" ? payload.billing : {};
  const released = firstDefined(payload?.released_credits, billing.released_credits);
  return [
    ["Estimated credits", firstDefined(payload?.estimated_credits, billing.estimated_credits) ? theme.info(firstDefined(payload?.estimated_credits, billing.estimated_credits)) : ""],
    ["Reserved credits", firstDefined(payload?.reserved_credits, billing.reserved_credits) ? theme.warning(firstDefined(payload?.reserved_credits, billing.reserved_credits)) : ""],
    ["Settled credits", firstDefined(payload?.settled_credits, billing.settled_credits) ? theme.accent(firstDefined(payload?.settled_credits, billing.settled_credits)) : ""],
    ["Released credits", hasNonZeroCreditValue(released) ? theme.info(released) : ""],
    ["Billing", firstDefined(payload?.billing_status, billing.status) ? styleStatus(theme, firstDefined(payload?.billing_status, billing.status)) : ""],
  ];
}

function readSetupState(io) {
  try {
    const config = readConfig(io.env);
    const keyInfo = getApiKeySource(io.env, config);
    const baseInfo = getApiBaseUrlSource(io.env, config);
    return {
      hasApiKey: Boolean(keyInfo.key),
      apiKeySource: keyInfo.source,
      apiBaseUrl: baseInfo.value,
      configPath: configPath(io.env),
      configError: "",
    };
  } catch (error) {
    return {
      hasApiKey: false,
      apiKeySource: "missing",
      apiBaseUrl: "https://api.sleepwalker.ai",
      configPath: configPath(io.env),
      configError: error && error.message ? error.message : String(error),
    };
  }
}

function isInteractiveSession(io, flags) {
  return Boolean(
    io.stdin &&
    io.stdin.isTTY &&
    io.stdout &&
    io.stdout.isTTY &&
    !flagBool(flags, "json"),
  );
}

function withRawMode(stdin, enabled) {
  if (stdin && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(enabled);
  }
}

function askLine(io, question) {
  if (io.stdin && typeof io.stdin.resume === "function") {
    io.stdin.resume();
  }
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function askRequired(io, question) {
  for (;;) {
    const value = await askLine(io, question);
    if (value) {
      return value;
    }
    io.stdout.write(`${io.theme.warning("Required.")} Please enter a value.\n`);
  }
}

async function askConfirm(io, question) {
  const value = (await askLine(io, `${question} ${io.theme.muted("[y/N]")} `)).toLowerCase();
  return value === "y" || value === "yes";
}

function writeMenu(stdout, theme, title, options, selectedIndex) {
  stdout.write(`${theme.accent(title)}\n\n`);
  options.forEach((option, index) => {
    const marker = index === selectedIndex ? theme.accent("›") : " ";
    const label = index === selectedIndex ? theme.bold(option.label) : option.label;
    const detail = option.detail ? ` ${theme.muted(`- ${option.detail}`)}` : "";
    stdout.write(`${marker} ${label}${detail}\n`);
  });
  stdout.write(`\n${theme.muted("Use ↑/↓, Enter to select, q to quit.")}\n`);
}

function selectOption(io, title, options) {
  const stdin = io.stdin;
  const stdout = io.stdout;
  const theme = io.theme;
  let selectedIndex = 0;
  let rendered = false;

  return new Promise((resolve) => {
    const cleanup = (value) => {
      stdin.off("keypress", onKeypress);
      withRawMode(stdin, false);
      if (typeof stdin.pause === "function") {
        stdin.pause();
      }
      stdout.write("\u001b[?25h");
      stdout.write("\n");
      resolve(value);
    };

    const render = () => {
      if (rendered) {
        readline.moveCursor(stdout, 0, -(options.length + 4));
        readline.clearScreenDown(stdout);
      } else {
        stdout.write("\u001b[?25l");
        rendered = true;
      }
      writeMenu(stdout, theme, title, options, selectedIndex);
    };

    const onKeypress = (_chunk, key = {}) => {
      if (key.name === "up") {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup(options[selectedIndex]);
        return;
      }
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup(null);
      }
    };

    readline.emitKeypressEvents(stdin);
    if (typeof stdin.resume === "function") {
      stdin.resume();
    }
    stdin.on("keypress", onKeypress);
    withRawMode(stdin, true);
    render();
  });
}

function normalizeApiBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw makeError("Usage: sleepwalker config set api-base-url <url>");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw makeError(`Invalid API base URL: ${raw}`);
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw makeError("API base URL must start with https:// or http://.");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw makeError("HTTP API base URLs are only allowed for localhost or loopback addresses. Use https:// for remote API hosts.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

async function sleep(ms, io) {
  if (typeof io.sleep === "function") {
    await io.sleep(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function output(stdout, flags, value, humanPrinter) {
  if (flagBool(flags, "json")) {
    printJson(stdout, value);
    return;
  }
  humanPrinter(value);
}

function formatTestType(value) {
  if (value === "ai_citations") {
    return "AI Visibility";
  }
  if (value === "content_intelligence") {
    return "Content Intelligence";
  }
  return value || "Report";
}

async function pollUntilDone({
  client,
  io,
  stdout,
  flags,
  path,
  query,
  type,
  theme,
}) {
  const intervalMs = Math.max(1000, flagNumber(flags, "poll-interval-ms", DEFAULT_POLL_INTERVAL_MS));
  const maxWaitSeconds = Math.max(1, flagNumber(flags, "max-wait-seconds", DEFAULT_MAX_WAIT_SECONDS));
  const maxWaitMs = maxWaitSeconds * 1000;
  let elapsedMs = 0;
  const quiet = flagBool(flags, "quiet");
  let lastStatus = "";
  let lastPayload = null;

  for (;;) {
    if (lastPayload && elapsedMs >= maxWaitMs) {
      const id = lastPayload.run_id || lastPayload.id || "";
      const hintCommand = type === "Content Intelligence" ? "sleepwalker ci status" : "sleepwalker visibility status";
      const error = makeError(`${type} run ${id || "unknown"} is still ${lastStatus || "unknown"} after ${maxWaitSeconds}s. Check later with \`${hintCommand} ${id || "<run_id>"}\`.`);
      error.payload = {
        timed_out: true,
        run_id: id || null,
        last_status: lastStatus || null,
        last_payload: lastPayload,
      };
      throw error;
    }

    const payload = await client.get(path, { query });
    lastPayload = payload;
    const status = String(payload.status || "").toLowerCase();
    if (!quiet && status !== lastStatus && !flagBool(flags, "json")) {
      const id = payload.run_id || payload.id || "";
      stdout.write(`${theme.muted(type)} run ${theme.id(id)} is ${styleStatus(theme, status || "unknown")}\n`);
    }
    lastStatus = status;
    if (TERMINAL_RUN_STATUSES.has(status)) {
      return payload;
    }
    await sleep(intervalMs, io);
    elapsedMs += intervalMs;
  }
}

async function handleConfig(args, flags, io) {
  const theme = io.theme;
  const command = args[0];
  const config = readConfig(io.env);

  if (!command || command === "show") {
    const keyInfo = getApiKeySource(io.env, config);
    const baseInfo = getApiBaseUrlSource(io.env, config);
    const payload = {
      config_path: configPath(io.env),
      api_base_url: baseInfo.value,
      api_base_url_source: baseInfo.source,
      api_key_source: keyInfo.source,
      api_key: keyInfo.key ? maskApiKey(keyInfo.key) : null,
    };
    output(io.stdout, flags, payload, (data) => {
      printKeyValue(io.stdout, [
        ["Config file", theme.id(data.config_path)],
        ["API base", `${theme.info(data.api_base_url)} ${theme.muted(`(${data.api_base_url_source})`)}`],
        ["API key", data.api_key ? `${theme.id(data.api_key)} ${theme.muted(`(${data.api_key_source})`)}` : theme.warning("not configured")],
      ], theme);
    });
    return;
  }

  if (command === "set" && args[1] === "api-base-url") {
    const apiBaseUrl = normalizeApiBaseUrl(args[2]);
    writeConfig({ ...config, apiBaseUrl }, io.env);
    io.stdout.write(`${theme.accent("Stored")} API base URL ${theme.id(apiBaseUrl)} locally.\n`);
    return;
  }

  if (command === "clear" && args[1] === "api-base-url") {
    const next = { ...config };
    delete next.apiBaseUrl;
    writeConfig(next, io.env);
    io.stdout.write(`${theme.warning("Removed")} stored API base URL override.\n`);
    return;
  }

  throw makeError("Usage: sleepwalker config show | config set api-base-url <url> | config clear api-base-url");
}

async function handleInit(flags, io) {
  const theme = io.theme;
  const state = readSetupState(io);
  const payload = {
    configured: state.hasApiKey && !state.configError,
    config_path: state.configPath,
    api_base_url: state.apiBaseUrl,
    api_key_source: state.apiKeySource,
    config_error: state.configError || null,
    next_commands: state.hasApiKey
      ? [
        "sleepwalker doctor",
        "sleepwalker reports by-url https://www.sleepwalker.ai",
        "sleepwalker commands",
      ]
      : [
        "sleepwalker auth key set sw_api_live_...",
        "sleepwalker doctor",
        "sleepwalker reports by-url https://www.sleepwalker.ai",
      ],
  };

  output(io.stdout, flags, payload, (data) => {
    io.stdout.write(`${theme.accent("Sleepwalker CLI setup")}\n\n`);
    printKeyValue(io.stdout, [
      ["Config file", theme.id(data.config_path)],
      ["API base", theme.info(data.api_base_url)],
      ["API key", data.configured ? `${theme.accent("configured")} ${theme.muted(`(${data.api_key_source})`)}` : theme.warning("not configured")],
    ], theme);

    if (data.config_error) {
      io.stdout.write(`\n${theme.warning("Config issue")}\n${data.config_error}\n`);
    }

    io.stdout.write(`\n${theme.accent("Next steps")}\n`);
    if (data.configured) {
      io.stdout.write(`  1. ${theme.command("sleepwalker doctor")} ${theme.muted("checks the live API connection and credits.")}\n`);
      io.stdout.write(`  2. ${theme.command("sleepwalker reports by-url https://www.sleepwalker.ai")} ${theme.muted("runs a safe read-only check.")}\n`);
      io.stdout.write(`  3. ${theme.command("sleepwalker commands")} ${theme.muted("shows the full command reference.")}\n`);
    } else {
      io.stdout.write(`  1. Open ${theme.info("https://app.sleepwalker.ai")} and go to ${theme.accent("API")}.\n`);
      io.stdout.write(`  2. Generate a new API key.\n`);
      io.stdout.write(`  3. ${theme.command("sleepwalker auth key set sw_api_live_...")}\n`);
      io.stdout.write(`  4. ${theme.command("sleepwalker doctor")}\n`);
      io.stdout.write(`  5. ${theme.command("sleepwalker reports by-url https://www.sleepwalker.ai")} ${theme.muted("runs a safe read-only check.")}\n`);
    }
  });
}

async function pauseForMenu(io) {
  await askLine(io, `\n${io.theme.muted("Press Enter to return to the menu.")}`);
}

async function runMenuAction(label, io, action) {
  try {
    io.stdout.write(`\n${io.theme.accent(label)}\n`);
    await action();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    io.stdout.write(`\n${io.theme.error("Error")} ${message}\n`);
  }
  await pauseForMenu(io);
}

async function handleInteractiveMenu(flags, io) {
  if (!isInteractiveSession(io, flags)) {
    throw makeError("Interactive menu requires a terminal. Run `sleepwalker --help` or `sleepwalker commands` instead.");
  }

  for (;;) {
    const state = readSetupState(io);
    const options = state.hasApiKey
      ? [
        { label: "Check connection", value: "doctor", detail: "account, API, credits" },
        { label: "Show credits", value: "credits" },
        { label: "Serialize a page", value: "page_serialize", detail: "clean content for agents" },
        { label: "Run AI Visibility", value: "visibility_run", detail: "prompt + platform" },
        { label: "Score content", value: "ci_score", detail: "quick Content Intelligence" },
        { label: "Run Content Intelligence", value: "ci_run", detail: "saved run" },
        { label: "Find reports by URL", value: "reports_by_url" },
        { label: "Command reference", value: "commands" },
        { label: "Clear stored API key", value: "clear_key" },
        { label: "Exit", value: "exit" },
      ]
      : [
        { label: "Enter API key", value: "set_key", detail: "paste sw_api_live_..." },
        { label: "Setup checklist", value: "init", detail: "where to generate a key" },
        { label: "Command reference", value: "commands" },
        { label: "Exit", value: "exit" },
      ];

    const selected = await selectOption(io, "Sleepwalker CLI", options);
    if (!selected || selected.value === "exit") {
      io.stdout.write(`${io.theme.muted("Bye.")}\n`);
      return;
    }

    if (selected.value === "set_key") {
      await runMenuAction("Store API key", io, async () => {
        const key = await askRequired(io, "Paste your Sleepwalker API key: ");
        await handleAuth(["key", "set", key], {}, io);
        await handleDoctor({}, io);
      });
      continue;
    }

    if (selected.value === "init") {
      await runMenuAction("Setup checklist", io, async () => handleInit({}, io));
      continue;
    }

    if (selected.value === "commands") {
      await runMenuAction("Command reference", io, async () => {
        io.stdout.write(renderCommandsHelp(io.theme));
      });
      continue;
    }

    if (selected.value === "clear_key") {
      await runMenuAction("Clear stored API key", io, async () => handleAuth(["key", "clear"], {}, io));
      continue;
    }

    if (selected.value === "doctor") {
      await runMenuAction("Connection check", io, async () => handleDoctor({}, io));
      continue;
    }

    if (selected.value === "credits") {
      await runMenuAction("Credits", io, async () => handleUsage({}, io));
      continue;
    }

    if (selected.value === "page_serialize") {
      await runMenuAction("Page serialization", io, async () => {
        const url = await askRequired(io, "URL: ");
        await handlePage(["serialize", url], {}, io);
      });
      continue;
    }

    if (selected.value === "visibility_run") {
      await runMenuAction("AI Visibility run", io, async () => {
        const url = await askRequired(io, "URL: ");
        const brand = await askRequired(io, "Brand / target entity: ");
        const prompt = await askRequired(io, "Prompt: ");
        const platform = await selectOption(io, "Choose platform", PLATFORM_CHOICES);
        if (!platform) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        const model = await selectOption(io, "Choose model", MODEL_CHOICES);
        if (!model) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        const watch = await askConfirm(io, "Watch until the run finishes?");
        const confirmed = await askConfirm(io, "Queue this run now? It can use prepaid credits.");
        if (!confirmed) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        const runFlags = {
          brand,
          prompt,
          platform: platform.value,
          watch,
          "idempotency-key": interactiveIdempotencyKey(io, "visibility-run"),
        };
        if (model.value) {
          runFlags.model = model.value;
        }
        await handleVisibility(["run", url], runFlags, io);
      });
      continue;
    }

    if (selected.value === "ci_score") {
      await runMenuAction("Content score", io, async () => {
        const url = await askRequired(io, "URL: ");
        const confirmed = await askConfirm(io, "Score this page now? It can use prepaid credits.");
        if (!confirmed) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        await handleCi(["score", url], {}, io);
      });
      continue;
    }

    if (selected.value === "ci_run") {
      await runMenuAction("Content Intelligence run", io, async () => {
        const url = await askRequired(io, "URL: ");
        const depth = await selectOption(io, "Choose analysis depth", [
          { label: "Full", value: "full", detail: "saved run with recommendations" },
          { label: "Score", value: "score", detail: "lighter saved run" },
        ]);
        if (!depth) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        const watch = await askConfirm(io, "Watch until the run finishes?");
        const confirmed = await askConfirm(io, "Queue this run now? It can use prepaid credits.");
        if (!confirmed) {
          io.stdout.write(`${io.theme.warning("Cancelled.")}\n`);
          return;
        }
        await handleCi(["run", url], {
          depth: depth.value,
          watch,
          "idempotency-key": interactiveIdempotencyKey(io, "content-run"),
        }, io);
      });
      continue;
    }

    if (selected.value === "reports_by_url") {
      await runMenuAction("Reports by URL", io, async () => {
        const url = await askRequired(io, "URL: ");
        await handleReports(["by-url", url], {}, io);
      });
    }
  }
}

async function handleDoctor(flags, io) {
  const theme = io.theme;
  const config = readConfig(io.env);
  const keyInfo = getApiKeySource(io.env, config);
  const baseInfo = getApiBaseUrlSource(io.env, config);
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const checks = [
    {
      name: "API base",
      status: "ok",
      detail: `${baseInfo.value} (${baseInfo.source})`,
    },
    {
      name: "API key",
      status: keyInfo.key ? "ok" : "missing",
      detail: keyInfo.key ? `${maskApiKey(keyInfo.key)} (${keyInfo.source})` : "Set SLEEPWALKER_API_KEY or run `sleepwalker auth key set <key>`.",
    },
  ];
  let usage = null;

  if (keyInfo.key) {
    try {
      usage = await client.get("/v1/usage", { query: { recent_limit: 1 } });
      checks.push({
        name: "API reachability",
        status: "ok",
        detail: "authenticated",
      });
    } catch (error) {
      checks.push({
        name: "API reachability",
        status: "error",
        detail: error instanceof SleepwalkerApiError ? `${error.status || "HTTP"} ${error.message}` : error.message,
      });
    }
  }

  const ready = checks.every((check) => check.status === "ok");
  const credits = usage && usage.credits ? usage.credits : {};
  const payload = {
    ready,
    api_base_url: baseInfo.value,
    api_base_url_source: baseInfo.source,
    api_key_source: keyInfo.source,
    api_key: keyInfo.key ? maskApiKey(keyInfo.key) : null,
    credits: usage ? credits : null,
    checks,
  };

  output(io.stdout, flags, payload, (data) => {
    io.stdout.write(`${data.ready ? theme.accent("Sleepwalker CLI is ready.") : theme.warning("Sleepwalker CLI needs attention.")}\n\n`);
    printList(io.stdout, data.checks, (check) => {
      const marker = check.status === "ok" ? theme.accent("ok") : theme.warning(check.status);
      return `${marker}  ${check.name}: ${check.detail}`;
    });
    if (data.credits) {
      io.stdout.write("\n");
      printKeyValue(io.stdout, [
        ["Available credits", theme.accent(data.credits.available_credit_units || "0.00")],
        ["Used credits", theme.info(data.credits.used_credit_units || "0.00")],
      ], theme);
    }
    if (data.ready) {
      printNextCommands(io.stdout, [
        "sleepwalker reports by-url https://www.sleepwalker.ai",
        "sleepwalker commands",
      ], theme);
      io.stdout.write(`\n${theme.muted("If an action fails with a scope error, generate a new key in Console > API.")}\n`);
    }
  });

  if (!ready) {
    throw makeError("Sleepwalker CLI doctor found setup issues.");
  }
}

async function handleAuth(args, flags, io) {
  const theme = io.theme;
  const subcommand = args[0];
  const nested = args[1];
  if (subcommand === "key" && nested === "set") {
    const key = requireArg(args[2], "Usage: sleepwalker auth key set <api_key>");
    const config = readConfig(io.env);
    writeConfig({ ...config, apiKey: key }, io.env);
    io.stdout.write(`${theme.accent("Stored")} API key ${theme.id(maskApiKey(key))} locally.\n`);
    return;
  }
  if (subcommand === "key" && nested === "show") {
    const config = readConfig(io.env);
    const envKey = io.env.SLEEPWALKER_API_KEY;
    const key = envKey || config.apiKey || "";
    if (!key) {
      io.stdout.write("No API key configured.\n");
      return;
    }
    io.stdout.write(`${theme.id(maskApiKey(key))}${theme.muted(envKey ? " (from env)" : " (from config)")}\n`);
    return;
  }
  if (subcommand === "key" && nested === "clear") {
    const config = readConfig(io.env);
    const next = { ...config };
    delete next.apiKey;
    writeConfig(next, io.env);
    io.stdout.write(`${theme.warning("Removed")} stored API key from local config.\n`);
    return;
  }
  if (subcommand === "login") {
    io.stdout.write("Create an API key in the Sleepwalker Console, then run:\n\n");
    io.stdout.write(`  ${theme.command("sleepwalker auth key set sw_api_live_...")}\n\n`);
    io.stdout.write(`${theme.muted("OAuth/device login is not part of this first CLI scaffold.")}\n`);
    return;
  }
  if (subcommand === "whoami") {
    const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
    const payload = await client.get("/v1/usage", { query: { recent_limit: 5 } });
    output(io.stdout, flags, payload, (data) => {
      const credits = data.credits || {};
      printKeyValue(io.stdout, [
        ["Account", data.email || data.user_email || data.user_id || "authenticated"],
        ["Available credits", theme.accent(credits.available_credit_units || "0.00")],
        ["Used credits", theme.info(credits.used_credit_units || "0.00")],
        ["API base", theme.id(client.baseUrl)],
      ], theme);
    });
    return;
  }
  throw makeError("Unknown auth command. Run `sleepwalker --help`.");
}

async function handleReports(args, flags, io) {
  const theme = io.theme;
  if (args[0] !== "by-url") {
    throw makeError("Usage: sleepwalker reports by-url <url> [--type ai_citations|content_intelligence] [--days 90] [--limit 5]");
  }
  const url = urlArg(args.slice(1), flags, "Usage: sleepwalker reports by-url <url>");
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const payload = await client.get("/v1/reports/by-url", {
    query: {
      url,
      test_type: flagString(flags, "type", flagString(flags, "test-type", "")),
      days: flagNumber(flags, "days", 90),
      limit: flagNumber(flags, "limit", 5),
    },
  });

  output(io.stdout, flags, payload, (data) => {
    printKeyValue(io.stdout, [
      ["URL", theme.info(data.url || url)],
      ["Matches", data.match_count ?? (data.matches || []).length],
      ["Lookback", `${data.days || 90} days`],
    ], theme);
    if (data.matches && data.matches.length) {
      io.stdout.write("\n");
      printList(io.stdout, data.matches, (match) => {
        const test = match.test || {};
        const runs = match.runs || [];
        const latest = runs[0] || {};
        const result = latest.overall_band || latest.status || "no runs";
        return `${theme.id(test.id || "")}  ${theme.muted(formatTestType(test.test_type))}  ${sanitizeTerminalText(test.name || "Untitled")}  ${theme.info(test.url || "")}  ${styleStatus(theme, result)}`;
      });
    }
  });
}

async function handleUsage(flags, io) {
  const theme = io.theme;
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const payload = await client.get("/v1/usage", {
    query: { recent_limit: flagNumber(flags, "recent-limit", 20) },
  });
  output(io.stdout, flags, payload, (data) => {
    const credits = data.credits || {};
    printKeyValue(io.stdout, [
      ["Available credits", theme.accent(credits.available_credit_units || "0.00")],
      ["Used credits", theme.info(credits.used_credit_units || "0.00")],
      ["Active grants", credits.active_grant_count ?? 0],
    ], theme);
  });
}

async function handleActivity(args, flags, io) {
  const theme = io.theme;
  if (args[0] !== "list") {
    throw makeError("Usage: sleepwalker activity list [--limit 10] [--kind all]");
  }
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const payload = await client.get("/v1/activity", {
    query: {
      limit: flagNumber(flags, "limit", 10),
      kind: flagString(flags, "kind", "all"),
    },
  });
  output(io.stdout, flags, payload, (data) => {
    printList(io.stdout, data.items || [], (item) => {
      const source = item.source || "unknown";
      const status = item.status || "unknown";
      const action = item.action || item.kind || "request";
      const credits = item.credits || item.estimated_credits || "";
      return `${theme.muted(item.created_at || "")}  ${theme.info(source)}  ${sanitizeTerminalText(action)}  ${styleStatus(theme, status)}${credits ? `  ${theme.warning(`${credits} credits`)}` : ""}`;
    });
  });
}

async function handleTests(args, flags, io) {
  const theme = io.theme;
  if (args[0] !== "list") {
    throw makeError("Usage: sleepwalker tests list [--limit 20] [--type ai_citations|content_intelligence]");
  }
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const payload = await client.get("/v1/tests", {
    query: {
      limit: flagNumber(flags, "limit", 20),
      test_type: flagString(flags, "type", ""),
    },
  });
  output(io.stdout, flags, payload, (data) => {
    printList(io.stdout, data.tests || data.items || [], (test) => {
      return `${theme.id(test.id || "")}  ${theme.muted(test.test_type || "")}  ${sanitizeTerminalText(test.name || test.title || "Untitled")}  ${theme.info(test.url || "")}`;
    });
  });
}

async function handlePage(args, flags, io) {
  const theme = io.theme;
  if (args[0] !== "serialize") {
    throw makeError("Usage: sleepwalker page serialize <url>");
  }
  const url = urlArg(args.slice(1), flags, "Usage: sleepwalker page serialize <url>");
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });
  const payload = await client.post("/v1/pages/content/serialize", {
    url,
    extraction_mode: flagString(flags, "mode", flagString(flags, "extraction-mode", "")) || undefined,
    max_chars: flagNumber(flags, "max-chars", undefined),
    offset: flagNumber(flags, "offset", undefined),
  });
  output(io.stdout, flags, payload, (data) => {
    const serialization = data.serialization || data;
    if (serialization.blocked || serialization.serialization_issue || data.blocked || data.serialization_issue) {
      io.stdout.write(`${sanitizeTerminalText(serialization.blocked_message || serialization.issue_message || data.blocked_message || data.issue_message || "Page could not be serialized.")}\n`);
      return;
    }
    const contentView = serialization.content_view || "";
    io.stdout.write(`${theme.accent("Page serialized")}\n\n`);
    printKeyValue(io.stdout, [
      ["URL", theme.info(serialization.url || url)],
      ["HTTP status", serialization.http_status ? styleStatus(theme, serialization.http_status) : ""],
      ["Content", `${serialization.content_view_chars ?? contentView.length} chars${serialization.content_view_truncated ? " (truncated)" : ""}`],
      ...billingDetailRows(serialization, theme),
    ], theme);
    const preview = shortPreview(contentView);
    if (preview) {
      io.stdout.write(`\n${theme.accent("Preview")}\n${preview}\n`);
    }
    printNextCommands(io.stdout, [
      `sleepwalker page serialize ${shellQuote(serialization.url || url)} --json`,
      `sleepwalker reports by-url ${shellQuote(serialization.url || url)}`,
    ], theme);
  });
}

async function handleVisibility(args, flags, io) {
  const theme = io.theme;
  const command = args[0];
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });

  if (command === "suggest-prompts") {
    const url = urlArg(args.slice(1), flags, "Usage: sleepwalker visibility suggest-prompts <url> --brand <brand>");
    const brand = requireArg(flagString(flags, "brand", ""), "Missing --brand <brand>.");
    const payload = await client.post("/v1/visibility/prompts/suggest", {
      url,
      brand_name: brand,
      language: flagString(flags, "language", undefined),
      country: flagString(flags, "country", undefined),
    });
    output(io.stdout, flags, payload, (data) => {
      const prompts = data.prompts || [];
      printList(io.stdout, prompts, (prompt) => `${theme.accent("-")} ${sanitizeTerminalText(prompt)}`);
      if (prompts.length) {
        printNextCommands(io.stdout, [
          `sleepwalker visibility run ${shellQuote(url)} --brand ${shellQuote(brand)} --prompt ${shellQuote(prompts[0])} --platform perplexity`,
        ], theme);
      }
    });
    return;
  }

  if (command === "models") {
    const payload = await client.get("/v1/visibility/models");
    output(io.stdout, flags, payload, (data) => {
      const platforms = data.platforms || {};
      const roles = data.roles || {};
      for (const [platform, options] of Object.entries(platforms)) {
        io.stdout.write(`${theme.accent(platform)}\n`);
        for (const option of options || []) {
          const marker = option.default ? theme.info(" (default)") : "";
          io.stdout.write(
            `  ${theme.id(option.id)}${marker}  ${theme.muted(`${option.tier}, ${option.credits_per_probe} cr/probe`)}\n`,
          );
        }
        const role = roles[platform];
        if (role) {
          io.stdout.write(`  ${theme.muted(`roles: latest=${role.latest} prior=${role.prior}`)}\n`);
        }
      }
      printNextCommands(io.stdout, [
        'sleepwalker visibility run <url> --brand <brand> --prompt <prompt> --platform openai --model latest',
      ], theme);
    });
    return;
  }

  if (command === "run") {
    const url = urlArg(args.slice(1), flags, "Usage: sleepwalker visibility run <url> --brand <brand> --prompt <prompt> --platform <platform> [--model <platform=model>]");
    const prompts = promptsFromFlags(flags);
    const platforms = splitCsvValues(flagList(flags, "platform"));
    if (!prompts.length) {
      throw makeError("Missing --prompt <prompt> or --prompt-file <path>.");
    }
    if (!platforms.length) {
      throw makeError("Missing --platform <platform>.");
    }
    // --model is repeatable: "platform=model" pairs, or a bare model/keyword
    // when exactly one platform is requested. Values are catalog model ids or
    // the keywords latest / prior / default; the server validates them.
    const models = {};
    for (const entry of splitCsvValues(flagList(flags, "model"))) {
      const eq = entry.indexOf("=");
      if (eq > 0) {
        models[entry.slice(0, eq).trim()] = entry.slice(eq + 1).trim();
      } else if (platforms.length === 1) {
        models[platforms[0]] = entry.trim();
      } else {
        throw makeError(`Ambiguous --model ${entry}: with multiple platforms use --model <platform>=<model>.`);
      }
    }
    const payload = await client.post("/v1/visibility/runs", {
      url,
      target_entity: requireArg(flagString(flags, "brand", flagString(flags, "target", "")), "Missing --brand <brand>."),
      prompts,
      platforms,
      models: Object.keys(models).length ? models : undefined,
      competitors: splitCsvValues(flagList(flags, "competitor")),
      language: flagString(flags, "language", "en"),
      country: flagString(flags, "country", "US"),
      idempotency_key: flagString(flags, "idempotency-key") || undefined,
    });
    if (flagBool(flags, "watch")) {
      const watched = await pollUntilDone({
        client,
        io,
        stdout: io.stdout,
        flags,
        path: `/v1/visibility/runs/${payload.run_id}`,
        query: { include_probes: true, include_results: true },
        type: "Visibility",
        theme,
      });
      output(io.stdout, flags, watched, (data) => printRunSummary(io.stdout, data, theme.accent("AI Visibility"), theme, {
        nextCommands: [
          data.run_id ? `sleepwalker visibility status ${shellQuote(data.run_id)} --results` : "",
        ],
      }));
    } else {
      output(io.stdout, flags, payload, (data) => printRunSummary(io.stdout, data, theme.accent("AI Visibility"), theme, {
        nextCommands: [
          data.run_id ? `sleepwalker visibility status ${shellQuote(data.run_id)} --results` : "",
          data.run_id ? `sleepwalker visibility status ${shellQuote(data.run_id)} --results --json` : "",
        ],
      }));
    }
    return;
  }

  if (command === "status") {
    const runId = requireArg(args[1], "Usage: sleepwalker visibility status <run_id>");
    const payload = await client.get(`/v1/visibility/runs/${runId}`, {
      query: {
        include_probes: flagBool(flags, "probes") || flagBool(flags, "results"),
        include_results: flagBool(flags, "results"),
      },
    });
    output(io.stdout, flags, payload, (data) => printRunSummary(io.stdout, data, theme.accent("AI Visibility"), theme, {
      nextCommands: [
        data.run_id ? `sleepwalker visibility status ${shellQuote(data.run_id)} --results --json` : "",
      ],
    }));
    return;
  }

  if (command === "list") {
    const payload = await client.get("/v1/visibility/runs", {
      query: {
        limit: flagNumber(flags, "limit", 20),
        status: flagString(flags, "status", ""),
        starting_after: flagString(flags, "starting-after", ""),
      },
    });
    output(io.stdout, flags, payload, (data) => {
      printList(io.stdout, data.runs || [], (run) => `${theme.id(run.run_id || run.id)}  ${styleStatus(theme, run.status)}  ${theme.info(run.url || "")}`);
    });
    return;
  }

  throw makeError("Unknown visibility command. Run `sleepwalker --help`.");
}

async function handleCi(args, flags, io) {
  const theme = io.theme;
  const command = args[0];
  const client = createApiClient({ env: io.env, fetchImpl: io.fetch });

  if (command === "score") {
    const url = urlArg(args.slice(1), flags, "Usage: sleepwalker ci score <url>");
    const payload = await client.post("/v1/content-intelligence/content/score", {
      url,
      extraction_mode: flagString(flags, "mode", flagString(flags, "extraction-mode", "")) || undefined,
      industry: flagString(flags, "industry", undefined),
      language: flagString(flags, "language", undefined),
      country: flagString(flags, "country", undefined),
    });
    output(io.stdout, flags, payload, (data) => {
      if (data.content_score_issue || data.blocked || data.site_error) {
        io.stdout.write(`${sanitizeTerminalText(data.issue_message || data.blocked_message || data.site_error_message || "Content could not be scored.")}\n`);
        return;
      }
      io.stdout.write(`${theme.ci("Content score")}\n\n`);
      printKeyValue(io.stdout, [
        ["Overall", theme.ci(`${data.overall_score ?? "n/a"}${data.overall_band ? ` - ${data.overall_band}` : ""}`)],
        ["Page type", data.page_type || "unknown"],
        ["Trend source", data.trend_source || "unknown"],
        ["Freshness", data.freshness_score ? `${data.freshness_score}${data.freshness_band ? ` - ${data.freshness_band}` : ""}` : ""],
        ["Depth", data.sufficiency_score ? `${data.sufficiency_score}${data.sufficiency_band ? ` - ${data.sufficiency_band}` : ""}` : ""],
        ...billingDetailRows(data, theme),
      ], theme);
      const recommendations = data.top_recommendations || [];
      if (recommendations.length) {
        io.stdout.write(`\n${theme.ci("Top recommendations")}\n`);
        printList(io.stdout, recommendations.slice(0, 3), (item) => `${theme.ci("-")} ${sanitizeTerminalText(item)}`);
      }
      printNextCommands(io.stdout, [
        `sleepwalker ci score ${shellQuote(url)} --json`,
        `sleepwalker ci run ${shellQuote(url)} --depth full`,
      ], theme);
    });
    return;
  }

  if (command === "run") {
    const url = urlArg(args.slice(1), flags, "Usage: sleepwalker ci run <url> [--depth score|full]");
    const payload = await client.post("/v1/content-intelligence/runs", {
      url,
      analysis_depth: flagString(flags, "depth", "full"),
      language: flagString(flags, "language", "en"),
      country: flagString(flags, "country", "US"),
      idempotency_key: flagString(flags, "idempotency-key") || undefined,
    });
    if (flagBool(flags, "watch")) {
      const watched = await pollUntilDone({
        client,
        io,
        stdout: io.stdout,
        flags,
        path: `/v1/content-intelligence/runs/${payload.run_id}`,
        query: { include_result: true },
        type: "Content Intelligence",
        theme,
      });
      output(io.stdout, flags, watched, (data) => printRunSummary(io.stdout, data, theme.ci("Content Intelligence"), theme, {
        nextCommands: [
          data.run_id ? `sleepwalker ci status ${shellQuote(data.run_id)} --result` : "",
        ],
      }));
    } else {
      output(io.stdout, flags, payload, (data) => printRunSummary(io.stdout, data, theme.ci("Content Intelligence"), theme, {
        nextCommands: [
          data.run_id ? `sleepwalker ci status ${shellQuote(data.run_id)} --result` : "",
          data.run_id ? `sleepwalker ci status ${shellQuote(data.run_id)} --result --json` : "",
        ],
      }));
    }
    return;
  }

  if (command === "status") {
    const runId = requireArg(args[1], "Usage: sleepwalker ci status <run_id>");
    const payload = await client.get(`/v1/content-intelligence/runs/${runId}`, {
      query: { include_result: flagBool(flags, "result") },
    });
    output(io.stdout, flags, payload, (data) => printRunSummary(io.stdout, data, theme.ci("Content Intelligence"), theme, {
      nextCommands: [
        data.run_id ? `sleepwalker ci status ${shellQuote(data.run_id)} --result --json` : "",
      ],
    }));
    return;
  }

  if (command === "list") {
    const payload = await client.get("/v1/content-intelligence/runs", {
      query: {
        limit: flagNumber(flags, "limit", 20),
        status: flagString(flags, "status", ""),
        starting_after: flagString(flags, "starting-after", ""),
      },
    });
    output(io.stdout, flags, payload, (data) => {
      printList(io.stdout, data.runs || [], (run) => `${theme.id(run.run_id || run.id)}  ${styleStatus(theme, run.status)}  ${theme.info(run.url || "")}`);
    });
    return;
  }

  throw makeError("Unknown ci command. Run `sleepwalker --help`.");
}

// Follow redirects by hand so --technical can report the exact chain (status
// per hop, https to http downgrades). Parity with redirect:"follow" otherwise:
// same headers, no cookie jar, one 30s deadline shared across all hops.
const OKF_MAX_REDIRECT_HOPS = 10;
const OKF_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function okfFetchWithChain(fetchImpl, startUrl, headers) {
  const chain = [];
  const startedAt = Date.now();
  const budgetMs = 30_000;
  let current = startUrl;
  for (let hop = 0; hop <= OKF_MAX_REDIRECT_HOPS; hop += 1) {
    const remaining = budgetMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    }
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers,
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(remaining) : undefined,
    });
    const location = response.headers?.get?.("location");
    let next = "";
    if (OKF_REDIRECT_STATUSES.has(response.status) && location) {
      try {
        // Location is resolved against the CURRENT hop, and only http(s)
        // targets are followed; anything else is reported as the final stop.
        const target = new URL(location, current);
        if (target.protocol === "http:" || target.protocol === "https:") next = target.toString();
      } catch {
        next = "";
      }
    }
    if (!next) {
      chain.push({ url: response.url || current, status: response.status });
      return { response, chain };
    }
    chain.push({ url: current, status: response.status });
    try {
      // Undici keeps the socket open until the hop body is consumed or cancelled.
      await response.body?.cancel?.();
    } catch {
      // best effort
    }
    current = next;
  }
  throw makeError(`Could not fetch ${startUrl}: more than ${OKF_MAX_REDIRECT_HOPS} redirects.`);
}

function captureHeaders(headers) {
  const bag = {};
  if (!headers) return bag;
  try {
    if (typeof headers.forEach === "function") {
      headers.forEach((value, name) => {
        bag[String(name).toLowerCase()] = String(value);
      });
      return bag;
    }
    for (const [name, value] of Object.entries(headers)) {
      bag[String(name).toLowerCase()] = String(value);
    }
  } catch {
    // headers stay best effort; the bundle degrades to fewer sections
  }
  return bag;
}

async function handleOkf(args, flags, io) {
  const theme = io.theme;
  const usage = "Usage: sleepwalker okf export <url> [--content | --technical] [--out <dir>] [--force]";
  if (args[0] !== "export") {
    throw makeError(usage);
  }
  // Flag parsing takes the next token as a flag value, so a mode flag typed
  // before the URL swallows it; adopt it back and treat the flag as boolean.
  let urlArg = args[1] || flagString(flags, "url", "");
  for (const modeFlag of ["content", "technical"]) {
    if (!urlArg && typeof flags[modeFlag] === "string" && /^https?:\/\//i.test(flags[modeFlag])) {
      urlArg = flags[modeFlag];
      flags[modeFlag] = true;
    }
  }
  // Default exports everything; --content and --technical narrow the bundle.
  const contentFlag = flagBool(flags, "content");
  const technicalFlag = flagBool(flags, "technical");
  const includeContent = contentFlag || !technicalFlag;
  const technical = technicalFlag || !contentFlag;
  const url = requireArg(urlArg, `${usage}\nPut flags after the URL.`);
  const fetchImpl = io.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw makeError("This command needs the built-in fetch (Node >= 18).");
  }

  const fetchHeaders = { "user-agent": okfUserAgent(VERSION), accept: "text/html,application/xhtml+xml" };
  let response;
  let redirectChain = [];
  try {
    if (technical) {
      ({ response, chain: redirectChain } = await okfFetchWithChain(fetchImpl, url, fetchHeaders));
    } else {
      response = await fetchImpl(url, {
        redirect: "follow",
        headers: fetchHeaders,
        // A hanging or slow-dripping server should fail the command, not stall it.
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(30_000) : undefined,
      });
    }
  } catch (error) {
    if (error?.exitCode) throw error;
    const reason = error?.name === "TimeoutError" ? "timed out after 30s" : error.message;
    throw makeError(`Could not fetch ${url}: ${reason}`);
  }
  if (!response.ok) {
    throw makeError(`Fetch failed for ${url}: HTTP ${response.status}.`);
  }
  const finalUrl = response.url || redirectChain[redirectChain.length - 1]?.url || url;
  const extraNotes = [];
  const contentType = String(response.headers?.get?.("content-type") || "");
  if (contentType && !/html|xml/i.test(contentType)) {
    extraNotes.push(`response content-type was ${contentType.split(";")[0].trim()}; extraction may be unreliable`);
  }
  const MAX_HTML_CHARS = 5_000_000;
  let html = await response.text();
  if (html.length > MAX_HTML_CHARS) {
    html = html.slice(0, MAX_HTML_CHARS);
    extraNotes.push(`page exceeded ${MAX_HTML_CHARS} characters; extraction used the truncated beginning`);
    if (technical) {
      extraNotes.push("technical: extraction ran on truncated HTML; the tag inventory may be incomplete");
    }
  }

  // The technical snapshot needs only what the one page fetch already
  // produced: the final response headers and the redirect chain.
  let technicalInput;
  if (technical) {
    if (!redirectChain.length) redirectChain = [{ url: finalUrl, status: response.status }];
    technicalInput = {
      headers: captureHeaders(response.headers),
      redirectChain,
    };
  }

  const now = new Date().toISOString();
  const { files, summary } = buildBundle({
    url: finalUrl,
    html,
    now,
    cliVersion: VERSION,
    extraNotes,
    technical: technicalInput,
    includeContent,
  });
  const outDir = flagString(flags, "out", "") || defaultOutDir(finalUrl);
  const { dir } = await writeBundle(outDir, files, { force: flagBool(flags, "force", false) });

  const payload = {
    url: finalUrl,
    out: dir,
    okf_version: "0.1",
    credits: 0,
    concepts: summary.conceptCount,
    content: Boolean(summary.content),
    technical: Boolean(summary.technical),
    files: summary.files,
    notes: summary.notes,
  };
  output(io.stdout, flags, payload, (data) => {
    io.stdout.write(`${theme.accent("OKF bundle created")}\n\n`);
    const conceptLabel =
      data.content && data.technical
        ? "content + technical (what AI crawlers see without running JS)"
        : data.technical
          ? "technical (what AI crawlers see without running JS)"
          : "content";
    printKeyValue(
      io.stdout,
      [
        ["URL", theme.info(data.url)],
        ["Output", data.out],
        ["Concepts", conceptLabel],
        ["Files", String(data.files.length)],
        ["Credits", "0 (ran locally, no account needed)"],
      ],
      theme,
    );
    if (data.notes && data.notes.length) {
      io.stdout.write(`\n${theme.muted(`note: ${data.notes.join("; ")}`)}\n`);
    }
    printNextCommands(
      io.stdout,
      [
        `sleepwalker okf export ${shellQuote(data.url)} --json`,
        `sleepwalker ci score ${shellQuote(data.url)}  # engine-grade analysis (account + credits)`,
      ],
      theme,
    );
  });
}

export async function runCli(argv, io) {
  const { positional, flags } = parseFlags(argv);
  io.theme = createTheme({ env: io.env, stdout: io.stdout });
  const command = positional[0];
  const rest = positional.slice(1);

  if (flagBool(flags, "version") || command === "version") {
    io.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "commands" || flagBool(flags, "help-all") || (command === "help" && rest[0] === "commands")) {
    io.stdout.write(renderCommandsHelp(io.theme));
    return;
  }
  if ((!command && isInteractiveSession(io, flags)) || command === "menu") {
    await handleInteractiveMenu(flags, io);
    return;
  }
  if (!command || flagBool(flags, "help") || command === "help") {
    io.stdout.write(renderHelp(io.theme, readSetupState(io)));
    return;
  }

  try {
    if (command === "init") {
      await handleInit(flags, io);
    } else if (command === "config") {
      await handleConfig(rest, flags, io);
    } else if (command === "doctor") {
      await handleDoctor(flags, io);
    } else if (command === "auth") {
      await handleAuth(rest, flags, io);
    } else if (command === "credits" || command === "usage") {
      await handleUsage(flags, io);
    } else if (command === "activity") {
      await handleActivity(rest, flags, io);
    } else if (command === "tests") {
      await handleTests(rest, flags, io);
    } else if (command === "reports") {
      await handleReports(rest, flags, io);
    } else if (command === "page") {
      await handlePage(rest, flags, io);
    } else if (command === "visibility") {
      await handleVisibility(rest, flags, io);
    } else if (command === "ci" || command === "content") {
      await handleCi(rest, flags, io);
    } else if (command === "okf") {
      await handleOkf(rest, flags, io);
    } else {
      throw makeError(`Unknown command: ${command}. Run \`sleepwalker --help\`.`);
    }
  } catch (error) {
    if (error instanceof SleepwalkerApiError && flagBool(flags, "json")) {
      printJson(io.stdout, {
        error: error.message,
        status: error.status,
        payload: error.payload,
      });
    } else if (error && error.payload && flagBool(flags, "json")) {
      printJson(io.stdout, error.payload);
    }
    throw error;
  }
}

export async function main(argv, io) {
  await runCli(argv, io);
}
