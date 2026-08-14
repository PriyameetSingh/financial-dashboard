import { prisma, tenantStamped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext } from "@/lib/tenant-context";
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  FinancialWorkflowStatus,
  KPIProgressStatus,
  KPIType,
  KPIWorkflowStatus,
  KPICategory,
  SchemeAssignmentKind,
  SponsorshipType,
} from "@prisma/client";

/**
 * Deterministic test seed for the data-scoping layer tests.
 *
 * Creates two roles (full-access vs assigned-data), two users, three schemes,
 * one meeting, finance budget + snapshot, KPI definition + target + measurement,
 * and an action item — for schemes A, B, and C. The restricted user is assigned
 * to schemeA only (via a dashboard_owner SchemeAssignment). schemeB is
 * unassigned. schemeC has NO SchemeAssignment for the restricted user at all —
 * they are only a direct performer on schemeC's KPI/action item, covering the
 * "assigned via performer, not via SchemeAssignment" visibility path.
 *
 * All rows use a `TESTSCOPE_` prefix on unique fields so they can be cleaned up
 * deterministically and never collide with real seed data.
 */

const PREFIX = "TESTSCOPE_";

/** Fixed FY + meeting dates — uniqueness comes from the PREFIX on codes/labels, not dates. */
const FY_START = new Date("2025-04-01T00:00:00.000Z");
const FY_END = new Date("2026-03-31T00:00:00.000Z");
const MEETING_DATE = new Date("2025-05-15T00:00:00.000Z");

export type ScopeSeed = {
  fullUser: { id: string; email: string; name: string };
  restrictedUser: { id: string; email: string; name: string };
  financeUser: { id: string; email: string; name: string };
  schemeA: { id: string; code: string; name: string };
  schemeB: { id: string; code: string; name: string };
  schemeC: { id: string; code: string; name: string };
  meeting: { id: string };
  financialYear: { id: string; label: string };
  kpiDefA: { id: string };
  kpiDefB: { id: string };
  kpiDefC: { id: string };
  actionItemA: { id: string; title: string };
  actionItemB: { id: string; title: string };
  actionItemC: { id: string; title: string };
};

/** Delete every row created by this seed (idempotent). */
export async function cleanupScopeSeed(tenantId: string = ODISHA_TENANT_ID): Promise<void> {
  return withTenantContext(tenantId, () => cleanupScopeSeedInner());
}

async function cleanupScopeSeedInner(): Promise<void> {
  const like = `${PREFIX}%`;
  await prisma.kpiMeasurement.deleteMany({ where: { kpiTarget: { kpiDefinition: { scheme: { code: { startsWith: PREFIX } } } } } }).catch(() => {});
  await prisma.kpiTarget.deleteMany({ where: { kpiDefinition: { scheme: { code: { startsWith: PREFIX } } } } }).catch(() => {});
  await prisma.kpiDefinition.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.actionItem.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.financeExpenditureSnapshot.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.financeBudget.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.schemeAssignment.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.subscheme.deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.scheme.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prisma.dashboardMeeting.deleteMany({ where: { title: { startsWith: like } } }).catch(() => {});
  await prisma.userRole.deleteMany({ where: { role: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.userPermissionOverride.deleteMany({ where: { user: { email: { startsWith: like } } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: like } } }).catch(() => {});
  await prisma.rolePermission.deleteMany({ where: { role: { code: { startsWith: PREFIX } } } }).catch(() => {});
  await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prisma.permission.deleteMany({ where: { code: { startsWith: `${PREFIX}` } } }).catch(() => {});
  await prisma.financialYear.deleteMany({ where: { label: { startsWith: like } } }).catch(() => {});
}

async function ensurePermission(code: string, name: string) {
  return prisma.permission.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });
}

async function ensureRole(code: string, name: string, tenantId: string) {
  return prisma.role.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: { name },
    create: tenantStamped({ code, name }),
  });
}

/**
 * Seed the fixture for one tenant. Runs inside an explicit tenant scope, so
 * every write goes through the Gate D chokepoint and is stamped with that
 * tenant — the seed itself exercises the production write path.
 */
export async function seedScope(tenantId: string = ODISHA_TENANT_ID): Promise<ScopeSeed> {
  return withTenantContext(tenantId, () => seedScopeInner(tenantId));
}

