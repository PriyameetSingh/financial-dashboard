import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/server-rbac";

export async function assertKpiUpdaterForScheme(schemeId: string, userId: string | undefined, userRoleIds: string[]) {
  const owners = await prisma.schemeAssignment.findMany({
    where: { schemeId, assignmentKind: "kpi_owner_1" },
    select: { userId: true, roleId: true },
  });
  if (owners.length === 0) return;
  const ok = owners.some(
    (o) => (o.userId && userId && o.userId === userId) || (o.roleId && userRoleIds.includes(o.roleId)),
  );
  if (!ok) {
    throw new AuthError(403, "Not assigned as KPI owner (updater) for this scheme");
  }
}

export async function assertKpiReviewerForScheme(schemeId: string, userId: string | undefined, userRoleIds: string[]) {
  const owners = await prisma.schemeAssignment.findMany({
    where: { schemeId, assignmentKind: "kpi_owner_2" },
    select: { userId: true, roleId: true },
  });
  if (owners.length === 0) return;
  const ok = owners.some(
    (o) => (o.userId && userId && o.userId === userId) || (o.roleId && userRoleIds.includes(o.roleId)),
  );
  if (!ok) {
    throw new AuthError(403, "Not assigned as KPI reviewer for this scheme");
  }
}

type DefinitionUpdater = { schemeId: string; performerUserIds: string[] };

/** Per-KPI performers win when set; otherwise scheme `kpi_owner_1` rules apply. */
export async function assertKpiUpdaterForDefinition(
  definition: DefinitionUpdater,
  userId: string | undefined,
  userRoleIds: string[],
  options: { canManageSchemes?: boolean } = {},
) {
  if (options.canManageSchemes) return;
  if (definition.performerUserIds.length > 0) {
    if (userId && definition.performerUserIds.includes(userId)) return;
    throw new AuthError(403, "Not assigned as an action owner for this KPI");
  }
  await assertKpiUpdaterForScheme(definition.schemeId, userId, userRoleIds);
}

type DefinitionReviewer = { schemeId: string; reviewerUserIds: string[] };

/** Only users listed as reviewers on the KPI may review (scheme `kpi_owner_2` is not used). */
export async function assertKpiReviewerForDefinition(
  definition: DefinitionReviewer,
  userId: string | undefined,
  userRoleIds: string[],
  options: { canManageSchemes?: boolean } = {},
) {
  if (options.canManageSchemes) return;
  if (definition.reviewerUserIds.length === 0) {
    throw new AuthError(403, "This KPI has no assigned reviewer");
  }
  if (userId && definition.reviewerUserIds.includes(userId)) return;
  throw new AuthError(403, "Not assigned as a reviewer for this KPI");
}

export type KpiSchemeAssignmentRow = {
  schemeId: string;
  userId: string | null;
  roleId: string | null;
};

function ownersMatchAssignment(
  owners: Array<{ userId: string | null; roleId: string | null }>,
  userId: string | undefined,
  userRoleIds: string[],
): boolean {
  if (owners.length === 0) return true;
  return owners.some(
    (o) => (o.userId && userId && o.userId === userId) || (o.roleId && userRoleIds.includes(o.roleId)),
  );
}

/** Group scheme_assignment rows by schemeId for batched KPI permission checks. */
export function groupKpiAssignmentsBySchemeId(
  rows: KpiSchemeAssignmentRow[],
): Map<string, Array<{ userId: string | null; roleId: string | null }>> {
  const m = new Map<string, Array<{ userId: string | null; roleId: string | null }>>();
  for (const r of rows) {
    const list = m.get(r.schemeId) ?? [];
    list.push({ userId: r.userId, roleId: r.roleId });
    m.set(r.schemeId, list);
  }
  return m;
}

/** In-memory equivalent of {@link userCanEnterKpiMeasurement} using preloaded kpi_owner_1 rows. */
export function userCanEnterKpiMeasurementSync(
  definition: DefinitionUpdater,
  userId: string | undefined,
  userRoleIds: string[],
  canManageSchemes: boolean,
  kpiOwner1BySchemeId: Map<string, Array<{ userId: string | null; roleId: string | null }>>,
): boolean {
  if (canManageSchemes) return true;
  if (definition.performerUserIds.length > 0) {
    return !!(userId && definition.performerUserIds.includes(userId));
  }
  const owners = kpiOwner1BySchemeId.get(definition.schemeId) ?? [];
  return ownersMatchAssignment(owners, userId, userRoleIds);
}

/** In-memory equivalent of {@link userCanReviewKpiMeasurement} — per-KPI reviewers only. */
export function userCanReviewKpiMeasurementSync(
  definition: DefinitionReviewer,
  userId: string | undefined,
  canManageSchemes: boolean,
): boolean {
  if (definition.reviewerUserIds.length === 0) return false;
  if (canManageSchemes) return true;
  return !!(userId && definition.reviewerUserIds.includes(userId));
}

export function userRoleIdsFromDbUser(user: { userRoles: Array<{ roleId: string }> } | null | undefined): string[] {
  if (!user) return [];
  return user.userRoles.map((ur) => ur.roleId);
}

/** For UI: whether this user may enter measurements (permission + assignment), without throwing. */
export async function userCanEnterKpiMeasurement(
  definition: DefinitionUpdater,
  userId: string | undefined,
  userRoleIds: string[],
  canManageSchemes: boolean,
): Promise<boolean> {
  try {
    await assertKpiUpdaterForDefinition(definition, userId, userRoleIds, { canManageSchemes });
    return true;
  } catch {
    return false;
  }
}

/** For UI: whether this user may review measurements (per-KPI reviewer list + permission), without throwing. */
export async function userCanReviewKpiMeasurement(
  definition: DefinitionReviewer,
  userId: string | undefined,
  userRoleIds: string[],
  canManageSchemes: boolean,
): Promise<boolean> {
  try {
    await assertKpiReviewerForDefinition(definition, userId, userRoleIds, { canManageSchemes });
    return true;
  } catch {
    return false;
  }
}
