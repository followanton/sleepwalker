import fs from "node:fs";

export function parseFlags(args) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--") || arg === "--") {
      positional.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [rawKey, inlineValue] = withoutPrefix.split(/=(.*)/s);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else {
        value = true;
      }
    }

    if (flags[key] === undefined) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else {
      flags[key] = [flags[key], value];
    }
  }

  return { positional, flags };
}

export function flagList(flags, name) {
  const value = flags[name];
  if (value === undefined || value === false) {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function flagString(flags, name, fallback = "") {
  const value = flags[name];
  if (value === undefined || value === true || value === false) {
    return fallback;
  }
  return Array.isArray(value) ? String(value[value.length - 1]) : String(value);
}

export function flagNumber(flags, name, fallback) {
  const value = flagString(flags, name, "");
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function flagBool(flags, name) {
  return Boolean(flags[name]);
}

export function readLinesFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
