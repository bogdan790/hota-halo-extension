import { beforeAll, describe, expect, it } from "vitest"

import { ctx, installFakeKernel, loadExtension, operation, qso, type FakeKernel } from "./kernel.js"

let kernel: FakeKernel
let adifFields: any
let adifImport: any
let activationExport: any
let hunterExport: any

/// A stand-in for the app's core `adif` exporter: the part of it that
/// matters here, which is asking the export's main handler for its fields
/// and writing one record per field set.
function fakeAdifCore(kernel: FakeKernel) {
  return {
    async generateExport(args: any, hookCtx: any) {
      const handler = kernel.hook(`adifFields`, args.mainHandler)
      const lines = ["Ham2K test export", "<ADIF_VER:5>3.1.4", "<PROGRAMID:10>Ham2K Test", "<EOH>"]
      const field = (name: string, value: string) => `<${name}:${String(value).length}>${value}`
      for (const q of args.qsos) {
        const sets: { name: string; value: string }[][] = handler.fieldCombinationsForOneQSO
          ? await handler.fieldCombinationsForOneQSO({ qso: q, operation: args.operation }, hookCtx)
          : [await handler.fieldsForOneQSO({ qso: q, operation: args.operation }, hookCtx)]
        sets.forEach((set, i) => {
          const at = new Date(q.startAtMillis + i * 1000)
          const date = at.toISOString().slice(0, 10).replace(/-/g, "")
          const time = at.toISOString().slice(11, 19).replace(/:/g, "")
          const written = new Set<string>()
          let line = [field("CALL", q.their.call), field("QSO_DATE", date), field("TIME_ON", time), field("BAND", q.band), field("MODE", q.mode)].join("")
          for (const { name, value } of set) {
            if (written.has(name)) continue
            written.add(name)
            line += field(name, value)
          }
          lines.push(`${line}<EOR>`)
        })
      }
      return { filename: "test.adi", mimeType: "text/plain", content: lines.join("\n") + "\n" }
    },
  }
}

/// A small ADIF reader, enough for the files this extension writes: lowercased
/// field names, values read by declared length, as the app's parser hands
/// them to `adifImport`.
function parseAdif(text: string): { fields: Record<string, string> }[] {
  const body = text.slice(text.toUpperCase().indexOf("<EOH>") + 5)
  const records: { fields: Record<string, string> }[] = []
  for (const chunk of body.split(/<EOR>/i)) {
    const fields: Record<string, string> = {}
    const re = /<([A-Za-z0-9_]+):(\d+)(?::[^>]*)?>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(chunk))) {
      fields[m[1].toLowerCase()] = chunk.substr(m.index + m[0].length, Number(m[2]))
    }
    if (Object.keys(fields).length) records.push({ fields })
  }
  return records
}

beforeAll(async () => {
  installFakeKernel()
  kernel = await loadExtension()
  adifFields = kernel.hook("adifFields", "yo3bee-hota")
  adifImport = kernel.hook("adifImport", "yo3bee-hota")
  activationExport = kernel.hook("export", "yo3bee-hota")
  hunterExport = kernel.hook("export", "yo3bee-hota-hunter")
  kernel.hooks.push({ category: "export", key: "adif", hook: fakeAdifCore(kernel), priority: 0 })
})

