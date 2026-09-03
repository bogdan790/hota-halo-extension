// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// What it takes to activate a HOTA site, as the SDK's activity scorer
// understands it. The server remains the authority when the log is uploaded;
// this is the live counter on the logging screen ("HOTA 3/5").

import { activityScorer, host } from "@ham2k/extension-sdk"
import { fmtInteger } from "@ham2k/lib-format-tools"
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
  // What makes a repeat contact a DUPLICATE — the same as every other
  // program: the same station on the same band and mode, the same UTC day.
  // A new band or mode is a legitimate contact (the hunter gets a new band
  // credit; the app says "New Band"). What it is NOT is a new callsign: the
  // activation counter below counts distinct callsigns, so it does not move.
  uniquePer: ["day", "band", "mode"],
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

/// A HOTA scoresheet: the SDK's, plus the callsigns worked per activated
/// reference — all time and today — which is what the activation rule
/// actually counts.
export type HotaScoresheet = ActivityScoresheet & {
  callsByRef: Record<string, Record<string, 1>>
  dayCallsByRef: Record<string, Record<string, 1>>
}

function activationRefsOf(operation: Record<string, JSONValue>): string[] {
  const refs = Array.isArray(operation.refs) ? operation.refs : []
  return refs
    .map((r) => (r && typeof r === "object" && !Array.isArray(r) ? r : null))
    .filter((r): r is Record<string, JSONValue> => r !== null && r.type === ACTIVATION_TYPE && typeof r.ref === "string" && r.ref !== "")
    .map((r) => String(r.ref))
}

function distinctCounts(byRef: Record<string, Record<string, 1>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [ref, calls] of Object.entries(byRef)) out[ref] = Object.keys(calls).length
  return out
}

/// The SDK's activity scorer, with two HOTA corrections on top:
///
///  - every QSO it judges has a time (see `qsoMillis`);
///  - the activation tally counts DISTINCT CALLSIGNS per reference per UTC
///    day, not contacts. The SDK's rule ("n QSOs, unique per band/mode/day")
///    is POTA's; HOTA's is five callsigns, on any band or mode. So a station
///    worked again on a new band is a fine contact — not a dupe, and the app
///    says "New Band" — but the counter reads the same until a new callsign
///    is logged.
export function hotaScorer(): ContestScorer<HotaScoresheet> {
  const base = activityScorer(HOTA_SCORING)
  const threshold = QSOS_TO_ACTIVATE
  return {
    startScoresheet(args, ctx) {
      return { ...base.startScoresheet(args, ctx), callsByRef: {}, dayCallsByRef: {} }
    },

    scoreQso(args, ctx) {
      const millis = qsoMillis(args.qso)
      if (millis !== args.qso.startAtMillis && !reportedMissingTime) {
        reportedMissingTime = true
        host.log(`scoring: a QSO arrived without a usable time (startAtMillis=${JSON.stringify(args.qso.startAtMillis)}, startAt=${JSON.stringify(args.qso.startAt)}); judging it as of now`)
      }
      const qso = millis === args.qso.startAtMillis ? args.qso : { ...args.qso, startAtMillis: millis }
      const sheet = args.scoresheet
      if (args.isNewDay) sheet.dayCallsByRef = {}

      const result = base.scoreQso({ ...args, qso }, ctx)
      const out = result.scoresheet as HotaScoresheet
      out.callsByRef = sheet.callsByRef ?? {}
      out.dayCallsByRef = sheet.dayCallsByRef ?? {}

      const their = qso.their && typeof qso.their === "object" && !Array.isArray(qso.their) ? (qso.their as Record<string, JSONValue>) : {}
      const call = typeof their.call === "string" ? their.call.trim().toUpperCase() : ""
      if (call && !result.score.dupe) {
        for (const ref of activationRefsOf(args.operation)) {
          ;(out.callsByRef[ref] ??= {})[call] = 1
          ;(out.dayCallsByRef[ref] ??= {})[call] = 1
        }
      }
      return { scoresheet: out, score: result.score }
    },

    summarizeScore(args, ctx) {
      const tallies = base.summarizeScore(args, ctx)
      const activation = tallies.activation
      if (!activation) return tallies

      const perDay = args.scope === "day"
      const counts = distinctCounts(perDay ? args.scoresheet.dayCallsByRef ?? {} : args.scoresheet.callsByRef ?? {})
      // A reference the operation carries but nobody has been worked at yet
      // still shows, at zero — the SDK lists it the same way.
      for (const ref of Object.keys((activation.activatedRefs as Record<string, number> | undefined) ?? {})) counts[ref] ??= 0
      const refs = Object.keys(counts).sort()
      if (refs.length === 0) return tallies

      const lowest = Math.min(...refs.map((ref) => counts[ref]))
      const activated = lowest >= threshold
      const summary = !activated
        ? `${fmtInteger(lowest)}/${fmtInteger(threshold)}`
        : refs.length < 6
          ? `${fmtInteger(lowest)} ${"\u2713".repeat(refs.length)}`
          : `${fmtInteger(lowest)} \u2713 x ${fmtInteger(refs.length)}`
      const longSummary = refs
        .map((ref) => (counts[ref] >= threshold ? `\u2705 **${ref}: ${fmtInteger(counts[ref])}**` : `\u274C ${ref}: ${fmtInteger(counts[ref])}/${fmtInteger(threshold)}`))
        .join("\n")

      return {
        ...tallies,
        activation: { ...activation, activatedRefs: counts, activated, summary, longSummary },
      }
    },
  }
}
