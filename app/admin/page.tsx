"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Permission, hasPermission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";

export default function AdminOverviewPage() {
  useRequireAnyPermission(
    [Permission.MANAGE_PERMISSIONS, Permission.MANAGE_FINANCIAL_YEARS],
    "/dashboard",
  );

  const user = useHydratedCurrentUser();
  const showUsers = user && hasPermission(user, Permission.MANAGE_PERMISSIONS);
  const showPermissions = user && hasPermission(user, Permission.MANAGE_PERMISSIONS);
  const showSchemes = user && hasPermission(user, Permission.MANAGE_SCHEMES);
  const showFinancialYears = user && hasPermission(user, Permission.MANAGE_FINANCIAL_YEARS);
  const showSystemSettings = showPermissions || showFinancialYears;

  return (
    <AppShell title="Administration">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">System Controls</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Manage user access, schemes, and approval workflows.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {showUsers && (
            <Link
              href="/admin/users"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Users</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">User Directory</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Assign roles and verify access scopes.</p>
            </Link>
          )}
          {showPermissions && (
            <Link
              href="/admin/roles"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Roles</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Role-wide permissions</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Edit default permission bundles for each application role (ACS, TASU, Nodal, etc.).
              </p>
            </Link>
          )}
          {showSchemes && (
            <Link
              href="/schemes"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Schemes</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Scheme Registry</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Review scheme coverage and approval flags.</p>
            </Link>
          )}
          {showFinancialYears && (
            <Link
              href="/admin/financial-years"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Financial years</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">FY calendar</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Add or edit financial year rows used across finance and KPIs.</p>
            </Link>
          )}
          {showSystemSettings && (
            <Link
              href="/admin/system"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">System</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">System Settings</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Configure role permissions and financial-year controls.</p>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
