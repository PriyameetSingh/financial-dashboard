/**
 * The permission CATALOG — code-owned, fixed, and the source of truth for the
 * `permissions` table.
 *
 * A tenant re-bundles these into roles; a tenant can never invent one, because a
 * permission that no code checks grants nothing. Adding a member here is a
 * product decision that ships with the enforcement that reads it.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The catalog was spread across three places that could drift silently:
 *   1. `Permission` in src/types/index.ts — what application code references
 *   2. `PERMISSIONS` in prisma/seed_roles_core.cjs — what the seed writes
 *   3. the `permissions` table — what enforcement actually reads
 * This module adds the metadata a configurator needs (group, owning module) and
 * is the one place to edit. tests/rbac-permission-catalog.test.ts fails if the
 * enum, the seed array and this catalog stop agreeing.
 *
 * ── owningModule and the entitlement ceiling ────────────────────────────────
 * `owningModule` names the module a permission belongs to, using the codes in
 * lib/entitlements/catalog.ts. A tenant not entitled to the module must not be
 * granted the permission — that is the ceiling a later gate enforces on role
 * edits. `null` means the always-on core: viewing data, managing users and
 * permissions, exporting. Those cannot be gated away or a tenant could lock
 * itself out of its own administration.
 */

/** Display grouping. Order here is the order a configurator should show. */
export const PERMISSION_GROUPS = [
  "Data access",
  "Financial",
  "KPI",
  "Action items",
  "Meetings & reports",
  "Administration",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export type PermissionCatalogEntry = {
  /** Stable code. Matches the TypeScript enum member and the DB `code`. */
  code: string;
  /** Human label — the DB `name` column. */
  label: string;
  group: PermissionGroup;
  /** Module code from lib/entitlements/catalog.ts, or null for always-on core. */
  owningModule: string | null;
};

/**
 * Every permission the product enforces.
 *
 * Kept in the same order as the seed array so the two read as one list side by
 * side. The labels are exactly the `name` values already in the database —
 * changing one would rename it on the Roles screen, which is an officer-visible
 * change and not part of this cut.
 */
export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  // Data access. Never module-gated: these decide what rows a caller may read
  // at all, and lib/data-scope.ts reads them on every request.
  { code: "VIEW_ALL_DATA", label: "View all data", group: "Data access", owningModule: null },
  {
    code: "VIEW_ASSIGNED_DATA",
    label: "View assigned data",
    group: "Data access",
    owningModule: null,
  },

  // Financial.
  {
    code: "ENTER_FINANCIAL_DATA",
    label: "Enter financial data",
    group: "Financial",
    owningModule: "MOD-FIN",
  },
  {
    code: "MANAGE_FINANCIAL_DATA",
    label: "Manage financial data",
    group: "Financial",
    owningModule: "MOD-FIN",
  },
  {
    code: "EDIT_FINANCIAL_ENTRIES",
    label: "Edit financial entries",
    group: "Financial",
    owningModule: "MOD-FIN",
  },
  {
    code: "APPROVE_FINANCIAL",
    label: "Approve financial",
    group: "Financial",
    owningModule: "MOD-FIN",
  },
  {
    code: "MANAGE_FINANCIAL_YEARS",
    label: "Manage financial years",
    group: "Financial",
    owningModule: "MOD-FIN",
  },

  // KPI.
  { code: "ENTER_KPI_DATA", label: "Enter KPI data", group: "KPI", owningModule: "MOD-KPI" },
  { code: "APPROVE_KPI", label: "Approve KPI", group: "KPI", owningModule: "MOD-KPI" },
  { code: "UPLOAD_PROOF", label: "Upload proof", group: "KPI", owningModule: "MOD-KPI" },
  {
    code: "FLAG_KPI_ESCALATION",
    label: "Flag KPI escalation / bottleneck",
    group: "KPI",
    owningModule: "MOD-KPI",
  },

  // Action items.
  {
    code: "CREATE_ACTION_ITEMS",
    label: "Create action items",
    group: "Action items",
    owningModule: "MOD-ACT",
  },
  {
    code: "UPDATE_ACTION_ITEMS",
    label: "Update action items",
    group: "Action items",
    owningModule: "MOD-ACT",
  },
  {
    code: "APPROVE_ACTION_ITEMS",
    label: "Approve action items",
    group: "Action items",
    owningModule: "MOD-ACT",
  },

  // Meetings & reports. EXPORT_REPORTS is core: exporting what you can already
  // see is not a separately-sold capability.
  {
    code: "EXPORT_REPORTS",
    label: "Export reports",
    group: "Meetings & reports",
    owningModule: null,
  },
  {
    code: "VIEW_COMMAND_CENTRE",
    label: "View command centre",
    group: "Meetings & reports",
    owningModule: "MOD-CC",
  },
  {
    code: "VIEW_ANALYTICS",
    label: "View analytics",
    group: "Meetings & reports",
    owningModule: null,
  },

  // Administration. MANAGE_USERS and MANAGE_PERMISSIONS are core by necessity:
  // gate them behind a module and an un-entitled tenant could not administer
  // itself at all.
  { code: "MANAGE_USERS", label: "Manage users", group: "Administration", owningModule: null },
  {
    code: "MANAGE_PERMISSIONS",
    label: "Manage permissions",
    group: "Administration",
    owningModule: null,
  },
  { code: "MANAGE_SCHEMES", label: "Manage schemes", group: "Administration", owningModule: null },
  {
    code: "REORDER_SCHEMES",
    label: "Reorder schemes for all users",
    group: "Administration",
    owningModule: null,
  },
  {
    code: "MANAGE_NOTIFICATION_CONFIG",
    label: "Manage notification configs",
    group: "Administration",
    owningModule: "MOD-NOTIF",
  },
  {
    code: "SEND_MANUAL_NOTIFICATIONS",
    label: "Send manual notifications",
    group: "Administration",
    owningModule: "MOD-NOTIF",
  },
  {
    code: "MANAGE_TENANT_CONFIG",
    label: "Manage tenant configuration",
    group: "Administration",
    owningModule: null,
  },
];

/** Lookup by code. */
export const PERMISSION_BY_CODE: ReadonlyMap<string, PermissionCatalogEntry> = new Map(
  PERMISSION_CATALOG.map((entry) => [entry.code, entry]),
);

/** True when the code names a permission the product actually enforces. */
export function isKnownPermission(code: string): boolean {
  return PERMISSION_BY_CODE.has(code);
}

/**
 * The module a permission belongs to, or null for always-on core.
 *
 * Returns null for an unknown code as well — callers that care about existence
 * must ask {@link isKnownPermission} first, so an unknown code can never be
 * mistaken for a core permission that anyone may hold.
 */
export function owningModuleFor(code: string): string | null {
  return PERMISSION_BY_CODE.get(code)?.owningModule ?? null;
}
