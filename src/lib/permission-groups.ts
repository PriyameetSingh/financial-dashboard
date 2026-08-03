import { Permission } from "@/types";

export type PermissionGroup = {
  id: string;
  label: string;
  /** Lucide icon name (resolved on the client to avoid bundling the whole icon set here). */
  icon: string;
  description: string;
  permissions: Permission[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "data-visibility",
    label: "Data Visibility",
    icon: "Eye",
    description: "Controls which records an officer can see across schemes.",
    permissions: [Permission.VIEW_ALL_DATA, Permission.VIEW_ASSIGNED_DATA],
  },
  {
    id: "data-entry",
    label: "Data Entry",
    icon: "PencilLine",
    description: "Entering and correcting financial and KPI figures.",
    permissions: [
      Permission.ENTER_FINANCIAL_DATA,
      Permission.MANAGE_FINANCIAL_DATA,
      Permission.EDIT_FINANCIAL_ENTRIES,
      Permission.ENTER_KPI_DATA,
    ],
  },
  {
    id: "action-items",
    label: "Action Items",
    icon: "ListChecks",
    description: "Creating, updating, and approving action items.",
    permissions: [
      Permission.CREATE_ACTION_ITEMS,
      Permission.UPDATE_ACTION_ITEMS,
      Permission.APPROVE_ACTION_ITEMS,
    ],
  },
  {
    id: "approvals-escalation",
    label: "Approvals & Escalation",
    icon: "ShieldCheck",
    description: "Approving financial/KPI submissions and flagging escalations.",
    permissions: [
      Permission.APPROVE_FINANCIAL,
      Permission.APPROVE_KPI,
      Permission.FLAG_KPI_ESCALATION,
    ],
  },
  {
    id: "proof-upload",
    label: "Proof Upload",
    icon: "Upload",
    description: "Uploading proof documents against action items.",
    permissions: [Permission.UPLOAD_PROOF],
  },
  {
    id: "reports-analytics",
    label: "Reports & Analytics",
    icon: "BarChart3",
    description: "Exporting reports and viewing analytics and the command centre.",
    permissions: [
      Permission.EXPORT_REPORTS,
      Permission.VIEW_ANALYTICS,
      Permission.VIEW_COMMAND_CENTRE,
    ],
  },
  {
    id: "scheme-management",
    label: "Scheme Management",
    icon: "FolderTree",
    description: "Managing schemes and their display order.",
    permissions: [Permission.MANAGE_SCHEMES, Permission.REORDER_SCHEMES],
  },
  {
    id: "administration",
    label: "Administration",
    icon: "Settings",
    description: "Users, permissions, financial years, and notification configuration.",
    permissions: [
      Permission.MANAGE_USERS,
      Permission.MANAGE_PERMISSIONS,
      Permission.MANAGE_FINANCIAL_YEARS,
      Permission.MANAGE_NOTIFICATION_CONFIG,
      Permission.SEND_MANUAL_NOTIFICATIONS,
    ],
  },
];

const PERMISSION_TO_GROUP: Map<Permission, PermissionGroup> = new Map(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => [p, group] as const)),
);

export function getPermissionGroup(permissionCode: Permission): PermissionGroup | undefined {
  return PERMISSION_TO_GROUP.get(permissionCode);
}
