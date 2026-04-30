import { SessionUser, Permission, UserRole } from "@/types";

export { Permission, UserRole };
export type { SessionUser };

const SESSION_USER_STORAGE_KEY = "hudd_session_user";
let memoryUser: SessionUser | null = null;

function readStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return memoryUser;
  try {
    const payload = window.localStorage.getItem(SESSION_USER_STORAGE_KEY);
    if (!payload) return null;
    return JSON.parse(payload) as SessionUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: SessionUser | null) {
  memoryUser = user;
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      window.localStorage.removeItem(SESSION_USER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage errors in private mode / disabled storage.
  }
}

export function setCurrentUser(user: SessionUser) {
  writeStoredUser(user);
}

export function getCurrentUser(): SessionUser | null {
  const stored = readStoredUser();
  if (stored) memoryUser = stored;
  return memoryUser;
}

export function clearCurrentUser() {
  writeStoredUser(null);
}

type MeApiUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation?: string | null;
  assignedSchemes: string[];
  permissions: Permission[];
};

/**
 * Loads the signed-in user profile and effective permissions from the database (via `/api/v1/rbac/me`)
 * and refreshes local client state. Call after login or when opening a guarded page.
 */
export async function refreshSessionUserFromApi(): Promise<SessionUser | null> {
  try {
    const res = await fetch("/api/v1/rbac/me", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearCurrentUser();
        return null;
      }
      return getCurrentUser();
    }
    const data = (await res.json()) as { user: MeApiUser | null };
    if (!data.user) {
      clearCurrentUser();
      return null;
    }
    const next: SessionUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      department: data.user.department,
      designation: data.user.designation ?? undefined,
      assignedSchemes: data.user.assignedSchemes,
      permissions: data.user.permissions,
    };
    setCurrentUser(next);
    return next;
  } catch {
    return getCurrentUser();
  }
}

export function hasPermission(user: SessionUser | null, permission: Permission) {
  if (!user?.permissions?.length) return false;
  return user.permissions.includes(permission);
}

export const MY_TASKS_HUB_ACCESS_PERMISSIONS: Permission[] = [
  Permission.ENTER_FINANCIAL_DATA,
  Permission.ENTER_KPI_DATA,
  Permission.UPDATE_ACTION_ITEMS,
  Permission.CREATE_ACTION_ITEMS,
];

export function canAccessMyTasksHub(user: SessionUser | null): boolean {
  if (!user) return false;
  return MY_TASKS_HUB_ACCESS_PERMISSIONS.some((p) => hasPermission(user, p));
}

export function canAccessScheme(user: SessionUser | null, schemeCode: string) {
  if (!user) return false;
  if (roleHasViewAll(user)) return true;
  return user.assignedSchemes.some((s) => s.toLowerCase() === schemeCode.toLowerCase());
}

function roleHasViewAll(user: SessionUser) {
  return hasPermission(user, Permission.VIEW_ALL_DATA);
}
