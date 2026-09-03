# HOTA — History On The Air

An extension for the Ham2K Logger. How to write one, what the hooks are, and
what the sandbox will and will not let you do:

@node_modules/@ham2k/extension-sdk/AGENTS.md

## Project rules

- **Study the SDK first.** `node_modules/@ham2k/extension-sdk/AGENTS.md`, its
  `docs/hooks.md` and the `k2hrc-llota` sample are the reference. Follow the
  SDK's activity-extension shape; do not invent architecture.
- **Nothing hardcoded that the API provides**: countries, reference names,
  coordinates, spot windows, thresholds. The single program constant is
  `QSOS_TO_ACTIVATE = 5` in `src/program.ts`.
- **No secrets in the repo.** HOTA's GET endpoints are public; the operator's
  own API key lives in the platform keychain via the `account` hook.
- **TDD on business logic**: reference parsing and matching, scoring, ADIF in
  both directions, spot mapping. `npm run check` is the gate.
- **No UI of its own, no uploads to cqhota.app, no changes to the cqhota.app
  server** — that is a separate repository and flow.
- Every user-visible string goes in `src/i18n/en.json` **and** `ro.json`.
