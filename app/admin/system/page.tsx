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

        
      </div>
    </AppShell>
  );
}
