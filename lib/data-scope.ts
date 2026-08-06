import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { asDatabaseUnavailableError } from "@/lib/db-errors";
import {
  getEffectivePermissionCodesFromUserId,
  type DbUserWithRbac,
} from "@/lib/server-rbac";
import { getSessionUser } from "@/lib/server-auth";

/**
 * DataScope is a plain, serialisable descriptor of what rows a caller may read.
 *
 * - `full`: the caller may read every row of every scoped model.
 * - `restricted`: the caller may read only rows whose scheme/subscheme id is in
 *   `schemeIds`/`subschemeIds`, and only user-directory rows whose id is in
 *   `userIds`.
 *
 * DataScope is resolved once per request from the authenticated session and passed
 * explicitly into every data-access function. It is never read from the session
 * inside a data-access function. It is a plain object (no closures) so it can be
 * logged or attached to a future chatbot query context.
 */
export type DataScope =
  | { kind: "full" }
  | {
      kind: "restricted";
      schemeIds: string[];
      subschemeIds: string[];
      /** User-directory scoping only — does NOT scope scheme data. */
      userIds: string[];
    };

/** Empty restricted scope — the deny-by-default result. Never widens access. */
export const EMPTY_SCOPE: DataScope = {
  kind: "restricted",
  schemeIds: [],
  subschemeIds: [],
  userIds: [],
};

/** True when the scope grants access to every row (used by fragment builders). */
export function isFullScope(scope: DataScope): scope is { kind: "full" } {
  return scope.kind === "full";
}

/**
 * Resolve the caller's DataScope from a loaded DB user (with RBAC graph).
 *
 * Deny-by-default: any failure (null user, no view permission, assignment query
 * error, database unavailable) returns {@link EMPTY_SCOPE}. There is no code path
 * here that widens access on failure.
 *
 * `VIEW_ALL_DATA` in effective permissions → `full`. Otherwise `restricted` to the
 * schemes/subschemes linked to the caller via `SchemeAssignment` (any
 * `assignmentKind`), matched by `userId` OR by one of the caller's `roleId`s.
 */
export async function resolveDataScopeForUser(
  user: DbUserWithRbac | null,
): Promise<DataScope> {
  if (!user) return EMPTY_SCOPE;

  let effective: Set<string>;
  try {
    // Only read the session when a fallback role might be needed (user has no
    // explicit user_roles). This keeps the resolver usable in tests and avoids
    // a session read for the common case where the user has explicit roles.
    let fallback: string | null = null;
    if (user.userRoles.length === 0) {
      const sessionUser = await getSessionUser();
      fallback = sessionUser?.role ?? null;
    }
    effective = await getEffectivePermissionCodesFromUserId(user.id, fallback);
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }

  if (effective.size === 0) return EMPTY_SCOPE;
  if (effective.has("VIEW_ALL_DATA")) return { kind: "full" };
  if (!effective.has("VIEW_ASSIGNED_DATA")) return EMPTY_SCOPE;

  const roleIds = user.userRoles.map((ur) => ur.roleId);
  const or: Array<{ userId: string } | { roleId: { in: string[] } }> = [];
  if (user.id) or.push({ userId: user.id });
  if (roleIds.length > 0) or.push({ roleId: { in: roleIds } });
  if (or.length === 0) return EMPTY_SCOPE;

  let rows: { schemeId: string; subschemeId: string | null }[];
  try {
    rows = await prisma.schemeAssignment.findMany({
      where: { OR: or },
      select: { schemeId: true, subschemeId: true },
    });
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }

  if (rows.length === 0) return EMPTY_SCOPE;

  const schemeIds = new Set<string>();
  const subschemeIds = new Set<string>();
  for (const r of rows) {
    schemeIds.add(r.schemeId);
    if (r.subschemeId) subschemeIds.add(r.subschemeId);
  }

  return {
    kind: "restricted",
    schemeIds: [...schemeIds],
    subschemeIds: [...subschemeIds],
    userIds: [user.id],
  };
}

/**
 * Per-request cached resolver. Uses React `cache()` so a single request resolves
 * scope once (deduped in RSC and route handlers), mirroring `getDbUserBySession`.
 */
export const resolveDataScope = cache(resolveDataScopeForUser);
