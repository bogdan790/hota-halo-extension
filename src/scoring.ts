// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// What it takes to activate a HOTA site, as the SDK's activity scorer
// understands it. The server remains the authority when the log is uploaded;
// this is the live counter on the logging screen ("HOTA 3/5").

import { activityScorer, host } from "@ham2k/extension-sdk"
import type { ActivityScoresheet, ActivityScoringRules, ContestScorer, JSONValue } from "@ham2k/extension-sdk"

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

/// The moment a QSO belongs to, in millis — or "now" for one that has no
/// time yet.
///
/// The QSO being typed reaches the live scoring path before it is logged,
/// and on HaLo it arrives without `startAtMillis`. The SDK's scorer reads a
/// missing time as 0, which is 1970: a different UTC day from every logged
/// contact, so a station worked five minutes ago was greeted with "New Day"
/// instead of "duplicate". A contact with no time is happening now; `Date`
/// inside the sandbox follows the app's clock.
export function qsoMillis(qso: Record<string, JSONValue>): number {
  const millis = Number(qso.startAtMillis)
  if (Number.isFinite(millis) && millis > 0) return millis
  const parsed = typeof qso.startAt === "string" ? Date.parse(qso.startAt) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return Date.now()
}

let reportedMissingTime = false

/// The SDK's activity scorer, with a time on every QSO it judges.
export function hotaScorer(): ContestScorer<ActivityScoresheet> {
  const base = activityScorer(HOTA_SCORING)
  return {
    ...base,
    scoreQso(args, ctx) {
      const millis = qsoMillis(args.qso)
      if (millis === args.qso.startAtMillis) return base.scoreQso(args, ctx)
      if (!reportedMissingTime) {
        reportedMissingTime = true
        host.log(`scoring: a QSO arrived without a usable time (startAtMillis=${JSON.stringify(args.qso.startAtMillis)}, startAt=${JSON.stringify(args.qso.startAt)}); judging it as of now`)
      }
      return base.scoreQso({ ...args, qso: { ...args.qso, startAtMillis: millis } }, ctx)
    },
  }
}
