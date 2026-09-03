// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// What it takes to activate a HOTA site, as the SDK's activity scorer
// understands it. The server remains the authority when the log is uploaded;
// this is the live counter on the logging screen ("HOTA 3/5").

import type { ActivityScoringRules } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.js"
import { ACTIVATION_TYPE, HUNTING_TYPE, ICON, PROGRAM, QSOS_TO_ACTIVATE } from "./program.js"

export const HOTA_SCORING: ActivityScoringRules = {
  label: PROGRAM,
  icon: ICON,
  activationType: ACTIVATION_TYPE,
  huntingType: HUNTING_TYPE,
  qsosToActivate: QSOS_TO_ACTIVATE,
  // A site sits inside a castle that is also a monastery: an operation may
  // carry more than one HOTA reference, and a hunted QSO may credit more than
  // one. Each reference still needs its own five callsigns.
  allowsMultipleReferences: true,
  // The rule is five DISTINCT CALLSIGNS per UTC day, any band, any mode. So a
  // station already worked today counts again only tomorrow — a new band or
  // mode does not make it a new contact for HOTA. (A repeat with a station
  // now at a DIFFERENT HOTA site is also a dupe for the counter; the ADIF
  // export still writes both HOTA-to-HOTA records, and the server credits
  // both on upload.)
  uniquePer: ["day"],
  activates: "daily",
  refNoun: (ctx) => tFor(ctx)("referenceNoun"),
  refNounPlural: (ctx) => tFor(ctx)("referenceNounPlural"),
  p2pLabel: (ctx) => tFor(ctx)("h2hLabel"),
}
