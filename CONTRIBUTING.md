# Contributing

This repository is the public developer surface for Sleepwalker client tools
and examples.

Good contributions include:

- CLI usability fixes;
- public API examples;
- MCP client setup examples;
- documentation improvements;
- bug reports with reproducible public-client behavior.

Please do not submit:

- secrets or real API keys;
- private deployment configuration;
- provider/model routing assumptions;
- backend implementation guesses;
- generated files such as `node_modules/` or local config files.

Run checks before opening a pull request:

```bash
cd packages/cli
npm ci
npm test
npm run smoke
npm pack --dry-run
```
