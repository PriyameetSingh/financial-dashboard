"use client";

import { useMemo, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import RoleBadge from "@/src/components/ui/RoleBadge";
import { fetchKPISubmissionsList } from "@/src/lib/services/kpiService";
import { fetchActionItems } from "@/src/lib/services/actionItemService";

export default function ProfilePage() {
  const user = useRequireAuth();
  const [kpiCount, setKpiCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [kpis, actions] = await Promise.all([fetchKPISubmissionsList(), fetchActionItems()]);
      if (!active) return;
      setKpiCount(kpis.length);
      setActionCount(actions.length);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Assigned Schemes</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{user.assignedSchemes.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">KPI Metrics</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{kpiCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Action Items</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{actionCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Assigned Schemes</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {user.assignedSchemes.map((scheme) => (
              <span
                key={scheme}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-muted)]"
              >
                {scheme}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
