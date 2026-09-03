import { beforeAll, describe, expect, it } from "vitest"

import { BRASOV, BUCHAREST, KRAKOW, REFERENCES, ctx, installFakeKernel, loadExtension, operation, type FakeKernel } from "./kernel.js"

let kernel: FakeKernel
let activity: any
let refHandler: any

beforeAll(async () => {
  installFakeKernel({ rows: REFERENCES })
  kernel = await loadExtension()
  activity = kernel.hook("activity", "yo3bee-hota")
  refHandler = kernel.hook("ref:hotaActivation")
})

const suggest = (searchTerm?: string, location?: { lat: number; lon: number }) =>
  activity.suggest({ operation: operation([]), searchTerm, location }, ctx())

describe("suggest — the numeric shortcut", () => {
  it("'0235' from Brașov lists every country's -H0235, nearest first", async () => {
    const found = await suggest("0235", BRASOV)
    expect(found.map((s: any) => s.ref)).toEqual(["RO-H0235", "HU-H0235", "PL-H0235"])
    expect(found[0]).toMatchObject({
      type: "hotaActivation",
      ref: "RO-H0235",
      name: "Râșnov Citadel",
      program: "HOTA",
      label: "HOTA RO-H0235: Râșnov Citadel",
      shortLabel: "HOTA RO-H0235",
      location: "BV",
      relevance: 1,
      allowsMultiple: true,
    })
    expect(found[0].distance).toBeLessThan(found[1].distance)
    expect(found[1].distance).toBeLessThan(found[2].distance)
  })

  it("'235' from Kraków puts Wawel first", async () => {
    const found = await suggest("235", KRAKOW)
    expect(found.map((s: any) => s.ref)).toEqual(["PL-H0235", "HU-H0235", "RO-H0235"])
  })

  it("works with no position at all", async () => {
    const found = await suggest("0235")
    expect(found.map((s: any) => s.ref).sort()).toEqual(["HU-H0235", "PL-H0235", "RO-H0235"])
    expect(found.every((s: any) => s.distance === undefined)).toBe(true)
  })

  it("a full code, however typed, finds exactly that site", async () => {
    for (const term of ["RO-H0235", "ro-h0235", "roh0235", "RO H 235"]) {
      const found = await suggest(term, BUCHAREST)
      expect(found.map((s: any) => s.ref)).toEqual(["RO-H0235"])
    }
  })

  it("a country prefix lists that country's sites, nearest first", async () => {
    const found = await suggest("RO-H", BUCHAREST)
    expect(found.map((s: any) => s.ref)).toEqual(["RO-H0283", "RO-H0084", "RO-H0001", "RO-H0235"])
  })

  it("never offers a retired site", async () => {
    expect((await suggest("0999", BUCHAREST)).length).toBe(0)
    expect((await suggest("RO-H09", BUCHAREST)).length).toBe(0)
  })
})

describe("suggest — names and nearby", () => {
  it("a name finds it through the host's own search", async () => {
    const found = await suggest("Râșnov")
    expect(found.map((s: any) => s.ref)).toEqual(["RO-H0235"])
  })

  it("a name search with a position is still nearest first", async () => {
    const found = await suggest("Castle", BRASOV)
    expect(found.map((s: any) => s.ref)).toEqual(["RO-H0001", "HU-H0235", "PL-H0235"])
  })

  it("no term: the sites around the operator", async () => {
    const found = await suggest(undefined, BUCHAREST)
    expect(found.slice(0, 2).map((s: any) => s.ref)).toEqual(["RO-H0283", "RO-H0084"])
  })
})

describe("reference handler", () => {
  it("validates and repairs what the operator typed", async () => {
    expect(await refHandler.validateRef({ ref: { type: "hotaActivation", ref: "ro-h235" } }, ctx())).toEqual({
      valid: true,
      normalized: "RO-H0235",
    })
    expect(await refHandler.validateRef({ ref: { type: "hotaActivation", ref: "RO-0031" } }, ctx())).toMatchObject({ valid: false })
  })

  it("decorates a known site with its name, place and grid", async () => {
    const ref = await refHandler.decorateRef({ ref: { type: "hotaActivation", ref: "roh0235" } }, ctx())
    expect(ref).toMatchObject({
      ref: "RO-H0235",
      name: "Râșnov Citadel",
      program: "HOTA",
      label: "HOTA RO-H0235: Râșnov Citadel",
      shortLabel: "HOTA RO-H0235",
      location: "BV",
      lat: 45.5861,
      lon: 25.4622,
    })
  })

  it("labels the unknown and the malformed without throwing", async () => {
    expect(await refHandler.decorateRef({ ref: { type: "hota", ref: "RO-H7777" } }, ctx())).toMatchObject({
      ref: "RO-H7777",
      name: "Unknown HOTA reference",
    })
    expect(await refHandler.decorateRef({ ref: { type: "hota", ref: "RO-0031" } }, ctx())).toMatchObject({
      ref: "RO-0031",
      name: "Not a HOTA reference",
    })
    expect(await refHandler.decorateRef({ ref: { type: "hota", ref: "RO-0031" } }, ctx({ locale: "ro" }))).toMatchObject({
      name: "Nu e o referință HOTA",
    })
  })

  it("links to the site's public page, and only for a real code", async () => {
    expect(await refHandler.linkForRef({ ref: { type: "hota", ref: "ro-h0235" } }, ctx())).toEqual({
      url: "https://cqhota.app/ref/RO-H0235",
    })
    expect(await refHandler.linkForRef({ ref: { type: "hota", ref: "RO-H" } }, ctx())).toBeNull()
  })

  it("titles the operation 'at' the site", async () => {
    expect(
      await refHandler.suggestOperationTitle({ ref: { type: "hotaActivation", ref: "RO-H0235", name: "Râșnov Citadel" }, operation: operation() }, ctx()),
    ).toEqual({ at: "RO-H0235", subtitle: "Râșnov Citadel" })
  })
})

describe("controls", () => {
  it("offers one activation control and one hunting control", async () => {
    const [control] = await activity.operationControls({ operation: operation() }, ctx())
    expect(control).toMatchObject({ key: "yo3bee-hota/activation", label: "HOTA site", allowsMultiple: true })
    expect(control.input).toMatchObject({ kind: "refList", refType: "hotaActivation", placeholder: "RO-H0235" })
    expect(new RegExp(`^(?:${control.input.pattern})$`, "i")).toEqual(expect.any(RegExp))
    expect(new RegExp(`^(?:${control.input.pattern})$`, "i").test("ro-h0235")).toBe(true)

    const [hunting] = await activity.loggingControls({ operation: operation() }, ctx())
    expect(hunting).toMatchObject({ key: "yo3bee-hota/hunter", label: "HOTA site (theirs)", allowsMultiple: true })
    expect(hunting.input).toMatchObject({ kind: "refList", refType: "hota" })
  })
})
