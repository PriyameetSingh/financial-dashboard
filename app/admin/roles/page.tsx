"use client";

import AppShell from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission, UserRole } from "@/lib/auth";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantTimezone, tenantLocale } from "@/lib/tenant-config/format";
import {
  BarChart3,
  Eye,
  FolderTree,
  ListChecks,
  PencilLine,
  Settings,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { PERMISSION_GROUPS } from "@/src/lib/permission-groups";
import CustomSelect from "@/src/components/ui/CustomSelect";
import ToggleSwitch from "@/src/components/ui/ToggleSwitch";

type RoleRow = { code: string; name: string; permissions: string[] };
type PermissionRow = { code: string; name: string };
type AuditEntry = {
  id: string;
  occurredAt: string;
  actorName: string | null;
  actorEmail: string | null;
  roleCode: string | null;
  permissionCode: string;
  granted: boolean;
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  Eye,
  PencilLine,
  ListChecks,
  ShieldCheck,
  Upload,
  BarChart3,
  FolderTree,
  Settings,
};

function formatRoleLabel(code: string): string {
  if (code === UserRole.VERTICAL_HEAD) return "Vertical Head";
  return code.replace(/_/g, " ");
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(tenantLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tenantTimezone(),
    });
  } catch {
    return iso;
  }
}

