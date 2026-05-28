"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";

export default function AdminSystemSettingsPage() {
  useRequireAnyPermission(
    [Permission.MANAGE_PERMISSIONS, Permission.MANAGE_FINANCIAL_YEARS],
    "/dashboard",
  );

  return (
    <AppShell title="System Settings">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">System Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Configure application-level access and fiscal controls.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/roles"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Roles</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Role Permissions</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Manage default permission bundles by role.</p>
          </Link>

          <Link
            href="/admin/financial-years"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Financial years</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">FY Calendar</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Maintain financial year rows used by reporting flows.</p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
