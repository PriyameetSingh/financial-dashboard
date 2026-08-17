import { Prisma } from "@prisma/client";
import type { DataScope } from "@/lib/data-scope";
import { isFullScope } from "@/lib/data-scope";

/**
 * Where-fragment builders for every scoped Prisma model.
 *
 * Each builder returns a Prisma `where` fragment that narrows rows to those the
 * caller's {@link DataScope} permits. For `full` scope the fragment is `{}` (no
 * narrowing). For `restricted` scope it adds `schemeId: { in: scope.schemeIds }`
 * (or the relation form, or `id: { in: scope.userIds }` for the user directory).
 *
 * These are pure functions — they never read the session, never query the DB.
 * Callers MUST pass a resolved `scope`. The required-second-parameter convention
 * on report builders makes omitting scope a compile error.
 */

/**
 * Vertical-membership OR-fragments, for a `SAME_VERTICAL` role.
 *
 * Returns [] when the scope carries no vertical policy (`verticalIds`
 * undefined), which is every scope resolved from the two legacy permissions —
 * so those fragments come out exactly as they did before this existed.
 *
 * An EMPTY array of verticals is different: the caller has the policy but no
 * memberships, so they reach nothing by vertical. `{ in: [] }` matches no row,
 * which is the deny-by-default answer, and it must never be mistaken for "no
 * narrowing".
 */
function verticalFragments<TWhere>(
  scope: Extract<DataScope, { kind: "restricted" }>,
  build: (verticalIdIn: string[]) => TWhere,
): TWhere[] {
  if (scope.verticalIds === undefined) return [];
  return [build(scope.verticalIds)];
}

const EMPTY = {};

/** Combine a base `where` with a scope fragment (AND). */
function and<TWhere>(base: TWhere, scopeFragment: object): TWhere {
  if (Object.keys(scopeFragment).length === 0) return base;
  return { ...base, ...scopeFragment } as TWhere;
}

/** Schemes the caller may see. */
export function schemeWhere(scope: DataScope): Prisma.SchemeWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.SchemeWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ id: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.SchemeWhereInput>(scope, (verticalIds) => ({
      verticalId: { in: verticalIds },
    })),
  );
  if (or.length === 0) return { id: { in: [] } };
  return or.length === 1 ? or[0] : { OR: or };
}

/** Subschemes the caller may see (by parent scheme). */
export function subschemeWhere(scope: DataScope): Prisma.SubschemeWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.SubschemeWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  // Inherited through the parent scheme rather than duplicated onto the row.
  or.push(
    ...verticalFragments<Prisma.SubschemeWhereInput>(scope, (verticalIds) => ({
      scheme: { verticalId: { in: verticalIds } },
    })),
  );
  if (or.length === 0) return { id: { in: [] } };
  return or.length === 1 ? or[0] : { OR: or };
}

/** Finance budgets for a given FY, narrowed to the caller's schemes. */
export function financeBudgetWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceBudgetWhereInput {
  const base: Prisma.FinanceBudgetWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  const or: Prisma.FinanceBudgetWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.FinanceBudgetWhereInput>(scope, (verticalIds) => ({
      scheme: { verticalId: { in: verticalIds } },
    })),
  );
  if (or.length === 0) return { ...base, schemeId: { in: [] } };
  return or.length === 1 ? { ...base, ...or[0] } : { ...base, OR: or };
}

/** Finance budget supplements for a given FY, narrowed to the caller's schemes. */
export function financeBudgetSupplementWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceBudgetSupplementWhereInput {
  const base: Prisma.FinanceBudgetSupplementWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  const or: Prisma.FinanceBudgetSupplementWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.FinanceBudgetSupplementWhereInput>(scope, (verticalIds) => ({
      scheme: { verticalId: { in: verticalIds } },
    })),
  );
  if (or.length === 0) return { ...base, schemeId: { in: [] } };
  return or.length === 1 ? { ...base, ...or[0] } : { ...base, OR: or };
}

/** Finance expenditure snapshots for a given FY, narrowed to the caller's schemes. */
export function financeSnapshotWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceExpenditureSnapshotWhereInput {
  const base: Prisma.FinanceExpenditureSnapshotWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  const or: Prisma.FinanceExpenditureSnapshotWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.FinanceExpenditureSnapshotWhereInput>(scope, (verticalIds) => ({
      scheme: { verticalId: { in: verticalIds } },
    })),
  );
  if (or.length === 0) return { ...base, schemeId: { in: [] } };
  return or.length === 1 ? { ...base, ...or[0] } : { ...base, OR: or };
}

/**
 * Definition-level performer/reviewer OR-fragment, shared by KPI and action-item
 * where-builders. A restricted user must see items they are directly assigned to
 * (performer or reviewer) even when no `SchemeAssignment` row exists for the
 * scheme — scheme-level assignment and per-item assignment are two independent
 * ways to gain visibility, not a two-step requirement.
 */
function assignedDirectlyFragments<TWhere extends object>(
  scope: Extract<DataScope, { kind: "restricted" }>,
  build: (userIdIn: string[]) => TWhere[],
): TWhere[] {
  if (scope.userIds.length === 0) return [];
  return build(scope.userIds);
}

