import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { QRT_REGEX, interpretSpotResponse, otherSpotBody, selfSpotBody, spotFromApi, spotsFromBody } from "../src/spots.js"
import { ctx, installFakeKernel, loadExtension, operation, qso, type FakeKernel } from "./kernel.js"

/// A row exactly as cqhota.app served it on 2026-09-03: numbers as strings.
const LIVE_ROW = {
  id: "26",
  callsign: "YO3BEE",
  freq_khz: "14300.0",
  mode: "SSB",
  comment: "TEST spotare",
  source: "self",
  spotter: null,
  created_at: "2026-09-03T09:07:23.706Z",
  reference: "RO-H0123",
  reference_name: "Ruinele Curții Domnești Piatra Neamț",
  name_en: "Princely Court Piatra Neamț",
  name_ro: "Ruinele Curții Domnești Piatra Neamț",
  county: "NT",
  era: "medieval",
  site_type: "ruin",
  dated: "1497",
  lat: 46.9275,
  lon: 26.3708,
  program: "HOTA",
  ended: false,
  overlaps: [{ program: "POTA", ref: "RO-0031" }],
  band: "20m",
  activator: "YO3BEE",
}

describe("spotFromApi", () => {
  it("maps a live row into a HaLo spot carrying the hunted reference", () => {
    expect(spotFromApi(LIVE_ROW)).toEqual({
      their: { call: "YO3BEE" },
      freq: 14300,
      band: "20m",
      mode: "SSB",
      refs: [{ type: "hota", ref: "RO-H0123" }],
      icon: "castle",
      spot: {
        timeInMillis: Date.parse("2026-09-03T09:07:23.706Z"),
        source: "HOTA",
        label: "RO-H0123: Princely Court Piatra Neamț — TEST spotare",
        sourceInfo: {
          id: "26",
          reference: "RO-H0123",
          name: "Princely Court Piatra Neamț",
          comment: "TEST spotare",
          spotter: null,
          source: "self",
          county: "NT",
          era: "medieval",
          overlaps: [{ program: "POTA", ref: "RO-0031" }],
        },
      },
    })
  })

  it("drops a spot that has gone QRT, however the server says so", () => {
    expect(spotFromApi({ ...LIVE_ROW, ended: true })).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, comment: "qrt 73" })).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, comment: "thanks all, QRT!" })).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, comment: "SQRT is not QRTX" })).not.toBeNull()
    expect(QRT_REGEX.test("QRT 12:00")).toBe(true)
  })

  it("drops what it cannot show", () => {
    expect(spotFromApi(null)).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, callsign: "", activator: "" })).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, reference: "RO-0031" })).toBeNull()
    expect(spotFromApi({ ...LIVE_ROW, created_at: "yesterday" })).toBeNull()
  })

  it("copes with the API.md shape (activator, no band) and missing bits", () => {
    const spot = spotFromApi({
      id: 1042,
      activator: "yo3bee",
      freq_khz: 14062.0,
      mode: "cw",
      created_at: "2026-08-14T09:41:00Z",
      reference: "ro-h0142",
      name_en: "Râșnov Citadel",
    })
    expect(spot).toMatchObject({ their: { call: "YO3BEE" }, freq: 14062, mode: "CW", refs: [{ type: "hota", ref: "RO-H0142" }] })
    expect(spot!.band).toBeUndefined()
    expect(spot!.spot.label).toBe("RO-H0142: Râșnov Citadel")
  })

  it("reads a whole feed and ignores a body that is not one", () => {
    expect(spotsFromBody(JSON.stringify([LIVE_ROW, { ...LIVE_ROW, id: 27, comment: "QRT" }])).length).toBe(1)
    expect(spotsFromBody("[]")).toEqual([])
    expect(spotsFromBody("{}")).toEqual([])
    expect(spotsFromBody("<html>")).toEqual([])
  })
})

