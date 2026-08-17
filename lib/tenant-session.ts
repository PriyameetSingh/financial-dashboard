/**
 * Session-layer tenant binding — the one path the Prisma chokepoint cannot
 * cover.
 *
 * A NextAuth JWT is a bearer credential: it is minted on one host and presented
 * on the next request with whatever Host header the client chooses. Without a
 * binding, a cookie minted for tenant A and replayed against tenant B's host
 * would authenticate successfully and then be *silently scoped into B* by the
 * chokepoint — the caller would be a real, logged-in principal operating inside
 * a tenant they never authenticated to. Data-layer isolation cannot see this,
 * because by the time a query runs the request already claims to be tenant B's.
 *
 * The binding: the JWT carries a `tenantId` claim stamped at sign-in, and every
 * request compares that claim against the tenant resolved from the Host. A
 * mismatch is REJECTED (401 / forced re-login) — never re-scoped, never
 * silently downgraded.
 *
 * This module is deliberately free of next-auth and Prisma imports so both the
 * middleware and the server guards can use it, and so the decision is directly
 * testable.
 */

export type TenantSessionVerdict =
  | "ok"
  | "mismatch"
  | "unbound_session"
  | "unresolved_tenant";

/**
 * Decide whether a session may act on the tenant resolved for this request.
 *
 * - `ok`                  claim and resolved tenant agree.
 * - `mismatch`            the session belongs to a DIFFERENT tenant → reject.
 * - `unbound_session`     a pre-Phase-2 token with no tenant claim. Rejected
 *                         (forces one re-login) rather than trusted: accepting
 *                         it would leave exactly the replay hole this check
 *                         exists to close.
 * - `unresolved_tenant`   no tenant for this host → reject; there is no tenant
 *                         whose data the caller could legitimately act on.
 */
export function verifyTenantSession(
  sessionTenantId: string | null | undefined,
  resolvedTenantId: string | null | undefined,
): TenantSessionVerdict {
  if (!resolvedTenantId) return "unresolved_tenant";
  if (!sessionTenantId) return "unbound_session";
  return sessionTenantId === resolvedTenantId ? "ok" : "mismatch";
}

/** True when the request must not proceed with this session. */
export function isTenantSessionRejected(verdict: TenantSessionVerdict): boolean {
  return verdict !== "ok";
}

/** Error code surfaced on the login redirect, for support/debugging. */
export function tenantSessionErrorCode(verdict: TenantSessionVerdict): string {
  switch (verdict) {
    case "mismatch":
      return "tenant_mismatch";
    case "unbound_session":
      return "session_not_bound_to_tenant";
    case "unresolved_tenant":
      return "tenant_not_resolved";
    default:
      return "ok";
  }
}
