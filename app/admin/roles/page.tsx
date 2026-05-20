"use client";

import AppShell from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission, UserRole } from "@/lib/auth";
import { withNextBasePath } from "@/lib/next-base-path";

type RoleRow = {
  code: string;
  name: string;
  permissions: string[];
};

type PermissionRow = {
  code: string;
  name: string;
};

function formatRoleLabel(code: string): string {
  if (code === UserRole.VERTICAL_HEAD) return "Vertical Head";
  return code.replace(/_/g, " ");
}

export default function AdminRolesPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionRow[]>([]);
  const [alert, setAlert] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editingRoleCode, setEditingRoleCode] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleCodeInput, setEditingRoleCodeInput] = useState("");

  const refresh = useCallback(async () => {
    const [rolesRes, permsRes] = await Promise.all([
      fetch(withNextBasePath("/api/v1/rbac/roles")),
      fetch(withNextBasePath("/api/v1/rbac/permissions")),
    ]);
    if (!rolesRes.ok) throw new Error("Failed to load roles");
    if (!permsRes.ok) throw new Error("Failed to load permissions");
    const rolesData = (await rolesRes.json()) as { roles: RoleRow[] };
    const permsData = (await permsRes.json()) as { permissions: PermissionRow[] };
    setRoles(rolesData.roles);
    setPermissionCatalog(permsData.permissions);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refresh();
        if (active) setAlert("");
      } catch {
        if (active) setAlert("Unable to load roles from the database.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [refresh]);

  const rolePermissionSet = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of roles) {
      map.set(r.code, new Set(r.permissions));
    }
    return map;
  }, [roles]);

  const togglePermission = useCallback(
    async (roleCode: string, permissionCode: string, currentlyGranted: boolean) => {
      const key = `${roleCode}:${permissionCode}`;
      setSaving((prev) => ({ ...prev, [key]: true }));
      setAlert("");
      try {
        const response = await fetch(
          withNextBasePath(`/api/v1/rbac/roles/${encodeURIComponent(roleCode)}/permissions`),
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionCode, granted: !currentlyGranted }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { detail?: string } | null;
          setAlert(data?.detail ?? "Unable to update role permission.");
          return;
        }
        await refresh();
      } catch {
        setAlert("Unable to update role permission.");
      } finally {
        setSaving((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [refresh],
  );

  const handleSaveRole = useCallback(async (originalCode: string) => {
    setSaving((prev) => ({ ...prev, [originalCode]: true }));
    setAlert("");
    try {
      const response = await fetch(withNextBasePath(`/api/v1/rbac/roles/${encodeURIComponent(originalCode)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingRoleName, code: editingRoleCodeInput }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setAlert(data?.detail ?? "Unable to update role.");
        return;
      }
      await refresh();
      setEditingRoleCode(null);
    } catch {
      setAlert("Unable to update role.");
    } finally {
      setSaving((prev) => ({ ...prev, [originalCode]: false }));
    }
  }, [editingRoleName, editingRoleCodeInput, refresh]);

  return (
    <AppShell title="Admin · Roles">
      <div className="space-y-5 px-6 py-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Role permissions</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Defaults applied to everyone with each application role. Use the{" "}
            <a href="/admin/users" className="font-medium text-[var(--text-primary)] underline-offset-2 hover:underline">
              user directory
            </a>{" "}
            for per-officer overrides.
          </p>
        </div>

        {alert && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.08)] px-4 py-3">
            <p className="text-sm text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        <div className="space-y-4">
          {roles.map((role) => {
            const grantedSet = rolePermissionSet.get(role.code) ?? new Set<string>();
            return (
              <div
                key={role.code}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
              >
                <div className="mb-3 flex flex-col gap-1 border-b border-[var(--border)] pb-3 md:flex-row md:items-baseline md:justify-between">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{formatRoleLabel(role.code)}</h2>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{role.code}</p>
                </div>
                {editingRoleCode === role.code ? (
                  <div className="mb-3 space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Role Code</label>
                        <input
                          type="text"
                          disabled
                          value={editingRoleCodeInput}
                          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-muted)] cursor-not-allowed opacity-60 focus:outline-none"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Display Name</label>
                        <input
                          type="text"
                          autoFocus
                          value={editingRoleName}
                          onChange={(e) => setEditingRoleName(e.target.value)}
                          placeholder="Display Name"
                          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--text-primary)] focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveRole(role.code);
                            if (e.key === "Escape") setEditingRoleCode(null);
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving[role.code]}
                        onClick={() => void handleSaveRole(role.code)}
                        className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg-primary)] disabled:opacity-50"
                      >
                        {saving[role.code] ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        disabled={saving[role.code]}
                        onClick={() => setEditingRoleCode(null)}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--text-muted)]">{role.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoleCode(role.code);
                        setEditingRoleName(role.name);
                        setEditingRoleCodeInput(role.code);
                      }}
                      className="text-[10px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                    >
                      Edit details
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {permissionCatalog.map((permission) => {
                    const granted = grantedSet.has(permission.code);
                    const key = `${role.code}:${permission.code}`;
                    const busy = Boolean(saving[key]);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={busy}
                        onClick={() => void togglePermission(role.code, permission.code, granted)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap disabled:cursor-wait disabled:opacity-60 ${
                          granted
                            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                            : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                        }`}
                      >
                        {busy ? "…" : permission.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {roles.length === 0 && !alert && (
            <p className="text-sm text-[var(--text-muted)]">No roles returned from the server.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
