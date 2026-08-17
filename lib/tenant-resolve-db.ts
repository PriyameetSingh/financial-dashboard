/**
 * Tenant lookup against the database — shared by the server resolver
 * (lib/tenant-context.ts) and the middleware (proxy.ts), which runs before any
 * tenant scope exists and therefore must use the unscoped client explicitly.
 *
 * Unresolved policy (plan §7c): an active tenant matching the slug wins;
 * otherwise, while exactly ONE tenant is active, default to it; once a second
 * tenant is active, unresolved returns null → deny. The flip is computed from
 * tenants.status, never from a hardcoded slug or an operator toggle.
 * DEV_DEFAULT_TENANT_SLUG applies in development only.
 */
import { prismaUnscoped } from "@/lib/prisma";

export type ResolvedTenantRow = { id: string; slug: string };

export async function findActiveTenant(
  slugCandidate: string | null | undefined,
): Promise<ResolvedTenantRow | null> {
  if (slugCandidate) {
    const bySlug = await prismaUnscoped.tenant.findFirst({
      where: { slug: slugCandidate, status: "active" },
      select: { id: true, slug: true },
    });
    if (bySlug) return bySlug;
  }

  if (process.env.NODE_ENV === "development" && process.env.DEV_DEFAULT_TENANT_SLUG) {
    const dev = await prismaUnscoped.tenant.findFirst({
      where: { slug: process.env.DEV_DEFAULT_TENANT_SLUG, status: "active" },
      select: { id: true, slug: true },
    });
    if (dev) return dev;
  }

  // Two rows are enough to distinguish "exactly one active" from "several".
  const actives = await prismaUnscoped.tenant.findMany({
    where: { status: "active" },
    select: { id: true, slug: true },
    take: 2,
  });
  return actives.length === 1 ? actives[0] : null;
}
