// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// The reference list, downloaded by the host and kept offline. This is what
// makes `RO-H0235` resolve to a name with no signal at the site. The host
// does the fetching, the scheduling and the storage (and sends the
// conditional request if the server's ETag makes one possible); this file's
// whole job is turning one entry of the export into one lookup row.

import type { DataFileDefinition, HookContext } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.js"
import { API_BASE, CATEGORY, EXTENSION_KEY } from "./program.js"
import { referenceEntryFromApi } from "./references.js"

export const DATA_FILE_KEY = `${EXTENSION_KEY}-references`

export const REFERENCES_EXPORT_URL = `${API_BASE}/references/export`

export const referencesDataFile: DataFileDefinition = {
  key: DATA_FILE_KEY,
  name: (_args: Record<string, never>, ctx: HookContext) => tFor(ctx)("dataFileName"),
  description: (_args: Record<string, never>, ctx: HookContext) => tFor(ctx)("dataFileDescription"),
  url: REFERENCES_EXPORT_URL,
  // The export's `version` is the date of the last change; sites are added
  // weekly while the program grows, so a week is the longest a list should
  // sit. The response is small (a few hundred KB) and cached upstream.
  maxAgeInDays: 7,
  fetchType: "json",
  // The export wraps its array: {program, version, count, references: [...]}
  jsonOptions: { rootPath: "references" },
  category: CATEGORY,
  jsonToLookupEntry: referenceEntryFromApi,
}
