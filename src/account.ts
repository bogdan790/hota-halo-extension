// Copyright ©️ 2026 Bogdan Pavel, YO3BEE — HOTA, History On The Air
// SPDX-License-Identifier: MIT
//
// The operator's cqhota.app integration key. Reading HOTA needs no key at
// all; only posting a spot does, and the key is the operator's own, generated
// under My Account → Integration API key. It lives in the platform keychain through the `account`
// hook — never in a settings field, never in this repository.

import { host } from "@ham2k/extension-sdk"
import type { AccountHook, HookContext } from "@ham2k/extension-sdk"

import { tFor } from "./i18n.js"
import { API_BASE, EXTENSION_KEY } from "./program.js"

export const API_KEY_FIELD = "apiKey"
/// The integration key cqhota.app issues per user under My Account →
/// Integration API key. Its scope is deliberately narrow — posting spots and
/// reading the operator's own summary — which is all this extension needs.
export const API_KEY_HEADER = "X-Integration-Key"
export const CREDENTIALS_CHECK_URL = `${API_BASE}/me/summary`

/// The key the operator stored, or undefined when the account is not set up.
export function apiKeyFrom(ctx: HookContext): string | undefined {
  const key = ctx.account?.credentials?.[API_KEY_FIELD]?.trim()
  return key ? key : undefined
}

export const HotaAccount: AccountHook = {
  label: (_args, ctx) => tFor(ctx)("accountLabel"),
  description: (_args, ctx) => tFor(ctx)("accountDescription"),
  kvKey: EXTENSION_KEY,
  // One key per cqhota.app account, the same on every device the operator
  // owns — so it may ride iCloud Keychain.
  synchronizable: true,
  fields: (_args, ctx) => [
    {
      key: API_KEY_FIELD,
      label: tFor(ctx)("accountApiKey"),
      type: "secret",
      preface: tFor(ctx)("accountApiKeyPreface"),
    },
  ],

  /// The string returned is the only feedback the operator gets, so it names
  /// the account the key opened rather than saying "OK".
  async testCredentials(credentials: Record<string, string>, ctx: HookContext): Promise<string> {
    const t = tFor(ctx)
    const key = (credentials[API_KEY_FIELD] ?? "").trim()
    if (!key) return t("accountMissingKey")

    try {
      const response = await host.fetch(CREDENTIALS_CHECK_URL, { headers: { [API_KEY_HEADER]: key } })
      if (response.status === 401 || response.status === 403) return t("accountInvalidKey")
      if (response.status !== 200) return t("accountUnreachable", { message: `HTTP ${response.status}` })
      const me = parseJson(response.body)
      const callsign = typeof me?.callsign === "string" ? me.callsign : "?"
      return t("accountConnected", { callsign })
    } catch (e) {
      return t("accountUnreachable", { message: (e as Error).message ?? String(e) })
    }
  },
}

export function parseJson(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