describe("ADIF fields — what cqhota.app parses on upload", () => {
  it("an activation writes MY_SIG=HOTA, MY_SIG_INFO and MY_HOTA_REF", async () => {
    const fields = await adifFields.fieldsForOneQSO({ qso: qso({ call: "YO4RDW" }), operation: operation(["RO-H0142"]) }, ctx())
    expect(fields).toEqual([
      { name: "MY_SIG", value: "HOTA" },
      { name: "MY_SIG_INFO", value: "RO-H0142" },
      { name: "MY_HOTA_REF", value: "RO-H0142" },
    ])
  })

  it("a HOTA-to-HOTA contact adds SIG=HOTA, SIG_INFO and HOTA_REF", async () => {
    const fields = await adifFields.fieldsForOneQSO(
      { qso: qso({ call: "YO4RDW", hunted: ["RO-H0031"] }), operation: operation(["RO-H0142"]) },
      ctx(),
    )
    expect(fields).toEqual([
      { name: "SIG", value: "HOTA" },
      { name: "SIG_INFO", value: "RO-H0031" },
      { name: "HOTA_REF", value: "RO-H0031" },
      { name: "MY_SIG", value: "HOTA" },
      { name: "MY_SIG_INFO", value: "RO-H0142" },
      { name: "MY_HOTA_REF", value: "RO-H0142" },
    ])
  })

  it("a station at two sites is two records, one site each", async () => {
    const sets = await adifFields.fieldCombinationsForOneQSO(
      { qso: qso({ call: "YO4RDW", hunted: ["RO-H0031", "RO-H0032"] }), operation: operation(["RO-H0142"]) },
      ctx(),
    )
    expect(sets.length).toBe(2)
    expect(sets[0]).toContainEqual({ name: "SIG_INFO", value: "RO-H0031" })
    expect(sets[0]).toContainEqual({ name: "HOTA_REF", value: "RO-H0031" })
    expect(sets[1]).toContainEqual({ name: "SIG_INFO", value: "RO-H0032" })
    expect(sets.every((s: any[]) => s.some((f) => f.name === "MY_SIG_INFO" && f.value === "RO-H0142"))).toBe(true)
  })

  it("a hunter with no activation writes only the SIG side", async () => {
    const fields = await adifFields.fieldsForOneQSO({ qso: qso({ call: "YO4RDW", hunted: ["RO-H0031"] }), operation: operation([]) }, ctx())
    expect(fields.map((f: any) => f.name)).toEqual(["SIG", "SIG_INFO", "HOTA_REF"])
  })

  it("a plain QSO in a plain operation contributes nothing", async () => {
    expect(await adifFields.fieldsForOneQSO({ qso: qso({ call: "YO4RDW" }), operation: operation([]) }, ctx())).toEqual([])
  })
})

describe("ADIF import — reading cqhota.app's own files back", () => {
  it("recovers the activation and the H2H site from a cqhota.app export record", async () => {
    // The record `GET /api/v1/activations/:id/adif` writes (API.md).
    const record = parseAdif(
      "HOTA log — cqhota.app\n<ADIF_VER:5>3.1.4\n<PROGRAMID:10>CQHOTA.app\n<EOH>\n" +
        "<CALL:6>YO4RDW<STATION_CALLSIGN:6>YO3BEE<OPERATOR:6>YO3BEE<QSO_DATE:8>20260814<TIME_ON:6>094100<BAND:3>20m<MODE:2>CW<FREQ:9>14.062000<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0142<SIG:4>HOTA<SIG_INFO:8>RO-H0031<EOR>\n",
    )
    const [result] = await adifImport.refsForRecords({ records: record }, ctx())
    expect(result).toEqual({
      refs: [
        { type: "hota", ref: "RO-H0031" },
        { type: "hotaActivation", ref: "RO-H0142", for: "operation" },
      ],
    })
  })

  it("reads the *_REF fields alone, as other loggers write them", async () => {
    const [result] = await adifImport.refsForRecords(
      { records: [{ fields: { call: "YO4RDW", my_hota_ref: "RO-H0142", hota_ref: "RO-H0031,RO-H0032" } }] },
      ctx(),
    )
    expect(result.refs).toEqual([
      { type: "hota", ref: "RO-H0031" },
      { type: "hota", ref: "RO-H0032" },
      { type: "hotaActivation", ref: "RO-H0142", for: "operation" },
    ])
  })

  it("repairs what it reads", async () => {
    const [result] = await adifImport.refsForRecords({ records: [{ fields: { my_sig: "hota", my_sig_info: "ro-h142" } }] }, ctx())
    expect(result.refs).toEqual([{ type: "hotaActivation", ref: "RO-H0142", for: "operation" }])
  })

  it("never claims another program's references", async () => {
    const results = await adifImport.refsForRecords(
      {
        records: [
          { fields: { call: "A", my_sig: "POTA", my_sig_info: "RO-0031", my_pota_ref: "RO-0031" } },
          { fields: { call: "B", sig: "SOTA", sig_info: "YO/EC-118", my_sota_ref: "YO/EC-001" } },
          { fields: { call: "C", my_llota_ref: "LLRO-0001" } },
          { fields: { call: "D" } },
        ],
      },
      ctx(),
    )
    expect(results).toEqual([null, null, null, null])
  })

  it("answers positionally, one entry per record", async () => {
    const results = await adifImport.refsForRecords(
      { records: [{ fields: {} }, { fields: { my_sig: "HOTA", my_sig_info: "RO-H0142" } }, { fields: {} }] },
      ctx(),
    )
    expect(results.length).toBe(3)
    expect(results[0]).toBeNull()
    expect(results[1]).not.toBeNull()
    expect(results[2]).toBeNull()
  })
})

