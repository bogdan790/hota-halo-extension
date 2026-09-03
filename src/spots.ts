// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// The HOTA spot feed, and posting to it. Reading is public; posting needs
// the operator's own key (see account.ts). The server owns every rule about
// what is "live": its window, its QRT detection, its cooldowns — this side
// only maps what it says and repeats its answers to the operator.

import { host } from "@ham2k/extension-sdk"
import type {
  HookContext,
  JSONValue,
  PostOtherSpotRequest,
  PostResult,
  PostSelfSpotRequest,
  Spot,
  SpotEligibility,
  SpotsHook,
} from "@ham2k/extension-sdk"

import { API_KEY_HEADER, apiKeyFrom, parseJson } from "./account.js"
import { tFor } from "./i18n.js"
import { ACTIVATION_TYPE, API_BASE, EXTENSION_KEY, HUNTING_TYPE, ICON, PROGRAM } from "./program.js"
import { isValidReference, normalizeReference } from "./references.js"

export const SPOTS_URL = `${API_BASE}/spots`

/// What the feed's own filter applies: a `QRT` token anywhere in the latest
/// comment closes the spot. Matches "QRT", "qrt 73", "thanks, QRT!" — not
/// "SQRT". Applied here too, so a feed that changes its default cannot put a
/// closed spot on the operator's screen.
export const QRT_REGEX = /\bQRT\b/i

/// One row of `GET /api/v1/spots`, as the API documents and serves it.
/// Numbers may arrive as strings (`"14300.0"`); ids too.
export interface HotaApiSpot {
  id?: number | string
  callsign?: string
  activator?: string
  freq_khz?: number | string
  band?: string | null
  mode?: string
  comment?: string | null
  source?: string
  spotter?: string | null
  created_at?: string
  reference?: string
  name_en?: string
  name_ro?: string
  reference_name?: string
  county?: string
  era?: string
  lat?: number
  lon?: number
  ended?: boolean
  overlaps?: { program?: string; ref?: string }[]
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

/// One API row → one HaLo spot, or null for anything that should not be
/// shown: a closed spot, a row without a callsign, a reference the program
/// would not accept, a time that cannot be read.
export function spotFromApi(raw: HotaApiSpot | null | undefined): Spot | null {
  if (!raw) return null
  const call = (str(raw.callsign) ?? str(raw.activator) ?? "").toUpperCase()
  const reference = normalizeReference(raw.reference)
  if (!call || !isValidReference(reference)) return null
  if (raw.ended === true || QRT_REGEX.test(String(raw.comment ?? ""))) return null

  const timeInMillis = Date.parse(String(raw.created_at ?? ""))
  if (!Number.isFinite(timeInMillis)) return null

  const freq = Number(raw.freq_khz)
  const name = str(raw.name_en) ?? str(raw.reference_name)
  const comment = str(raw.comment)
  const overlaps: JSONValue = (raw.overlaps ?? [])
    .filter((o) => str(o?.program) && str(o?.ref))
    .map((o) => ({ program: String(o.program), ref: String(o.ref) }))

  return {
    their: { call },
    freq: Number.isFinite(freq) && freq > 0 ? freq : undefined,
    band: str(raw.band ?? undefined),
    mode: str(raw.mode)?.toUpperCase(),
    refs: [{ type: HUNTING_TYPE, ref: reference }],
    icon: ICON,
    spot: {
      timeInMillis,
      source: PROGRAM,
      label: [name ? `${reference}: ${name}` : reference, comment].filter((x) => x).join(" — "),
      sourceInfo: {
        id: raw.id != null ? String(raw.id) : null,
        reference,
        name: name ?? null,
        comment: comment ?? null,
        spotter: str(raw.spotter ?? undefined) ?? null,
        source: str(raw.source) ?? null,
        county: str(raw.county) ?? null,
        era: str(raw.era) ?? null,
        overlaps,
      },
    },
  }
}

/// The whole feed body → spots, newest first as the server sends them.
/// A body that is not a JSON array is an empty feed, never an error.
export function spotsFromBody(body: string): Spot[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map((row) => spotFromApi(row as HotaApiSpot)).filter((s): s is Spot => s !== null)
}

function refsOfType(container: Record<string, JSONValue>, type: string): string[] {
  const refs = Array.isArray(container.refs) ? container.refs : []
  return refs
    .map((r) => (r && typeof r === "object" && !Array.isArray(r) ? r : null))
    .filter((r): r is Record<string, JSONValue> => r !== null && r.type === type && typeof r.ref === "string" && r.ref !== "")
    .map((r) => normalizeReference(r.ref))
}

/// The body of `POST /api/v1/spots`, as the API documents it.
export interface SpotPostBody {
  reference: string
  freq_khz: number
  mode: string
  comment?: string
  source: "self" | "respot"
  for_activator?: string
}

export type SpotBodyResult = { body: SpotPostBody } | { error: string }

/// A self-spot: the operation's (primary) HOTA site, on the frequency and
/// mode the operator is calling on. An operation carrying several HOTA
/// references spots the first — the server spaces out spots on different
/// references, so one call cannot announce all of them at once.
export function selfSpotBody(request: PostSelfSpotRequest): SpotBodyResult {
  const [reference] = refsOfType(request.operation, ACTIVATION_TYPE)
  if (!reference) return { error: "spotNoReference" }
  const mode = str(request.mode)?.toUpperCase()
  if (!mode) return { error: "spotNoMode" }
  const freq = Number(request.freq)
  if (!Number.isFinite(freq) || freq <= 0) return { error: "spotNoFrequency" }
  const comment = str(request.comment)
  return { body: { reference, freq_khz: freq, mode, ...(comment ? { comment } : {}), source: "self" } }
}

/// A re-spot of a station just worked at a HOTA site: the site from the
/// QSO's hunted reference, on the QSO's frequency and mode, credited to the
/// activator by name.
export function otherSpotBody(request: PostOtherSpotRequest): SpotBodyResult {
  const qso = request.qso
  const their = qso.their && typeof qso.their === "object" && !Array.isArray(qso.their) ? qso.their : {}
  const call = str((their as Record<string, JSONValue>).call)?.toUpperCase()
  if (!call) return { error: "spotNoHuntedReference" }
  const [reference] = refsOfType(qso, HUNTING_TYPE)
  if (!reference) return { error: "spotNoHuntedReference" }
  const mode = str(qso.mode)?.toUpperCase()
  if (!mode) return { error: "spotNoMode" }
  const freq = Number(qso.freq)
  if (!Number.isFinite(freq) || freq <= 0) return { error: "spotNoFrequency" }
  const comment = str(request.comment)
  return {
    body: { reference, freq_khz: freq, mode, ...(comment ? { comment } : {}), source: "respot", for_activator: call },
  }
}

/// The server's answer, as a result the operator can read. `201` is the
/// only success; everything else repeats the server's own `error` text,
/// which names the rule that refused it (outside a ham band, reference not
/// active, too far, too soon, too many).
export function interpretSpotResponse(status: number, body: string, ctx: HookContext, success: string): PostResult {
  const t = tFor(ctx)
  if (status === 201 || status === 200) return { ok: true, message: success }
  if (status === 401 || status === 403) return needsAccount(ctx, t("accountInvalidKey"))
  const error = parseJson(body)?.error
  const message = typeof error === "string" && error ? error : `HTTP ${status}`
  return { ok: false, message: t("spotRejected", { message }) }
}

function needsAccount(ctx: HookContext, text: string): PostResult {
  const t = tFor(ctx)
  return {
    ok: false,
    message: text,
    userMessage: {
      presentation: "dialog",
      title: PROGRAM,
      text,
      icon: ICON,
      actions: [{ type: "account", label: t("spotConnectAction"), key: EXTENSION_KEY }],
    },
  }
}

async function post(body: SpotPostBody, ctx: HookContext, success: string): Promise<PostResult> {
  const t = tFor(ctx)
  const key = apiKeyFrom(ctx)
  if (!key) return needsAccount(ctx, t("spotNeedsAccount"))
  try {
    const response = await host.fetch(SPOTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", [API_KEY_HEADER]: key },
      body: JSON.stringify(body),
    })
    return interpretSpotResponse(response.status, response.body, ctx, success)
  } catch (e) {
    return { ok: false, message: t("spotUnreachable", { message: (e as Error).message ?? String(e) }) }
  }
}

