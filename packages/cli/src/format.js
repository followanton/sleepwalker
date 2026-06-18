import { createTheme, sanitizeTerminalText, styleStatus } from "./theme.js";

export function printJson(stdout, value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function asList(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function printKeyValue(stdout, rows, theme = createTheme({ stdout })) {
  const visibleRows = rows.filter((row) => row && row[1] !== undefined && row[1] !== null && row[1] !== "");
  const width = Math.max(...visibleRows.map(([key]) => String(key).length), 0);
  for (const [key, value] of visibleRows) {
    stdout.write(`${theme.muted(String(key).padEnd(width))}  ${value ?? ""}\n`);
  }
}

function valueCount(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean).length;
  }
  return 0;
}

function valueLabel(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTerminalText(item)).join(", ");
  }
  return sanitizeTerminalText(value);
}

function hasNonZeroCreditValue(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) || numeric !== 0;
}

function billingRows(run, theme) {
  const billing = run.billing && typeof run.billing === "object" ? run.billing : {};
  const rows = [];
  const estimated = run.estimated_credits || billing.estimated_credits;
  const reserved = run.reserved_credits || billing.reserved_credits;
  const settled = run.settled_credits || billing.settled_credits;
  const released = run.released_credits || billing.released_credits;
  const status = run.billing_status || billing.status;
  if (estimated) {
    rows.push(["Estimated credits", theme.info(estimated)]);
  }
  if (reserved) {
    rows.push(["Reserved credits", theme.warning(reserved)]);
  }
  if (settled) {
    rows.push(["Settled credits", theme.accent(settled)]);
  }
  if (hasNonZeroCreditValue(released)) {
    rows.push(["Released credits", theme.info(released)]);
  }
  if (status) {
    rows.push(["Billing", styleStatus(theme, status)]);
  }
  return rows;
}

export function printNextCommands(stdout, commands, theme = createTheme({ stdout })) {
  const visible = asList(commands).filter(Boolean);
  if (!visible.length) {
    return;
  }
  stdout.write(`\n${theme.accent("Next")}\n`);
  for (const command of visible) {
    stdout.write(`  ${theme.command(command)}\n`);
  }
}

export function printRunSummary(stdout, payload, type, theme = createTheme({ stdout }), options = {}) {
  const run = payload || {};
  const id = run.run_id || run.id;
  const platforms = run.platforms || run.platform || run.ai_platforms;
  const promptCount = run.prompt_count || run.prompts_count || valueCount(run.prompts);
  const platformCount = run.platform_count || valueCount(platforms);
  const probeCount = run.probe_count || run.total_probes || run.summary?.total_probes || valueCount(run.probes);
  const rows = [
    ["Type", type],
    ["Run ID", id ? theme.id(id) : "unknown"],
    ["Status", styleStatus(theme, run.status || "unknown")],
    ["URL", run.url ? theme.info(run.url) : ""],
    ["Target", sanitizeTerminalText(run.target_entity || run.brand_name || run.target || "")],
    ["Platforms", valueLabel(platforms) || ""],
    ["Prompts", promptCount || ""],
    ["Platform count", !platforms && platformCount ? platformCount : ""],
    ["Probes", probeCount || ""],
  ];
  rows.push(...billingRows(run, theme));
  if (run.skipped_probe_count) {
    rows.push(["Skipped probes", theme.warning(run.skipped_probe_count)]);
  }
  printKeyValue(stdout, rows, theme);
  printNextCommands(stdout, options.nextCommands, theme);
}

export function printList(stdout, items, render) {
  if (!items.length) {
    stdout.write("No records found.\n");
    return;
  }
  for (const item of items) {
    stdout.write(`${render(item)}\n`);
  }
}
