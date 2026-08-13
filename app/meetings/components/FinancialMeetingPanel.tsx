"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchFinanceSummary, fetchIfmsTimeseries } from "@/src/lib/services/financialService";
import type { FinanceSummaryRow } from "@/types";
import { tenantConfig } from "@/lib/tenant-config";

function shortLabel(label: string, max = 18) {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

export default function FinancialMeetingPanel({ financialYearLabel }: { financialYearLabel: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fy, setFy] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceSummaryRow[]>([]);
  const [totals, setTotals] = useState<{
    budgetEstimateCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
  } | null>(null);
  const [series, setSeries] = useState<{ asOfDate: string; ifmsCr: number }[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchFinanceSummary({ financialYearLabel }),
      fetchIfmsTimeseries({ financialYearLabel }),
    ])
      .then(([sum, ts]) => {
        if (!alive) return;
        setFy(sum.financialYearLabel);
        setAsOf(sum.asOfDate);
        setRows(sum.rows ?? []);
        setTotals(sum.totals);
        setSeries(ts.points ?? []);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load financial summary");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [financialYearLabel]);

  const barData = useMemo(
    () =>
      rows.map((r) => ({
        name: shortLabel(r.label),
        fullLabel: r.label,
        budget: r.budgetEstimateCr,
        ifms: r.ifmsExpenditureCr,
        so: r.soExpenditureCr,
      })),
    [rows],
  );

  const lineData = useMemo(
    () => series.map((p) => ({ ...p, label: p.asOfDate.slice(5) })),
    [series],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
        <Loader2 className="animate-spin" size={18} />
        Loading financial summary…
      </div>
    );
  }

  if (err || !totals) {
    return <p className="text-sm text-[var(--alert-critical)]">{err ?? "No data"}</p>;
  }

  const pct =
    totals.budgetEstimateCr > 0
      ? ((totals.ifmsExpenditureCr / totals.budgetEstimateCr) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text-muted)]">
        FY {fy ?? financialYearLabel}
        {asOf ? ` · snapshot ${asOf}` : " · FY budget & expenditure (latest rolled up)"}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Budget (est.)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            ₹{totals.budgetEstimateCr.toFixed(1)} Cr
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">SO expenditure</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            ₹{totals.soExpenditureCr.toFixed(1)} Cr
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">IFMS expenditure</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--accent)]">
            ₹{totals.ifmsExpenditureCr.toFixed(1)} Cr
          </p>
        </div>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        IFMS utilization vs budget estimate: <strong className="text-[var(--text-primary)]">{pct}%</strong>
      </p>

      {barData.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
            By budget category — IFMS (₹ Cr)
          </p>
          <div className="h-[220px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2">
            <ResponsiveContainer width="100%" height={204}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 4, bottom: 36 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)] opacity-50" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={56}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={44} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    const { labels } = tenantConfig();
                    const label =
                      name === "ifms" ? labels.ifmsExpenditure : name === "budget" ? "Budget" : name === "so" ? labels.soExpenditure : String(name);
                    return [`₹${Number.isFinite(n) ? n.toFixed(2) : "0.00"} Cr`, label];
                  }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullLabel ? String(payload[0].payload.fullLabel) : ""
                  }
                />
                <Bar dataKey="ifms" name="ifms" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {lineData.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
            IFMS trend by snapshot date (₹ Cr)
          </p>
          <div className="h-[200px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2">
            <ResponsiveContainer width="100%" height={184}>
              <LineChart data={lineData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)] opacity-50" />
                <XAxis dataKey="asOfDate" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={44} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => {
                    const n = typeof value === "number" ? value : Number(value);
                    return [`₹${Number.isFinite(n) ? n.toFixed(2) : "0.00"} Cr`, tenantConfig().labels.ifmsExpenditure];
                  }}
                />
                <Line type="monotone" dataKey="ifmsCr" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)] text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium tabular-nums">Budget</th>
                <th className="px-3 py-2 font-medium tabular-nums">SO</th>
                <th className="px-3 py-2 font-medium tabular-nums">IFMS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.headCode} className="border-b border-[var(--border)]/80 last:border-0">
                  <td className="px-3 py-2 text-[var(--text-primary)]">{r.label}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">₹{r.budgetEstimateCr.toFixed(1)}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">₹{r.soExpenditureCr.toFixed(1)}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--accent)]">₹{r.ifmsExpenditureCr.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
