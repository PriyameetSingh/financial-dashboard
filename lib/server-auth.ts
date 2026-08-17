import { auth } from "@/auth";
import { getTenantContextSafe } from "@/lib/tenant-context";
import { isTenantSessionRejected, verifyTenantSession } from "@/lib/tenant-session";

type SessionUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  iat?: number;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  // Every API guard funnels through here (check-api-guards proves route
  // coverage), so resolving the tenant context first primes the
  // request-scoped config holder for all 81 /api/v1 handlers. Deduped per
  // request via React cache inside getTenantContext.
  const { tenantId } = await getTenantContextSafe();
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return null;
  }

  // Defence in depth behind the middleware check (lib/tenant-session.ts): a
  // session bound to another tenant is treated as no session at all, so guards
  // 401 instead of authorising a caller inside a tenant they never signed in
  // to. Never re-scope such a session — that is the silent-cross-tenant path.
  if (isTenantSessionRejected(verifyTenantSession(user.tenantId, tenantId))) {
    return null;
  }

  return {
    id: user.id,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    role: user.role,
    iat: user.iat,
  };
}