describe("spot bodies", () => {
  it("a self-spot names the operation's site, frequency and mode", () => {
    expect(selfSpotBody({ operation: operation(["RO-H0142"]), freq: 14062, mode: "cw", comment: " CQ HOTA " })).toEqual({
      body: { reference: "RO-H0142", freq_khz: 14062, mode: "CW", comment: "CQ HOTA", source: "self" },
    })
  })

  it("a self-spot refuses politely when something is missing", () => {
    expect(selfSpotBody({ operation: operation([]), freq: 14062, mode: "CW" })).toEqual({ error: "spotNoReference" })
    expect(selfSpotBody({ operation: operation(), freq: 14062 })).toEqual({ error: "spotNoMode" })
    expect(selfSpotBody({ operation: operation(), freq: 0, mode: "CW" })).toEqual({ error: "spotNoFrequency" })
  })

  it("a re-spot credits the activator at the QSO's hunted site", () => {
    expect(otherSpotBody({ qso: qso({ call: "yo4rdw", freq: 7032, mode: "CW", hunted: ["RO-H0031"] }), comment: "tnx" })).toEqual({
      body: { reference: "RO-H0031", freq_khz: 7032, mode: "CW", comment: "tnx", source: "respot", for_activator: "YO4RDW" },
    })
    expect(otherSpotBody({ qso: qso({ call: "YO4RDW" }) })).toEqual({ error: "spotNoHuntedReference" })
  })

  it("repeats the server's own reason for a refusal", () => {
    expect(interpretSpotResponse(201, '{"id":1,"created_at":"..."}', ctx(), "done")).toEqual({ ok: true, message: "done" })
    expect(interpretSpotResponse(400, '{"error":"frequency 99999 kHz outside known ham bands"}', ctx(), "done")).toEqual({
      ok: false,
      message: "HOTA did not accept the spot: frequency 99999 kHz outside known ham bands",
    })
    expect(interpretSpotResponse(429, '{"error":"too many new spots — wait 20 seconds between different references"}', ctx(), "done").message).toContain("wait 20 seconds")
    expect(interpretSpotResponse(500, "oops", ctx(), "done").message).toContain("HTTP 500")
    const rejected = interpretSpotResponse(403, '{"error":"invalid API key"}', ctx(), "done")
    expect(rejected.ok).toBe(false)
    expect(rejected.userMessage?.actions).toEqual([{ type: "account", label: "Connect", key: "yo3bee-hota" }])
  })
})

