// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// HOTA — History On The Air — for the Ham2K Logger. Historic sites over 200
// years old, activated with five distinct callsigns in a UTC day.
//
// What this file does is say which hook goes where. The program's own rules
// live in program.ts and scoring.ts; the reference code logic in
// references.ts; the network in spots.ts, account.ts and dataFile.ts.

import { activityExportHook, contestScorer, defineExtension, huntingExportHook } from "@ham2k/extension-sdk"

import manifest from "../manifest.json" with { type: "json" }
import { HotaAccount } from "./account.js"
import { activityHook, adifFieldsHook, adifImportHook, refHandler } from "./activity.js"
import { DATA_FILE_KEY, referencesDataFile } from "./dataFile.js"
import { ACTIVATION_TYPE, EXTENSION_KEY, HUNTING_TYPE, ICON, PROGRAM } from "./program.js"
import { hotaScorer } from "./scoring.js"
import { HotaSpots } from "./spots.js"

export const HUNTER_EXPORT_KEY = `${EXTENSION_KEY}-hunter`

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    // One handler, both types: an activation and a hunted reference are the
    // same site, validated and decorated the same way.
    registerHook(`ref:${HUNTING_TYPE}`, { hook: refHandler, key: EXTENSION_KEY })
    registerHook(`ref:${ACTIVATION_TYPE}`, { hook: refHandler, key: EXTENSION_KEY })

    // Registered under the extension key so `yo3bee-hota:` scopes the
    // Activities search to HOTA alone.
    registerHook("activity", { hook: activityHook, key: EXTENSION_KEY })

    // The ADIF fields are asked for by key: the export below names this
    // extension as the file's main handler, and the `adif` core exporter
    // looks the hook up under exactly this key.
    registerHook("adifFields", { hook: adifFieldsHook, key: EXTENSION_KEY })
    registerHook("adifImport", { hook: adifImportHook, key: EXTENSION_KEY })

    registerHook("dataFile", { hook: referencesDataFile, key: DATA_FILE_KEY })

    // One ADIF per activated site, carrying MY_SIG/MY_SIG_INFO/MY_HOTA_REF
    // and, per HOTA-to-HOTA contact, SIG/SIG_INFO/HOTA_REF — the file
    // cqhota.app's uploader reads. Plus a hunter log for an operation that
    // only worked HOTA stations.
    registerHook("export", {
      hook: activityExportHook({ key: EXTENSION_KEY, label: PROGRAM, activationType: ACTIVATION_TYPE, icon: ICON }),
      key: EXTENSION_KEY,
    })
    registerHook("export", {
      hook: huntingExportHook({
        key: EXTENSION_KEY,
        label: PROGRAM,
        huntingType: HUNTING_TYPE,
        activationType: ACTIVATION_TYPE,
        icon: ICON,
        color: manifest.accentColor,
      }),
      key: HUNTER_EXPORT_KEY,
    })

    // `scope` keeps this scorer out of operations with no HOTA reference.
    registerHook("scoring", {
      hook: contestScorer(hotaScorer(), {
        scope: { refTypes: [ACTIVATION_TYPE, HUNTING_TYPE], huntingRefTypes: [HUNTING_TYPE] },
      }),
      key: EXTENSION_KEY,
    })

    registerHook("spots", { hook: HotaSpots, key: EXTENSION_KEY })
    registerHook("account", { hook: HotaAccount, key: EXTENSION_KEY })
  },
})
