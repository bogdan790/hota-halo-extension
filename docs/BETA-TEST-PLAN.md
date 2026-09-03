# HOTA extension — beta integration test plan

A step-by-step scenario for integrating `yo3bee-hota` into a HaLo beta. Each
step says what to do and what should happen. Where the extension depends on
a host behaviour the SDK documents but this project could not observe, the
step is marked **⚠ verify** — those are the ones worth watching first.

Everything below runs against the live, public `cqhota.app` API. The
reference list is a few hundred KB; the spot feed is small.

## 0. Build and pack

```sh
git clone https://github.com/bogdan790/hota-halo-extension
cd hota-halo-extension
npm install
npm run check
```

Expected: typecheck clean, 95 tests green, `yo3bee-hota-0.1.0.h2kext` in the
project root, packer output listing one domain: `cqhota.app`.

## 1. Install

**Settings → Extensions → Install from file…** → the `.h2kext`, or drag the
file onto the app window.

Observed on Linux (26.9.0 build 160, run inside a distrobox): neither the file
chooser nor the `.h2kext` command-line argument produced an install dialog.
Unzipping the bundle by hand into the app's extension directory worked — the
app picks it up on restart and lists it as *Installed*:

```sh
mkdir -p ~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota
unzip yo3bee-hota-0.1.0.h2kext -d ~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota
```

Expected: the consent sheet lists `cqhota.app`; after the runtime restarts,
*HOTA — History On The Air* appears under Activities, enabled, with the
`castle` icon.

## 2. Reference list

**Settings → Data files** (or wherever the build lists them).