describe("export → import round trip", () => {
  const op = operation(["RO-H0142"])
  const qsos = [
    qso({ call: "YO4RDW", mode: "CW", freq: 14062, at: "2026-08-14T09:41:00Z" }),
    qso({ call: "DL3KZA", mode: "CW", freq: 14062, at: "2026-08-14T09:39:00Z", hunted: ["RO-H0031"] }),
    qso({ call: "SP9ABC", mode: "SSB", freq: 14300, at: "2026-08-14T09:45:00Z", hunted: ["PL-H0007", "PL-H0008"] }),
  ]

  it("offers one HOTA file per activated site, dated by the log", async () => {
    const options = await activationExport.suggestExportOptions({ operation: op, qsos }, ctx())
    expect(options).toEqual([
      expect.objectContaining({
        exportType: "yo3bee-hota-adif:RO-H0142",
        format: "adif",
        label: "ADIF for HOTA RO-H0142",
        filename: "2026-08-14 YO3BEE at RO-H0142.adi",
        refType: "hotaActivation",
        selectedByDefault: true,
      }),
    ])
    const compact = await activationExport.suggestExportOptions({ operation: op, qsos, compactFilenames: true }, ctx())
    expect(compact[0].filename).toBe("YO3BEE@RO-H0142-20260814.adi")
  })

  it("writes the file cqhota.app reads, and reads it back to the same references", async () => {
    const file = await activationExport.generateExport({ operation: op, qsos, exportType: "yo3bee-hota-adif:RO-H0142" }, ctx())
    expect(file.filename).toBe("2026-08-14 YO3BEE at RO-H0142.adi")
    expect(file.content).toContain("<MY_SIG:4>HOTA<MY_SIG_INFO:8>RO-H0142<MY_HOTA_REF:8>RO-H0142")
    expect(file.content).toContain("<SIG:4>HOTA<SIG_INFO:8>RO-H0031<HOTA_REF:8>RO-H0031")

    const records = parseAdif(file.content)
    // Three contacts, four records: the two-site contact is written twice.
    expect(records.length).toBe(4)
    expect(records.map((r) => r.fields.call)).toEqual(["YO4RDW", "DL3KZA", "SP9ABC", "SP9ABC"])
    expect(records[2].fields.time_on).toBe("094500")
    expect(records[3].fields.time_on).toBe("094501")

    const imported = await adifImport.refsForRecords({ records }, ctx())
    expect(imported).toEqual([
      { refs: [{ type: "hotaActivation", ref: "RO-H0142", for: "operation" }] },
      { refs: [{ type: "hota", ref: "RO-H0031" }, { type: "hotaActivation", ref: "RO-H0142", for: "operation" }] },
      { refs: [{ type: "hota", ref: "PL-H0007" }, { type: "hotaActivation", ref: "RO-H0142", for: "operation" }] },
      { refs: [{ type: "hota", ref: "PL-H0008" }, { type: "hotaActivation", ref: "RO-H0142", for: "operation" }] },
    ])
  })

  it("a hunter log is offered only when nothing is being activated", async () => {
    expect(await hunterExport.suggestExportOptions({ operation: op, qsos }, ctx())).toEqual([])
    const [option] = await hunterExport.suggestExportOptions({ operation: operation([]), qsos }, ctx())
    expect(option).toMatchObject({ exportType: "yo3bee-hota-hunter", format: "adif", filename: "2026-08-14 YO3BEE for HOTA.adi" })

    const file = await hunterExport.generateExport({ operation: operation([]), qsos, exportType: "yo3bee-hota-hunter" }, ctx())
    const records = parseAdif(file.content)
    expect(records.map((r) => r.fields.call)).toEqual(["DL3KZA", "SP9ABC", "SP9ABC"])
    expect(records.every((r) => r.fields.my_sig === undefined)).toBe(true)
  })
})
