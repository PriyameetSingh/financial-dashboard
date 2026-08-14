/**
 * Phase 3 — reading a tenant's enabled modules, before any tenant scope exists.
 *
 * `proxy.ts` runs ahead of the request-scoped resolver (lib/tenant-context.ts),
 * so there is no scope for the Prisma chokepoint to apply. This module therefore
 * uses `prismaUnscoped` with an EXPLICIT `tenantId` in the where clause —
 * exactly the pattern, and exactly the justification, of
 * `lib/tenant-resolve-db.ts` and the session-block lookup already in proxy.ts.
 * It is allowlisted in scripts/check-tenant-chokepoint.mjs on that basis.
 *
 * There is no cache here on purpose. A TTL cache keyed by tenantId is the
 * obvious optimisation, but it buys a staleness window on a security-relevant
 * DENY and needs an invalidation hook from the config/entitlement write path.
 * One indexed query returning at most a handful of rows, next to the two the
 * proxy already issues, is the right trade until that hook exists.
 */
import { prismaUnscoped } from "@/lib/prisma";

/**
 * The gated module codes this tenant has switched on.
 *
 * Fails CLOSED in every direction: no tenant resolved, no rows, or a database
 * error all yield an empty set, which leaves core routes reachable and every
 * gated route denied. A tenant can never be locked out by this (core is never
 * consulted against the set) and can never be over-served by it.
 */
export async function loadEnabledModuleCodes(
  tenantId: string | null,
): Promise<ReadonlySet<string>> {
  if (!tenantId) return new Set();
  try {
    const rows = await prismaUnscoped.tenantEntitlement.findMany({
      where: { tenantId, enabled: true },
      select: { module: { select: { code: true } } },
    });
    return new Set(rows.map((r) => r.module.code));
  } catch (error) {
    console.error("[entitlements] Failed to load entitlements; denying gated modules", error);
    return new Set();
  }
}
