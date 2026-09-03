// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// Everything about a HOTA reference CODE that needs no host and no network:
// what one looks like, how a half-typed one is repaired, how a search term is
// read, and how one row of the public reference export becomes one row of
// the host's lookup database. Pure functions, so they are the tested core.

import type { ActivitySuggestion, LookupEntry, LookupRow } from "@ham2k/extension-sdk"
import { distanceOnEarth, locationToGrid6 } from "@ham2k/lib-geo-tools"

import { ACTIVATION_TYPE, PROGRAM } from "./program.js"

/// `XX-H0000`: an ISO-3166 country code, a dash, `H`, four digits. The
/// country part is NOT enumerated here — the reference list says which
/// countries exist, and a new one joins the program without a new build.
export const REFERENCE_REGEX = /^[A-Z]{2}-H\d{4}$/

/// What an operator may actually type: `ro-h235`, `ROH0235`, `RO H 0235`.
const LOOSE_REFERENCE = /^([A-Z]{2})[\s-]*H[\s-]*(\d{1,4})$/
const LOOSE_PREFIX = /^([A-Z]{2})[\s-]*H[\s-]*(\d{0,3})$/
const DIGITS_ONLY = /^\d{1,4}$/

/// Repairs a reference into canonical form where it can — uppercase, the dash
/// restored, the number padded to four digits — and otherwise returns the
/// trimmed, uppercased input unchanged, so that whatever the operator typed
/// is still there for `decorateRef` to label invalid and for them to fix.
export function normalizeReference(input: unknown): string {
  const raw = String(input ?? "").trim().toUpperCase()
  const match = LOOSE_REFERENCE.exec(raw)
  if (!match) return raw
  return `${match[1]}-H${match[2].padStart(4, "0")}`
}

export function isValidReference(input: unknown): boolean {
  return REFERENCE_REGEX.test(normalizeReference(input))
}

/// The country part of a valid reference (`RO` of `RO-H0235`), or undefined.
export function countryOf(input: unknown): string | undefined {
  const ref = normalizeReference(input)
  return REFERENCE_REGEX.test(ref) ? ref.slice(0, 2) : undefined
}

/// How a search term is read. The four-digit shortcut is the point of the
/// whole thing: an activator standing at a site types its number and gets
/// every country's `-H0235`, nearest first.
export type SearchQuery =
  | { kind: "number"; digits: string }
  | { kind: "code"; code: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "text"; text: string }

export function parseSearchTerm(term: unknown): SearchQuery {
  const raw = String(term ?? "").trim().toUpperCase()
  if (DIGITS_ONLY.test(raw)) return { kind: "number", digits: raw.padStart(4, "0") }
  const full = LOOSE_REFERENCE.exec(raw)
  if (full && full[2].length === 4) return { kind: "code", code: normalizeReference(raw) }
  const partial = LOOSE_PREFIX.exec(raw)
  if (partial) return { kind: "prefix", prefix: `${partial[1]}-H${partial[2]}` }
  return { kind: "text", text: raw }
}

/// Whether a reference code answers a query. A `prefix` with digits matches
/// both as a prefix (`RO-H02` → `RO-H0235`) and as the padded code it may
/// have meant (`RO-H235` → `RO-H0235`).
export function matchesQuery(key: string, query: SearchQuery): boolean {
  const code = key.toUpperCase()
  switch (query.kind) {
    case "number":
      return code.endsWith(`-H${query.digits}`)
    case "code":
      return code === query.code
    case "prefix":
      return code.startsWith(query.prefix) || code === normalizeReference(query.prefix)
    case "text":
      return true
  }
}

/// The text handed to the host's lookup search for a structured query.
export function searchTextFor(query: SearchQuery): string {
  switch (query.kind) {
    case "number":
      return query.digits
    case "code":
      return query.code
    case "prefix":
      return query.prefix
    case "text":
      return query.text
  }
}

/// How relevant a row is to the query, for the host's `distance / relevance`
/// ranking: an exact code beats a prefix, which beats a name.
export function relevanceFor(key: string, query: SearchQuery): number {
  if (query.kind === "number" || query.kind === "code") return 1
  if (query.kind === "prefix") return key.toUpperCase() === normalizeReference(query.prefix) ? 1 : 0.9
  return 0.7
}

/// One entry of `GET /api/v1/references/export` as the API documents it.
export interface HotaApiReference {
  code?: string
  name?: string
  name_local?: string
  county?: string
  era?: string
  status?: string
  lat?: number | string
  lon?: number | string
}

function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

/// One row of the export → one row of the host's lookup database, or null to
/// drop it. `flags` follows the data-file convention: 0 marks a reference the
/// program has retired or not yet approved, so `activeOnly` searches skip it.
export function referenceEntryFromApi(entry: HotaApiReference | null | undefined): LookupEntry | null {
  const ref = normalizeReference(entry?.code)
  if (!REFERENCE_REGEX.test(ref)) return null

  const lat = finiteNumber(entry?.lat)
  const lon = finiteNumber(entry?.lon)
  const name = typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : undefined
  const nameLocal = typeof entry?.name_local === "string" && entry.name_local.trim() ? entry.name_local.trim() : undefined
  const status = typeof entry?.status === "string" ? entry.status : "active"

  return {
    subCategory: ref.slice(0, 2),
    key: ref,
    name,
    lat,
    lon,
    flags: status === "active" ? 1 : 0,
    data: {
      ref,
      name,
      nameLocal,
      location: entry?.county || undefined,
      era: entry?.era || undefined,
      status,
      // Derived from the coordinate, never stored instead of it.
      grid: lat != null && lon != null ? locationToGrid6(lat, lon) : undefined,
      lat,
      lon,
    },
  }
}

export interface Location {
  lat: number
  lon: number
}

/// A lookup row as an Activities-view suggestion, in the same shape the SDK's
/// `referenceActivity` produces so the two search paths look identical.
export function suggestionFromRow(
  row: LookupRow,
  query: SearchQuery,
  location: Location | undefined,
  allowsMultiple: boolean,
): ActivitySuggestion {
  const data = (row.data ?? {}) as Record<string, unknown>
  const distance =
    location && row.lat != null && row.lon != null
      ? distanceOnEarth(location, { lat: row.lat, lon: row.lon }) ?? undefined
      : undefined
  return {
    type: ACTIVATION_TYPE,
    ref: row.key,
    name: row.name,
    grid: typeof data.grid === "string" ? data.grid : undefined,
    lat: row.lat,
    lon: row.lon,
    location: typeof data.location === "string" ? data.location : undefined,
    program: PROGRAM,
    label: `${PROGRAM} ${row.key}: ${row.name ?? ""}`,
    shortLabel: `${PROGRAM} ${row.key}`,
    distance,
    relevance: relevanceFor(row.key, query),
    allowsMultiple,
  }
}

/// Nearest first; anything without a distance after, by code.
export function sortByDistance<T extends { distance?: number; ref?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.distance ?? Infinity
    const db = b.distance ?? Infinity
    if (da !== db) return da - db
    return String(a.ref ?? "").localeCompare(String(b.ref ?? ""))
  })
}
