/**
 * Shared roles + permissions upsert and legacy role migration.
 * Used by `prisma/seed.js` (full seed) and `prisma/seed_roles.js` (RBAC only).
 */

const PERMISSIONS = [
  { code: "VIEW_ALL_DATA", name: "View all data" },
  { code: "VIEW_ASSIGNED_DATA", name: "View assigned data" },
  { code: "ENTER_FINANCIAL_DATA", name: "Enter financial data" },
  { code: "MANAGE_FINANCIAL_DATA", name: "Manage financial data" },
  { code: "ENTER_KPI_DATA", name: "Enter KPI data" },
  { code: "CREATE_ACTION_ITEMS", name: "Create action items" },
  { code: "UPDATE_ACTION_ITEMS", name: "Update action items" },
  { code: "UPLOAD_PROOF", name: "Upload proof" },
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
    code: "FA",
    name: "Finance Advisor",
    permissions: ["VIEW_ALL_DATA", "ENTER_FINANCIAL_DATA", "UPLOAD_PROOF"],
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
  const pm = await prisma.role.findUnique({ where: { code: "PROGRAMME_MANAGER" } });
  if (!pm) return;

  const legacyCodes = ["AS", "PS_HUDD", "DIRECTOR", "VIEWER"];
  for (const oldCode of legacyCodes) {
    const old = await prisma.role.findUnique({ where: { code: oldCode } });
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
        create: { userId: ur.userId, roleId: pm.id },
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
      where: { code: r.code },
      update: { name: r.name },
      create: { code: r.code, name: r.name },
    });

    const permissionRows = await prisma.permission.findMany({ where: { code: { in: r.permissions } } });
    for (const perm of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  await migrateLegacyRoles(prisma);
}

/** One dummy TASU user (MANAGE_USERS + MANAGE_PERMISSIONS) for admin UI after RBAC reset. Idempotent by email. */
async function ensureBootstrapTasuAdmin(prisma) {
  const email = process.env.BOOTSTRAP_TASU_EMAIL || "tasu.admin@hudd.bootstrap";
  const tasu = await prisma.role.findUnique({ where: { code: "TASU" } });
  if (!tasu) throw new Error("TASU role missing after seed");

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "TASU Bootstrap Admin",
      department: "Technical & Advisory Support Unit",
      code: "tasu-bootstrap",
      isActive: true,
    },
    create: {
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
    create: { userId: user.id, roleId: tasu.id },
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
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error(`Role not found: ${roleCode}`);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
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
  ensureKnownUserRoleLinks,
};
