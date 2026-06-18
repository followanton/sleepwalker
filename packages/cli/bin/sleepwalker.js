#!/usr/bin/env node

import { main } from "../src/cli.js";

main(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  fetch: globalThis.fetch,
}).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`Sleepwalker CLI error: ${message}\n`);
  process.exitCode = typeof error.exitCode === "number" ? error.exitCode : 1;
});