async function seedScopeInner(tenantId: string): Promise<ScopeSeed> {
  await cleanupScopeSeedInner();

  // Use the REAL permission codes — resolveDataScopeForUser checks effective.has("VIEW_ALL_DATA")
  // / "VIEW_ASSIGNED_DATA". We upsert the real permission rows (idempotent) and link them to
  // test-scoped roles. Cleanup does NOT delete these real permissions (only test roles/users).
  const permAll = await ensurePermission("VIEW_ALL_DATA", "View all data");
  const permAssigned = await ensurePermission("VIEW_ASSIGNED_DATA", "View assigned data");
  const permEnterFinancial = await ensurePermission("ENTER_FINANCIAL_DATA", "Enter financial data");
  const roleFull = await ensureRole(`${PREFIX}ACS`, "Test ACS", tenantId);
  const roleAssigned = await ensureRole(`${PREFIX}NODAL`, "Test Nodal", tenantId);
  const roleFinance = await ensureRole(`${PREFIX}FINANCE`, "Test Finance Nodal", tenantId);

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roleFull.id, permissionId: permAll.id } },
    update: {},
    create: tenantStamped({ roleId: roleFull.id, permissionId: permAll.id }),
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roleAssigned.id, permissionId: permAssigned.id } },
    update: {},
    create: tenantStamped({ roleId: roleAssigned.id, permissionId: permAssigned.id }),
  });
  // Finance role: VIEW_ASSIGNED_DATA (restricted for KPI/action items) + ENTER_FINANCIAL_DATA
  // (full scope for finance reads, via resolveFinanceDataScope) — no SchemeAssignment rows at all.
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roleFinance.id, permissionId: permAssigned.id } },
    update: {},
    create: tenantStamped({ roleId: roleFinance.id, permissionId: permAssigned.id }),
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roleFinance.id, permissionId: permEnterFinancial.id } },
    update: {},
    create: tenantStamped({ roleId: roleFinance.id, permissionId: permEnterFinancial.id }),
  });

  const fullUser = await prisma.user.create({
    data: tenantStamped({
      email: `${PREFIX}full@hudd.test`,
      name: `${PREFIX} Full Access`,
      code: `${PREFIX}FULL`,
      isActive: true,
      userRoles: { create: [{ roleId: roleFull.id, tenantId }] },
    }),
  });
  const restrictedUser = await prisma.user.create({
    data: tenantStamped({
      email: `${PREFIX}restricted@hudd.test`,
      name: `${PREFIX} Restricted`,
      code: `${PREFIX}RESTRICTED`,
      isActive: true,
      userRoles: { create: [{ roleId: roleAssigned.id, tenantId }] },
    }),
  });
  const financeUser = await prisma.user.create({
    data: tenantStamped({
      email: `${PREFIX}finance@hudd.test`,
      name: `${PREFIX} Finance Nodal`,
      code: `${PREFIX}FINANCE`,
      isActive: true,
      userRoles: { create: [{ roleId: roleFinance.id, tenantId }] },
    }),
  });

  const fyStart = FY_START;
  const fyEnd = FY_END;
  const financialYear = await prisma.financialYear.create({
    data: tenantStamped({ label: `${PREFIX}FY`, startDate: fyStart, endDate: fyEnd }),
  });

  const schemeA = await prisma.scheme.create({
    data: tenantStamped({
      code: `${PREFIX}SCH_A`,
      name: `${PREFIX} Scheme Alpha`,
      verticalName: "Test Vertical",
      sponsorshipType: SponsorshipType.STATE,
    }),
  });
  const schemeB = await prisma.scheme.create({
    data: tenantStamped({
      code: `${PREFIX}SCH_B`,
      name: `${PREFIX} Scheme Beta`,
      verticalName: "Test Vertical",
      sponsorshipType: SponsorshipType.STATE,
    }),
  });
  const schemeC = await prisma.scheme.create({
    data: tenantStamped({
      code: `${PREFIX}SCH_C`,
      name: `${PREFIX} Scheme Gamma`,
      verticalName: "Test Vertical",
      sponsorshipType: SponsorshipType.STATE,
    }),
  });

  // Restricted user is assigned to schemeA only (dashboard_owner).
  await prisma.schemeAssignment.create({
    data: tenantStamped({
      schemeId: schemeA.id,
      assignmentKind: SchemeAssignmentKind.dashboard_owner,
      userId: restrictedUser.id,
      sortOrder: 0,
    }),
  });

  const meetingDate = MEETING_DATE;
  const meeting = await prisma.dashboardMeeting.create({
    data: tenantStamped({
      meetingDate,
      title: `${PREFIX} Meeting`,
      financialYearId: financialYear.id,
      createdById: fullUser.id,
    }),
  });

  for (const s of [schemeA, schemeB]) {
    await prisma.financeBudget.create({
      data: tenantStamped({
        schemeId: s.id,
        subschemeId: null,
        financialYearId: financialYear.id,
        budgetEstimateCr: 100,
      }),
    });
    await prisma.financeExpenditureSnapshot.create({
      data: tenantStamped({
        schemeId: s.id,
        subschemeId: null,
        financialYearId: financialYear.id,
        meetingId: meeting.id,
        asOfDate: meetingDate,
        soExpenditureCr: 40,
        ifmsExpenditureCr: 50,
        workflowStatus: FinancialWorkflowStatus.submitted,
      }),
    });
  }

  const kpiDefA = await prisma.kpiDefinition.create({
    data: tenantStamped({
      schemeId: schemeA.id,
      category: KPICategory.STATE,
      description: `${PREFIX} KPI Alpha`,
      kpiType: KPIType.OUTPUT,
      performers: { create: [tenantStamped({ userId: restrictedUser.id, sortOrder: 0 })] },
    }),
  });
  const kpiDefB = await prisma.kpiDefinition.create({
    data: tenantStamped({
      schemeId: schemeB.id,
      category: KPICategory.STATE,
      description: `${PREFIX} KPI Beta`,
      kpiType: KPIType.OUTPUT,
      performers: { create: [tenantStamped({ userId: fullUser.id, sortOrder: 0 })] },
    }),
  });
  // No SchemeAssignment exists for schemeC — restrictedUser sees this only via
  // the direct performer relation, never via scheme-level assignment.
  const kpiDefC = await prisma.kpiDefinition.create({
    data: tenantStamped({
      schemeId: schemeC.id,
      category: KPICategory.STATE,
      description: `${PREFIX} KPI Gamma`,
      kpiType: KPIType.OUTPUT,
      performers: { create: [tenantStamped({ userId: restrictedUser.id, sortOrder: 0 })] },
    }),
  });
  for (const def of [kpiDefA, kpiDefB, kpiDefC]) {
    const target = await prisma.kpiTarget.create({
      data: tenantStamped({ kpiDefinitionId: def.id, financialYearId: financialYear.id, denominatorValue: 100 }),
    });
    await prisma.kpiMeasurement.create({
      data: tenantStamped({
        kpiTargetId: target.id,
        meetingId: meeting.id,
        measuredAt: meetingDate,
        numeratorValue: 60,
        progressStatus: KPIProgressStatus.on_track,
        workflowStatus: KPIWorkflowStatus.reviewed,
      }),
    });
  }

  const actionItemA = await prisma.actionItem.create({
    data: tenantStamped({
      meetingId: meeting.id,
      schemeId: schemeA.id,
      itemType: ActionItemType.action_item,
      title: `${PREFIX} Action Alpha`,
      description: `${PREFIX} action for scheme A`,
      priority: ActionItemPriority.Medium,
      dueDate: meetingDate,
      status: ActionItemStatus.OPEN,
      createdById: fullUser.id,
      performers: { create: [tenantStamped({ userId: restrictedUser.id, sortOrder: 0 })] },
    }),
  });
  const actionItemB = await prisma.actionItem.create({
    data: tenantStamped({
      meetingId: meeting.id,
      schemeId: schemeB.id,
      itemType: ActionItemType.action_item,
      title: `${PREFIX} Action Beta`,
      description: `${PREFIX} action for scheme B`,
      priority: ActionItemPriority.Medium,
      dueDate: meetingDate,
      status: ActionItemStatus.OPEN,
      createdById: fullUser.id,
      performers: { create: [tenantStamped({ userId: fullUser.id, sortOrder: 0 })] },
    }),
  });
  // No SchemeAssignment exists for schemeC — restrictedUser sees this only via
  // the direct performer relation, never via scheme-level assignment.
  const actionItemC = await prisma.actionItem.create({
    data: tenantStamped({
      meetingId: meeting.id,
      schemeId: schemeC.id,
      itemType: ActionItemType.action_item,
      title: `${PREFIX} Action Gamma`,
      description: `${PREFIX} action for scheme C`,
      priority: ActionItemPriority.Medium,
      dueDate: meetingDate,
      status: ActionItemStatus.OPEN,
      createdById: fullUser.id,
      performers: { create: [tenantStamped({ userId: restrictedUser.id, sortOrder: 0 })] },
    }),
  });

  return {
    fullUser: { id: fullUser.id, email: fullUser.email, name: fullUser.name },
    restrictedUser: { id: restrictedUser.id, email: restrictedUser.email, name: restrictedUser.name },
    financeUser: { id: financeUser.id, email: financeUser.email, name: financeUser.name },
    schemeA: { id: schemeA.id, code: schemeA.code, name: schemeA.name },
    schemeB: { id: schemeB.id, code: schemeB.code, name: schemeB.name },
    schemeC: { id: schemeC.id, code: schemeC.code, name: schemeC.name },
    meeting: { id: meeting.id },
    financialYear: { id: financialYear.id, label: financialYear.label },
    kpiDefA: { id: kpiDefA.id },
    kpiDefB: { id: kpiDefB.id },
    kpiDefC: { id: kpiDefC.id },
    actionItemA: { id: actionItemA.id, title: actionItemA.title },
    actionItemB: { id: actionItemB.id, title: actionItemB.title },
    actionItemC: { id: actionItemC.id, title: actionItemC.title },
  };
}

/** Load a DbUserWithRbac (with the role/permission graph) for a seeded user. */
export async function loadDbUserWithRbac(userId: string, tenantId: string = ODISHA_TENANT_ID) {
  return withTenantContext(tenantId, () => loadDbUserWithRbacInner(userId));
}

async function loadDbUserWithRbacInner(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
      permissionOverrides: { include: { permission: true } },
    },
  });
}
