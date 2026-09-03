// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// The reference handler, the logging controls, the ADIF fields and the
// search — almost all of it built by the SDK's `referenceActivity` from one
// description. What HOTA adds on top:
//
//  - a repairing normalizer, so `ro-h235` validates as `RO-H0235`;
//  - the numeric search: `0235` finds every country's `-H0235`, nearest
//    first, which is how an activator standing at a site picks it.

import { activityAdifImport, host, referenceActivity } from "@ham2k/extension-sdk"
import type {
  ActivityHook,
  ActivitySuggestion,
  AdifImportHook,
  HookContext,
  LookupRow,
  Ref,
  RefHandlerHook,
  SuggestArgs,
} from "@ham2k/extension-sdk"

import { tFor } from "./i18n.js"
import {
  ACTIVATION_TYPE,
  ADIF_REF_FIELD,
  CATEGORY,
  COLOR,
  EXTENSION_KEY,
  HUNTING_TYPE,
  ICON,
  PROGRAM,
  SITE_URL,
} from "./program.js"
import {
  REFERENCE_REGEX,
  matchesQuery,
  normalizeReference,
  parseSearchTerm,
  searchTextFor,
  sortByDistance,
  suggestionFromRow,
} from "./references.js"
import { HOTA_SCORING } from "./scoring.js"

/// Sites within this many degrees of the operator count as "nearby" — the
/// SDK's own radius, so HOTA's nearby list reaches as far as POTA's.
const NEARBY_DELTA = 1.5
const MAX_SUGGESTIONS = 30

export const ALLOWS_MULTIPLE = HOTA_SCORING.allowsMultipleReferences ?? false

export function linkForReference(reference: string): string {
  return `${SITE_URL}/ref/${encodeURIComponent(reference)}`
}

const factory = referenceActivity({
  key: EXTENSION_KEY,
  label: PROGRAM,
  activationType: ACTIVATION_TYPE,
  huntingType: HUNTING_TYPE,
  referenceRegex: REFERENCE_REGEX,
  icon: ICON,
  color: COLOR,
  placeholder: "RO-H0235",
  tFor,
  category: CATEGORY,
  linkUrl: linkForReference,
  // A contact with a station standing at two HOTA sites is two records, and
  // cqhota.app credits both — the same rule as park-to-park on two parks.
  splitRecordsPerHuntedRef: true,
  adifProgram: PROGRAM,
  adifRefField: ADIF_REF_FIELD,
  allowsMultiple: ALLOWS_MULTIPLE,
})

const baseRefHandler = factory.refHandler as RefHandlerHook
const baseActivityHook = factory.activityHook as ActivityHook

/// The SDK's handler, with HOTA's repairing normalizer in front of it: what
/// the operator typed is fixed up BEFORE the pattern is checked, so a code
/// missing its dash or its leading zeros is accepted rather than flagged.
export const refHandler: RefHandlerHook = {
  ...baseRefHandler,
  async validateRef({ ref }, _ctx) {
    const normalized = normalizeReference(ref.ref)
    return { valid: REFERENCE_REGEX.test(normalized), normalized }
  },
  async decorateRef({ ref }, ctx) {
    const repaired: Ref = { ...ref, ref: normalizeReference(ref.ref) }
    return baseRefHandler.decorateRef!({ ref: repaired }, ctx)
  },
}

async function rowsFor(text: string, location: SuggestArgs["location"]): Promise<LookupRow[]> {
  // Two queries, because the host's text search is a black box and the
  // numeric shortcut must not depend on how it matches: the sites around
  // the operator are fetched by position and filtered here, and the text
  // search adds the rest of the world. Both skip retired references.
  const nearby = location ? await host.dbLookupSelectByLocation(CATEGORY, location.lat, location.lon, NEARBY_DELTA, true) : []
  const searched = await host.dbLookupSelectAll(CATEGORY, text, undefined, true)
  return [...nearby, ...searched]
}

export const activityHook: ActivityHook = {
  ...baseActivityHook,

  async suggest(args: SuggestArgs, ctx: HookContext): Promise<ActivitySuggestion[]> {
    const term = (args.searchTerm ?? "").trim()
    const query = parseSearchTerm(term)

    // A name, or no term at all: the SDK's search does the right thing —
    // and with a position known, HOTA orders even a name search by distance.
    if (!term || query.kind === "text") {
      const base = await baseActivityHook.suggest!(args, ctx)
      return term && args.location ? sortByDistance(base) : base
    }

    const seen = new Set<string>()
    const found: ActivitySuggestion[] = []
    for (const row of await rowsFor(searchTextFor(query), args.location)) {
      const key = normalizeReference(row.key)
      if (seen.has(key) || !matchesQuery(key, query)) continue
      seen.add(key)
      found.push(suggestionFromRow({ ...row, key }, query, args.location, ALLOWS_MULTIPLE))
    }
    return sortByDistance(found).slice(0, MAX_SUGGESTIONS)
  },
}

export const adifFieldsHook = factory.adifFieldsHook

/// Built here rather than taken from the factory so that a reference read
/// back from a file goes through the same repairing normalizer the typed one
/// does. Reads `MY_HOTA_REF`/`HOTA_REF` and `MY_SIG=HOTA`/`SIG=HOTA` pairs,
/// exactly the fields cqhota.app parses on upload.
export const adifImportHook: AdifImportHook = activityAdifImport({
  sig: PROGRAM,
  huntingType: HUNTING_TYPE,
  activationType: ACTIVATION_TYPE,
  refField: `${ADIF_REF_FIELD.toLowerCase()}_ref`,
  normalize: normalizeReference,
})
