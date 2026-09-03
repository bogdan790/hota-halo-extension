import { beforeAll, describe, expect, it } from "vitest"

import { ctx, installFakeKernel, loadExtension, operation, qso, type FakeKernel } from "./kernel.js"

let kernel: FakeKernel
let scoring: any

beforeAll(async () => {
  installFakeKernel()
  kernel = await loadExtension()
  scoring = kernel.hook("scoring", "yo3bee-hota")
})

const CALLS = ["YO4RDW", "DL3KZA", "SP9ABC", "HA5XYZ", "OK1DEF", "F5GHI"]
const at = (minutes: number, day = 14) => `2026-08-${String(day).padStart(2, "0")}T09:${String(minutes).padStart(2, "0")}:00Z`

async function score(qsos: any[], op = operation()) {
  return scoring.scoreQsos({ operation: op, qsos }, ctx())
}

describe("activation — five distinct callsigns", () => {
  it("is scoped to operations carrying a HOTA reference", () => {
    expect(scoring.scope).toEqual({ refTypes: ["hotaActivation", "hota"], huntingRefTypes: ["hota"] })
  })

  it("four QSOs: not yet — the counter reads 4/5", async () => {
    const result = await score(CALLS.slice(0, 4).map((call, i) => qso({ call, at: at(i) })))
    const activation = result.operationSummary.activation
    expect(activation).toMatchObject({ key: "activation", total: 4, activated: false, summary: "4/5" })
    expect(activation.label).toMatch(/^HOTA: /)
    expect(activation.activatedRefs).toEqual({ "RO-H0235": 4 })
    expect(result.daySections[0].scores.activation).toMatchObject({ summary: "4/5", activated: false })
  })

  it("five QSOs with five callsigns: activated", async () => {
    const result = await score(CALLS.slice(0, 5).map((call, i) => qso({ call, at: at(i) })))
    expect(result.operationSummary.activation).toMatchObject({ total: 5, activated: true, summary: "5 ✓" })
    expect(Object.values(result.qsoScores).every((s: any) => s.value === 1)).toBe(true)
  })

  it("five QSOs but only four callsigns: a repeat does not count", async () => {
    const qsos = [
      ...CALLS.slice(0, 4).map((call, i) => qso({ call, at: at(i) })),
      qso({ call: "YO4RDW", at: at(10) }),
    ]
    const result = await score(qsos)
    expect(result.operationSummary.activation).toMatchObject({ total: 4, activated: false, summary: "4/5", duplicates: 1 })
    expect(result.qsoScores[qsos[4].uuid]).toMatchObject({ value: 0, dupe: true, alerts: ["duplicate"] })
  })

  it("the same station on another band or mode is still the same callsign", async () => {
    const qsos = [
      ...CALLS.slice(0, 4).map((call, i) => qso({ call, at: at(i) })),
      qso({ call: "YO4RDW", band: "40m", mode: "CW", freq: 7030, at: at(10) }),
    ]
    const result = await score(qsos)
    expect(result.operationSummary.activation).toMatchObject({ total: 4, activated: false })
  })

  it("the same station on the next UTC day counts again — each day stands alone", async () => {
    const day1 = CALLS.slice(0, 5).map((call, i) => qso({ call, at: at(i, 14) }))
    const day2 = CALLS.slice(0, 5).map((call, i) => qso({ call, at: at(i, 15) }))
    const result = await score([...day1, ...day2])
    expect(result.qsoScores[day2[0].uuid]).toMatchObject({ value: 1, notices: ["newDay"] })
    expect(result.daySections.length).toBe(2)
    expect(result.daySections[1].scores.activation).toMatchObject({ total: 5, activated: true })
    expect(result.operationSummary.activation).toMatchObject({ total: 10, activated: true })
  })

  it("a callsign variant is a different callsign, as on the air", async () => {
    const result = await score([qso({ call: "YO4RDW", at: at(0) }), qso({ call: "YO4RDW/P", at: at(1) })])
    expect(result.operationSummary.activation).toMatchObject({ total: 2, duplicates: 0 })
  })

  it("a QSO with no callsign scores nothing and breaks nothing", async () => {
    const result = await score([qso({ call: "", at: at(0) })])
    expect(Object.values(result.qsoScores)[0]).toEqual({ value: 0 })
  })
})

describe("two sites at once", () => {
  it("each reference needs its own five, and the counter shows the lowest", async () => {
    const op = operation(["RO-H0235", "RO-H0001"])
    const result = await score(CALLS.slice(0, 3).map((call, i) => qso({ call, at: at(i) })), op)
    expect(result.operationSummary.activation.activatedRefs).toEqual({ "RO-H0235": 3, "RO-H0001": 3 })
    expect(result.operationSummary.activation.summary).toBe("3/5")
    expect(result.operationSummary.activation.longSummary).toContain("❌ RO-H0001: 3/5")
  })
})

