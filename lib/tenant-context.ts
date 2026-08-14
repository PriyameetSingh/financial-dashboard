/**
 * Server-side tenant resolution — Phase 2 Gate C.
 *
 * Request flow: proxy.ts strips any client-supplied TENANT_HEADER, derives a
 * slug candidate from the Host, and forwards it on the internal header. Here,
 * `getTenantContext()` (React `cache()` — one resolution per request) reads
 * that header, resolves the active tenant row, loads its config entries, and
 * overlays them onto ODISHA_DEFAULTS. Resolving also primes the request-scoped
 * holder so the existing sync `tenantConfig()` call sites see the DB-resolved
 * config for the rest of the request.
 *
 * Unresolved policy (plan §7c): a slug that matches an active tenant wins;
 * otherwise, while EXACTLY ONE active tenant exists, default to it. The moment
 * a second tenant is active, unresolved requests get TenantResolutionError
 * (deny) — the flip is computed from tenants.status, not from an operator
 * setting or a hardcoded slug. DEV_DEFAULT_TENANT_SLUG applies in development
 * only.
 *
 * Rule 3: no module-global tenant state. The only stores are Next's own
 * request-scoped rails (headers() / React cache()) and, for non-request
 * contexts (tests, scripts, cron), an explicit AsyncLocalStorage scope entered
 * via `withTenantContext()`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { findActiveTenant } from "@/lib/tenant-resolve-db";
import { ODISHA_DEFAULTS, type TenantConfig } from "@/lib/tenant-config";
import { overlayConfigEntries } from "@/lib/tenant-config/registry";
import { TENANT_HEADER } from "@/lib/tenant-config/resolution";
import {
  primeTenantHolder,
  registerHolderProvider,
  type TenantHolder,
} from "@/lib/tenant-config/request-store";

/** Explicit scope for non-request contexts; see withTenantContext(). */
const explicitScope = new AsyncLocalStorage<TenantHolder>();
registerHolderProvider(() => explicitScope.getStore() ?? null);

export class TenantResolutionError extends Error {
  status = 404;
  constructor() {
    super("No tenant resolved for this request");
  }
}

export type TenantContext = {
  tenantId: string;
  slug: string;
  config: TenantConfig;
};

export async function loadTenantConfigFromDb(tenantId: string): Promise<TenantConfig> {
  const rows = await prisma.tenantConfigEntry.findMany({
    where: { tenantId },
    select: { key: true, value: true },
  });
  return overlayConfigEntries(ODISHA_DEFAULTS, rows);
}

async function resolveTenantContext(): Promise<TenantContext> {
  const requestHeaders = await headers();
  const tenant = await findActiveTenant(requestHeaders.get(TENANT_HEADER));
  if (!tenant) throw new TenantResolutionError();
  const config = await loadTenantConfigFromDb(tenant.id);
  primeRequestScope(config, tenant.id);
  return { tenantId: tenant.id, slug: tenant.slug, config };
}

/**
 * Establish the resolved tenant for the REST OF THIS REQUEST, on both rails.
 *
 * Why two rails, and why this is not belt-and-braces for its own sake:
 *
 *   React `cache()` only memoises inside a render scope. RSC rendering has one;
 *   a Route Handler does NOT. There, every `requestHolder()` call returns a
 *   fresh object, so `primeTenantHolder()` wrote to a throwaway and the holder
 *   read microseconds later was still empty. The visible symptom was that every
 *   authenticated `/api/v1/**` request died with `TenantScopeError` — the
 *   chokepoint refusing, correctly, to run an unscoped query. It stayed hidden
 *   because the whole test suite establishes scope through `withTenantContext`
 *   (AsyncLocalStorage), which never touches this path, and because
 *   `tenantConfig()` degrades silently to ODISHA_DEFAULTS when unprimed.
 *
 *   - `primeTenantHolder` covers RSC: React's cache cell is shared across the
 *     component tree of one render, including sibling branches that never enter
 *     this function's async context.
 *   - `enterWith` covers Route Handlers: AsyncLocalStorage is scoped to the
 *     request's async context, which Next establishes per request (it is the
 *     same rail `headers()` itself rides on).
 *
 * `enterWith` is only reached when no store exists yet, so an explicit
 * `withTenantContext()` scope (tests, scripts, cron) always wins and is never
 * clobbered. It is called only AFTER `await headers()` has succeeded, which
 * proves we are inside a request context — the case the Phase 2 note warns
 * about (`enterWith` persisting into a shared/global frame) cannot arise here.
 */
function primeRequestScope(config: TenantConfig, tenantId: string): void {
  primeTenantHolder(config, tenantId);
  if (!explicitScope.getStore()) {
    explicitScope.enterWith({ cfg: config, tenantId });
  }
}

/** One tenant resolution per request (React cache — request-scoped by contract). */
export const getTenantContext = cache(resolveTenantContext);

/**
 * Fallback-tolerant variant for entry points that must not fail the request
 * when resolution is unavailable (static prerender at build time, DB down at
 * the root layout). Falls back to ODISHA_DEFAULTS — default branding, never
 * another tenant's data (the holder is per-request and starts empty).
 */
export async function getTenantContextSafe(): Promise<{
  tenantId: string | null;
  slug: string | null;
  config: TenantConfig;
}> {
  try {
    return await getTenantContext();
  } catch {
    return { tenantId: null, slug: null, config: ODISHA_DEFAULTS };
  }
}

/**
 * Establish an explicit tenant scope for non-request contexts — vitest, seed
 * scripts, cron. Loads the tenant's config from the DB, then runs `fn` inside
 * an AsyncLocalStorage scope so `tenantConfig()` (and, from Gate D, the
 * scoped Prisma client) resolve against exactly this tenant. Scopes nest and
 * never leak: concurrent `withTenantContext` runs are isolated by ALS.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const config = await loadTenantConfigFromDb(tenantId);
  const holder: TenantHolder = { cfg: config, tenantId };
  return explicitScope.run(holder, () => Promise.resolve(fn()));
}

/**
 * Enter a tenant scope for the CURRENT async execution context and everything
 * chained after it, without wrapping a callback (AsyncLocalStorage.enterWith).
 *
 * TEST AND SCRIPT USE ONLY — it is the ergonomic form for a vitest `beforeAll`
 * or a CLI script's entry point. Never call it from a request path: request
 * scoping must come from the per-request resolver (getTenantContext) or an
 * explicit `withTenantContext()` wrap, both of which cannot bleed between
 * concurrent requests. `enterWith` deliberately persists in the surrounding
 * context, which is right for a single-tenant script and wrong for a server.
 */
export async function enterTenantScope(tenantId: string): Promise<void> {
  const config = await loadTenantConfigFromDb(tenantId);
  explicitScope.enterWith({ cfg: config, tenantId });
}