describe("spots hook", () => {
  let kernel: FakeKernel
  let spots: any
  let account: any

  beforeAll(async () => {
    installFakeKernel()
    kernel = await loadExtension()
    spots = kernel.hook("spots", "yo3bee-hota")
    account = kernel.hook("account", "yo3bee-hota")
  })

  beforeEach(() => {
    kernel.fetches.length = 0
    kernel.logs.length = 0
  })

  it("fetches the public feed without any key", async () => {
    kernel.respondWith(() => ({ status: 200, body: JSON.stringify([LIVE_ROW]) }))
    const result = await spots.fetchSpots({}, ctx())
    expect(result.length).toBe(1)
    expect(kernel.fetches[0]).toMatchObject({ url: "https://cqhota.app/api/v1/spots", method: "GET" })
    expect(kernel.fetches[0].headers["X-Api-Key"]).toBeUndefined()
  })

  it("answers with nothing offline, on an error, or when the server is down", async () => {
    expect(await spots.fetchSpots({}, ctx({ online: false }))).toEqual([])
    expect(kernel.fetches.length).toBe(0)
    kernel.respondWith(() => ({ status: 503, body: "" }))
    expect(await spots.fetchSpots({}, ctx())).toEqual([])
    kernel.respondWith(() => { throw new Error("no route to host") })
    expect(await spots.fetchSpots({}, ctx())).toEqual([])
    expect(kernel.logs.some((l) => l.includes("no route to host"))).toBe(true)
  })

  it("offers self-spotting only while activating a HOTA site", async () => {
    expect(await spots.isSelfSpotEnabled({ operation: operation(["RO-H0142"]) }, ctx())).toEqual({ enabled: true, icon: "castle" })
    expect(await spots.isSelfSpotEnabled({ operation: operation([]) }, ctx())).toEqual({ enabled: false, icon: "castle" })
    expect(await spots.isOtherSpotEnabled({ qso: qso({ call: "YO4RDW", hunted: ["RO-H0031"] }) }, ctx())).toMatchObject({ enabled: true })
    expect(await spots.isOtherSpotEnabled({ qso: qso({ call: "YO4RDW" }) }, ctx())).toMatchObject({ enabled: false })
  })

  it("asks for the account before posting, without touching the network", async () => {
    const result = await spots.postSelfSpot({ operation: operation(["RO-H0142"]), freq: 14062, mode: "CW" }, ctx())
    expect(result.ok).toBe(false)
    expect(result.userMessage).toMatchObject({ presentation: "dialog", actions: [{ type: "account", key: "yo3bee-hota" }] })
    expect(kernel.fetches.length).toBe(0)
  })

  it("posts a self-spot with the operator's key, exactly as the API documents", async () => {
    kernel.respondWith(() => ({ status: 201, body: '{"id":1043,"created_at":"2026-08-14T09:41:00Z"}' }))
    const result = await spots.postSelfSpot(
      { operation: operation(["RO-H0142"]), freq: 14062, mode: "CW", comment: "CQ HOTA, CQ POTA" },
      ctx({ account: { credentials: { apiKey: "secret-key" } } }),
    )
    expect(result).toEqual({ ok: true, message: "Spotted on HOTA at RO-H0142" })
    expect(kernel.fetches[0]).toMatchObject({
      url: "https://cqhota.app/api/v1/spots",
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": "secret-key" },
    })
    expect(JSON.parse(kernel.fetches[0].body!)).toEqual({
      reference: "RO-H0142",
      freq_khz: 14062,
      mode: "CW",
      comment: "CQ HOTA, CQ POTA",
      source: "self",
    })
  })

  it("re-spots a station just worked", async () => {
    kernel.respondWith(() => ({ status: 201, body: "{}" }))
    const result = await spots.postOtherSpot(
      { qso: qso({ call: "YO4RDW", freq: 7032, mode: "CW", hunted: ["RO-H0031"] }), comment: "tnx" },
      ctx({ account: { credentials: { apiKey: "secret-key" } }, locale: "ro" }),
    )
    expect(result).toEqual({ ok: true, message: "Re-spotat YO4RDW pe HOTA la RO-H0031" })
    expect(JSON.parse(kernel.fetches[0].body!)).toMatchObject({ source: "respot", for_activator: "YO4RDW", reference: "RO-H0031" })
  })

  it("passes the server's refusal on, and survives the network going away", async () => {
    const withKey = ctx({ account: { credentials: { apiKey: "secret-key" } } })
    kernel.respondWith(() => ({ status: 422, body: '{"error":"outside the 500 m limit"}' }))
    expect(await spots.postSelfSpot({ operation: operation(), freq: 14062, mode: "CW" }, withKey)).toEqual({
      ok: false,
      message: "HOTA did not accept the spot: outside the 500 m limit",
    })
    kernel.respondWith(() => { throw new Error("timeout") })
    expect((await spots.postSelfSpot({ operation: operation(), freq: 14062, mode: "CW" }, withKey)).message).toContain("timeout")
  })

  it("the account test names who the key belongs to", async () => {
    expect(await account.testCredentials({ apiKey: "" }, ctx())).toBe("Enter your cqhota.app API key")
    kernel.respondWith(({ headers }) =>
      headers["X-Api-Key"] === "good" ? { status: 200, body: '{"callsign":"YO3BEE","role":"user"}' } : { status: 403, body: '{"error":"invalid API key"}' },
    )
    expect(await account.testCredentials({ apiKey: "good" }, ctx())).toBe("✅ Connected as YO3BEE")
    expect(await account.testCredentials({ apiKey: "bad" }, ctx())).toBe("cqhota.app rejected this API key")
    expect(kernel.fetches[0]).toMatchObject({ url: "https://cqhota.app/api/v1/me", headers: { "X-Api-Key": "good" } })
    expect(account.kvKey).toBe("yo3bee-hota")
    expect((await account.fields({}, ctx()))[0]).toMatchObject({ key: "apiKey", type: "secret" })
  })
})
