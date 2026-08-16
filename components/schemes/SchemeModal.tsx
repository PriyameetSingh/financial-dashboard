"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchSchemeModalData, type SchemeModalPayload } from "@/src/lib/services/schemeService";
import type { SchemeOverview } from "@/types";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantConfig } from "@/lib/tenant-config";

type Props = {
  open: boolean;
  onClose: () => void;
  scheme: Pick<SchemeOverview, "id" | "code" | "name" | "verticalName"> | null;
};

function formatCurrency(value: number) {
  const { currencySymbol, currencyUnit } = tenantConfig();
  return `${currencySymbol}${value.toFixed(1)} ${currencyUnit}`;
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const PROGRESS_LABEL: Record<string, string> = {
  on_track: "On track",
  delayed: "Delayed",
  overdue: "Overdue",
};

function latestAchievementAsOf(
  series: SchemeModalPayload["kpi"]["rows"][number]["measurementSeries"],
  asOfDay: string,
): number | null {
  let last: (typeof series)[number] | null = null;
  for (const m of series) {
    if (m.measuredAt <= asOfDay) last = m;
    else break;
  }
  return last?.achievementPct ?? null;
}

function averageAchievement(rows: SchemeModalPayload["kpi"]["rows"], asOfDay: string): number | null {
  const pcts: number[] = [];
  for (const r of rows) {
    const v = latestAchievementAsOf(r.measurementSeries, asOfDay);
    if (v !== null && v !== undefined) pcts.push(v);
  }
  if (pcts.length === 0) return null;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function startOfIsoWeek(isoDay: string): string {
  const [y, mo, d] = isoDay.split("-").map(Number);
  const t = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const day = new Date(t).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const d2 = new Date(t - mondayOffset * 864e5);
  return d2.toISOString().slice(0, 10);
}

function lastIsoDayOfCalendarMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0);
  const yy = last.getFullYear();
  const mm = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function uniqueSortedMonthKeysFromKpiRows(rows: SchemeModalPayload["kpi"]["rows"]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const m of r.measurementSeries) {
      set.add(m.measuredAt.slice(0, 7));
    }
  }
  return [...set].sort();
}

type IfmsPoint = { asOfDate: string; ifmsCr: number; utilisationPct: number | null };

function latestIfmsOnOrBefore(sortedAsc: IfmsPoint[], day: string): IfmsPoint | null {
  let last: IfmsPoint | null = null;
  for (const p of sortedAsc) {
    if (p.asOfDate <= day) last = p;
    else break;
  }
  return last;
}

