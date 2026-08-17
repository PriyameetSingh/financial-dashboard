/**
 * Shared roles + permissions upsert and legacy role migration.
 * Used by `prisma/seed.js` (full seed) and `prisma/seed_roles.js` (RBAC only).
 */

/**
 * Phase 2 tenancy: seeds run outside any request, so they address the tenant
 * explicitly. Defaults to the well-known Odisha tenant (created by migration
 * 20260813084800_phase2_odisha_backfill); override with SEED_TENANT_ID.
 */
const TENANT_ID = process.env.SEED_TENANT_ID || "00000000-0000-4000-8000-000000000001";

const PERMISSIONS = [
  { code: "VIEW_ALL_DATA", name: "View all data" },
  { code: "VIEW_ASSIGNED_DATA", name: "View assigned data" },
  { code: "ENTER_FINANCIAL_DATA", name: "Enter financial data" },
  { code: "MANAGE_FINANCIAL_DATA", name: "Manage financial data" },
  { code: "EDIT_FINANCIAL_ENTRIES", name: "Edit financial entries" },
  { code: "ENTER_KPI_DATA", name: "Enter KPI data" },
  { code: "CREATE_ACTION_ITEMS", name: "Create action items" },
  { code: "UPDATE_ACTION_ITEMS", name: "Update action items" },
  { code: "UPLOAD_PROOF", name: "Upload proof" },
  /*
   * DELIBERATELY HELD BY NO ROLE. Unlike APPROVE_KPI — which drives three route
   * handlers against KPIWorkflowStatus (draft|submitted|reviewed|rejected) —
   * this permission gates nothing: no route handler, no screen, no service call
   * reads it. And FinancialWorkflowStatus is `draft|submitted`, so there is no
   * approved state for it to move a record into.
   *
   * It stays declared so the Roles screen keeps showing it (removing it would
   * change what officers see for no functional gain), and it stays unassigned
   * because granting a capability that cannot be exercised is worse than not
   * having it. Assign it when a financial approval workflow exists.
   */
  { code: "APPROVE_FINANCIAL", name: "Approve financial" },
  { code: "APPROVE_KPI", name: "Approve KPI" },
  { code: "APPROVE_ACTION_ITEMS", name: "Approve action items" },
  { code: "MANAGE_USERS", name: "Manage users" },
  { code: "MANAGE_SCHEMES", name: "Manage schemes" },
  { code: "EXPORT_REPORTS", name: "Export reports" },
  { code: "VIEW_COMMAND_CENTRE", name: "View command centre" },
  { code: "VIEW_ANALYTICS", name: "View analytics" },
  { code: "MANAGE_PERMISSIONS", name: "Manage permissions" },
  { code: "MANAGE_FINANCIAL_YEARS", name: "Manage financial years" },
  { code: "FLAG_KPI_ESCALATION", name: "Flag KPI escalation / bottleneck" },
  { code: "REORDER_SCHEMES", name: "Reorder schemes for all users" },
  { code: "MANAGE_NOTIFICATION_CONFIG", name: "Manage notification configs" },
  { code: "SEND_MANUAL_NOTIFICATIONS", name: "Send manual notifications" },
  { code: "MANAGE_TENANT_CONFIG", name: "Manage tenant configuration" },
];

/** Merged former AS / PS HUDD / similar desk roles — permission set aligned with Nodal Officer. */
const NODAL_LIKE_PERMISSIONS = ["VIEW_ASSIGNED_DATA", "ENTER_KPI_DATA", "UPLOAD_PROOF", "VIEW_ANALYTICS"];