describe("HOTA-to-HOTA", () => {
  it("a hunted site is credited and named in the summary", async () => {
    const qsos = [
      qso({ call: "YO4RDW", at: at(0), hunted: ["RO-H0142"] }),
      qso({ call: "DL3KZA", at: at(1) }),
    ]
    const result = await score(qsos)
    expect(result.qsoScores[qsos[0].uuid].value).toBe(2)
    expect(result.operationSummary.activation.label).toContain("HOTA-to-HOTA")
  })

  it("a station at two sites credits both — the same as park-to-park on two parks", async () => {
    const qsos = [qso({ call: "YO4RDW", at: at(0), hunted: ["RO-H0142", "RO-H0143"] })]
    const result = await score(qsos)
    expect(result.qsoScores[qsos[0].uuid].value).toBe(4)
    expect(result.operationSummary.activation.activatedRefs).toEqual({ "RO-H0235": 2 })
  })

  it("a pure hunter operation tallies sites hunted", async () => {
    const op = operation([])
    const qsos = [
      qso({ call: "YO4RDW", at: at(0), hunted: ["RO-H0142"] }),
      qso({ call: "DL3KZA", at: at(1), hunted: ["RO-H0142"] }),
      qso({ call: "SP9ABC", at: at(2), hunted: ["PL-H0007"] }),
    ]
    const result = await score(qsos, op)
    expect(result.operationSummary.activation).toBeUndefined()
    expect(result.operationSummary.hunting).toMatchObject({ key: "hunting", total: 2, huntedQsos: 3 })
    expect(result.operationSummary.hunting.label).toBe("HOTA: 2 sites hunted")
  })
})

describe("live path", () => {
  it("warns about a duplicate while the callsign is being typed", async () => {
    kernel.hooks // ensure loaded
    const logged = CALLS.slice(0, 2).map((call, i) => qso({ call, at: at(i) }))
    const live = await scoring.scoreQso(
      { operation: operation(), qso: qso({ call: "YO4RDW", at: at(5) }), resumeFrom: (await score(logged)).scoresheet },
      ctx(),
    )
    expect(live).toEqual({ notices: [], alerts: ["duplicate"] })
  })
})

describe("live path — the QSO being typed has no time yet", () => {
  it("a repeat typed right now is a duplicate, not a new day", async () => {
    const logged = CALLS.slice(0, 3).map((call, i) => qso({ call, at: at(i) }))
    const now = Date.now()
    const untimed = { ...qso({ call: "YO4RDW" }), startAt: undefined, startAtMillis: undefined }
    // The log sits on today's UTC day, like the real thing.
    const today = logged.map((q) => ({ ...q, startAtMillis: now - 5 * 60_000 - (3 - Number(q.uuid.slice(4)) % 3) * 1000, startAt: undefined }))
    const live = await scoring.scoreQso({ operation: operation(), qso: untimed, resumeFrom: (await score(today)).scoresheet }, ctx())
    expect(live).toEqual({ notices: [], alerts: ["duplicate"] })
    const fresh = await scoring.scoreQso({ operation: operation(), qso: { ...untimed, their: { call: "F5GHI" } }, resumeFrom: (await score(today)).scoresheet }, ctx())
    expect(fresh).toEqual({ notices: [], alerts: [] })
  })

  it("a QSO with only an ISO time is placed on that day", async () => {
    const logged = [qso({ call: "YO4RDW", at: at(0, 14) })]
    const nextDay = { ...qso({ call: "YO4RDW" }), startAtMillis: undefined, startAt: "2026-08-15T10:00:00Z" }
    const live = await scoring.scoreQso({ operation: operation(), qso: nextDay, resumeFrom: (await score(logged)).scoresheet }, ctx())
    expect(live).toEqual({ notices: ["newDay"], alerts: [] })
  })

  it("the spots panel judges many untimed candidates at once", async () => {
    const now = Date.now()
    const logged = [{ ...qso({ call: "YO4RDW" }), startAtMillis: now - 60_000, startAt: undefined }]
    const result = await scoring.scoreCandidates(
      {
        operation: operation(),
        candidates: [
          { key: "a", qso: { their: { call: "YO4RDW" }, band: "40m", mode: "CW" } },
          { key: "b", qso: { their: { call: "DL3KZA" }, band: "40m", mode: "CW" } },
        ],
        resumeFrom: (await score(logged)).scoresheet,
      },
      ctx(),
    )
    expect(result).toEqual({ a: { notices: [], alerts: ["duplicate"] }, b: { notices: [], alerts: [] } })
  })
})
