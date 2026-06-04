import type { ActionItem, SessionUser } from "@/types";
import { canAccessMyTasksHub } from "@/src/lib/auth";

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Same rules as `app/action-items/[id]/page.tsx` — directory `SessionUser.id` is user `code`. */
export function isAssignedActionOfficer(item: ActionItem, u: { id: string; name: string }): boolean {
  if (item.performers?.length) {
    return item.performers.some(
      (p) =>
        (!!p.code && p.code.trim().toLowerCase() === u.id.trim().toLowerCase()) ||
        normalize(p.name) === normalize(u.name),
    );
  }
  const code = item.assignedToUserCode?.trim().toLowerCase();
  if (code && code === u.id.trim().toLowerCase()) return true;
  return normalize(item.assignedTo) === normalize(u.name);
}

/** True when this user is one of the item's reviewers (same rules as `app/action-items/page.tsx`). */
export function isDesignatedReviewer(item: ActionItem, u: { id: string; name: string }): boolean {
  // Prefer explicit reviewer user ids from the API (DB ids, same as SessionUser.id).
  if (item.reviewerUserIds?.length) {
    if (item.reviewerUserIds.includes(u.id)) return true;
  }
  if (item.reviewerUserId && item.reviewerUserId === u.id) {
    return true;
  }

  // Fallback to legacy code/name matching for older data shapes.
  if (item.reviewers?.length) {
    return item.reviewers.some(
      (r) =>
        (!!r.code && r.code.trim().toLowerCase() === u.id.trim().toLowerCase()) ||
        normalize(r.name) === normalize(u.name),
    );
  }
  const code = item.reviewerUserCode?.trim().toLowerCase();
  if (code && code === u.id.trim().toLowerCase()) return true;
  return normalize(item.reviewer) === normalize(u.name);
}

export function isPendingActionItem(item: ActionItem): boolean {
  return item.status !== "COMPLETED";
}

export function hasPendingAssignedActionItems(items: ActionItem[], user: SessionUser): boolean {
  return items.some((item) => isAssignedActionOfficer(item, user) && isPendingActionItem(item));
}

export function hasAnyAssignedActionItems(items: ActionItem[], user: SessionUser): boolean {
  return items.some((item) => isAssignedActionOfficer(item, user));
}

export function filterAssignedPendingActionItems(items: ActionItem[], user: SessionUser): ActionItem[] {
  return items.filter((item) => isAssignedActionOfficer(item, user) && isPendingActionItem(item));
}

/** Sidebar /my-tasks: financial-KPI-action permissions, or at least one pending item assigned to this user. */
export function canSeeMyTasksNav(user: SessionUser | null, actionItems: ActionItem[]): boolean {
  if (!user) return false;
  if (canAccessMyTasksHub(user)) return true;
  return hasPendingAssignedActionItems(actionItems, user);
}