function bucketIfmsByWeek(series: IfmsPoint[]): IfmsPoint[] {
  if (series.length === 0) return [];
  const byWeek = new Map<string, IfmsPoint>();
  for (const p of series) {
    const wk = startOfIsoWeek(p.asOfDate);
    const prev = byWeek.get(wk);
    if (!prev || p.asOfDate > prev.asOfDate) byWeek.set(wk, p);
  }
  return [...byWeek.values()].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

function bucketIfmsByMonth(series: IfmsPoint[]): IfmsPoint[] {
  if (series.length === 0) return [];
  const byMonth = new Map<string, IfmsPoint>();
  for (const p of series) {
    const mk = p.asOfDate.slice(0, 7);
    const prev = byMonth.get(mk);
    if (!prev || p.asOfDate > prev.asOfDate) byMonth.set(mk, p);
  }
  return [...byMonth.values()].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

type ChartGranularity = "week" | "month" | "meeting";

export default function SchemeModal({ open, onClose, scheme }: Props) {
  const [data, setData] = useState<SchemeModalPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpiScope, setKpiScope] = useState<string>("__consolidated__");
  const [meetings, setMeetings] = useState<{ id: string; meetingDate: string; title: string | null }[]>([]);
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("week");

  const load = useCallback(async () => {
    if (!scheme) return;
    setLoading(true);
    setError(null);
    try {
      const [modal, mRes] = await Promise.all([
        fetchSchemeModalData(scheme.id),
        fetch(withNextBasePath("/api/v1/meetings"), { cache: "no-store" }).then((r) => r.json()),
      ]);
      setData(modal);
      if (mRes?.meetings) setMeetings(mRes.meetings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load scheme");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scheme]);

  useEffect(() => {
    if (!open || !scheme) {
      setData(null);
      setError(null);
      setKpiScope("__consolidated__");
      setChartGranularity("week");
      return;
    }
    void load();
  }, [open, scheme, load]);

  const filteredKpiRows = useMemo(() => {
    if (!data) return [];
    if (kpiScope === "__consolidated__") return data.kpi.rows;
    if (kpiScope === "__scheme_level__") return data.kpi.rows.filter((r) => !r.subschemeId);
    return data.kpi.rows.filter((r) => r.subschemeId === kpiScope);
  }, [data, kpiScope]);

  const filteredProgress = useMemo(() => {
    const c = { on_track: 0, delayed: 0, overdue: 0 };
    for (const r of filteredKpiRows) {
      const ps = r.latest?.progressStatus;
      if (ps === "on_track") c.on_track += 1;
      else if (ps === "delayed") c.delayed += 1;
      else if (ps === "overdue") c.overdue += 1;
    }
    return c;
  }, [filteredKpiRows]);

  const meetingsChrono = useMemo(
    () => [...meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate)),
    [meetings],
  );

  const weeklyKpiBase = useMemo(() => {
    if (!data) return [];
    if (kpiScope === "__consolidated__") {
      return data.kpi.weeklyConsolidated.map((w) => ({
        label: w.weekStart.slice(5),
        avg: w.avgAchievementPct,
      }));
    }
    if (kpiScope === "__scheme_level__") {
      const row = data.kpi.weeklyBySubscheme.find((s) => s.subschemeId === null);
      return (row?.series ?? []).map((w) => ({
        label: w.weekStart.slice(5),
        avg: w.avgAchievementPct,
      }));
    }
    const row = data.kpi.weeklyBySubscheme.find((s) => s.subschemeId === kpiScope);
    return (row?.series ?? []).map((w) => ({
      label: w.weekStart.slice(5),
      avg: w.avgAchievementPct,
    }));
  }, [data, kpiScope]);

  const kpiChartData = useMemo(() => {
    if (chartGranularity === "week") {
      return weeklyKpiBase;
    }
    if (chartGranularity === "month") {
      const keys = uniqueSortedMonthKeysFromKpiRows(filteredKpiRows);
      return keys
        .map((ym) => {
          const end = lastIsoDayOfCalendarMonth(ym);
          const avg = averageAchievement(filteredKpiRows, end);
          const label = `${ym.slice(5, 7)}/${ym.slice(2, 4)}`;
          return { label, avg };
        })
        .filter((p) => p.avg !== null);
    }
    return meetingsChrono
      .map((m) => {
        const avg = averageAchievement(filteredKpiRows, m.meetingDate);
        const shortTitle = m.title && m.title.length > 18 ? `${m.title.slice(0, 16)}…` : m.title;
        const label = shortTitle ? `${m.meetingDate.slice(5)} · ${shortTitle}` : m.meetingDate.slice(5);
        return { label, avg };
      })
      .filter((p) => p.avg !== null);
  }, [chartGranularity, weeklyKpiBase, filteredKpiRows, meetingsChrono]);

  const ifmsSeriesRaw = useMemo((): IfmsPoint[] => {
    if (!data) return [];
    return data.ifmsTimeseries.map((p) => ({
      asOfDate: p.asOfDate,
      ifmsCr: p.ifmsCr,
      utilisationPct: p.utilisationPct,
    }));
  }, [data]);

  const ifmsSeriesForGranularity = useMemo(() => {
    if (chartGranularity === "week") return bucketIfmsByWeek(ifmsSeriesRaw);
    if (chartGranularity === "month") return bucketIfmsByMonth(ifmsSeriesRaw);
    return meetingsChrono
      .map((m) => {
        const snap = latestIfmsOnOrBefore(ifmsSeriesRaw, m.meetingDate);
        if (!snap) return null;
        return { ...snap, meetingDate: m.meetingDate };
      })
      .filter((x): x is IfmsPoint & { meetingDate: string } => x !== null);
  }, [chartGranularity, ifmsSeriesRaw, meetingsChrono]);

  const ifmsChartData = useMemo(() => {
    if (chartGranularity === "meeting") {
      return (ifmsSeriesForGranularity as Array<IfmsPoint & { meetingDate: string }>).map((p) => {
        const m = meetingsChrono.find((x) => x.meetingDate === p.meetingDate);
        const shortTitle = m?.title && m.title.length > 16 ? `${m.title.slice(0, 14)}…` : m?.title;
        const label = shortTitle ? `${p.meetingDate.slice(5)} · ${shortTitle}` : p.asOfDate.slice(5);
        return { label, ifms: p.ifmsCr, util: p.utilisationPct };
      });
    }
    return (ifmsSeriesForGranularity as IfmsPoint[]).map((p) => ({
      label: p.asOfDate.slice(5),
      ifms: p.ifmsCr,
      util: p.utilisationPct,
    }));
  }, [chartGranularity, ifmsSeriesForGranularity, meetingsChrono]);

  const ifmsWow = useMemo(() => {
    const series = ifmsSeriesForGranularity as IfmsPoint[];
    if (series.length < 2) return null;
    const cur = series[series.length - 1]!;
    const prev = series[series.length - 2]!;
    return {
      deltaIfms: cur.ifmsCr - prev.ifmsCr,
      prevDate: prev.asOfDate,
      curDate: cur.asOfDate,
      deltaUtil:
        cur.utilisationPct !== null && prev.utilisationPct !== null ? cur.utilisationPct - prev.utilisationPct : null,
    };
  }, [ifmsSeriesForGranularity]);

  const kpiScopeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "__consolidated__", label: "All KPIs (consolidated)" }];
    opts.push({ value: "__scheme_level__", label: "Scheme-level KPIs only" });
    if (!data) return opts;
    for (const s of data.subschemeFinancial) {
      if (data.scheme && s.id === data.scheme.id && s.name === "Scheme total") continue;
      opts.push({ value: s.id, label: `${s.code} — ${s.name}` });
    }
    return opts;
  }, [data]);

  if (!open || !scheme) return null;

  const exp = data?.expenditure;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ax-scrim px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheme-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] p-6 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--text-muted)]">
              {scheme.verticalName} · {data?.financialYearLabel ?? "FY"}
            </p>
            <h2 id="scheme-modal-title" className="mt-1 text-lg font-semibold leading-snug text-[var(--text-primary)]">
              {scheme.code} — {scheme.name}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Financial progress, KPIs by component, recent updates, and trend charts (week-on-week and meeting comparisons).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center gap-2 py-10 text-sm text-[var(--text-muted)]">
              <Loader2 className="animate-spin" size={18} />
              Loading scheme analytics…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-[var(--alert-critical)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--alert-critical)]">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-8">
              {/* Financial */}
              <section>
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Financial progress</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--accent)] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--sidebar-text-primary)]">Annual budget</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                      {exp ? formatCurrency(exp.annualBudgetCr) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--accent)] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--sidebar-text-primary)]">IFMS (latest)</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                      {exp ? formatCurrency(exp.ifmsExpenditureCr) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--accent)] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--sidebar-text-primary)]">SO (latest)</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                      {exp ? formatCurrency(exp.soExpenditureCr) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--accent)] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--sidebar-text-primary)]">IFMS utilisation</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                      {exp && exp.annualBudgetCr > 0
                        ? `${((exp.ifmsExpenditureCr / exp.annualBudgetCr) * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                    {exp?.asOfDate && (
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">As of {exp.asOfDate}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Trend comparison</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Same mode is used for IFMS vs budget utilisation and for average KPI achievement. Week = one snapshot per ISO week;
                    month = month-end view; meeting = value on or before each meeting date.
                  </p>
                  <div
                    className="mt-3 flex flex-wrap gap-2"
                    role="group"
                    aria-label="Chart snapshot granularity"
                  >
                    {(
                      [
                        { id: "week" as const, label: "Week by week" },
                        { id: "month" as const, label: "Monthly" },
                        { id: "meeting" as const, label: "By meeting" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChartGranularity(opt.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          chartGranularity === opt.id
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--sidebar-text-primary)]"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {ifmsWow && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Latest step (IFMS): {ifmsWow.deltaIfms >= 0 ? "+" : ""}
                    {ifmsWow.deltaIfms.toFixed(2)} Cr from {ifmsWow.prevDate} → {ifmsWow.curDate}
                    {ifmsWow.deltaUtil !== null && (
                      <span className="ml-2">
                        · Utilisation change {ifmsWow.deltaUtil >= 0 ? "+" : ""}
                        {ifmsWow.deltaUtil.toFixed(1)} pts
                      </span>
                    )}
                  </p>
                )}

                <div className="mt-4 w-full min-h-[224px] min-w-0 shrink-0">
                  {ifmsChartData.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      {chartGranularity === "meeting" && meetingsChrono.length === 0
                        ? "No meetings found. Create meetings to compare IFMS by meeting day."
                        : chartGranularity === "meeting" && ifmsSeriesRaw.length === 0
                          ? "No IFMS snapshots for this scheme in the current FY."
                          : chartGranularity === "meeting"
                            ? "No IFMS snapshot on or before any meeting date in this FY."
                            : "No IFMS snapshots for this scheme in the current FY."}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={224} minWidth={0} minHeight={200}>
                      <LineChart
                        data={ifmsChartData}
                        margin={{ top: 8, right: 12, left: 4, bottom: chartGranularity === "meeting" ? 28 : 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10 }}
                          stroke="var(--text-muted)"
                          angle={chartGranularity === "meeting" ? -25 : 0}
                          textAnchor={chartGranularity === "meeting" ? "end" : "middle"}
                          height={chartGranularity === "meeting" ? 48 : 30}
                        />
                        <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                        <YAxis
                          yAxisId="r"
                          orientation="right"
                          domain={[0, "auto"]}
                          tick={{ fontSize: 10 }}
                          stroke="var(--text-muted)"
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value, name) => {
                            const v = typeof value === "number" ? value : Number(value);
                            const n = Number.isFinite(v) ? v : 0;
                            return name === "util"
                              ? [`${n.toFixed(1)}%`, "Utilisation"]
                              : [formatCurrency(n), tenantConfig().labels.ifmsExpenditure];
                          }}
                        />
                        <Legend />
                        <Line
                          yAxisId="l"
                          type="monotone"
                          dataKey="ifms"
                          name="IFMS (₹ Cr)"
                          stroke="var(--accent)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          yAxisId="r"
                          type="monotone"
                          dataKey="util"
                          name="Budget utilisation"
                          stroke="var(--ax-muted)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-6">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">By component (latest)</p>
                  <div className="mt-2 space-y-2">
                    {data.subschemeFinancial.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No budget lines for this scheme.</p>
                    ) : (
                      data.subschemeFinancial.map((row) => (
                        <div key={row.id} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <span className="text-sm font-medium text-[var(--text-primary)]">{row.code}</span>
                            <span className="text-sm text-[var(--text-muted)]"> — {row.name}</span>
                            {row.asOfDate && (
                              <span className="ml-2 text-[10px] text-[var(--text-muted)]">· {row.asOfDate}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-[var(--text-muted)]">
                            <span>Budget {formatCurrency(row.budgetCr)}</span>
                            <span>IFMS {formatCurrency(row.ifmsCr)}</span>
                            <span className="font-medium text-[var(--text-primary)]">{formatPct(row.utilisationPct)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* KPI */}
              <section>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">KPI progress</h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Scope filters the table and counts. Trend comparison (week / month / meeting) is set under Financial progress
                      above.
                    </p>
                  </div>
                  <label className="flex flex-col text-[11px] text-[var(--text-muted)]">
                    Scope
                    <select
                      className="mt-1 min-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                      value={kpiScope}
                      onChange={(e) => setKpiScope(e.target.value)}
                    >
                      {kpiScopeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {(["on_track", "delayed", "overdue"] as const).map((k) => (
                    <div
                      key={k}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-center"
                    >
                      <p className="text-2xl font-semibold text-[var(--text-primary)]">{filteredProgress[k]}</p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        {PROGRESS_LABEL[k] ?? k}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 w-full min-h-[208px] min-w-0 shrink-0">
                  {kpiChartData.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      {chartGranularity === "meeting" && meetingsChrono.length === 0
                        ? "No meetings found. Add meetings to chart KPI snapshots by meeting day."
                        : chartGranularity === "meeting"
                          ? "No KPI achievement data on or before meeting dates in this scope."
                          : "No KPI measurements in the selected scope for this FY."}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={208} minWidth={0} minHeight={180}>
                      <LineChart
                        data={kpiChartData}
                        margin={{ top: 8, right: 12, left: 4, bottom: chartGranularity === "meeting" ? 28 : 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10 }}
                          stroke="var(--text-muted)"
                          angle={chartGranularity === "meeting" ? -25 : 0}
                          textAnchor={chartGranularity === "meeting" ? "end" : "middle"}
                          height={chartGranularity === "meeting" ? 48 : 30}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v) => {
                            const n = typeof v === "number" ? v : Number(v);
                            return [`${Number.isFinite(n) ? n.toFixed(1) : "—"}%`, "Avg achievement"];
                          }}
                        />
                        <Line type="monotone" dataKey="avg" name="Avg achievement" stroke="var(--ax-status-ok)" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        <th className="pb-2 pr-3">KPI</th>
                        <th className="pb-2 pr-3">Component</th>
                        <th className="pb-2 pr-3">Achievement</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKpiRows.map((r) => (
                        <tr key={r.id} className="border-t border-[var(--border)] text-[var(--text-primary)]">
                          <td className="py-2 pr-3 align-top">{r.description}</td>
                          <td className="py-2 pr-3 align-top text-[var(--text-muted)]">
                            {r.subschemeCode ? `${r.subschemeCode}` : "—"}
                          </td>
                          <td className="py-2 pr-3 align-top tabular-nums">{formatPct(r.latest?.achievementPct ?? null)}</td>
                          <td className="py-2 align-top">
                            {r.latest ? PROGRESS_LABEL[r.latest.progressStatus] ?? r.latest.progressStatus : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredKpiRows.length === 0 && (
                    <p className="mt-2 text-sm text-[var(--text-muted)]">No KPIs in this scope.</p>
                  )}
                </div>
              </section>

              {/* Updates */}
              <section>
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Updates</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Recent KPI measurements and financial data entries for this scheme.</p>
                <ul className="mt-3 space-y-2">
                  {data.updates.length === 0 ? (
                    <li className="text-sm text-[var(--text-muted)]">No updates yet.</li>
                  ) : (
                    data.updates.map((u, i) => (
                      <li
                        key={`${u.at}-${u.kind}-${i}`}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-[var(--text-primary)]">{u.title}</span>
                          <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                            {u.kind === "kpi" ? "KPI" : "Financial"} · {new Date(u.at).toLocaleString()}
                          </span>
                        </div>
                        {u.detail && <p className="mt-1 text-xs text-[var(--text-muted)]">{u.detail}</p>}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
