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

const EMPTY = {};

/** Combine a base `where` with a scope fragment (AND). */
function and<TWhere>(base: TWhere, scopeFragment: object): TWhere {
  if (Object.keys(scopeFragment).length === 0) return base;
  return { ...base, ...scopeFragment } as TWhere;
}

/** Schemes the caller may see. */
export function schemeWhere(scope: DataScope): Prisma.SchemeWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) return { id: { in: [] } };
  return { id: { in: scope.schemeIds } };
}

/** Subschemes the caller may see (by parent scheme). */
export function subschemeWhere(scope: DataScope): Prisma.SubschemeWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) return { id: { in: [] } };
  return { schemeId: { in: scope.schemeIds } };
}

/** Finance budgets for a given FY, narrowed to the caller's schemes. */
export function financeBudgetWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceBudgetWhereInput {
  const base: Prisma.FinanceBudgetWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  if (scope.schemeIds.length === 0) return { ...base, schemeId: { in: [] } };
  return { ...base, schemeId: { in: scope.schemeIds } };
}

/** Finance budget supplements for a given FY, narrowed to the caller's schemes. */
export function financeBudgetSupplementWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceBudgetSupplementWhereInput {
  const base: Prisma.FinanceBudgetSupplementWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  if (scope.schemeIds.length === 0) return { ...base, schemeId: { in: [] } };
  return { ...base, schemeId: { in: scope.schemeIds } };
}

/** Finance expenditure snapshots for a given FY, narrowed to the caller's schemes. */
export function financeSnapshotWhere(
  scope: DataScope,
  fyId: string,
): Prisma.FinanceExpenditureSnapshotWhereInput {
  const base: Prisma.FinanceExpenditureSnapshotWhereInput = { financialYearId: fyId };
  if (isFullScope(scope)) return base;
  if (scope.schemeIds.length === 0) return { ...base, schemeId: { in: [] } };
  return { ...base, schemeId: { in: scope.schemeIds } };
}

/** KPI definitions the caller may see (via scheme). */
export function kpiDefinitionWhere(scope: DataScope): Prisma.KpiDefinitionWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) return { schemeId: { in: [] } };
  return { schemeId: { in: scope.schemeIds } };
}

/** KPI targets the caller may see (via KPI definition's scheme). */
export function kpiTargetWhere(scope: DataScope): Prisma.KpiTargetWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) {
    return { kpiDefinition: { schemeId: { in: [] } } };
  }
  return { kpiDefinition: { schemeId: { in: scope.schemeIds } } };
}

/** KPI measurements the caller may see (via target → definition → scheme). */
export function kpiMeasurementWhere(scope: DataScope): Prisma.KpiMeasurementWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) {
    return { kpiTarget: { kpiDefinition: { schemeId: { in: [] } } } };
  }
  return { kpiTarget: { kpiDefinition: { schemeId: { in: scope.schemeIds } } } };
}

/** Action items the caller may see. Action items may have `schemeId = null`
 * (meeting-level items); those are excluded for restricted users because there
 * is no scheme to anchor the scope on. */
export function actionItemWhere(scope: DataScope): Prisma.ActionItemWhereInput {
  if (isFullScope(scope)) return EMPTY;
  if (scope.schemeIds.length === 0) return { schemeId: { in: [] } };
  return { schemeId: { in: scope.schemeIds } };
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
