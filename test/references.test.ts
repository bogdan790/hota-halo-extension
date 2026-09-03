import { describe, expect, it } from "vitest"

import {
  REFERENCE_REGEX,
  countryOf,
  isValidReference,
  matchesQuery,
  normalizeReference,
  parseSearchTerm,
  referenceEntryFromApi,
  relevanceFor,
  sortByDistance,
} from "../src/references.js"

describe("normalizeReference", () => {
  it.each([
    ["RO-H0235", "RO-H0235"],
    ["ro-h0235", "RO-H0235"],
    [" ro-h235 ", "RO-H0235"],
    ["ROH0235", "RO-H0235"],
    ["RO H 235", "RO-H0235"],
    ["pl-h1", "PL-H0001"],
    ["HU-H0042", "HU-H0042"],
  ])("repairs %s into %s", (input, expected) => {
    expect(normalizeReference(input)).toBe(expected)
    expect(isValidReference(input)).toBe(true)
  })

  it.each(["", "RO-0235", "RO-H12345", "US-1234", "YO/EC-118", "LLRO-0001", "H0235", "RO-H"])(
    "leaves %s alone and rejects it",
    (input) => {
      expect(normalizeReference(input)).toBe(input.trim().toUpperCase())
      expect(isValidReference(input)).toBe(false)
    },
  )

  it("copes with non-strings", () => {
    expect(normalizeReference(undefined)).toBe("")
    expect(normalizeReference(null)).toBe("")
    expect(isValidReference(42)).toBe(false)
  })
})

describe("REFERENCE_REGEX", () => {
  it("does not enumerate countries", () => {
    for (const cc of ["RO", "PL", "HU", "BG", "RS", "ZZ"]) expect(REFERENCE_REGEX.test(`${cc}-H0001`)).toBe(true)
  })
  it("gives the country back", () => {
    expect(countryOf("pl-h235")).toBe("PL")
    expect(countryOf("nope")).toBeUndefined()
  })
})

describe("parseSearchTerm", () => {
  it("reads four digits as a number across countries", () => {
    expect(parseSearchTerm("0235")).toEqual({ kind: "number", digits: "0235" })
    expect(parseSearchTerm("235")).toEqual({ kind: "number", digits: "0235" })
    expect(parseSearchTerm("1")).toEqual({ kind: "number", digits: "0001" })
  })
  it("reads a full code, however typed", () => {
    expect(parseSearchTerm("ro-h0235")).toEqual({ kind: "code", code: "RO-H0235" })
    expect(parseSearchTerm("ROH0235")).toEqual({ kind: "code", code: "RO-H0235" })
  })
  it("reads a partial code as a prefix", () => {
    expect(parseSearchTerm("RO-H")).toEqual({ kind: "prefix", prefix: "RO-H" })
    expect(parseSearchTerm("ro-h02")).toEqual({ kind: "prefix", prefix: "RO-H02" })
    expect(parseSearchTerm("RO-H235")).toEqual({ kind: "prefix", prefix: "RO-H235" })
  })
  it("reads everything else as a name", () => {
    expect(parseSearchTerm("Râșnov")).toEqual({ kind: "text", text: "RÂȘNOV" })
    expect(parseSearchTerm("castle")).toEqual({ kind: "text", text: "CASTLE" })
    expect(parseSearchTerm("RO")).toEqual({ kind: "text", text: "RO" })
    expect(parseSearchTerm("12345")).toEqual({ kind: "text", text: "12345" })
  })
})

describe("matchesQuery", () => {
  it("number: every country's same number, nothing else", () => {
    const q = parseSearchTerm("0235")
    expect(matchesQuery("RO-H0235", q)).toBe(true)
    expect(matchesQuery("PL-H0235", q)).toBe(true)
    expect(matchesQuery("RO-H1235", q)).toBe(false)
    expect(matchesQuery("RO-H0023", q)).toBe(false)
  })
  it("code: exactly one", () => {
    const q = parseSearchTerm("ro-h0235")
    expect(matchesQuery("RO-H0235", q)).toBe(true)
    expect(matchesQuery("PL-H0235", q)).toBe(false)
  })
  it("prefix: as typed, and as the padded code it may have meant", () => {
    const q = parseSearchTerm("RO-H235")
    expect(matchesQuery("RO-H2350", q)).toBe(true)
    expect(matchesQuery("RO-H0235", q)).toBe(true)
    expect(matchesQuery("RO-H0236", q)).toBe(false)
    expect(matchesQuery("PL-H0235", q)).toBe(false)
  })
  it("relevance ranks an exact code above a prefix above a name", () => {
    expect(relevanceFor("RO-H0235", parseSearchTerm("0235"))).toBe(1)
    expect(relevanceFor("RO-H0235", parseSearchTerm("RO-H235"))).toBe(1)
    expect(relevanceFor("RO-H2350", parseSearchTerm("RO-H235"))).toBe(0.9)
    expect(relevanceFor("RO-H0235", parseSearchTerm("Râșnov"))).toBe(0.7)
  })
})

describe("referenceEntryFromApi", () => {
  const rasnov = {
    code: "RO-H0235",
    name: "Râșnov Citadel",
    name_local: "Cetatea Râșnov",
    county: "BV",
    era: "medieval",
    status: "active",
    lat: 45.5861,
    lon: 25.4622,
  }

  it("maps one export entry to one lookup row", () => {
    const row = referenceEntryFromApi(rasnov)
    expect(row).toMatchObject({
      subCategory: "RO",
      key: "RO-H0235",
      name: "Râșnov Citadel",
      lat: 45.5861,
      lon: 25.4622,
      flags: 1,
      data: { ref: "RO-H0235", nameLocal: "Cetatea Râșnov", location: "BV", era: "medieval", status: "active" },
    })
    expect((row!.data as any).grid).toBe("KN25ro")
  })

  it("marks anything not active as retired for searches", () => {
    expect(referenceEntryFromApi({ ...rasnov, status: "retired" })!.flags).toBe(0)
    expect(referenceEntryFromApi({ ...rasnov, status: "pending" })!.flags).toBe(0)
  })

  it("drops rows that are not references", () => {
    expect(referenceEntryFromApi(null)).toBeNull()
    expect(referenceEntryFromApi({})).toBeNull()
    expect(referenceEntryFromApi({ code: "RO-0031", name: "a park" })).toBeNull()
  })

  it("survives a row without a coordinate", () => {
    const row = referenceEntryFromApi({ code: "bg-h0001", name: "Boyana Church" })
    expect(row).toMatchObject({ key: "BG-H0001", subCategory: "BG" })
    expect(row!.lat).toBeUndefined()
    expect((row!.data as any).grid).toBeUndefined()
  })

  it("parses the real export shape", () => {
    const body = JSON.parse(
      '{"program":"HOTA","version":"2026-09-03","count":1,"references":[{"code":"BG-H0001","name":"Boyana Church","name_local":"Боянска църква","county":"22","era":"medieval","status":"active","lat":42.6444,"lon":23.2661}]}',
    )
    expect(referenceEntryFromApi(body.references[0])).toMatchObject({ key: "BG-H0001", name: "Boyana Church", flags: 1 })
  })
})

describe("sortByDistance", () => {
  it("nearest first, then the placeless by code", () => {
    const sorted = sortByDistance([
      { ref: "C", distance: 30 },
      { ref: "Z" },
      { ref: "A", distance: 5 },
      { ref: "B" },
    ])
    expect(sorted.map((s) => s.ref)).toEqual(["A", "C", "B", "Z"])
  })
})
