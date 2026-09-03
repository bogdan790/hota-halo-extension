// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// A stand-in for the Ham2K Logger's extension kernel, for tests. The SDK's
// `host` and `hooks` objects talk to `globalThis.__polo`; this installs one
// that answers from memory: a lookup table of references, a scripted
// `fetch`, a key/value store, and a registry of the hooks the extension
// registers so a test can call them the way the app would.

import type { Hook, HookContext, LookupEntry, LookupRow } from "@ham2k/extension-sdk"

export interface FetchCall {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export type FetchResponder = (call: FetchCall) => { status: number; body: string } | Promise<{ status: number; body: string }>

export interface FakeKernelOptions {
  rows?: LookupEntry[]
  category?: string
  fetch?: FetchResponder
}

export interface RegisteredHook {
  category: string
  key: string
  hook: Hook
  priority: number
}

export interface FakeKernel {
  calls: { method: string; params: Record<string, unknown> }[]
  fetches: FetchCall[]
  logs: string[]
  kv: Map<string, unknown>
  hooks: RegisteredHook[]
  definition?: { key: string; hooks?: string[]; [k: string]: unknown }
  hook<T = Record<string, any>>(category: string, key?: string): T
  hookKeys(category: string): string[]
  setRows(rows: LookupEntry[]): void
  respondWith(fetch: FetchResponder): void
}

export const DEFAULT_CATEGORY = "yo3bee-hota"

function rowFrom(entry: LookupEntry, category: string): LookupRow {
  return { category, ...entry }
}

export function installFakeKernel(options: FakeKernelOptions = {}): FakeKernel {
  const category = options.category ?? DEFAULT_CATEGORY
  let rows: LookupRow[] = (options.rows ?? []).map((r) => rowFrom(r, category))
  let respond: FetchResponder = options.fetch ?? (() => ({ status: 404, body: "" }))

  const kernel: FakeKernel & Record<string, unknown> = {
    calls: [],
    fetches: [],
    logs: [],
    kv: new Map(),
    hooks: [],
    definition: undefined,

    hook(category, key) {
      const found = kernel.hooks
        .filter((h) => h.category === category && (key === undefined || h.key === key))
        .sort((a, b) => b.priority - a.priority)[0]
      if (!found) throw new Error(`no hook registered under ${category}${key ? ` / ${key}` : ""}`)
      return found.hook as any
    },
    hookKeys(category) {
      return kernel.hooks.filter((h) => h.category === category).map((h) => h.key)
    },
    setRows(entries) {
      rows = entries.map((r) => rowFrom(r, category))
    },
    respondWith(fetch) {
      respond = fetch
    },

    // --- what the SDK calls -------------------------------------------------

    defineExtension(def: any) {
      kernel.definition = def
      def.onActivation({
        registerHook(category: string, params: { hook: Hook; key?: string; priority?: number }) {
          kernel.hooks.push({ category, key: params.key ?? def.key, hook: params.hook, priority: params.priority ?? 0 })
        },
      })
    },

    log(message: string) {
      kernel.logs.push(message)
    },

    getAccountKvKey() {
      return DEFAULT_CATEGORY
    },

    host: { async showForm() { return null } },

    async hostCall(method: string, params: Record<string, any>) {
      kernel.calls.push({ method, params })
      switch (method) {
        case "fetch": {
          const call: FetchCall = {
            url: params.url,
            method: params.method ?? "GET",
            headers: params.headers ?? {},
            body: params.body,
          }
          kernel.fetches.push(call)
          return respond(call)
        }
        case "kvGet":
          return kernel.kv.get(`${params.ns}/${params.key}`) ?? null
        case "kvSet":
          kernel.kv.set(`${params.ns}/${params.key}`, params.value)
          return undefined
        case "dbLookupSelectOne":
          return rows.find((r) => r.category === params.category && r.key === params.key) ?? null
        case "dbLookupSelectAll": {
          const q = String(params.query ?? "").toUpperCase()
          return rows
            .filter((r) => r.category === params.category)
            .filter((r) => params.subCategory === undefined || r.subCategory === params.subCategory)
            .filter((r) => !params.activeOnly || r.flags !== 0)
            .filter((r) => r.key.toUpperCase().includes(q) || (r.name ?? "").toUpperCase().includes(q))
            .slice(0, 100)
        }
        case "dbLookupSelectByLocation": {
          const { lat, lon, delta } = params
          return rows
            .filter((r) => r.category === params.category)
            .filter((r) => !params.activeOnly || r.flags !== 0)
            .filter((r) => r.lat != null && r.lon != null && Math.abs(r.lat - lat) <= delta && Math.abs(r.lon - lon) <= delta)
        }
        case "getLocation":
          return null
        case "getSettings":
          return {}
        case "statusBarSetMessage":
        case "statusBarSetProgress":
        case "statusBarClear":
        case "statusBarShowNotice":
        case "statusBarDismissNotice":
        case "showMessage":
          return undefined
        default:
          throw new Error(`fake kernel: unhandled host call ${method}`)
      }
    },

    // `hooks.invokeOne`/`invokeAll` — routes to the registered hooks, the
    // way the runtime does inside the sandbox.
    async invokeLocal(category: string, method: string, args: unknown, _online?: boolean, key?: string) {
      const targets = kernel.hooks.filter((h) => h.category === category && (key === undefined || h.key === key))
      const results = []
      for (const target of targets) {
        const fn = (target.hook as any)[method]
        if (typeof fn !== "function") continue
        try {
          results.push({ key: target.key, ok: true, value: await fn.call(target.hook, args, ctx()) })
        } catch (e) {
          results.push({ key: target.key, ok: false, error: (e as Error).message })
        }
      }
      return results
    },
  }

  ;(globalThis as any).__polo = kernel
  return kernel
}

/// Loads the extension against the installed fake kernel. Each test file is
/// its own module graph under vitest, so this runs `defineExtension` once
/// per file.
export async function loadExtension(): Promise<FakeKernel> {
  const kernel = (globalThis as any).__polo as FakeKernel | undefined
  if (!kernel) throw new Error("installFakeKernel() first")
  await import("../src/index.js")
  return kernel
}

export function ctx(overrides: Partial<HookContext> = {}): HookContext {
  return { online: true, locale: "en", appName: "Ham2K Logger (test)", ...overrides }
}

// --- fixtures ---------------------------------------------------------------

/// A handful of references from the real export, plus a Polish and a
/// Hungarian one sharing a number with a Romanian one, which is what the
/// numeric search has to tell apart.
export const REFERENCES: LookupEntry[] = [
  entry("RO-H0235", "Râșnov Citadel", "Cetatea Râșnov", "BV", 45.5861, 25.4622),
  entry("RO-H0283", "Old Princely Court Bucharest", "Curtea Veche București", "B", 44.43, 26.1017),
  entry("RO-H0084", "Stavropoleos Church", "Biserica Stavropoleos București", "B", 44.4319, 26.0989),
  entry("RO-H0001", "Bran Castle", "Castelul Bran", "BV", 45.5149, 25.3672),
  entry("PL-H0235", "Wawel Castle", "Zamek Królewski na Wawelu", "12", 50.0541, 19.9352),
  entry("HU-H0235", "Buda Castle", "Budai Vár", "BU", 47.4962, 19.0394),
  entry("BG-H0001", "Boyana Church", "Боянска църква", "22", 42.6444, 23.2661),
  { ...entry("RO-H0999", "Retired Site", "Sit retras", "B", 44.44, 26.11), flags: 0 },
]

export function entry(code: string, name: string, nameLocal: string, county: string, lat: number, lon: number): LookupEntry {
  return {
    subCategory: code.slice(0, 2),
    key: code,
    name,
    lat,
    lon,
    flags: 1,
    data: { ref: code, name, nameLocal, location: county, lat, lon },
  }
}

export const BUCHAREST = { lat: 44.4268, lon: 26.1025 }
export const BRASOV = { lat: 45.6427, lon: 25.5887 }
export const KRAKOW = { lat: 50.0614, lon: 19.9366 }

let qsoCounter = 0

export interface QsoOptions {
  call: string
  band?: string
  mode?: string
  at?: string
  freq?: number
  hunted?: string[]
}

export function qso({ call, band = "20m", mode = "SSB", at = "2026-08-14T09:41:00Z", freq = 14300, hunted = [] }: QsoOptions) {
  qsoCounter += 1
  return {
    uuid: `qso-${qsoCounter}`,
    our: { call: "YO3BEE" },
    their: { call },
    freq,
    band,
    mode,
    startAt: at,
    startAtMillis: Date.parse(at),
    refs: hunted.map((ref) => ({ type: "hota", ref })),
  }
}

export function operation(activating: string[] = ["RO-H0235"], extraRefs: { type: string; ref: string }[] = []) {
  return {
    uuid: "op-1",
    stationCall: "YO3BEE",
    operatorCall: "YO3BEE",
    refs: [...activating.map((ref) => ({ type: "hotaActivation", ref })), ...extraRefs],
  }
}
