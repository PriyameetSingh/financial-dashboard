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

type TenantRow = { id: string; slug: string };

async function findActiveTenant(slugCandidate: string | null): Promise<TenantRow | null> {
  if (slugCandidate) {
    const bySlug = await prisma.tenant.findFirst({
      where: { slug: slugCandidate, status: "active" },
      select: { id: true, slug: true },
    });
    if (bySlug) return bySlug;
  }
  if (process.env.NODE_ENV === "development" && process.env.DEV_DEFAULT_TENANT_SLUG) {
    const dev = await prisma.tenant.findFirst({
      where: { slug: process.env.DEV_DEFAULT_TENANT_SLUG, status: "active" },
      select: { id: true, slug: true },
    });
    if (dev) return dev;
  }
  // Single-active-tenant default; two rows are enough to detect "multiple".
  const actives = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true, slug: true },
    take: 2,
  });
  return actives.length === 1 ? actives[0] : null;
}

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
  primeTenantHolder(config, tenant.id);
  return { tenantId: tenant.id, slug: tenant.slug, config };
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
