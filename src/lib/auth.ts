import { MockUser, Permission, UserRole } from "@/types";

export { Permission, UserRole };
export type { MockUser };

const SESSION_USER_STORAGE_KEY = "hudd_session_user";
let memoryUser: MockUser | null = null;

function readStoredUser(): MockUser | null {
  if (typeof window === "undefined") return memoryUser;
  try {
    const payload = window.localStorage.getItem(SESSION_USER_STORAGE_KEY);
    if (!payload) return null;
    return JSON.parse(payload) as MockUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: MockUser | null) {
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

export function setCurrentUser(user: MockUser) {
  writeStoredUser(user);
}

export function getCurrentUser(): MockUser | null {
  const stored = readStoredUser();
  if (stored) memoryUser = stored;
  return memoryUser;
}

export function clearCurrentUser() {
  writeStoredUser(null);
}

/** Prototype login cards — identities must exist in DB with matching `users.code`. Permissions always come from `/api/v1/rbac/me`. */
export const MOCK_USERS: MockUser[] = [
  {
    id: "acs",
    name: "Smt. Ushaa Padhee",
    email: "usha.padhee@hudd.ori",
    role: UserRole.ACS,
    department: "Housing & Urban Development Department",
    assignedSchemes: ["PMAY-U", "SUJALA", "GARIMA"],
  },
  {
    id: "ps",
    name: "Shri Pradeep Jena",
    email: "pradeep.jena@hudd.ori",
    role: UserRole.PS_HUDD,
    department: "Housing & Urban Development Department",
    assignedSchemes: ["All schemes"],
  },
  {
    id: "as",
    name: "Shri Suvendu Das",
    email: "suvendu.das@hudd.ori",
    role: UserRole.AS,
    department: "Housing & Urban Development Department",
    assignedSchemes: ["All schemes"],
  },
  {
    id: "fa",
    name: "Shri Rakesh Mohanty",
    email: "rakesh.mohanty@hudd.ori",
    role: UserRole.FA,
    department: "Finance & Planning",
    assignedSchemes: ["All schemes"],
  },
  {
    id: "tasu",
    name: "Ms. Priya Nair",
    email: "priya.nair@hudd.ori",
    role: UserRole.TASU,
    department: "Technical & Advisory Support Unit",
    assignedSchemes: ["PMAY-U", "SUJALA", "GARIMA"],
  },
  {
    id: "nodal",
    name: "Shri Amit Kumar",
    email: "amit.kumar@hudd.ori",
    role: UserRole.NODAL_OFFICER,
    department: "HUDD Field Unit",
    assignedSchemes: ["PMAY-U", "SUJALA", "GARIMA"],
  },
  {
    id: "director",
    name: "Shri B.K. Mishra",
    email: "bk.mishra@hudd.ori",
    role: UserRole.DIRECTOR,
    department: "Directorate of DMA",
    assignedSchemes: ["DMA", "All schemes"],
  },
  {
    id: "viewer",
    name: "Shri Ramesh Patnaik",
    email: "ramesh.patnaik@hudd.ori",
    role: UserRole.VIEWER,
    department: "Audit & Compliance",
    assignedSchemes: ["All schemes"],
  },
];

type MeApiUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  assignedSchemes: string[];
  permissions: Permission[];
};

/**
 * Loads the signed-in user profile and effective permissions from the database (via `/api/v1/rbac/me`)
 * and refreshes local client state. Call after login or when opening a guarded page.
 */
export async function refreshSessionUserFromApi(): Promise<MockUser | null> {
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
    const next: MockUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      department: data.user.department,
      assignedSchemes: data.user.assignedSchemes,
      permissions: data.user.permissions,
    };
    setCurrentUser(next);
    return next;
  } catch {
    return getCurrentUser();
  }
}

export function hasPermission(user: MockUser | null, permission: Permission) {
  if (!user?.permissions?.length) return false;
  return user.permissions.includes(permission);
}

export const MY_TASKS_HUB_ACCESS_PERMISSIONS: Permission[] = [
  Permission.ENTER_FINANCIAL_DATA,
  Permission.ENTER_KPI_DATA,
  Permission.UPDATE_ACTION_ITEMS,
  Permission.CREATE_ACTION_ITEMS,
];

export function canAccessMyTasksHub(user: MockUser | null): boolean {
  if (!user) return false;
  return MY_TASKS_HUB_ACCESS_PERMISSIONS.some((p) => hasPermission(user, p));
}

export function canAccessScheme(user: MockUser | null, schemeCode: string) {
  if (!user) return false;
  if (roleHasViewAll(user)) return true;
  return user.assignedSchemes.some((s) => s.toLowerCase() === schemeCode.toLowerCase());
}

function roleHasViewAll(user: MockUser) {
  return hasPermission(user, Permission.VIEW_ALL_DATA);
}
