"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchKPISubmissions } from "@/src/lib/services/kpiService";
import type { KPISubmission } from "@/types";

const PIE_COLORS = ["var(--ax-status-ok)", "var(--ax-status-warning)", "var(--ax-status-warning)", "var(--ax-muted)", "var(--ax-muted)"];

const PROGRESS_LABELS: Record<string, string> = {
  on_track: "On track",
  delayed: "Delayed",
  overdue: "Overdue",
  none: "No measurement",
};

export default function KpiMeetingPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fy, setFy] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);

  useEffect(() => {
    let alive = true;
    fetchKPISubmissions()
      .then((data) => {
        if (!alive) return;
        setFy(data.financialYearLabel);
        setSubmissions(data.submissions ?? []);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load KPI data");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of submissions) {
      c[s.status] = (c[s.status] ?? 0) + 1;
    }
    return c;
  }, [submissions]);

  const pieData = useMemo(() => {
    const rows = [
      { key: "approved", name: "Approved", value: statusCounts.approved ?? 0 },
      {
        key: "pending",
        name: "Pending review",
        value: (statusCounts.submitted_pending ?? 0) + (statusCounts.submitted ?? 0),
      },
      { key: "draft", name: "Draft", value: statusCounts.draft ?? 0 },
      { key: "not_submitted", name: "Not submitted", value: statusCounts.not_submitted ?? 0 },
    ].filter((r) => r.value > 0);
    return rows;
  }, [statusCounts]);

  const progressData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of submissions) {
      const k = s.measurementProgressStatus ?? "none";
      m[k] = (m[k] ?? 0) + 1;
    }
    return (["on_track", "delayed", "overdue", "none"] as const)
      .filter((k) => (m[k] ?? 0) > 0)
      .map((k) => ({
        name: PROGRESS_LABELS[k] ?? k,
        count: m[k] ?? 0,
      }));
  }, [submissions]);

  const verticalData = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of submissions) {
      const v = s.vertical || "—";
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name: name.length > 24 ? `${name.slice(0, 23)}…` : name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [submissions]);

  const total = submissions.length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--ax-muted)]">
        <Loader2 className="animate-spin" size={18} />
        Loading KPI submissions…
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-[var(--ax-status-critical)]">{err}</p>;
  }

  const approved = statusCounts.approved ?? 0;
  const pending = (statusCounts.submitted_pending ?? 0) + (statusCounts.submitted ?? 0);
  const draft = statusCounts.draft ?? 0;
  const notSubmitted = statusCounts.not_submitted ?? 0;

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--ax-muted)]">
        FY {fy ?? "—"} · {total} KPI row{total !== 1 ? "s" : ""} (latest measurement per definition)
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Approved", value: approved, tone: "text-[var(--ax-status-ok)]" },
          { label: "Pending review / submitted", value: pending, tone: "ax-tone-warning" },
          { label: "Draft", value: draft, tone: "text-[var(--ax-muted)]" },
          { label: "Not submitted", value: notSubmitted, tone: "text-[var(--ax-muted)]" },
        ].map((row) => (
          <div key={row.label} className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ax-muted)]">{row.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {pieData.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ax-muted)]">
              Workflow status mix
            </p>
            <div className="h-[220px] rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-2">
              <ResponsiveContainer width="100%" height={204}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={pieData[i].key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-divider)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {progressData.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ax-muted)]">
              Delivery progress (latest measurement)
            </p>
            <div className="h-[220px] rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-2">
              <ResponsiveContainer width="100%" height={204}>
                <BarChart data={progressData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--color-divider)] opacity-50" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ax-muted)" }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 10, fill: "var(--ax-muted)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-divider)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {verticalData.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ax-muted)]">
            KPI rows by vertical (top 10)
          </p>
          <div className="h-[240px] rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-2">
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={verticalData} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--color-divider)] opacity-50" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "var(--ax-muted)" }}
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={64}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--ax-muted)" }} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-divider)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {submissions.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ax-muted)]">
            Sample KPIs (first 8)
          </p>
          <ul className="space-y-2 rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-3 text-sm">
            {submissions.slice(0, 8).map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 border-b border-[var(--color-divider)]/60 pb-2 last:border-0 last:pb-0">
                <span className="font-medium text-[var(--color-text)]">{s.description}</span>
                <span className="text-xs text-[var(--ax-muted)]">
                  {s.scheme} · {s.vertical} ·{" "}
                  <span
                    className={
                      s.status === "approved"
                        ? "text-[var(--ax-status-ok)]"
                        : s.status === "not_submitted"
                          ? "text-[var(--ax-muted)]"
                          : "ax-tone-warning"
                    }
                  >
                    {s.status.replace(/_/g, " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
