/**
 * Returns true if the session should be considered invalidated because the
 * user's password was reset (by an admin or self-service) after the session
 * was issued.
 *
 * Uses `>=` so a password reset in the same second as login still invalidates
 * the session (same-second edge case). If `sessionsInvalidatedAt` is set but
 * `iat` is missing, treats the session as invalidated (security-first: a
 * valid NextAuth JWT always carries `iat`, so a missing one is suspicious).
 */
export function isSessionInvalidated(
  sessionsInvalidatedAt: Date | null | undefined,
  iat: number | null | undefined,
): boolean {
  if (!sessionsInvalidatedAt) return false;
  if (iat == null) return true;
  const invalidatedAtSeconds = Math.floor(sessionsInvalidatedAt.getTime() / 1000);
  return invalidatedAtSeconds >= iat;
}
