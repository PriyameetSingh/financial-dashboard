"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";

export default function AdminOverviewPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS], "/dashboard");

  return (
    <AppShell title="Administration">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">System Controls</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Manage user access, schemes, and approval workflows.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/users"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Users</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">User Directory</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Assign roles and verify access scopes.</p>
          </Link>
          <Link
            href="/admin/permissions"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Permissions</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Grant & roles</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Add/remove people and assign permission templates.</p>
          </Link>
          <Link
            href="/schemes"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border-strong)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Schemes</p>
            <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">Scheme Registry</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Review scheme coverage and approval flags.</p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
