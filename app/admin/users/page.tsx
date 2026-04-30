"use client";

import AppShell from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission, UserRole } from "@/lib/auth";
import RoleBadge from "@/src/components/ui/RoleBadge";

const PERMISSION_LIST = Object.values(Permission);

type OverrideEffect = "allow" | "deny";

type DbUserPermissionOverride = {
  code: Permission;
  effect: OverrideEffect;
};

type DbUserRow = {
  code: string | null;
  name: string;
  email: string;
  department: string | null;
  designation: string | null;
  roles: UserRole[];
  overrides: DbUserPermissionOverride[];
  effectivePermissions: Permission[];
  assignedSchemes: string[];
};

type CreateUserFormState = {
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  defaultPassword: string;
  roleCode: UserRole;
};

type RoleFilterValue = UserRole | "ALL";

const INITIAL_CREATE_USER_FORM: CreateUserFormState = {
  name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  defaultPassword: "",
  roleCode: UserRole.NODAL_OFFICER,
};

/** Digits from phone — matches API / Keycloak username. */
function usernameDigitsFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function formatRoleLabel(role: UserRole): string {
  if (role === UserRole.PROGRAMME_MANAGER) return "Programme Manager";
  return role.replace(/_/g, " ");
}

// ─── Permissions Modal ────────────────────────────────────────────────────────

interface PermissionsModalProps {
  user: DbUserRow;
  onToggle: (userCode: string, permission: Permission) => Promise<void>;
  onClose: () => void;
  alert: string;
}

