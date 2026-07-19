const RESET = "\u001b[0m";

const CODES = {
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[38;2;34;197;94m",
  greenSoft: "\u001b[38;2;186;247;203m",
  purple: "\u001b[38;2;167;139;250m",
  blue: "\u001b[38;2;96;165;250m",
  cyan: "\u001b[38;2;34;211;238m",
  yellow: "\u001b[38;2;245;158;11m",
  orange: "\u001b[38;2;249;115;22m",
  red: "\u001b[38;2;239;68;68m",
  muted: "\u001b[38;2;148;163;184m",
};

const WORDMARK = [
  String.raw`     _                              _ _`,
  String.raw` ___| | ___  ___ _ ____      ____ _| | | _____ _ __`,
  "/ __| |/ _ \\/ _ \\ '_ \\ \\ /\\ / / _` | | |/ / _ \\ '__|",
  String.raw`\__ \ |  __/  __/ |_) \ V  V / (_| | |   <  __/ |`,
  String.raw`|___/_|\___|\___| .__/ \_/\_/ \__,_|_|_|\_\___|_|`,
  String.raw`                |_|`,
].join("\n");

function shouldUseColor(env, stdout) {
  if (env.NO_COLOR !== undefined) {
    return false;
  }
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") {
    return true;
  }
  return Boolean(stdout && stdout.isTTY);
}

function wrap(enabled, code, value) {
  const text = sanitizeTerminalText(value);
  return enabled ? `${code}${text}${RESET}` : text;
}

