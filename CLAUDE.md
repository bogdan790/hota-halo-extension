# hota-halo-extension — notes for Claude Code

Read `AGENTS.md` first (project rules + the SDK's own `node_modules/@ham2k/extension-sdk/AGENTS.md`), then
**`docs/SESSION-LOG.md`** — the project's memory: what was done, what was decided, what Sebastián said, how to resume
on a new machine. The original brief (Romanian) is `docs/BRIEF.ro.md`. Keep the log updated at the end of every session.
`npm run check` is the whole gate (typecheck + vitest + build + pack). Tests run against the fake
extension kernel in `test/kernel.ts`. Strings go in `src/i18n/en.json` **and** `ro.json`.

## State on 2026-09-04 — project still in progress
- Published: GitHub release v0.1.2 (`yo3bee-hota-0.1.2.h2kext` attached); npm `hota-halo-extension@0.1.2` (0.1.1 was never published; Bogdan runs `npm publish` from an interactive terminal).
  Scoring fix `d4236c7` (distinct callsigns, POTA-style dupes) is on `main` but **not yet released** → released as v0.1.2 on 2026-09-04.
  npm publish must be run by Bogdan from an interactive terminal (npm 2FA via passkey).
- Verified on a real Ham2K Logger (halo-next 26.9.0 build 160, Linux): data file loads (`rootPath: "references"`
  confirmed), search, operation title, activation counter, ADIF export. See `docs/TEST-REPORT-2026-09-03.md`
  and `docs/BETA-TEST-PLAN.md` (steps marked ✅ verified / ⏳ pending / ⚠ verify).
- Known: on that build "Install from file…", the `.h2kext` launch argument and drag & drop showed no install dialog;
  manual unzip into `~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/` works. Report to Sebastián.
- **Self-spot works end-to-end** since 2026-09-04 (halo-next 26.9.0 build 162): the per-user integration key
  (`X-Integration-Key`, scope `POST /spots` + `GET /me/summary`, My Account → Integration API key) is live on
  cqhota.app. Account test, self-spot, QSY, QRT and the spots feed verified — `docs/TEST-REPORT-2026-09-04.md`.
- Open: the SPOTS row shows a tree glyph instead of `castle` (Sebastián: icons are MDI names or `fa-` Font Awesome);
  `.h2kext` install dialog still missing on Linux (162 fixed Windows only).
- Not yet exercised on the device: re-spot, tap-on-spot, hunter export, ADIF import, H2H on a logged QSO, offline.

## Local dev environment (Bogdan's workstation)
- HaLo AppImage needs glibc 2.38; Ubuntu 22.04 host → runs in distrobox `halo` (Ubuntu 24.04, created with `--nvidia`):
  `distrobox enter halo -- ~/Applications/halo-next/AppRun`. Desktop entry "Ham2K Logger (Next)" + Desktop shortcut.
- Reinstall after a build: `cp build/index.js build/manifest.json ~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/`
  then restart the app (`pkill -f 'ham2k_logg[e]r'` — the bracket keeps pkill from matching its own shell).

## Design decisions worth keeping
- Extension key `yo3bee-hota`; ref types `hota` (hunted) / `hotaActivation`. Built on `referenceActivity`,
  `activityScorer` (wrapped in `src/scoring.ts`), `activityExportHook`, `huntingExportHook`, `activityAdifImport`.
- Scoring: dupes judged on day+band+mode (SDK `uniquePer`), activation tally = distinct callsigns per site per UTC
  day (`hotaScorer` in `src/scoring.ts`); a live QSO without `startAtMillis` is judged as of the app clock.
- Numeric search (`0235` → every country's -H0235, nearest first) queries the host both by position and by text and
  filters locally, because the host's `dbLookupSelectAll` match semantics are undocumented.
- Nothing from the API is hardcoded (countries, names, spot windows); the only program constant is `QSOS_TO_ACTIVATE = 5`.
- No own UI, no log upload, never touch the cqhota.app server from this repo.
