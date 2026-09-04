# Test report — 2026-09-04 (v0.1.2, self-spot end-to-end)

Follow-up to `TEST-REPORT-2026-09-03.md`. Device: Ham2K Logger `halo-next 26.9.0 (162)`,
Linux (Ubuntu 24.04 distrobox on a 22.04 host). Extension: the v0.1.2 code
(scoring fixes `3b09018` + `d4236c7`), unzipped by hand into
`~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/`.

## What changed since 09-03

The per-user **integration key** went live on cqhota.app this afternoon:
`X-Integration-Key`, scoped to `POST /api/v1/spots` and `GET /api/v1/me/summary`,
generated under **My Account → Integration API key**. The extension had been
written against this contract since v0.1.1; nothing changed on the extension
side today.

## Handshake, verified with curl

| Request | Response |
| --- | --- |
| `GET /api/v1/me/summary` with no header | `401 {"error":"missing X-Api-Key or X-Integration-Key"}` — the message now names both accepted headers (server fix `ed9b28b`, a nit from this test) |
| `GET /api/v1/me/summary` with a made-up key | `403 {"error":"invalid integration key"}` |
| `GET /api/v1/me/summary` with the real key | `200 {"callsign":"YO3BEE", …, "auth":"integration_key"}` |
| `POST /api/v1/spots` with the real key, `source: self` | `201`, the spot on cqhota.app/spots within seconds |

The extension maps these exactly as `spots.test.ts` and `account.ts` expect:
401/403 → *cqhota.app rejected this integration key* with an **account** action;
200 → `✅ Connected as YO3BEE`.

## Manual, on the device

| Step | Result |
| --- | --- |
| Settings → Accounts & Services → **HOTA (cqhota.app)** → paste key → **Test** | ✓ *Connected as YO3BEE* → Save |
| New operation at `RO-H0123` (Princely Court Piatra Neamț), 20 m USB 14300 | ✓ operation titled *YO3BEE at RO-H0123*; HOTA button in the action row |
| **Spot myself** with a comment | ✓ *Spotted on HOTA at RO-H0123*; visible on cqhota.app/spots |
| Self-spot again after QSY (new frequency) | ✓ second spot, frequency updated |
| Self-spot with `QRT` in the comment | ✓ the server closes the activation; the HOTA feed drops the row |
| SPOTS panel, HOTA source | ✓ loads the live HOTA feed (`GET /api/v1/spots`); empty once the only spot was QRT |
| HOTA action-row button | ✓ present on operations carrying a HOTA site, absent otherwise (`spots.ts` eligibility) |
| One QSO logged during the test | ✓ scored, counter `1/5` |
| Install from file… / `.h2kext` argument / drag & drop | ✗ still no install dialog on Linux build 162 (Sebastián: 162 fixes Windows double-click, Linux not yet) |

Local reference table after the data-file refresh: 490 HOTA sites
(RO 276 · HU 101 · BG 88 · PL 24 · RS 1), category `yo3bee-hota`.

## Open item — spot icon

The manifest and every `Spot` returned by the feed carry `icon: "castle"`
(an MDI icon that exists). In the SPOTS panel the HOTA row renders with a
deciduous-tree glyph, while POTA rows show a pine tree and SOTA rows their
own icon. Sebastián's answer on icon names: any MDI icon by name
(pictogrammers.com/library/mdi) or any Font Awesome Free icon prefixed `fa-`.
So `castle` is a valid name; the tree looks like a fallback taken somewhere
else in the spot-row path (perhaps from the ref *type* rather than from
`Spot.icon`). Next step: try `fa-chess-rook` / `fa-fort-awesome` on the spot
rows to see whether `Spot.icon` is honoured at all, and ask where the row
picks its icon from.

## Status of the beta test plan

Confirmed today: §5 account connect, self-spot, QRT, feed. Still needs a
second operator on the air: tapping a spot to fill the hunted-site field,
explicit re-spot from a logged QSO, HOTA-to-HOTA credit on the device.
ADIF import (§7) and offline (§8) remain automated-only.