function PermissionsModal({ user, onToggle, onClose, alert }: PermissionsModalProps) {
  const overrideCount = user.overrides.length;
  const grantedCount = user.effectivePermissions.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Permissions</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">{user.name}</h2>
            <div className="mt-1 flex items-center gap-3">
              <RoleBadge role={user.roles[0] ?? UserRole.NODAL_OFFICER} />
              <span className="text-xs text-[var(--text-muted)]">
                {grantedCount} granted
                {overrideCount > 0 && (
                  <> · <span className="text-[var(--alert-warning)]">{overrideCount} override{overrideCount > 1 ? "s" : ""}</span></>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-b border-[var(--border)] px-6 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--text-primary)] bg-[var(--text-primary)]" />
            Granted
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)]" />
            Denied (override)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-transparent" />
            Not granted
          </span>
        </div>

        {/* Permission toggles */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {PERMISSION_LIST.map((permission) => {
              const override = user.overrides.find((entry) => entry.code === permission) ?? null;
              const granted = user.effectivePermissions.includes(permission);
              return (
                <button
                  key={`modal-${user.code ?? user.email}-${permission}`}
                  onClick={() => onToggle(user.code ?? "", permission)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${override?.effect === "deny"
                    ? "border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)] text-[var(--alert-critical)]"
                    : granted
                      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                    }`}
                  title={
                    override
                      ? `Override active — click to unset (${override.effect})`
                      : granted
                        ? "Click to deny (override)"
                        : "Click to grant (override)"
                  }
                >
                  {permission.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alert */}
        {alert && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <p className="text-xs text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateUserModalProps {
  isOpen: boolean;
  form: CreateUserFormState;
  roleOptions: UserRole[];
  phoneUsernamePreview: string;
  isCreatingUser: boolean;
  alert: string;
  onChange: (key: Exclude<keyof CreateUserFormState, "roleCode">, value: string) => void;
  onRoleChange: (roleCode: UserRole) => void;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

function CreateUserModal({
  isOpen,
  form,
  roleOptions,
  phoneUsernamePreview,
  isCreatingUser,
  alert,
  onChange,
  onRoleChange,
  onSubmit,
  onClose,
}: CreateUserModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Administration</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">Create User</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Creates the user in Keycloak and syncs local RBAC in one action.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            aria-label="Close create user dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Name
              <input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Officer name"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                placeholder="name@example.org"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Phone number
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => onChange("phone", e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
              <span className="text-[10px] text-[var(--text-muted)]">
                {phoneUsernamePreview.length >= 10
                  ? `Login username (digits): ${phoneUsernamePreview}`
                  : "Enter at least 10 digits; spaces and symbols are stripped for the username."}
              </span>
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Department (optional)
              <input
                value={form.department}
                onChange={(e) => onChange("department", e.target.value)}
                placeholder="Department"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] md:col-span-2">
              Designation
              <input
                required
                value={form.designation}
                onChange={(e) => onChange("designation", e.target.value)}
                placeholder="e.g. Principal Secretary, HUDD"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Default Password
              <input
                type="password"
                value={form.defaultPassword}
                onChange={(e) => onChange("defaultPassword", e.target.value)}
                placeholder="Temporary password"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Role
              <select
                value={form.roleCode}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              >
                {roleOptions.map((role) => (
                  <option key={`create-role-${role}`} value={role}>
                    {formatRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {alert && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <p className="text-xs text-[var(--text-muted)]">{alert}</p>
          </div>
        )}

        <div className="flex gap-3 border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isCreatingUser}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingUser ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  const [users, setUsers] = useState<DbUserRow[]>([]);
  const [alert, setAlert] = useState("");
  const [selectedUser, setSelectedUser] = useState<DbUserRow | null>(null);
  const [createUserAlert, setCreateUserAlert] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(INITIAL_CREATE_USER_FORM);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>("ALL");
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Record<string, UserRole>>({});
  const [roleUpdateLoadingCodes, setRoleUpdateLoadingCodes] = useState<Record<string, boolean>>({});
  const [deleteLoadingCodes, setDeleteLoadingCodes] = useState<Record<string, boolean>>({});

  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, Permission[]>>(() =>
    Object.fromEntries(Object.values(UserRole).map((role) => [role, [] as Permission[]])) as Record<UserRole, Permission[]>,
  );

  const refreshRoles = useCallback(async () => {
    const response = await fetch("/api/v1/rbac/roles");
    if (!response.ok) throw new Error("Failed to load roles");
    const data = (await response.json()) as { roles: Array<{ code: UserRole; permissions: Permission[] }> };

    setRolePermissions((prev) => {
      const next: Record<UserRole, Permission[]> = { ...prev };
      for (const role of data.roles) {
        next[role.code] = role.permissions;
      }
      return next;
    });
  }, []);

  const refreshUsers = useCallback(async () => {
    const response = await fetch("/api/v1/rbac/users");
    if (!response.ok) throw new Error("Failed to load users");
    const data = (await response.json()) as { users: DbUserRow[] };
    setUsers(data.users);
    return data.users;
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await Promise.all([refreshRoles(), refreshUsers()]);
        if (!active) return;
        setAlert("");
      } catch {
        if (!active) return;
        setAlert("Unable to load permissions from database. Using fallback view.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [refreshRoles, refreshUsers]);

  const managePermissionCount = useMemo(() => {
    return users.filter((user) => user.effectivePermissions.includes(Permission.MANAGE_PERMISSIONS)).length;
  }, [users]);

  const roleOptions = useMemo<UserRole[]>(() => {
    const keys = Object.keys(rolePermissions).filter((code) => code in UserRole) as UserRole[];
    if (keys.length) return keys;
    return Object.values(UserRole);
  }, [rolePermissions]);

  const phoneUsernamePreview = useMemo(
    () => usernameDigitsFromPhone(createUserForm.phone),
    [createUserForm.phone],
  );

  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const role = user.roles[0] ?? UserRole.NODAL_OFFICER;
      if (roleFilter !== "ALL" && role !== roleFilter) return false;
      if (!needle) return true;

      const assignedSchemes = user.assignedSchemes?.join(" ").toLowerCase() ?? "";
      const haystack = [
        user.name,
        user.email,
        user.code ?? "",
        user.department ?? "",
        user.designation ?? "",
        role,
        assignedSchemes,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [roleFilter, searchTerm, users]);

  const pendingRoleSaveCount = useMemo(() => {
    return users.reduce((count, user) => {
      const userCode = user.code ?? "";
      if (!userCode) return count;
      const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
      const nextRole = pendingRoleChanges[userCode];
      if (!nextRole || nextRole === currentRole) return count;
      return count + 1;
    }, 0);
  }, [pendingRoleChanges, users]);

  const handleCreateUserChange = useCallback((key: Exclude<keyof CreateUserFormState, "roleCode">, value: string) => {
    setCreateUserForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateUserRoleChange = useCallback((roleCode: UserRole) => {
    setCreateUserForm((prev) => ({ ...prev, roleCode }));
  }, []);

  const handleCreateUser = useCallback(async () => {
    if (isCreatingUser) return;
    setCreateUserAlert("");

    if (!createUserForm.name.trim() || !createUserForm.email.trim() || !createUserForm.defaultPassword.trim()) {
      setCreateUserAlert("Name, email, and default password are required.");
      return;
    }

    if (!createUserForm.designation.trim()) {
      setCreateUserAlert("Designation is required for every new user.");
      return;
    }

    const phoneDigits = usernameDigitsFromPhone(createUserForm.phone);
    if (phoneDigits.length < 10) {
      setCreateUserAlert("Phone number is required: at least 10 digits. Digits are used as the login username.");
      return;
    }

    setIsCreatingUser(true);
    try {
      const response = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createUserForm.name.trim(),
          email: createUserForm.email.trim().toLowerCase(),
          phone: createUserForm.phone.trim(),
          department: createUserForm.department.trim() || undefined,
          designation: createUserForm.designation.trim(),
          defaultPassword: createUserForm.defaultPassword,
          roleCode: createUserForm.roleCode,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setCreateUserAlert(data?.detail || "Unable to create user.");
        return;
      }

      setCreateUserForm(INITIAL_CREATE_USER_FORM);
      setCreateUserAlert("User created in Keycloak and local RBAC.");
      await refreshUsers();
      setIsCreateUserOpen(false);
    } catch {
      setCreateUserAlert("Unable to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  }, [createUserForm, isCreatingUser, refreshUsers]);

  const handleRoleDraftChange = useCallback((userCode: string, roleCode: UserRole) => {
    setPendingRoleChanges((prev) => ({ ...prev, [userCode]: roleCode }));
  }, []);

  const handleRoleUpdate = useCallback(async (user: DbUserRow) => {
    const userCode = user.code ?? "";
    if (!userCode) return;

    const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
    const nextRole = pendingRoleChanges[userCode] ?? currentRole;
    if (nextRole === currentRole) {
      return;
    }

    setRoleUpdateLoadingCodes((prev) => ({ ...prev, [userCode]: true }));
    setAlert("");
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode: nextRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setAlert(data?.detail || "Unable to update role.");
        return;
      }

      await refreshUsers();
      setPendingRoleChanges((prev) => {
        const next = { ...prev };
        delete next[userCode];
        return next;
      });
    } catch {
      setAlert("Unable to update role.");
    } finally {
      setRoleUpdateLoadingCodes((prev) => ({ ...prev, [userCode]: false }));
    }
  }, [pendingRoleChanges, refreshUsers]);

  const handleDeleteUser = useCallback(async (user: DbUserRow) => {
    const userCode = user.code ?? "";
    if (!userCode) return;

    const confirmed = window.confirm(`Delete ${user.name}? This action deactivates the account and removes role access.`);
    if (!confirmed) return;

    setDeleteLoadingCodes((prev) => ({ ...prev, [userCode]: true }));
    setAlert("");
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userCode)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setAlert(data?.detail || "Unable to delete user.");
        return;
      }

      await refreshUsers();
      setPendingRoleChanges((prev) => {
        const next = { ...prev };
        delete next[userCode];
        return next;
      });
      if (selectedUser?.code === userCode) {
        setSelectedUser(null);
      }
    } catch {
      setAlert("Unable to delete user.");
    } finally {
      setDeleteLoadingCodes((prev) => ({ ...prev, [userCode]: false }));
    }
  }, [refreshUsers, selectedUser?.code]);

  const togglePermission = useCallback(async (userCode: string, permission: Permission) => {
    const target = users.find((user) => user.code === userCode);
    if (!target) return;

    const currentOverride = target.overrides.find((override) => override.code === permission) ?? null;
    const hasEffective = target.effectivePermissions.includes(permission);

    let nextEffect: "allow" | "deny" | "unset";
    if (currentOverride) {
      nextEffect = "unset";
    } else {
      nextEffect = hasEffective ? "deny" : "allow";
    }

    if (permission === Permission.MANAGE_PERMISSIONS && hasEffective && nextEffect === "deny" && managePermissionCount <= 1) {
      setAlert("At least one officer must retain the Manage Permissions privilege.");
      return;
    }

    setAlert("");

    const response = await fetch(`/api/v1/rbac/users/${userCode}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionCode: permission, effect: nextEffect }),
    });

    if (!response.ok) {
      setAlert("Unable to persist user permission change.");
      return;
    }

    const latestUsers = await refreshUsers();

    // Keep the modal user data in sync after refresh
    setSelectedUser((prev) => {
      if (!prev || prev.code !== userCode) return prev;
      return latestUsers.find((u) => u.code === userCode) ?? prev;
    });
  }, [managePermissionCount, refreshUsers, users]);

  // Sync selectedUser when users list updates
  useEffect(() => {
    setSelectedUser((prev) => {
      if (!prev) return null;
      return users.find((u) => u.code === prev.code) ?? prev;
    });
  }, [users]);

  return (
    <AppShell title="Admin · Users">
      <div className="space-y-5 px-6 py-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">User Directory</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Manage users, roles, permission overrides, and access visibility.
              </p>
            </div>
            <button
              onClick={() => { setCreateUserAlert(""); setIsCreateUserOpen(true); }}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
            >
              Create User
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Active Users</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{filteredUsers.length}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">of {users.length} total</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Pending Role Saves</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{pendingRoleSaveCount}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Unsaved role changes in this view</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Can Manage Permissions</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{managePermissionCount}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Users with effective grant</p>
          </div>
        </div>

        {alert && !selectedUser && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.08)] px-4 py-3">
            <p className="text-sm text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Search & Filter</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--text-muted)]">
              Search users
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, phone/code, designation, department, scheme"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>
            <label className="flex min-w-[220px] flex-col gap-1 text-xs text-[var(--text-muted)]">
              Filter by role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilterValue)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              >
                <option value="ALL">All roles</option>
                {roleOptions.map((role) => (
                  <option key={`filter-role-${role}`} value={role}>
                    {formatRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => { setSearchTerm(""); setRoleFilter("ALL"); }}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-[var(--bg-surface)] text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Assigned Schemes</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const userCode = user.code ?? "";
                  const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
                  const selectedRole = pendingRoleChanges[userCode] ?? currentRole;
                  const roleChanged = selectedRole !== currentRole;
                  const isUpdatingRole = Boolean(roleUpdateLoadingCodes[userCode]);
                  const isDeleting = Boolean(deleteLoadingCodes[userCode]);
                  const shownSchemes = user.assignedSchemes?.slice(0, 2) ?? [];
                  const hiddenSchemeCount = Math.max((user.assignedSchemes?.length ?? 0) - shownSchemes.length, 0);
                  return (
                    <tr key={user.code ?? user.email} className="border-t border-[var(--border)] align-top transition-colors hover:bg-[var(--bg-hover)]">
                      <td className="px-4 py-4">
                        <p className="font-medium text-[var(--text-primary)]">{user.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{user.email}</p>
                        {user.code && (
                          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                            {user.code}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                        {user.designation?.trim() ? user.designation : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-[220px] flex-col gap-2">
                          <RoleBadge role={currentRole} />
                          <select
                            value={selectedRole}
                            onChange={(e) => handleRoleDraftChange(userCode, e.target.value as UserRole)}
                            disabled={!userCode || isUpdatingRole || isDeleting}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {roleOptions.map((role) => (
                              <option key={`row-role-${userCode}-${role}`} value={role}>
                                {formatRoleLabel(role)}
                              </option>
                            ))}
                          </select>
                          {roleChanged && (
                            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--alert-warning)]">
                              Unsaved change
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">{user.department || "—"}</td>
                      <td className="px-4 py-4">
                        {shownSchemes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {shownSchemes.map((schemeCode) => (
                              <span
                                key={`${userCode}-scheme-${schemeCode}`}
                                className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]"
                              >
                                {schemeCode}
                              </span>
                            ))}
                            {hiddenSchemeCount > 0 && (
                              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                                +{hiddenSchemeCount} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-[240px] flex-wrap items-center gap-2">
                          <button
                            onClick={() => { setAlert(""); setSelectedUser(user); }}
                            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
                            title="Manage permissions for this user"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M8.5 8.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              <path d="M6 4v4M4 6h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Permissions
                          </button>
                          <button
                            onClick={() => void handleRoleUpdate(user)}
                            disabled={!roleChanged || !userCode || isUpdatingRole || isDeleting}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Save selected role"
                          >
                            {isUpdatingRole ? "Saving..." : "Save Role"}
                          </button>
                          <button
                            onClick={() => void handleDeleteUser(user)}
                            disabled={!userCode || isDeleting || isUpdatingRole}
                            className="rounded-lg border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.08)] px-3 py-1.5 text-xs font-semibold text-[var(--alert-critical)] transition-colors hover:bg-[rgba(255,59,59,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Delete user account"
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr className="border-t border-[var(--border)]">
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      No users match the current search/filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedUser && (
        <PermissionsModal
          user={selectedUser}
          onToggle={togglePermission}
          onClose={() => { setSelectedUser(null); setAlert(""); }}
          alert={alert}
        />
      )}

      <CreateUserModal
        isOpen={isCreateUserOpen}
        form={createUserForm}
        roleOptions={roleOptions}
        phoneUsernamePreview={phoneUsernamePreview}
        isCreatingUser={isCreatingUser}
        alert={createUserAlert}
        onChange={handleCreateUserChange}
        onRoleChange={handleCreateUserRoleChange}
        onSubmit={handleCreateUser}
        onClose={() => { if (!isCreatingUser) setIsCreateUserOpen(false); }}
      />
    </AppShell>
  );
}