Expected: *HOTA references* is listed, downloads, and reports a count around
500 (the export's `count` on 2026-09-03 was 490).

**✅ verified 2026-09-03** on halo-next 26.9.0 (160), Linux: the list loads and
`jsonOptions.rootPath: "references"` is the right spelling — `0123` resolves
to *RO-H0123 · Princely Court Piatra Neamț · NT*.

## 3. Add a site to an operation

New operation → Activities → search.

| Type | Expect |
| --- | --- |
| `0235` | `HOTA RO-H0235: Râșnov Citadel`, plus `PL-H0235` and `HU-H0235`; with location on, nearest first |
| `roh235` | exactly `RO-H0235` |
| `RO-H02` | Romanian sites whose number starts with 02 |
| `Râșnov` or `castle` | name matches, through the host's search |
| *(nothing)* | sites near the operation's location / station grid |

Pick one. Expected: the operation row shows *at RO-H0235* with *Râșnov
Citadel* beneath; the row's web button opens `https://cqhota.app/ref/RO-H0235`.

Type a code by hand into the *HOTA site* control: `ro-h235`. Expected:
accepted and shown as `RO-H0235`. Type `RO-0031` (a POTA code). Expected:
tinted as not matching, and if kept, decorated *Not a HOTA reference*.

**⚠ verify** — the numeric shortcut is served by two host queries, by
position and by text, and filtered here; only the text half works with
location off. If `0235` returns nothing with location off, the host's text
search does not substring-match keys — the position query still covers the
activator-at-the-site case.

## 4. Log and watch the counter

Log five QSOs with five different callsigns, any band, any mode.

| After | Expect |
| --- | --- |
| 4 QSOs | `HOTA: 4 QSOs` with summary `4/5` |
| a 5th with a *repeated* callsign | still `4/5`; the QSO flagged *duplicate* |
| the same repeat on another band | still a duplicate — HOTA counts callsigns, not band-slots |
| a 5th distinct callsign | `5 ✓` — activated |
| the same station tomorrow (UTC) | counts again, with a *new day* notice |

Add a second site (n-fer). Expected: the counter shows the *lowest* of the
two, and the long summary lists each with ✅/❌.

Log a QSO and put `RO-H0142` in *HOTA site (theirs)*. Expected: the summary
mentions *1 HOTA-to-HOTA QSO*; the QSO scores 2.

## 5. Spots

Open the Spots panel with the HOTA source on.

Expected: rows from `GET https://cqhota.app/api/v1/spots`, each showing
`RO-H0142: Râșnov Citadel — <comment>`, with the site as a `hota` ref so
tapping one fills the hunted-site field. A spot whose comment contains `QRT`
never appears. (The feed is often empty outside activations; a test spot can
be posted from the cqhota.app web app.)

Tap **spot myself** with no account. Expected: a dialog *Connect your
cqhota.app account to post HOTA spots* with a *Connect* button opening the
Accounts panel.

**Settings → Accounts & Services → HOTA**: paste the integration API key
generated at cqhota.app → **My Account → Integration API key**, tap test.
Expected: `✅ Connected as <CALL>`; a wrong key says *cqhota.app rejected this
integration key*.

**⏳ pending server side** — the integration key (`X-Integration-Key`, scoped
to `POST /api/v1/spots` and `GET /api/v1/me/summary`) is being added to
cqhota.app; until it is deployed the account cannot be connected and the
spot-posting steps below wait. Everything else in this plan works without it.

Spot yourself on 14.062 CW with a comment. Expected: *Spotted on HOTA at
RO-H0235*; the spot appears on cqhota.app's Spots page within seconds.
Spot again on another site within 20 s. Expected: the server's own refusal
repeated verbatim (*too many new spots — wait 20 seconds…*). Spot on
99.999 MHz. Expected: *frequency … outside known ham bands*.

Work a station that has a `hota` ref on the QSO and tap **re-spot**.
Expected: `POST /api/v1/spots` with `source: respot` and `for_activator`
set to their call; *Re-spotted <CALL> on HOTA at <REF>*.

**⚠ verify** — the integration key reaches the spots hook through
`ctx.account.credentials.apiKey`. If the host only injects `ctx.account`
into the `account` hook's own extension for *some* categories, posting will
always ask to connect; `apiKeyFrom()` in `src/account.ts` is the single
place to adapt.

**✅ verified 2026-09-03**: scoped search `yo3bee-hota: 0123` → the site with
name and county; the operation is titled *YO3BEE at RO-H0123 / Princely Court
Piatra Neamț*.

## 6. Export, then upload

Exports panel. Expected options:

- **ADIF for HOTA RO-H0235** — `2026-09-03 YO3BEE at RO-H0235.adi`
  (`YO3BEE@RO-H0235-20260903.adi` with compact names), selected by default,
  one per activated site.
- For an operation with hunted HOTA refs but no activation: **ADIF for HOTA
  hunter**.

**✅ verified 2026-09-03**: option *ADIF for HOTA RO-H0123*, file
`2026-09-03 YO3BEE at RO-H0123.adi`, every record carrying
`<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0123<MY_HOTA_REF:8>RO-H0123`.

Open the file. Expected on every record:

```
<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0235<MY_HOTA_REF:8>RO-H0235
```

and on a HOTA-to-HOTA record additionally:

```
<SIG:4>HOTA<SIG_INFO:8>RO-H0142<HOTA_REF:8>RO-H0142
```

A QSO with two hunted sites is two records, one second apart. A POTA n-fer
running alongside contributes nothing to this file (and HOTA contributes
nothing to the POTA file); the full ADIF export carries both.

Upload the file at **cqhota.app → Log → Upload ADIF**. Expected: the
activation is recognised (`reference: RO-H0235`, `valid: true` with ≥ 5
callsigns) and the HOTA-to-HOTA contact credited.

## 7. Import

Download that activation's ADIF back from cqhota.app (*My activations*) and
import it. Expected: an operation *at RO-H0235*, with the hunted site on the
right QSO — and nothing from `MY_POTA_REF` / `SIG=SOTA` lines claimed as
HOTA.

## 8. Offline

Airplane mode. Expected: search, decoration and scoring keep working from
the offline list; the Spots panel shows nothing from HOTA and logs nothing
alarming; a spot attempt reports the network, not a crash.

## What to report back

- Anything under **⚠ verify** that did not hold — those are host-contract
  guesses, each isolated to one function.
- The host's actual text-search semantics for `dbLookupSelectAll`, so the
  search can lean on it rather than around it.
- Whether a `submit`-style export hook is planned; `POST /api/v1/logs/adif`
  with the account key is ready to be bound to it.
