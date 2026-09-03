# HOTA — History On The Air, for the Ham2K Logger

An **activity extension** for the [Ham2K Logger](https://ham2k.com) (HaLo)
that brings [HOTA — History On The Air](https://cqhota.app) into the app:
historic sites over 200 years old, activated with five distinct callsigns in
a UTC day.

| | |
| --- | --- |
| **References** | The full HOTA list, downloaded from cqhota.app and kept offline. Type `0235` at a site and get every country's `-H0235`, nearest first. |
| **Spots** | The public HOTA spot feed in the Spots panel; self-spot and re-spot with your own cqhota.app API key. |
| **Scoring** | A live counter on the logging screen — `HOTA 3/5` — per reference, per UTC day. |
| **Exports** | One ADIF per activated site, in exactly the format cqhota.app's uploader reads. A hunter log for HOTA-to-HOTA contacts. |
| **Import** | HOTA references recovered from any ADIF that carries them, including cqhota.app's own exports. |

Extension key: `yo3bee-hota`. Reference types: `hotaActivation` (the site the
operation is at) and `hota` (the site the other station is at).

## Installing it

Grab `yo3bee-hota-<version>.h2kext` from the
[releases](https://github.com/bogdan790/hota-halo-extension/releases) (or
build one, below), then in the app: **Settings → Extensions → Install from
file…**. The app shows what the bundle asks for — one domain, `cqhota.app` —
before anything is written.

To post spots, add your cqhota.app API key under **Settings → Accounts →
HOTA**. The key is on your profile page at cqhota.app. Everything else — the
reference list, the spot feed — is public and needs no account.

## Building it

```sh
npm install
npm run check        # typecheck + tests + build + pack
```

`npm run build` writes `build/index.js` with the official
`@ham2k/extension-tools` preset; `npm run pack` turns `build/` into a
`.h2kext`. The packer is also the checker: it refuses anything that would
install and then misbehave.

```sh
npm test             # vitest, against a fake extension kernel (test/kernel.ts)
npm run test:watch
```

Requires Node 20+.

## How it is put together

The extension follows the SDK's own shape for an award program — most of the
reference handling, the logging controls and the ADIF fields are built by
`referenceActivity()` from one description, exactly as the SDK's `k2hrc-llota`
sample does. What HOTA adds is what HOTA *is*.

```
manifest.json      identity, hooks, the one domain it may reach
src/index.ts       registers every hook — nothing else
src/program.ts     the constants: key, ref types, API base, the 5-QSO rule
src/references.ts  pure: reference codes, search terms, export rows → lookup rows
src/activity.ts    referenceActivity() + the numeric search + repairing validation
src/scoring.ts     the activation rule, for the SDK's activityScorer
src/spots.ts       the spot feed, self-spot, re-spot
src/account.ts     the operator's cqhota.app API key (platform keychain)
src/dataFile.ts    the offline reference list
src/i18n.ts, src/i18n/*.json   every user-visible string, en + ro
test/kernel.ts     a fake __polo kernel: lookup table, scripted fetch, hook registry
test/*.test.ts     references, search, scoring, ADIF round-trip, spots, registration
docs/BETA-TEST-PLAN.md   the step-by-step scenario for a HaLo beta integration
```

### Hooks

| Category | Key | What it does |
| --- | --- | --- |
| `ref:hota`, `ref:hotaActivation` | `yo3bee-hota` | validates (and repairs: `ro-h235` → `RO-H0235`), decorates from the offline list, links to `cqhota.app/ref/<code>`, titles the operation "at RO-H0235" |
| `activity` | `yo3bee-hota` | the *HOTA site* control on the operation, the *HOTA site (theirs)* control per QSO, and the Activities search |
| `dataFile` | `yo3bee-hota-references` | `GET /api/v1/references/export`, refreshed by the host, one lookup row per site |
| `scoring` | `yo3bee-hota` | `contestScorer(activityScorer(HOTA_SCORING))`, scoped to operations with a HOTA ref |
| `adifFields` | `yo3bee-hota` | `MY_SIG`/`MY_SIG_INFO`/`MY_HOTA_REF` for the activation; `SIG`/`SIG_INFO`/`HOTA_REF` per hunted site, one record per site |
| `adifImport` | `yo3bee-hota` | the inverse: reads those fields back, repairing codes as it goes; never claims another program's `SIG` |
| `export` | `yo3bee-hota`, `yo3bee-hota-hunter` | one ADIF per activated site; a hunter log when nothing is being activated |
| `spots` | `yo3bee-hota` | `GET /api/v1/spots` → Spots panel; `POST /api/v1/spots` for self-spot (`source: self`) and re-spot (`source: respot`) |
| `account` | `yo3bee-hota` | the API key, one `secret` field, tested against `GET /api/v1/me` |

### The rules, and where they come from

**Nothing that the API can tell us is written down here.** Country codes,
names, coordinates, which sites are retired: all from the reference export.
Which spots are live, how long a spot lasts, what closes it (a `QRT` in the
comment), how often you may spot: the server decides and this extension
repeats its answer. The reference *pattern* — `XX-H` and four digits — is the
one shape assumption, and it deliberately does not enumerate countries.

**The one program constant** is `QSOS_TO_ACTIVATE = 5`: an activation is
valid with at least five QSOs with *distinct callsigns* per reference per UTC
day, on any band or mode. The scorer is configured `uniquePer: ["day"]`,
which is what makes a station already worked today a duplicate on any other
band or mode. cqhota.app remains the authority when the log is uploaded.

Known edge: a repeat QSO with a station now at a *different* HOTA site is a
dupe for the counter (it is the same callsign) even though the ADIF carries
both HOTA-to-HOTA records and the server credits both. Chosen so that the
activation counter never reads `5/5` on four callsigns.

### The numeric search

An activator standing at a site types its number. `0235` (or `235`) returns
every country's `-H0235`, nearest first when the app knows where you are;
`RO-H0235` in any spelling returns that site; `RO-H02` lists a country's
sites by prefix; anything else searches names through the host's own lookup.
Sites are fetched both by position (the host's nearby query) and by text, so
the shortcut does not depend on how the host's text search matches.

### Spots

The feed maps straight onto HaLo spots, each carrying a `hota` reference so
that tapping one fills the hunted-site field. A spot marked `ended`, or whose
latest comment contains the word `QRT`, is dropped at the source. Posting
needs the account; without one the operator is offered the *Connect* action.
A self-spot names the operation's first HOTA reference — the server spaces out
spots on different references, so an n-fer is announced one site at a time.
Coordinates are not sent with a spot, so the server's 500 m check does not
apply from here.

### ADIF

What the uploader at cqhota.app reads (from its API documentation):

```
<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0142<MY_HOTA_REF:8>RO-H0142       your site
<SIG:4>HOTA<SIG_INFO:8>RO-H0031<HOTA_REF:8>RO-H0031                theirs (HOTA-to-HOTA)
```

A contact with a station at two sites is written twice, a second apart, one
site per record — the same as park-to-park on two parks, and how cqhota.app
credits both. Other programs' fields (`MY_POTA_REF`, `SIG=SOTA`, …) belong to
their own extensions; the HOTA file claims only HOTA, and a full export lets
every extension contribute its own.

## What it does not do

- **No UI of its own.** The app renders the controls and panels; this
  extension describes them.
- **No upload.** The flow stays: HaLo exports the ADIF, the operator uploads
  it at cqhota.app. The SDK has no official "submit" hook today; if one lands,
  `POST /api/v1/logs/adif` with the account's key is the obvious binding, and
  it should be proposed rather than wired in quietly.
- **No changes to cqhota.app.** That is another repository, another flow.

## Contributing

`npm run check` is the whole gate. The business logic — reference parsing,
the search, scoring, ADIF in both directions, spot mapping — is covered by
tests that run against a fake kernel, so a rule change starts with a failing
test. Strings go in `src/i18n/en.json` and `ro.json`, both.

## License

MIT — see [LICENSE](LICENSE). The Ham2K extension SDK is MPL-2.0.
