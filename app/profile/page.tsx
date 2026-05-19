"use client";

import { useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import RoleBadge from "@/src/components/ui/RoleBadge";

export default function ProfilePage() {
  const user = useRequireAuth();

  const initials = useMemo(() => {
    if (!user) return "HN";
    return user.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
  }, [user]);

  if (!user) {
    return null;
  }

  return (
    <AppShell title="My Profile">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-xl font-semibold text-[var(--text-primary)]">
            {initials}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">HUDD Officer</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{user.name}</h1>
            <p className="text-sm text-[var(--text-muted)]">{user.department}</p>
            {user.designation?.trim() ? (
              <p className="mt-1 text-sm text-[var(--text-primary)]">{user.designation}</p>
            ) : null}
          </div>
          <RoleBadge role={user.role} size="md" />
        </div>
      </div>
    </AppShell>
  );
}
