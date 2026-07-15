# Credits

Sleepwalker uses prepaid credits for billable actions.

Read-only actions are normally unmetered. Billable actions use the same credit
behavior across the app, API, MCP, and CLI.

Examples of billable actions:

- page serialization;
- prompt suggestions;
- AI Visibility runs;
- Content Intelligence scoring;
- Content Intelligence runs.

Credits for an AI Visibility run are reserved when the run is queued.
Cancelling a run releases the reserved credits of probes that did not start;
probes that already ran settle normally.

Credits are managed in the hosted app:

```text
https://app.sleepwalker.ai
```

For the full credit lifecycle, see:

```text
https://www.sleepwalker.ai/docs/billing/credits/
```
