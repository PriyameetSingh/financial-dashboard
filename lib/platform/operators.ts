/**
 * Fleet Console access — Phase 5.
 *
 * `PlatformOperator` (lib/tenant-scope-registry.ts) is a GLOBAL_MODEL, so
 * `prisma.platformOperator.*` already bypasses the tenant chokepoint with no
 * scope required — the same seam `prisma.tenant.findMany()` already relies on.
 * This is deliberately not RBAC: the `Permission` catalog only ever grants
 * through a tenant-scoped `Role`, which has no way to express an authority
 * that isn't any one tenant's to grant. Membership here is checked IN
 * ADDITION TO normal session auth, never instead of it — a caller still needs
 * a resolved session and a DB user before this is even asked.
 */
import { prisma } from "@/lib/prisma";

export async function isPlatformOperator(userId: string): Promise<boolean> {
  const row = await prisma.platformOperator.findUnique({ where: { userId } });
  return row !== null;
}
