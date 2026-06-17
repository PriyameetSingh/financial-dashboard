import { Permission, type SessionUser } from "@/types";

const EDIT_SIGNALS: Permission[] = [
  Permission.ENTER_FINANCIAL_DATA,
  Permission.MANAGE_FINANCIAL_DATA,
  Permission.ENTER_KPI_DATA,
  Permission.CREATE_ACTION_ITEMS,
  Permission.UPDATE_ACTION_ITEMS,
  Permission.MANAGE_USERS,
  Permission.MANAGE_SCHEMES,
  Permission.MANAGE_PERMISSIONS,
  Permission.MANAGE_FINANCIAL_YEARS,
  Permission.APPROVE_FINANCIAL,
  Permission.APPROVE_KPI,
  Permission.APPROVE_ACTION_ITEMS,
  Permission.UPLOAD_PROOF,
  Permission.REORDER_SCHEMES,
];

/** True when the user has no workflow or admin mutation permissions (read-focused UI watermark). */
export function isReadOnlyWatermarkUser(user: SessionUser | null): boolean {
  if (!user?.permissions?.length) return true;
  const p = user.permissions;
  return !EDIT_SIGNALS.some((code) => p.includes(code));
}