export const HotaSpots: SpotsHook = {
  sourceName: PROGRAM,

  async fetchSpots(_args, ctx): Promise<Spot[]> {
    if (!ctx.online) return []
    try {
      const response = await host.fetch(SPOTS_URL)
      if (response.status !== 200) {
        host.log(`spots: cqhota.app answered HTTP ${response.status}`)
        return []
      }
      return spotsFromBody(response.body)
    } catch (e) {
      // A source that throws takes the whole spots panel down, not just its
      // own rows.
      host.log(`spots: fetch failed: ${(e as Error).message ?? e}`)
      return []
    }
  },

  async isSelfSpotEnabled({ operation }, _ctx): Promise<SpotEligibility> {
    return { enabled: refsOfType(operation, ACTIVATION_TYPE).length > 0, icon: ICON }
  },

  async isOtherSpotEnabled({ qso }, _ctx): Promise<SpotEligibility> {
    return { enabled: refsOfType(qso, HUNTING_TYPE).length > 0, icon: ICON }
  },

  async postSelfSpot(request, ctx): Promise<PostResult> {
    const t = tFor(ctx)
    const built = selfSpotBody(request)
    if ("error" in built) return { ok: false, message: t(built.error) }
    return post(built.body, ctx, t("spotPosted", { reference: built.body.reference }))
  },

  async postOtherSpot(request, ctx): Promise<PostResult> {
    const t = tFor(ctx)
    const built = otherSpotBody(request)
    if ("error" in built) return { ok: false, message: t(built.error) }
    return post(built.body, ctx, t("spotRespotted", { call: built.body.for_activator, reference: built.body.reference }))
  },
}
