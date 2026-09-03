// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT

import { createCachedTranslator } from "@ham2k/extension-sdk"

import en from "./i18n/en.json" with { type: "json" }
import ro from "./i18n/ro.json" with { type: "json" }

/// Every user-visible string reaches the SDK through this, keyed on the
/// app's locale. English is the fallback for every locale without a catalog.
export const tFor = createCachedTranslator({ en: { translation: en }, ro: { translation: ro } })
