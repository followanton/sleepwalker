#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../bin/sleepwalker.js");

async function run(args, { env = process.env } = {}) {
  const label = `sleepwalker ${args.join(" ")}`;
  process.stdout.write(`\n> ${label}\n`);
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: { ...env, NO_COLOR: "1" },
    maxBuffer: 1024 * 1024 * 8,
  });
  if (stdout.trim()) {
    process.stdout.write(`${stdout.trim()}\n`);
  }
  if (stderr.trim()) {
    process.stderr.write(`${stderr.trim()}\n`);
  }
}

async function main() {
  await run(["--help"]);

  if (!process.env.SLEEPWALKER_API_KEY) {
    process.stdout.write("\nNo SLEEPWALKER_API_KEY set. Live read smoke skipped.\n");
    process.stdout.write("Set SLEEPWALKER_API_KEY to smoke-test the hosted API without spending credits.\n");
    return;
  }

  await run(["doctor", "--json"]);
  await run(["credits", "--json"]);
  await run(["tests", "list", "--limit", "1", "--json"]);
  await run(["activity", "list", "--limit", "1", "--json"]);

  if (process.env.SLEEPWALKER_CLI_SMOKE_WRITE === "1") {
    const url = process.env.SLEEPWALKER_CLI_SMOKE_WRITE_URL || "https://www.sleepwalker.ai";
    await run(["page", "serialize", url, "--max-chars", "1000", "--json"]);
  } else {
    process.stdout.write("\nWrite smoke skipped. Set SLEEPWALKER_CLI_SMOKE_WRITE=1 to include a billable action.\n");
  }
}

main().catch((error) => {
  process.stderr.write(`\nSmoke failed: ${error.message}\n`);
  if (error.stdout) {
    process.stderr.write(`${error.stdout}\n`);
  }
  if (error.stderr) {
    process.stderr.write(`${error.stderr}\n`);
  }
  process.exitCode = 1;
});
