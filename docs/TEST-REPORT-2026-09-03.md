# Test report — 2026-09-03 (v0.1.1 + scoring fix `d4236c7`)

## Automated — `npm run check` (typecheck + vitest + build + pack)

99 tests, all green, against the fake extension kernel in `test/kernel.ts`
(in-memory reference table, scripted `fetch`, hook registry). Plus a build with
the official `@ham2k/extension-tools` preset and a clean `h2kext-pack`.

| File | Tests | What it proves |
| --- | --- | --- |
| `references.test.ts` | 32 | code repair (`ro-h235` → `RO-H0235`), rejection of POTA/SOTA/LLOTA codes, search-term parsing (number / code / prefix / name), matching, export row → lookup row (active vs retired flag, grid, missing coordinate), distance ordering |
| `suggest.test.ts` | 15 | `0235` returns every country's `-H0235` nearest first; full code in any spelling; country prefix; retired sites never offered; name search; nearby with no term; validate/decorate/link/title of the ref handler; the two logging controls |
| `scoring.test.ts` | 17 | 4 callsigns → `4/5`; 5 → activated; repeat callsign is a dupe and does not count; **new band / new mode = contact, not dupe, counter unchanged**; next UTC day counts again; callsign variants are distinct; n-fer shows the lowest site; HOTA-to-HOTA credit, two sites = two credits but one callsign; pure hunter tally; live path: repeat while typing → *duplicate*, untimed QSO judged as of now, spots-panel batch |
| `adif.test.ts` | 13 | `MY_SIG/MY_SIG_INFO/MY_HOTA_REF` and `SIG/SIG_INFO/HOTA_REF`; two hunted sites → two records; hunter-only fields; import from a cqhota.app export record, from `*_REF` fields alone, repaired codes, other programs never claimed, positional answers; **export → import round trip** through a stand-in ADIF core; hunter log offered only when not activating; filenames normal and compact |
| `spots.test.ts` | 17 | live feed row (strings for numbers) → HaLo spot; QRT/`ended` dropped; malformed rows dropped; feed body parsing; self-spot / re-spot bodies exactly as the API documents; server refusals repeated verbatim; account action on 401/403; fetch offline / 503 / exception → `[]`; posting without a key never touches the network; `X-Integration-Key` header on posts; account test against `/me/summary` |
| `extension.test.ts` | 5 | registered hook categories == manifest `hooks`; keys the app looks up by; distributable manifest (callsign key, `activity`, one domain, no secrets); no private copy of any host library in the bundle; data file URL/rootPath/category |

Server side (repo HOTA.app, not yet deployed): 79 tests green, 7 of them new in
`src/tests/integration-keys.test.js` — valid key authenticates and sets
`req.user`; missing → 401, malformed/unknown → 403, suspended → 423; the
integration key cannot pass `requireApiKey` (account routes → 401);
regeneration invalidates the old hash instantly; scoped routes accept either
the integration key or the session, integration key deciding when both are sent.

## Manual — Ham2K Logger `halo-next 26.9.0 (160)`, Linux

Run inside an Ubuntu 24.04 distrobox (the AppImage needs glibc 2.38; host is
22.04) with NVIDIA passthrough.

| Step | Result |
| --- | --- |
| Install from file… / `.h2kext` as argument / drag & drop | ✗ no install dialog appeared on this build |
| Manual unzip into `~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/` | ✓ listed as *Installed*, enabled |
| Data file *HOTA references* | ✓ loads; `jsonOptions.rootPath: "references"` confirmed |
| Activities search `yo3bee-hota: 0123` | ✓ `HOTA RO-H0123 · Princely Court Piatra Neamț · NT` |
| Operation title | ✓ *YO3BEE at RO-H0123 / Princely Court Piatra Neamț* |
| Logging 8 QSOs (6 distinct callsigns, 2 repeats) | ✓ header `6 ✓`; Info: *HOTA: 6 activation QSOs*, *✅ RO-H0123: 6* |
| Repeat callsign while typing (same band/mode) | ✗ showed *New Day* → **fixed** (untimed live QSO judged as of now) → ✓ *Dupe!* |
| Repeat callsign on a new band | ✗ showed *Dupe!* → **fixed** (distinct-callsign counter, POTA-style dupes) → expect *New Band* — re-test pending |
| Exports panel | ✓ *ADIF for HOTA RO-H0123* + *Full ADIF Export*, file `2026-09-03 YO3BEE at RO-H0123.adi` |
| ADIF content | ✓ every record `<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0123<MY_HOTA_REF:8>RO-H0123` |
| Self-spot | ⏳ dialog *Connect your cqhota.app account* → account form with the new text; blocked until the integration key ships on cqhota.app |

## Not yet exercised on the device

Spots panel feed (no live HOTA spot at test time), re-spot, hunter ADIF export,
ADIF import, HOTA-to-HOTA on a logged QSO, n-fer on the device, offline mode.
All covered by the automated suite; see `BETA-TEST-PLAN.md` §5–§8.