export function sanitizeTerminalText(value) {
  return String(value ?? "").replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

export function createTheme({ env = process.env, stdout = process.stdout } = {}) {
  const enabled = shouldUseColor(env, stdout);
  return {
    enabled,
    bold: (value) => wrap(enabled, CODES.bold, value),
    dim: (value) => wrap(enabled, CODES.dim, value),
    accent: (value) => wrap(enabled, CODES.green, value),
    accentSoft: (value) => wrap(enabled, CODES.greenSoft, value),
    ci: (value) => wrap(enabled, CODES.purple, value),
    info: (value) => wrap(enabled, CODES.blue, value),
    id: (value) => wrap(enabled, CODES.cyan, value),
    warning: (value) => wrap(enabled, CODES.yellow, value),
    orange: (value) => wrap(enabled, CODES.orange, value),
    error: (value) => wrap(enabled, CODES.red, value),
    muted: (value) => wrap(enabled, CODES.muted, value),
    command: (value) => wrap(enabled, CODES.purple, value),
  };
}

export function styleStatus(theme, status) {
  const value = String(status || "unknown");
  const normalized = value.toLowerCase();
  if (["completed", "settled", "succeeded", "success", "operational"].includes(normalized)) {
    return theme.accent(value);
  }
  if (["queued", "running", "partially_queued", "pending"].includes(normalized)) {
    return theme.warning(value);
  }
  if (["released", "skipped", "cancelled"].includes(normalized)) {
    return theme.info(value);
  }
  if (["failed", "fail", "errored", "error", "denied", "site_error", "blocked"].includes(normalized)) {
    return theme.error(value);
  }
  return theme.muted(value);
}

export function renderWelcome(theme, options = {}) {
  const hasApiKey = Boolean(options.hasApiKey);
  const apiKeySource = options.apiKeySource || "missing";
  const apiBaseUrl = options.apiBaseUrl || "https://api.sleepwalker.ai";
  const configError = options.configError || "";
  const command = (value) => theme.command(value);
  const section = (value) => theme.accent(value);
  const muted = (value) => theme.muted(value);
  return `${theme.accent(WORDMARK)}
${theme.accent("Sleepwalker")} ${theme.ci("CLI")} ${theme.muted("command line")}
${theme.muted("AI Visibility | Content Intelligence | MCP | API | CLI")}

${section("Start here")}
${configError ? `  ${theme.warning("Config needs attention:")} ${configError}\n` : ""}${hasApiKey
    ? `  ${theme.accent("API key detected")} ${muted(`(${apiKeySource})`)}
  ${command("sleepwalker menu")}          Open the interactive command menu.
  ${command("sleepwalker doctor")}        Check account, API reachability, and credits.
  ${command("sleepwalker credits")}       Show prepaid credits.
`
    : `  ${command("sleepwalker init")}          Follow the setup checklist.
  ${command("sleepwalker auth key set <api_key>")}
  ${command("sleepwalker doctor")}        Check the connection.
`}

${hasApiKey
    ? `${section("Common workflows")}
  ${command("sleepwalker page serialize <url>")}
  ${command("sleepwalker visibility run <url>")} ${muted("--brand <brand> --prompt <prompt> --platform <platform>")}
  ${command("sleepwalker ci run <url>")} ${muted("[--depth score|full] [--watch]")}
  ${command("sleepwalker reports by-url <url>")}
`
    : `${section("After setup")}
  ${command("sleepwalker commands")}      Choose an action once the CLI is authenticated.
`}

${section("More")}
${hasApiKey ? `  ${command("sleepwalker commands")}      Show every command and option.\n` : ""}  ${command("sleepwalker config show")}   Show local configuration.

${section("API base")}
  ${theme.info(apiBaseUrl)}
`;
}

export function renderCommandsHelp(theme) {
  const command = (value) => theme.command(value);
  const section = (value) => theme.accent(value);
  const muted = (value) => theme.muted(value);
  return `${theme.accent(WORDMARK)}
${theme.accent("Sleepwalker")} ${theme.ci("CLI")} ${theme.muted("command reference")}

${section("Usage")}
  ${command("sleepwalker <command> [options]")}

${section("Setup")}
  ${command("sleepwalker menu")}
  ${command("sleepwalker init")}
  ${command("sleepwalker auth key set <api_key>")}
  ${command("sleepwalker auth key show")}
  ${command("sleepwalker auth key clear")}
  ${command("sleepwalker auth whoami")}
  ${command("sleepwalker doctor")}
  ${command("sleepwalker config show")}
  ${command("sleepwalker config set api-base-url <url>")}
  ${command("sleepwalker config clear api-base-url")}

${section("Read")}
  ${command("sleepwalker credits")}
  ${command("sleepwalker usage")} ${muted("[--recent-limit 20]")}
  ${command("sleepwalker activity list")} ${muted("[--limit 10] [--kind all]")}
  ${command("sleepwalker tests list")} ${muted("[--limit 20] [--type ai_citations|content_intelligence]")}
  ${command("sleepwalker reports by-url <url>")} ${muted("[--type ai_citations|content_intelligence]")}

${section("Local (free, no account, no credits)")}
  ${command("sleepwalker okf export <url>")} ${muted("[--content | --technical] [--out <dir>] [--force]  build an Open Knowledge Format bundle on your machine")}

${section("Actions")}
  ${command("sleepwalker page serialize <url>")} ${muted("[--max-chars 4000] [--offset 0]")}
  ${command("sleepwalker visibility suggest-prompts <url>")} ${muted("--brand <brand>")}
  ${command("sleepwalker visibility models")} ${muted("list selectable AI models per platform with credit prices")}
  ${command("sleepwalker visibility run <url>")} ${muted("--brand <brand> --prompt <prompt> --platform <platform> [--model <platform=model|latest|prior>] [--watch] [--idempotency-key <key>]")}
  ${command("sleepwalker visibility status <run_id>")} ${muted("[--results]")}
  ${command("sleepwalker visibility list")} ${muted("[--limit 20] [--status queued|running|completed|failed]")}
  ${command("sleepwalker ci score <url>")}
  ${command("sleepwalker ci run <url>")} ${muted("[--depth score|full] [--watch] [--idempotency-key <key>]")}
  ${command("sleepwalker ci status <run_id>")} ${muted("[--result]")}
  ${command("sleepwalker ci list")} ${muted("[--limit 20] [--status queued|running|completed|failed]")}

${section("Global options")}
  ${theme.info("--json")}          Print raw JSON responses.
  ${theme.info("--help")}          Show help.
  ${theme.info("--version")}       Show version.

${section("Environment")}
  ${theme.info("SLEEPWALKER_API_KEY")}       API key from the Sleepwalker Console.
  ${theme.info("SLEEPWALKER_API_BASE_URL")}  API base URL. Defaults to https://api.sleepwalker.ai.
`;
}

export function renderHelp(theme, options = {}) {
  return renderWelcome(theme, options);
}
