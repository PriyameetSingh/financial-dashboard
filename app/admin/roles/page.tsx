"use client";

import AppShell from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission, UserRole } from "@/lib/auth";
import { withNextBasePath } from "@/lib/next-base-path";

const PERMISSION_LIST = Object.values(Permission);

type RoleRow = {
  code: string;
  name: string;
  permissions: Permission[];
};

function formatRoleLabel(code: string): string {
  if (code === UserRole.PROGRAMME_MANAGER) return "Programme Manager";
  return code.replace(/_/g, " ");
}

export default function AdminRolesPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [alert, setAlert] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const response = await fetch(withNextBasePath("/api/v1/rbac/roles"));
    if (!response.ok) throw new Error("Failed to load roles");
    const data = (await response.json()) as { roles: RoleRow[] };
    setRoles(data.roles);
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
    const map = new Map<string, Set<Permission>>();
    for (const r of roles) {
      map.set(r.code, new Set(r.permissions));
    }
    return map;
  }, [roles]);

  const togglePermission = useCallback(
    async (roleCode: string, permission: Permission, currentlyGranted: boolean) => {
      const key = `${roleCode}:${permission}`;
      setSaving((prev) => ({ ...prev, [key]: true }));
      setAlert("");
      try {
        const response = await fetch(
          withNextBasePath(`/api/v1/rbac/roles/${encodeURIComponent(roleCode)}/permissions`),
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionCode: permission, granted: !currentlyGranted }),
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
            const grantedSet = rolePermissionSet.get(role.code) ?? new Set<Permission>();
            return (
              <div
                key={role.code}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
              >
                <div className="mb-3 flex flex-col gap-1 border-b border-[var(--border)] pb-3 md:flex-row md:items-baseline md:justify-between">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{formatRoleLabel(role.code)}</h2>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{role.code}</p>
                </div>
                <p className="mb-3 text-xs text-[var(--text-muted)]">{role.name}</p>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_LIST.map((permission) => {
                    const granted = grantedSet.has(permission);
                    const key = `${role.code}:${permission}`;
                    const busy = Boolean(saving[key]);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={busy}
                        onClick={() => void togglePermission(role.code, permission, granted)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap disabled:cursor-wait disabled:opacity-60 ${
                          granted
                            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                            : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                        }`}
                      >
                        {busy ? "…" : permission.replace(/_/g, " ")}
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