export default function AdminRolesPage() {
  const user = useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionRow[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [alert, setAlert] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editingRoleCode, setEditingRoleCode] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleCodeInput, setEditingRoleCodeInput] = useState("");
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null);
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);

  const AUDIT_PAGE_SIZE = 10;

  const refreshAudit = useCallback(async (page: number) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(AUDIT_PAGE_SIZE),
      });
      const auditRes = await fetch(withNextBasePath(`/api/v1/rbac/audit?${params.toString()}`));
      if (!auditRes.ok) return;
      const data = (await auditRes.json()) as {
        entries: AuditEntry[];
        page: number;
        totalPages: number;
        total: number;
      };
      setAuditEntries(data.entries);
      setAuditPage(data.page);
      setAuditTotalPages(data.totalPages);
      setAuditTotal(data.total);
    } finally {
      setAuditLoading(false);
    }
  }, []);

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
    if (!user) return;
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
  }, [user, refresh]);

  // Load / reload audit entries whenever the page changes (also fires on mount).
  useEffect(() => {
    if (!user) return;
    void refreshAudit(auditPage);
  }, [auditPage, user, refreshAudit]);

  useEffect(() => {
    if (selectedRoleCode === null && roles.length > 0) {
      setSelectedRoleCode(roles[0].code);
    }
    if (selectedRoleCode && !roles.some((r) => r.code === selectedRoleCode)) {
      setSelectedRoleCode(roles[0]?.code ?? null);
    }
  }, [roles, selectedRoleCode]);

  const rolePermissionSet = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of roles) map.set(r.code, new Set(r.permissions));
    return map;
  }, [roles]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.code === selectedRoleCode) ?? null,
    [roles, selectedRoleCode],
  );

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
          },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { detail?: string } | null;
          setAlert(data?.detail ?? "Unable to update role permission.");
          return;
        }
        await Promise.all([refresh(), refreshAudit(auditPage)]);
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
    [refresh, refreshAudit, auditPage],
  );

  const handleSaveRole = useCallback(async (originalCode: string) => {
    setSaving((prev) => ({ ...prev, [originalCode]: true }));
    setAlert("");
    try {
      const response = await fetch(
        withNextBasePath(`/api/v1/rbac/roles/${encodeURIComponent(originalCode)}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editingRoleName, code: editingRoleCodeInput }),
        },
      );
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

  const roleSelectOptions = useMemo(
    () => roles.map((r) => ({ value: r.code, label: formatRoleLabel(r.code) })),
    [roles],
  );

  if (!user) return null;

  return (
    <AppShell title="Admin · Roles">
      <div className="space-y-5 px-4 py-5 md:px-6 md:py-6">
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
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[color-mix(in_srgb,_var(--ax-status-critical)_8%,_transparent)] px-4 py-3">
            <p className="text-sm text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        {roles.length === 0 && !alert && (
          <p className="text-sm text-[var(--text-muted)]">No roles returned from the server.</p>
        )}
        {roles.length > 0 && selectedRole && (
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <aside className="w-full md:w-64 shrink-0">
              {/* Mobile: dropdown + back-to-list control */}
              <div className="md:hidden">
                {!showDetailOnMobile ? (
                  <div className="space-y-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">Available Roles</p>
                    <CustomSelect
                      value={selectedRoleCode ?? ""}
                      onChange={(v) => {
                        setSelectedRoleCode(v);
                        setShowDetailOnMobile(true);
                      }}
                      options={roleSelectOptions}
                    />
                    <ul className="mt-2 space-y-1">
                      {roles.map((role) => {
                        const isActive = role.code === selectedRoleCode;
                        return (
                          <li key={role.code}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRoleCode(role.code);
                                setShowDetailOnMobile(true);
                              }}
                              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                isActive
                                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                                  : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                              }`}
                            >
                              {formatRoleLabel(role.code)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDetailOnMobile(false)}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                  >
                    ← Back to list
                  </button>
                )}
              </div>

              {/* Desktop: persistent sidebar */}
              <div className="hidden md:block">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">Available Roles</p>
                <ul className="space-y-1">
                  {roles.map((role) => {
                    const isActive = role.code === selectedRoleCode;
                    return (
                      <li key={role.code}>
                        <button
                          type="button"
                          onClick={() => setSelectedRoleCode(role.code)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                              : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          {formatRoleLabel(role.code)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>

            {/* Main panel */}
            <div className={`min-w-0 flex-1 ${showDetailOnMobile ? "block" : "hidden"} md:block`}>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <div className="mb-4 flex flex-col gap-1 border-b border-[var(--border)] pb-3 md:flex-row md:items-baseline md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{formatRoleLabel(selectedRole.code)}</h2>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{selectedRole.code}</p>
                  </div>
                </div>

                {editingRoleCode === selectedRole.code ? (
                  <div className="mb-4 space-y-3">
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
                            if (e.key === "Enter") void handleSaveRole(selectedRole.code);
                            if (e.key === "Escape") setEditingRoleCode(null);
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={Boolean(saving[selectedRole.code])}
                        onClick={() => void handleSaveRole(selectedRole.code)}
                        className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg-primary)] disabled:opacity-50"
                      >
                        {saving[selectedRole.code] ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(saving[selectedRole.code])}
                        onClick={() => setEditingRoleCode(null)}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[var(--text-muted)]">{selectedRole.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoleCode(selectedRole.code);
                        setEditingRoleName(selectedRole.name);
                        setEditingRoleCodeInput(selectedRole.code);
                      }}
                      className="text-[10px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                    >
                      Edit details
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  {PERMISSION_GROUPS.map((group) => {
                    const Icon = GROUP_ICONS[group.icon] ?? Settings;
                    const groupPermissions = group.permissions.filter((p) =>
                      permissionCatalog.some((c) => c.code === p),
                    );
                    if (groupPermissions.length === 0) return null;
                    return (
                      <div key={group.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                        <div className="mb-3 flex items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">{group.description}</p>
                          </div>
                        </div>
                        <ul className="divide-y divide-[var(--border)]">
                          {groupPermissions.map((permCode) => {
                            const perm = permissionCatalog.find((c) => c.code === permCode);
                            const granted = (rolePermissionSet.get(selectedRole.code) ?? new Set<string>()).has(permCode);
                            const key = `${selectedRole.code}:${permCode}`;
                            const busy = Boolean(saving[key]);
                            return (
                              <li key={key} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-[var(--text-primary)]">{perm?.name ?? permCode.replace(/_/g, " ")}</p>
                                  <p className="truncate text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{permCode}</p>
                                </div>
                                <ToggleSwitch
                                  checked={granted}
                                  disabled={busy}
                                  onChange={() => void togglePermission(selectedRole.code, permCode, granted)}
                                  label={`Toggle ${perm?.name ?? permCode} for ${selectedRole.code}`}
                                  hint={busy ? "…" : granted ? "On" : "Off"}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Role Update History</h2>
            <p className="text-xs text-[var(--text-muted)]">
              {auditTotal === 0
                ? "Recent permission changes across all roles"
                : `Showing ${auditEntries.length} of ${auditTotal} ${auditTotal === 1 ? "entry" : "entries"}`}
            </p>
          </div>

          {auditEntries.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No permission changes recorded yet.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-2 pr-4 font-medium">Timestamp</th>
                      <th className="py-2 pr-4 font-medium">Modified Role</th>
                      <th className="py-2 pr-4 font-medium">Action Taken</th>
                      <th className="py-2 pr-4 font-medium">Operator</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry) => {
                      const perm = permissionCatalog.find((c) => c.code === entry.permissionCode);
                      return (
                        <tr key={entry.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="py-2.5 pr-4 align-top text-[var(--text-primary)]">{formatTimestamp(entry.occurredAt)}</td>
                          <td className="py-2.5 pr-4 align-top text-[var(--text-primary)]">{entry.roleCode ?? "—"}</td>
                          <td className="py-2.5 pr-4 align-top text-[var(--text-primary)]">
                            {entry.granted ? "Granted" : "Revoked"} {perm?.name ?? entry.permissionCode.replace(/_/g, " ")}
                          </td>
                          <td className="py-2.5 pr-4 align-top text-[var(--text-primary)]">
                            {entry.actorName ?? entry.actorEmail ?? "System"}
                          </td>
                          <td className="py-2.5 align-top">
                            <span className="ax-chip ax-chip-ok px-2 py-0.5 text-[10px] font-medium">
                              Verified
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <ul className="space-y-3 md:hidden">
                {auditEntries.map((entry) => {
                  const perm = permissionCatalog.find((c) => c.code === entry.permissionCode);
                  return (
                    <li key={entry.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="ax-chip ax-chip-ok px-2 py-0.5 text-[10px] font-medium">
                          Verified
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{formatTimestamp(entry.occurredAt)}</span>
                      </div>
                      <dl className="space-y-1 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-[var(--text-muted)]">Modified Role</dt>
                          <dd className="text-[var(--text-primary)]">{entry.roleCode ?? "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-[var(--text-muted)]">Action Taken</dt>
                          <dd className="text-[var(--text-primary)]">
                            {entry.granted ? "Granted" : "Revoked"} {perm?.name ?? entry.permissionCode.replace(/_/g, " ")}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-[var(--text-muted)]">Operator</dt>
                          <dd className="text-[var(--text-primary)]">{entry.actorName ?? entry.actorEmail ?? "System"}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {auditTotalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-muted)]">
                Page {auditPage} of {auditTotalPages}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={auditPage <= 1 || auditLoading}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={auditPage >= auditTotalPages || auditLoading}
                  onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