/** KPI definitions the caller may see: via scheme assignment, or as a direct performer/reviewer. */
export function kpiDefinitionWhere(scope: DataScope): Prisma.KpiDefinitionWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.KpiDefinitionWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.KpiDefinitionWhereInput>(scope, (verticalIds) => ({ scheme: { verticalId: { in: verticalIds } } })),
  );
  or.push(
    ...assignedDirectlyFragments<Prisma.KpiDefinitionWhereInput>(scope, (userIds) => [
      { performers: { some: { userId: { in: userIds }, isActive: true } } },
      { reviewerUsers: { some: { userId: { in: userIds } } } },
    ]),
  );
  if (or.length === 0) return { schemeId: { in: [] } };
  return { OR: or };
}

/** KPI targets the caller may see (via KPI definition's scheme, or as a direct performer/reviewer on the definition). */
export function kpiTargetWhere(scope: DataScope): Prisma.KpiTargetWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.KpiTargetWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ kpiDefinition: { schemeId: { in: scope.schemeIds } } });
  or.push(
    ...verticalFragments<Prisma.KpiTargetWhereInput>(scope, (verticalIds) => ({ kpiDefinition: { scheme: { verticalId: { in: verticalIds } } } })),
  );
  or.push(
    ...assignedDirectlyFragments<Prisma.KpiTargetWhereInput>(scope, (userIds) => [
      { kpiDefinition: { performers: { some: { userId: { in: userIds }, isActive: true } } } },
      { kpiDefinition: { reviewerUsers: { some: { userId: { in: userIds } } } } },
    ]),
  );
  if (or.length === 0) return { kpiDefinition: { schemeId: { in: [] } } };
  return { OR: or };
}

/** KPI measurements the caller may see (via target → definition → scheme, or as a direct performer/reviewer on the definition). */
export function kpiMeasurementWhere(scope: DataScope): Prisma.KpiMeasurementWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.KpiMeasurementWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ kpiTarget: { kpiDefinition: { schemeId: { in: scope.schemeIds } } } });
  or.push(
    ...verticalFragments<Prisma.KpiMeasurementWhereInput>(scope, (verticalIds) => ({ kpiTarget: { kpiDefinition: { scheme: { verticalId: { in: verticalIds } } } } })),
  );
  or.push(
    ...assignedDirectlyFragments<Prisma.KpiMeasurementWhereInput>(scope, (userIds) => [
      { kpiTarget: { kpiDefinition: { performers: { some: { userId: { in: userIds }, isActive: true } } } } },
      { kpiTarget: { kpiDefinition: { reviewerUsers: { some: { userId: { in: userIds } } } } } },
    ]),
  );
  if (or.length === 0) return { kpiTarget: { kpiDefinition: { schemeId: { in: [] } } } };
  return { OR: or };
}

/** Action items the caller may see: via scheme assignment, or as a direct performer/reviewer.
 * Action items may have `schemeId = null` (meeting-level items); those are only
 * reachable for restricted users through the direct performer/reviewer path. */
export function actionItemWhere(scope: DataScope): Prisma.ActionItemWhereInput {
  if (isFullScope(scope)) return EMPTY;
  const or: Prisma.ActionItemWhereInput[] = [];
  if (scope.schemeIds.length > 0) or.push({ schemeId: { in: scope.schemeIds } });
  or.push(
    ...verticalFragments<Prisma.ActionItemWhereInput>(scope, (verticalIds) => ({
      // The row's OWN vertical, not the scheme's: a meeting-level action item
      // has no scheme but does carry a vertical, and it must stay reachable.
      OR: [
        { verticalId: { in: verticalIds } },
        { scheme: { verticalId: { in: verticalIds } } },
      ],
    })),
  );
  or.push(
    ...assignedDirectlyFragments<Prisma.ActionItemWhereInput>(scope, (userIds) => [
      { performers: { some: { userId: { in: userIds }, isActive: true } } },
      { reviewerUsers: { some: { userId: { in: userIds } } } },
    ]),
  );
  if (or.length === 0) return { schemeId: { in: [] } };
  return { OR: or };
}

/** User-directory scoping only — does NOT scope scheme data. */
export function userWhere(scope: DataScope): Prisma.UserWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.userIds.length === 0) return { id: { in: [] } };
  return { id: { in: scope.userIds } };
}

/**
 * Meetings are NOT scheme-scoped today. A meeting references many schemes via
 * action items and has no direct scheme FK, so there is no clean per-scheme gate.
 * Returns `{}` and documents the decision; meeting visibility is a separate
 * question (recorded in the summary, not fixed here).
 */
export function meetingWhere(_scope: DataScope): Prisma.DashboardMeetingWhereInput {
  return EMPTY;
}

/** Merge a caller-provided base `where` with a scope fragment (AND). Exposed for
 * routes that already compose a `where` clause and need to add scope narrowing. */
export function withScope<TWhere extends object>(
  base: TWhere,
  scope: DataScope,
  fragment: (scope: DataScope) => TWhere,
): TWhere {
  return and(base, fragment(scope));
}
