/**
 * Request-scoped holder for the resolved tenant config — the Rule-3-safe
 * replacement for the Phase-1 module-global singleton.
 *
 * There is NO module-global "current tenant" on the server. The active holder
 * is resolved per read, in priority order:
 *
 *   1. Browser: a client-module holder. A browser runtime serves exactly one
 *      tenant per page load (seeded by <TenantConfigProvider>), so module
 *      state is safe THERE — the concurrency hazard is server-side only.
 *   2. Server, explicit scope: a provider registered by `lib/tenant-context`
 *      returns the AsyncLocalStorage store established by
 *      `withTenantContext()` (tests, scripts, cron — non-request contexts).
 *   3. Server, Next request: a React `cache()` cell — per-request by
 *      framework contract (the same AsyncLocalStorage-backed rail `auth()`
 *      and `getDbUserBySession` already ride).
 *
 * `holderProvider` is a function pointer wired once at server startup
 * (environment plumbing, carries no tenant data) — it is not tenant state.
 */
import { cache } from "react";
import type { TenantConfig } from "./index";

export type TenantHolder = {
  cfg: TenantConfig | null;
  tenantId: string | null;
};

/** Per-request cell in the Next.js server runtime. */
const requestHolder = cache((): TenantHolder => ({ cfg: null, tenantId: null }));

let holderProvider: (() => TenantHolder | null) | null = null;

/** Wired by lib/tenant-context (ALS scopes for tests/scripts). Startup-only. */
export function registerHolderProvider(provider: () => TenantHolder | null): void {
  holderProvider = provider;
}

/** Browser-side holder — single tenant per page load, seeded by the provider component. */
let clientHolder: TenantHolder | null = null;

export function activeHolder(): TenantHolder {
  if (typeof window !== "undefined") {
    if (!clientHolder) clientHolder = { cfg: null, tenantId: null };
    return clientHolder;
  }
  const scoped = holderProvider?.();
  if (scoped) return scoped;
  return requestHolder();
}

/** Prime the active holder with the resolved config (server resolver / tests). */
export function primeTenantHolder(cfg: TenantConfig, tenantId: string | null): void {
  const holder = activeHolder();
  holder.cfg = cfg;
  holder.tenantId = tenantId;
}

/** Seed the browser holder from server-resolved config (TenantConfigProvider). */
export function primeClientTenantConfig(cfg: TenantConfig): void {
  if (typeof window === "undefined") return; // never touch shared server module state
  if (!clientHolder) clientHolder = { cfg: null, tenantId: null };
  clientHolder.cfg = cfg;
}
