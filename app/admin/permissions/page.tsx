"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { MockUser, Permission, UserRole, MOCK_USERS } from "@/lib/auth";
import RoleBadge from "@/src/components/ui/RoleBadge";
import PendingBadge from "@/src/components/ui/PendingBadge";

const PERMISSION_LIST = Object.values(Permission);

export default function AdminPermissionsPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  const [users, setUsers] = useState<MockUser[]>(() => MOCK_USERS.map((user) => ({ ...user, permissions: [] as Permission[] })));
  const [rolePermissionsByCode, setRolePermissionsByCode] = useState<Record<string, Permission[]>>({});

  const [form, setForm] = useState({ name: "", role: UserRole.TASU, email: "", department: "", assignedSchemes: "" });
  const [alert, setAlert] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/v1/rbac/roles");
        if (!response.ok) return;
        const data = (await response.json()) as { roles: Array<{ code: string; permissions: Permission[] }> };
        if (!active) return;
        const map: Record<string, Permission[]> = {};
        for (const r of data.roles) {
          map[r.code] = r.permissions;
        }
        setRolePermissionsByCode(map);
        setUsers((prev) =>
          prev.map((u) => ({
            ...u,
            permissions: map[u.role] ?? u.permissions ?? [],
          })),
        );
      } catch {
        /* keep empty until MANAGE_PERMISSIONS session can load roles */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const managePermissionCount = useMemo(
    () => users.filter((user) => user.permissions?.includes(Permission.MANAGE_PERMISSIONS)).length,
    [users]
  );

  const togglePermission = (userId: string, permission: Permission) => {
    setUsers((prev) => {
      const target = prev.find((user) => user.id === userId);
      if (!target) return prev;
      const hasPermission = target.permissions?.includes(permission) ?? false;
      if (permission === Permission.MANAGE_PERMISSIONS && hasPermission && managePermissionCount <= 1) {
        setAlert("At least one person must keep the Manage Permissions grant.");
        return prev;
      }

      setAlert("");
      return prev.map((user) => {
        if (user.id !== userId) return user;
        const nextPermissions = hasPermission
          ? (user.permissions ?? []).filter((perm) => perm !== permission)
          : [...(user.permissions ?? []), permission];
        return { ...user, permissions: nextPermissions };
      });
    });
  };

  const addUser = () => {
    if (!form.name || !form.email) {
      setAlert("Name and email are required to add someone.");
      return;
    }
    setUsers((prev) => [
      ...prev,
      {
        id: `${form.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        name: form.name,
        email: form.email,
        role: form.role,
        department: form.department || "New unit",
        assignedSchemes: form.assignedSchemes ? form.assignedSchemes.split(",").map((s) => s.trim()) : ["All schemes"],
        permissions: [...(rolePermissionsByCode[form.role] ?? [])],
      },
    ]);
    setForm({ name: "", role: UserRole.TASU, email: "", department: "", assignedSchemes: "" });
    setAlert("");
  };

  const removeUser = (id: string) => {
    setUsers((prev) => prev.filter((user) => user.id !== id));
  };

  return (
    <AppShell title="Permission Management">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Permissions</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Assign privileges & people</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Add or remove officers and assign which permissions they can activate. Data is currently local; swap to backend when ready.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/admin/users"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Back to</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">User Directory</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">View metadata, audit logs, and permission chips.</p>
          </Link>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Units</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{users.length}</p>
            <p className="text-sm text-[var(--text-muted)]">Editable roster for ERP ingestion.</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Manage permissions</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{managePermissionCount}</p>
            <p className="text-sm text-[var(--text-muted)]">People who can grant permissions.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Add a person</h2>
            <p className="text-sm text-[var(--text-muted)]">Enter basic details; permission template follows their role.</p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {Object.values(UserRole).map((role) => (
                    <option key={role} value={role}>
                      {role.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Department</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Assigned schemes</label>
                <input
                  value={form.assignedSchemes}
                  onChange={(e) => setForm((f) => ({ ...f, assignedSchemes: e.target.value }))}
                  placeholder="comma separated"
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <button
                onClick={addUser}
                className="w-full rounded-xl bg-[var(--text-primary)] py-2 text-sm font-semibold text-[var(--bg-primary)]"
              >
                Add person
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Role permissions (from database)</h2>
            <p className="text-sm text-[var(--text-muted)]">Effective grants per role code as stored in RBAC tables.</p>
            <div className="mt-4 grid gap-3 text-xs text-[var(--text-muted)]">
              {(
                Object.keys(rolePermissionsByCode).length > 0
                  ? (Object.entries(rolePermissionsByCode) as [string, Permission[]][])
                  : (Object.values(UserRole).map((r) => [r, [] as Permission[]] as [UserRole, Permission[]]))
              ).map(([role, perms]) => (
                <div key={role} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center justify-between text-[var(--text-primary)]">
                    <span>{String(role).replace(/_/g, " ")}</span>
                    <span className="text-[10px] uppercase tracking-[0.3em]">DB</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PERMISSION_LIST.map((permission) => (
                      <span
                        key={`${role}-${permission}`}
                        className={`text-[10px] rounded-full border px-2 py-1 ${
                          perms.includes(permission)
                            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                            : "border-[var(--border)] bg-transparent"
                        }`}
                      >
                        {permission.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">People with permissions</h2>
            <PendingBadge count={users.filter((user) => user.permissions?.includes(Permission.MANAGE_PERMISSIONS)).length} />
          </div>
          {alert && <p className="mt-3 text-sm text-[var(--alert-danger)]">{alert}</p>}
          <div className="mt-4 space-y-4 text-sm">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{user.name}</p>
                    <p className="text-[var(--text-muted)] text-xs uppercase tracking-[0.3em]">{user.department}</p>
                  </div>
                  <RoleBadge role={user.role} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_LIST.map((permission) => {
                    const granted = user.permissions?.includes(permission) ?? false;
                    return (
                      <button
                        key={`${user.id}-${permission}`}
                        onClick={() => togglePermission(user.id, permission)}
                        className={`text-[10px] rounded-full border px-2 py-1 transition-colors whitespace-nowrap ${
                          granted
                            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                            : "border-[var(--border)] bg-transparent text-[var(--text-muted)]"
                        }`}
                        title={granted ? "Revoke" : "Grant"}
                      >
                        {permission.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Assigned schemes: {user.assignedSchemes.join(", ")}</span>
                  <button
                    onClick={() => removeUser(user.id)}
                    className="text-[var(--alert-critical)] font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
