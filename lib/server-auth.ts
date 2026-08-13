import { auth } from "@/auth";
import { getTenantContextSafe } from "@/lib/tenant-context";

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
  await getTenantContextSafe();
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
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
