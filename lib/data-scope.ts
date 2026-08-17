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
      /**
       * Verticals the caller belongs to, for a `SAME_VERTICAL` role.
       *
       * Additive and OR-ed with the assignment lists above: a caller reaches a
       * row if it belongs to one of their schemes OR sits in one of their
       * verticals. Absent (undefined) for every scope resolved from the two
       * legacy permissions, which is what keeps their `where` fragments byte
       * identical to what they were before this existed.
       *
       * An empty array is NOT the same as absent: it means a vertical-scoped
       * caller with no memberships, who reaches nothing by vertical.
       */
      verticalIds?: string[];
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
 *
 * `fullAccessPermissions` (optional) names additional permission codes that also
 * grant `full` scope, on top of `VIEW_ALL_DATA` — e.g. financial-data entry is
 * intentionally scheme-unrestricted for anyone holding `ENTER_FINANCIAL_DATA` /
 * `MANAGE_FINANCIAL_DATA`, independent of the (separate, narrower) KPI/action-item
 * "assigned data" scoping. See {@link resolveFinanceDataScope}.
 */
export async function resolveDataScopeForUser(
  user: DbUserWithRbac | null,
  options?: { fullAccessPermissions?: string[] },
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
  if (options?.fullAccessPermissions?.some((code) => effective.has(code))) return { kind: "full" };

  // The role-policy union, resolved from the caller's roles. Runs BEFORE the
  // VIEW_ASSIGNED_DATA gate below because a SAME_<dimension> role is a way of
  // seeing data in its own right — it does not also require the legacy assigned
  // permission. `ALL` anywhere in the union wins outright: union means most
  // permissive.
  const policies = user.userRoles.map((ur) => ur.role?.dataScopePolicy).filter(Boolean);
  if (policies.includes("ALL")) return { kind: "full" };

  const verticalIds = policies.includes("SAME_VERTICAL")
    ? await verticalMembershipsOf(user.id)
    : undefined;

  // No legacy assigned permission and no dimension policy → nothing to see.
  // A caller with ONLY SAME_VERTICAL still proceeds, carrying their verticals.
  if (!effective.has("VIEW_ASSIGNED_DATA") && verticalIds === undefined) return EMPTY_SCOPE;

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

  // No SchemeAssignment rows does NOT mean "deny everything" — it means this
  // caller's *scheme-level* scope is empty. `userIds` must still carry the
  // caller's own id so the direct performer/reviewer fallback in
  // `lib/data-access/scope-where.ts` (items assigned to them without any
  // SchemeAssignment row) still works. Returning the shared `EMPTY_SCOPE`
  // constant here — as this used to — silently drops `userIds` too and was the
  // root cause of "assigned data" nodal officers seeing nothing.
  if (rows.length === 0) {
    return {
      kind: "restricted",
      schemeIds: [],
      subschemeIds: [],
      userIds: [user.id],
      ...(verticalIds !== undefined ? { verticalIds } : {}),
    };
  }

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
    // Spread rather than always-present: a scope with no vertical policy must
    // be structurally identical to what this returned before SAME_VERTICAL
    // existed, so the where-fragments it produces cannot drift.
    ...(verticalIds !== undefined ? { verticalIds } : {}),
  };
}

/**
 * The verticals a user belongs to — the subject side of `SAME_VERTICAL`.
 *
 * Read from the user at request time, never from the role or the assignment:
 * that is what makes the policy self-relative. Moving someone between verticals
 * changes what they see without touching a role.
 *
 * Deny-by-default on failure: an empty set means "reaches nothing by vertical",
 * which is the safe direction. It never widens.
 */
async function verticalMembershipsOf(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.userVertical.findMany({
      where: { userId },
      select: { verticalId: true },
    });
    return rows.map((r) => r.verticalId);
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }
}

/**
 * Per-request cached resolver. Uses React `cache()` so a single request resolves
 * scope once (deduped in RSC and route handlers), mirroring `getDbUserBySession`.
 */
export const resolveDataScope = cache(resolveDataScopeForUser);

/** Permissions that imply "all schemes" for financial data, regardless of SchemeAssignment. */
const FINANCE_FULL_ACCESS_PERMISSIONS = ["ENTER_FINANCIAL_DATA", "MANAGE_FINANCIAL_DATA"];

/**
 * Finance-specific scope resolver: anyone who can enter or manage financial data
 * sees every scheme's financial data by design (finance entry is not gated by
 * per-scheme assignment the way KPI/action-item "assigned data" is). Falls back to
 * the standard scheme-assignment-based restriction for users who only hold
 * `VIEW_ASSIGNED_DATA` with no financial-entry permission.
 */
export const resolveFinanceDataScope = cache((user: DbUserWithRbac | null) =>
  resolveDataScopeForUser(user, { fullAccessPermissions: FINANCE_FULL_ACCESS_PERMISSIONS }),
);