const ROLES = [
  {
    code: "ACS",
    name: "Additional Chief Secretary",
    permissions: [
      "VIEW_ALL_DATA",
      "ENTER_FINANCIAL_DATA",
      "ENTER_KPI_DATA",
      "CREATE_ACTION_ITEMS",
      "UPDATE_ACTION_ITEMS",
      "UPLOAD_PROOF",
      "MANAGE_USERS",
      "MANAGE_SCHEMES",
      "MANAGE_PERMISSIONS",
      "MANAGE_FINANCIAL_YEARS",
      "EXPORT_REPORTS",
      "VIEW_COMMAND_CENTRE",
      "VIEW_ANALYTICS",
      "APPROVE_KPI",
      "APPROVE_ACTION_ITEMS",
      "FLAG_KPI_ESCALATION",
      "REORDER_SCHEMES",
      "MANAGE_NOTIFICATION_CONFIG",
      "SEND_MANUAL_NOTIFICATIONS",
    ],
  },
  {
    code: "PROGRAMME_MANAGER",
    name: "Programme Manager",
    permissions: [...NODAL_LIKE_PERMISSIONS, "FLAG_KPI_ESCALATION"],
  },
  {
    code: "VERTICAL_HEAD",
    name: "Vertical Head",
    permissions: [...NODAL_LIKE_PERMISSIONS, "FLAG_KPI_ESCALATION"],
  },
  {
    /*
     * The finance desk, and the only role that holds the two financial
     * permissions below.
     *
     * Both were defined in PERMISSIONS but assigned to NO role, which made two
     * shipped features unreachable by every user in every tenant:
     * `MANAGE_FINANCIAL_DATA` is the sole gate on the bulk entry screen, and
     * `EDIT_FINANCIAL_ENTRIES` gates the correct/remove actions on an
     * expenditure snapshot — so there was no way to fix a mis-keyed figure.
     * (v1.4.6 shipped that correction feature and its permission together, and
     * nothing ever granted it.)
     *
     * FA rather than ACS on least privilege: bulk entry and corrections are
     * data-desk work, the ACS already holds ENTER_FINANCIAL_DATA for the
     * per-scheme and summary screens, and it holds MANAGE_PERMISSIONS if it ever
     * needs to grant itself more.
     *
     * MANAGE_FINANCIAL_DATA widens no VISIBILITY here: `lib/data-scope.ts` puts
     * it in the same finance full-access set as ENTER_FINANCIAL_DATA, which this
     * role already had. It unlocks a screen, not a row.
     */
    code: "FA",
    name: "Finance Advisor",
    permissions: [
      "VIEW_ALL_DATA",
      "ENTER_FINANCIAL_DATA",
      "MANAGE_FINANCIAL_DATA",
      "EDIT_FINANCIAL_ENTRIES",
      "UPLOAD_PROOF",
    ],
  },
  {
    code: "TASU",
    name: "TASU",
    permissions: [
      "VIEW_ASSIGNED_DATA",
      "CREATE_ACTION_ITEMS",
      "UPDATE_ACTION_ITEMS",
      "APPROVE_ACTION_ITEMS",
      "VIEW_ANALYTICS",
      "MANAGE_USERS",
      "MANAGE_PERMISSIONS",
      "MANAGE_FINANCIAL_YEARS",
      "REORDER_SCHEMES",
      "MANAGE_NOTIFICATION_CONFIG",
      "SEND_MANUAL_NOTIFICATIONS",
      "MANAGE_TENANT_CONFIG",
    ],
  },
  {
    code: "NODAL_OFFICER",
    name: "Nodal Officer",
    permissions: [...NODAL_LIKE_PERMISSIONS, "FLAG_KPI_ESCALATION"],
  },
];

/** Reassign users and scheme templates off legacy roles, then delete those roles. */
async function migrateLegacyRoles(prisma) {
  const pm = await prisma.role.findFirst({ where: { tenantId: TENANT_ID, code: "PROGRAMME_MANAGER" } });
  if (!pm) return;

  const legacyCodes = ["AS", "PS_HUDD", "DIRECTOR", "VIEWER"];
  for (const oldCode of legacyCodes) {
    const old = await prisma.role.findFirst({ where: { tenantId: TENANT_ID, code: oldCode } });
    if (!old) continue;

    await prisma.schemeAssignment.updateMany({
      where: { roleId: old.id },
      data: { roleId: pm.id },
    });

    const links = await prisma.userRole.findMany({ where: { roleId: old.id } });
    for (const ur of links) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: ur.userId, roleId: pm.id } },
        update: {},
        create: { tenantId: TENANT_ID, userId: ur.userId, roleId: pm.id },
      });
    }
    await prisma.userRole.deleteMany({ where: { roleId: old.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: old.id } });
    await prisma.role.delete({ where: { id: old.id } }).catch(() => {});
  }
}

