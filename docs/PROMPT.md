# The prompt that built this extension

This is the brief Bogdan (YO3BEE) handed to Claude Code on 3 September 2026, translated from Romanian
(`docs/BRIEF.ro.md` is the original). It is shared here so that other award programs can follow the same
route. Replace the HOTA specifics — API, reference format, activation rule, ADIF fields — with your own;
the structure is what made it work: study the SDK first, hardcode nothing the API provides, test-drive the
program rules, and stay out of the app's UI.

What is *not* in the brief but mattered just as much: run the result on a real Ham2K Logger as soon as it
builds, and expect the first device run to find things the tests cannot (it found two).

---

## HOTA HaLo extension — implementation brief
(3 Sep 2026 — NEW project, separate repo `hota-halo-extension`, at the invitation of Sebastián Delmont / Ham2K)

### Context
HOTA — History On The Air (https://cqhota.app) is an on-the-air program for historic sites ≥ 200 years old.
Sebastián (author of Ham2K PoLo/HaLo) invited us to be the first trial of HaLo's extension system:
"ask it to write an activity extension for HaLo for the HOTA program, including spots, scoring and exports".

### Step 0 — study the SDK FIRST
- `@ham2k/extension-sdk` — https://www.npmjs.com/package/@ham2k/extension-sdk
- `@ham2k/extension-tools` — https://www.npmjs.com/package/@ham2k/extension-tools

Follow the SDK's "activity extension" shape exactly (lifecycle, manifest, the APIs HaLo exposes).
Do NOT invent your own architecture. Use the test harness from extension-tools if there is one.

### What the extension does
1. **References**: source = the public HOTA API (docs: https://cqhota.app/api-docs):
   - `GET https://cqhota.app/api/v1/references/export` (full CSV) or the equivalent JSON endpoint — local cache,
     periodic refresh (honour ETag/304 if the server offers it).
   - Search like POTA in PoLo: type "0235" → RO-H0235 with name + distance; suggestions sorted by distance from
     the GPS position; multi-country (RO-H / PL-H / HU-H / BG-H — the format is `XX-H\d{4}`, do NOT hardcode
     the countries).
2. **Spots**: read `GET /api/v1/spots` (poll every 1–2 min) + self-spot through the public spotting API (see
   api-docs; the rules: TTL, re-spot, a comment containing `\bQRT\b` closes the spot).
3. **Scoring** (shown live during the activation): a valid activation = **at least 5 QSOs with distinct
   callsigns** per reference per UTC day, any band/mode (no repeaters, satellite OK); H2H = both stations on
   HOTA references (same reference: detected automatically by the server; different references: the other
   station's reference field). The extension shows the counter (e.g. "HOTA 3/5"); the server remains the
   authority at upload.
4. **Export**: ADIF with `MY_SIG=HOTA` / `MY_SIG_INFO=<reference>`, and for H2H `SIG=HOTA` /
   `SIG_INFO=<their reference>` — exactly the format cqhota.app parses on upload. Multi-program: HaLo handles the
   other activities (POTA etc.) — the HOTA extension emits only the HOTA fields.

### Project rules
- Nothing hardcoded that comes from the API (country lists, thresholds, formats); only the 5-QSO rule is a
  program constant.
- No secrets in the repo (HOTA's public APIs need no key). MIT licence. README in English with setup +
  architecture.
- TDD: reference parsing, code matching (4 digits → suggestions), scoring (4 QSOs invalid / 5 valid / a
  duplicate of the same call does not count), ADIF generation (round-trip with the examples from the cqhota
  README).
- Deliverable: a publishable npm package + a step-by-step test scenario for Sebastián (HaLo beta integration).

### What you do NOT do
- No UI of your own (the UI is HaLo's, through the SDK).
- No log uploads to cqhota.app from the extension (the flow stays: HaLo exports ADIF → the operator uploads it
  on the site) — unless the SDK has an official "submit" hook, in which case document it as a proposal, do not
  implement it without an authenticated endpoint.
- Do not touch the cqhota.app server in any way — that is another repo, another flow.

---

## How the session actually went (for calibration)

- One evening, one Claude Code session, from the brief to a public GitHub release and an npm package:
  scaffold with `h2kext-init`, ~100 tests against a fake extension kernel, README, beta test plan.
- Sebastián's reply to the first link: "Test it on your logger. You know the program better." That step
  found two bugs the tests could not — a live QSO arrives without a timestamp, and the SDK's scorer counts
  contacts where HOTA counts callsigns — both fixed the same night, with tests.
- Where the host contract could not be observed (HaLo's own repo is not public), the extension flags it in
  the test plan as "verify" and isolates each guess in one function.
