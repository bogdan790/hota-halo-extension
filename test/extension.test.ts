import { beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import manifest from "../manifest.json" with { type: "json" }
import { referencesDataFile } from "../src/dataFile.js"
import { ctx, installFakeKernel, loadExtension, type FakeKernel } from "./kernel.js"

let kernel: FakeKernel

beforeAll(async () => {
  installFakeKernel()
  kernel = await loadExtension()
})

describe("registration", () => {
  it("registers exactly the hook categories the manifest declares", () => {
    const registered = [...new Set(kernel.hooks.map((h) => h.category))].sort()
    expect(registered).toEqual([...manifest.hooks].sort())
  })

  it("keys the hooks the app looks up by key under the extension key", () => {
    for (const category of ["activity", "adifFields", "adifImport", "scoring", "spots", "account", "ref:hota", "ref:hotaActivation"]) {
      expect(kernel.hookKeys(category)).toEqual(["yo3bee-hota"])
    }
    expect(kernel.hookKeys("export").sort()).toEqual(["yo3bee-hota", "yo3bee-hota-hunter"])
    expect(kernel.hookKeys("dataFile")).toEqual(["yo3bee-hota-references"])
  })

  it("has a distributable manifest: callsign key, activity category, one domain, no secrets", () => {
    expect(manifest.key).toMatch(/^yo3bee-[a-z0-9-]+$/)
    expect(manifest.category).toBe("activity")
    expect(manifest.api).toBe(1)
    expect(manifest.domains).toEqual(["cqhota.app"])
    expect(JSON.stringify(manifest)).not.toMatch(/api[_-]?key|secret|token/i)
  })

  it("does not carry a private copy of any host library", () => {
    const bundle = readFileSync(new URL("../build/index.js", import.meta.url), "utf8")
    for (const lib of Object.keys(manifest.sharedDependencies)) {
      expect(bundle).toContain(`__polo.sharedModules[${JSON.stringify(lib)}]`)
    }
    expect(bundle).not.toMatch(/node_modules\/i18next/)
  })
})

describe("data file", () => {
  it("points at the public export and files rows under the extension's category", async () => {
    expect(referencesDataFile.url).toBe("https://cqhota.app/api/v1/references/export")
    expect(referencesDataFile.fetchType).toBe("json")
    expect(referencesDataFile.jsonOptions).toEqual({ rootPath: "references" })
    expect(referencesDataFile.category).toBe("yo3bee-hota")
    expect(referencesDataFile.maxAgeInDays).toBeGreaterThan(0)
    expect(await (referencesDataFile.name as any)({}, ctx())).toBe("HOTA references")
    expect(await (referencesDataFile.name as any)({}, ctx({ locale: "ro" }))).toBe("Referințe HOTA")
  })
})
