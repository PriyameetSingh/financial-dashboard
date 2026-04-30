"use client";

import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import PendingBadge from "@/src/components/ui/PendingBadge";

interface ReportCard {
  id: string;
  title: string;
  description: string;
  lastUpdated: string;
  status: string;
}

const reports: ReportCard[] = [
  {
    id: "rep-01",
    title: "Monthly Scheme Performance",
    description: "Aggregated KPI vs budget health across all HUDD schemes.",
    lastUpdated: "20 Mar 2026",
    status: "Ready",
  },
  {
    id: "rep-02",
    title: "ULB Risk Watch",
    description: "Flagged ULBs requiring escalation and intervention.",
    lastUpdated: "19 Mar 2026",
    status: "Draft",
  },
  {
    id: "rep-03",
    title: "Finance Lapse Forecast",
    description: "Projected lapses with recommended mitigation actions.",
    lastUpdated: "18 Mar 2026",
    status: "Ready",
  },
];

export default function ReportsPage() {
  useRequireRole([UserRole.PROGRAMME_MANAGER, UserRole.ACS], "/dashboard");

  return (
    <AppShell title="Reports & Export">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Insights</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Reports & Export</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Curated briefings and exportable packs for executive review.
            </p>
          </div>
          <button className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]">
            Generate New Pack
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Pending Exports</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">3</p>
            <PendingBadge count={2} label="Ready" className="mt-3" />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Executive Packs</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">7</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Last Export</p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">19 Mar 2026 · 14:30 IST</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{report.status}</p>
                <p className="text-xs text-[var(--text-muted)]">Updated {report.lastUpdated}</p>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{report.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{report.description}</p>
              <div className="mt-4 flex gap-2">
                <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">Preview</button>
                <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">Download</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