async function seedRolesAndPermissions(prisma) {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { code: p.code, name: p.name },
    });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code: r.code } },
      update: { name: r.name },
      create: { tenantId: TENANT_ID, code: r.code, name: r.name },
    });

    const permissionRows = await prisma.permission.findMany({ where: { code: { in: r.permissions } } });
    for (const perm of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { tenantId: TENANT_ID, roleId: role.id, permissionId: perm.id },
      });
    }
  }

  await migrateLegacyRoles(prisma);
}

/** One dummy TASU user (MANAGE_USERS + MANAGE_PERMISSIONS) for admin UI after RBAC reset. Idempotent by email. */
async function ensureBootstrapTasuAdmin(prisma) {
  const email = process.env.BOOTSTRAP_TASU_EMAIL || "tasu.admin@hudd.bootstrap";
  const tasu = await prisma.role.findFirst({ where: { tenantId: TENANT_ID, code: "TASU" } });
  if (!tasu) throw new Error("TASU role missing after seed");

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TENANT_ID, email } },
    update: {
      name: "TASU Bootstrap Admin",
      department: "Technical & Advisory Support Unit",
      code: "tasu-bootstrap",
      isActive: true,
    },
    create: {
      tenantId: TENANT_ID,
      email,
      name: "TASU Bootstrap Admin",
      department: "Technical & Advisory Support Unit",
      code: "tasu-bootstrap",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: tasu.id } },
    update: {},
    create: { tenantId: TENANT_ID, userId: user.id, roleId: tasu.id },
  });

  return { email, userId: user.id };
}

/**
 * One Finance Advisor user, so the seeded tenant can actually exercise its own
 * financial entry screens.
 *
 * Before this the only seeded user was the bootstrap TASU admin, which holds no
 * data-entry permission at all — so the financial and KPI entry screens could
 * not be opened by any seeded session, and the accessibility leg had to skip
 * them. A seed that cannot reach its own product's screens cannot be used to
 * check them. Idempotent by email, same as the TASU bootstrap.
 */
async function ensureFinanceDeskUser(prisma) {
  const email = process.env.SEED_FA_EMAIL || "finance.desk@hudd.bootstrap";
  const fa = await prisma.role.findFirst({ where: { tenantId: TENANT_ID, code: "FA" } });
  if (!fa) throw new Error("FA role missing after seed");

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TENANT_ID, email } },
    update: {
      name: "Finance Desk",
      department: "Finance",
      code: "fa-bootstrap",
      isActive: true,
    },
    create: {
      tenantId: TENANT_ID,
      email,
      name: "Finance Desk",
      department: "Finance",
      code: "fa-bootstrap",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: fa.id } },
    update: {},
    create: { tenantId: TENANT_ID, userId: user.id, roleId: fa.id },
  });

  return { email, userId: user.id };
}

/** Link real users (e.g. after Keycloak sync) to a DB role so `/rbac/me` gets `role_permissions`. */
async function ensureKnownUserRoleLinks(prisma) {
  const links = [];
  for (const { email, roleCode } of links) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
    });
    if (!user) {
      console.warn(`[seed_roles] Skip role link — user not found: ${email}`);
      continue;
    }
    const role = await prisma.role.findFirst({ where: { tenantId: TENANT_ID, code: roleCode } });
    if (!role) throw new Error(`Role not found: ${roleCode}`);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { tenantId: TENANT_ID, userId: user.id, roleId: role.id },
    });
    console.log(`[seed_roles] Linked ${user.email} → ${roleCode}`);
  }
}

module.exports = {
  PERMISSIONS,
  ROLES,
  NODAL_LIKE_PERMISSIONS,
  migrateLegacyRoles,
  seedRolesAndPermissions,
  ensureBootstrapTasuAdmin,
  ensureFinanceDeskUser,
  ensureKnownUserRoleLinks,
};
