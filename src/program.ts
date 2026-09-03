// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// The constants the whole extension agrees on. Everything that comes from
// the HOTA API (countries, reference names, spot windows) stays OUT of this
// file on purpose: the only program rule an extension may carry is the one
// the program itself defines, and HOTA defines exactly one — five distinct
// callsigns make an activation.

import manifest from "../manifest.json" with { type: "json" }

/// The extension key, and the `category` under which the reference list is
/// stored in the host's lookup database. Must match the data file's category.
export const EXTENSION_KEY = manifest.key
export const CATEGORY = manifest.key

/// Two reference types, because they are two different claims about the same
/// site: the one the OPERATION is at (activating), and the one the OTHER
/// station is at (hunted, on the QSO). Named after the program, like `pota`
/// and `potaActivation`.
export const HUNTING_TYPE = "hota"
export const ACTIVATION_TYPE = "hotaActivation"

/// The ADIF `SIG` value cqhota.app parses, and the stem of its `*_REF` fields
/// (`MY_HOTA_REF`, `HOTA_REF`).
export const PROGRAM = "HOTA"
export const ADIF_REF_FIELD = "HOTA"

/// The public API. Every GET is public; writes need the operator's own key.
export const SITE_URL = "https://cqhota.app"
export const API_BASE = `${SITE_URL}/api/v1`

/// The one program constant: an activation is valid with at least this many
/// QSOs with DISTINCT callsigns per reference per UTC day, any band or mode.
export const QSOS_TO_ACTIVATE = 5

export const ICON = manifest.icon
export const COLOR = manifest.accentColor
