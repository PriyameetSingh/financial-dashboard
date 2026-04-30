"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import type { FinanceSummaryBreakdown } from "@/lib/financial-budget-entries";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import type { FinancialEntry, FinanceSummaryRow } from "@/types";
import { fetchFinanceSummary } from "@/src/lib/services/financialService";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatCurrency(value: number) {
  return `₹${value.toFixed(1)} Cr`;
}

const CHART_BUDGET = "#1e3a8a";
const CHART_IFMS = "#0d9488";
const CHART_SO = "#ea580c";

type FundingBarRow = {
  name: string;
  budgetEstimateCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
};

function buildFundingOverviewRows(rows: FinanceSummaryRow[]): FundingBarRow[] {
  const byCode = new Map(rows.map((r) => [r.headCode, r]));
  const g = (code: string) => byCode.get(code);
  const transferCodes = ["STATE_FINANCE_COMMISSION", "UNION_FINANCE_COMMISSION", "OTHER_TRANSFER_STAMP_DUTY"] as const;
  const transfer = transferCodes.reduce(
    (acc, c) => {
      const r = g(c);
      return {
        budgetEstimateCr: acc.budgetEstimateCr + (r?.budgetEstimateCr ?? 0),
        soExpenditureCr: acc.soExpenditureCr + (r?.soExpenditureCr ?? 0),
        ifmsExpenditureCr: acc.ifmsExpenditureCr + (r?.ifmsExpenditureCr ?? 0),
      };
    },
    { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
  );
  return [
    {
      name: "State Sector Scheme",
      budgetEstimateCr: g("STATE_SCHEME")?.budgetEstimateCr ?? 0,
      soExpenditureCr: g("STATE_SCHEME")?.soExpenditureCr ?? 0,
      ifmsExpenditureCr: g("STATE_SCHEME")?.ifmsExpenditureCr ?? 0,
    },
    {
      name: "Centrally Sponsored Scheme",
      budgetEstimateCr: g("CENTRALLY_SPONSORED_SCHEME")?.budgetEstimateCr ?? 0,
      soExpenditureCr: g("CENTRALLY_SPONSORED_SCHEME")?.soExpenditureCr ?? 0,
      ifmsExpenditureCr: g("CENTRALLY_SPONSORED_SCHEME")?.ifmsExpenditureCr ?? 0,
    },
    {
      name: "Central Sector Scheme",
      budgetEstimateCr: g("CENTRAL_SECTOR_SCHEME")?.budgetEstimateCr ?? 0,
      soExpenditureCr: g("CENTRAL_SECTOR_SCHEME")?.soExpenditureCr ?? 0,
      ifmsExpenditureCr: g("CENTRAL_SECTOR_SCHEME")?.ifmsExpenditureCr ?? 0,
    },
    {
      name: "Transfer From State",
      budgetEstimateCr: transfer.budgetEstimateCr,
      soExpenditureCr: transfer.soExpenditureCr,
      ifmsExpenditureCr: transfer.ifmsExpenditureCr,
    },
    {
      name: "Admin. Expenditure",
      budgetEstimateCr: g("ADMIN_EXPENDITURE")?.budgetEstimateCr ?? 0,
      soExpenditureCr: g("ADMIN_EXPENDITURE")?.soExpenditureCr ?? 0,
      ifmsExpenditureCr: g("ADMIN_EXPENDITURE")?.ifmsExpenditureCr ?? 0,
    },
  ];
}

function utilisationPct(ifms: number, budget: number) {
  if (!budget || budget <= 0) return 0;
  return Math.min(100, (ifms / budget) * 100);
}

function effBudget(entry: FinancialEntry) {
  return entry.effectiveBudgetCr ?? entry.annualBudget + (entry.totalSupplementCr ?? 0);
}

type ComparePreset = "none" | "wow" | "since_last_meeting" | "meeting_pair" | "custom";

type Props = {
  entries: FinancialEntry[];
  financialYearLabel: string | null;
  summary: FinanceSummaryBreakdown | null;
};

export default function FinancialOverviewClient({
  entries,
  financialYearLabel,
  summary,
}: Props) {
  const currentUser = useHydratedCurrentUser();
  const [preset, setPreset] = useState<ComparePreset>("none");
  const [snapshotDates, setSnapshotDates] = useState<string[]>([]);
  const [meetings, setMeetings] = useState<{ id: string; meetingDate: string; title: string | null }[]>([]);
  const [baselineSummary, setBaselineSummary] = useState<Awaited<ReturnType<typeof fetchFinanceSummary>> | null>(null);
  const [currentHeadSummary, setCurrentHeadSummary] = useState<Awaited<ReturnType<typeof fetchFinanceSummary>> | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [customBaseline, setCustomBaseline] = useState("");
  const [customCurrent, setCustomCurrent] = useState("");
  const [meetingA, setMeetingA] = useState("");
  const [meetingB, setMeetingB] = useState("");

  const summaryTotals = useMemo(() => {
    const totalBudget = entries.reduce((sum, entry) => sum + effBudget(entry), 0);
    const totalSo = entries.reduce((sum, entry) => sum + entry.so, 0);
    const totalIfms = entries.reduce((sum, entry) => sum + entry.ifms, 0);
    const pct = totalBudget ? ((totalIfms / totalBudget) * 100).toFixed(1) : "0.0";
    return { totalBudget, totalSo, totalIfms, pct };
  }, [entries]);

  const currentSummaryAsOf = summary?.asOfDate ?? null;

  const resolvedDates = useMemo(() => {
    if (preset === "none") return { baseline: null as string | null, current: currentSummaryAsOf };
    const dates = snapshotDates;
    if (dates.length === 0) return { baseline: null, current: currentSummaryAsOf };

    if (preset === "wow") {
      return { baseline: dates.length >= 2 ? dates[1] : null, current: dates[0] ?? currentSummaryAsOf };
    }

    if (preset === "since_last_meeting" && meetings.length > 0) {
      const md = meetings[0].meetingDate;
      const onOrBefore = dates.filter((d) => d <= md);
      return {
        baseline: onOrBefore[0] ?? null,
        current: dates[0] ?? currentSummaryAsOf,
      };
    }

    if (preset === "meeting_pair" && meetingA && meetingB) {
      const early = meetingA < meetingB ? meetingA : meetingB;
      const late = meetingA < meetingB ? meetingB : meetingA;
      const bLine = dates.filter((d) => d <= early);
      const cLine = dates.filter((d) => d <= late);
      return {
        baseline: bLine[0] ?? null,
        current: cLine[0] ?? dates[0] ?? currentSummaryAsOf,
      };
    }

    if (preset === "custom" && customBaseline && customCurrent) {
      return { baseline: customBaseline, current: customCurrent };
    }

    return { baseline: null, current: currentSummaryAsOf };
  }, [
    preset,
    snapshotDates,
    meetings,
    currentSummaryAsOf,
    meetingA,
    meetingB,
    customBaseline,
    customCurrent,
  ]);

  const loadMeta = useCallback(async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        fetch("/api/v1/financial/snapshot-dates", { cache: "no-store" }),
        fetch("/api/v1/meetings", { cache: "no-store" }),
      ]);
      if (dRes.ok) {
        const j = (await dRes.json()) as { dates: string[] };
        setSnapshotDates(j.dates ?? []);
      }
      if (mRes.ok) {
        const j = (await mRes.json()) as {
          meetings: { id: string; meetingDate: string; title: string | null }[];
        };
        setMeetings(j.meetings ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (preset === "none" || !resolvedDates.baseline || !resolvedDates.current) {
      setBaselineSummary(null);
      setCurrentHeadSummary(null);
      return;
    }
    if (resolvedDates.baseline === resolvedDates.current) {
      setBaselineSummary(null);
      setCurrentHeadSummary(null);
      return;
    }
    let alive = true;
    setLoadingCompare(true);
    setBaselineSummary(null);
    setCurrentHeadSummary(null);
    Promise.all([
      fetchFinanceSummary({ asOfDate: resolvedDates.baseline, financialYearLabel: financialYearLabel ?? undefined }),
      fetchFinanceSummary({ asOfDate: resolvedDates.current, financialYearLabel: financialYearLabel ?? undefined }),
    ])
      .then(([base, cur]) => {
        if (alive) {
          setBaselineSummary(base);
          setCurrentHeadSummary(cur);
        }
      })
      .catch(() => {
        if (alive) {
          setBaselineSummary(null);
          setCurrentHeadSummary(null);
        }
      })
      .finally(() => {
        if (alive) setLoadingCompare(false);
      });
    return () => {
      alive = false;
    };
  }, [preset, resolvedDates.baseline, resolvedDates.current, financialYearLabel]);

  const activeHeadSummary = useMemo(() => {
    if (preset === "none") {
      if (!summary?.rows.length) return null;
      return {
        financialYearLabel: summary.financialYearLabel,
        asOfDate: summary.asOfDate,
        rows: summary.rows,
        totals: summary.totals,
      };
    }
    if (!currentHeadSummary) return null;
    return {
      financialYearLabel: currentHeadSummary.financialYearLabel,
      asOfDate: currentHeadSummary.asOfDate,
      rows: currentHeadSummary.rows,
      totals: currentHeadSummary.totals,
    };
  }, [preset, currentHeadSummary, summary]);

  const compareSummaryRows = useMemo(() => {
    if (!baselineSummary || !activeHeadSummary || preset === "none") return null;
    const byHead = new Map<string, FinanceSummaryRow>();
    for (const r of baselineSummary.rows) byHead.set(r.headCode, r);

    return activeHeadSummary.rows.map((row) => {
      const base = byHead.get(row.headCode);
      return {
        ...row,
        deltaIfms: base ? row.ifmsExpenditureCr - base.ifmsExpenditureCr : null,
        deltaSo: base ? row.soExpenditureCr - base.soExpenditureCr : null,
        baselineIfms: base?.ifmsExpenditureCr ?? null,
      };
    });
  }, [baselineSummary, activeHeadSummary, preset]);

  const headChartData = useMemo(() => {
    if (!compareSummaryRows) return [];
    return compareSummaryRows.map((r) => ({
      name: r.label.slice(0, 14),
      baseline: r.baselineIfms ?? 0,
      current: r.ifmsExpenditureCr,
    }));
  }, [compareSummaryRows]);

  const totalsDelta = useMemo(() => {
    if (!baselineSummary || !activeHeadSummary || preset === "none") return null;
    return {
      ifms: activeHeadSummary.totals.ifmsExpenditureCr - baselineSummary.totals.ifmsExpenditureCr,
      so: activeHeadSummary.totals.soExpenditureCr - baselineSummary.totals.soExpenditureCr,
      budget: activeHeadSummary.totals.budgetEstimateCr - baselineSummary.totals.budgetEstimateCr,
    };
  }, [baselineSummary, activeHeadSummary, preset]);

  const isViewer = isReadOnlyWatermarkUser(currentUser);
  const fyDisplay = financialYearLabel ?? "—";

  const compareHint = useMemo(() => {
    if (preset === "none") return null;
    if (preset === "wow") return "Week on week: compares the two most recent snapshot dates with summary-head data.";
    if (preset === "since_last_meeting")
      return "Baseline = latest finance summary on or before the most recent meeting date; current = latest overall.";
    if (preset === "meeting_pair")
      return "Baseline = snapshot on or before the earlier selected meeting; current = on or before the later meeting.";
    if (preset === "custom") return "Compares finance summary heads at two as-of dates.";
    return null;
  }, [preset]);

  const fundingBarData = useMemo(() => {
    if (!activeHeadSummary?.rows.length) return [];
    return buildFundingOverviewRows(activeHeadSummary.rows);
  }, [activeHeadSummary]);

  const totalBudgetUtilisationPct = useMemo(() => {
    if (!activeHeadSummary?.totals) return 0;
    return utilisationPct(
      activeHeadSummary.totals.ifmsExpenditureCr,
      activeHeadSummary.totals.budgetEstimateCr,
    );
  }, [activeHeadSummary]);

  const schemeGaugeRows = useMemo(() => {
    if (!activeHeadSummary?.rows.length) return [];
    const byCode = new Map(activeHeadSummary.rows.map((r) => [r.headCode, r]));
    const mk = (code: string, shortLabel: string) => {
      const r = byCode.get(code);
      const b = r?.budgetEstimateCr ?? 0;
      const i = r?.ifmsExpenditureCr ?? 0;
      return { shortLabel, pct: utilisationPct(i, b) };
    };
    return [
      mk("STATE_SCHEME", "State"),
      mk("CENTRALLY_SPONSORED_SCHEME", "Centrally Sponsored"),
      mk("CENTRAL_SECTOR_SCHEME", "Central"),
    ];
  }, [activeHeadSummary]);

  /** Placeholder IFMS trend: smooth progression by meeting until backend timeseries is reliable. */
  const ifmsMeetingTrendChartData = useMemo(() => {
    const sorted = [...meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
    if (sorted.length === 0) return [];
    const startCr = 2000;
    const endCr = 8000;
    const denom = Math.max(1, sorted.length - 1);
    return sorted.map((m, i) => ({
      label: m.meetingDate.slice(5),
      ifmsCr: startCr + ((endCr - startCr) * i) / denom,
    }));
  }, [meetings]);

  const transferDistributionRows = useMemo(() => {
    if (!activeHeadSummary?.rows.length) return [];
    const byCode = new Map(activeHeadSummary.rows.map((r) => [r.headCode, r]));
    const codes = ["STATE_FINANCE_COMMISSION", "UNION_FINANCE_COMMISSION", "OTHER_TRANSFER_STAMP_DUTY"] as const;
    const dotClass = ["bg-emerald-500", "bg-orange-500", "bg-amber-400"] as const;
    return codes.map((code, idx) => {
      const r = byCode.get(code);
      return {
        label: r?.label ?? code,
        ifmsCr: r?.ifmsExpenditureCr ?? 0,
        dotClass: dotClass[idx],
      };
    });
  }, [activeHeadSummary]);

  return (
    <AppShell title="Financial Overview">
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">{fyDisplay}</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Schemes wise Financial Progress</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Live SO vs IFMS from finance budgets and expenditure snapshots (database). Use comparison mode for summary-head
            deltas (same basis as FA summary entries).
          </p>
        </div>

        {/* Comparison toolbar */}
        {/* <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Comparison</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                ["none", "Current only"],
                ["wow", "Week on week"],
                ["since_last_meeting", "Since last meeting"],
                ["meeting_pair", "Meeting vs meeting"],
                ["custom", "Custom dates"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  preset === id
                    ? "border-[var(--text-primary)] bg-[var(--bg-hover)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === "meeting_pair" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex flex-col text-[11px] text-[var(--text-muted)]">
                Earlier meeting
                <select
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  value={meetingA}
                  onChange={(e) => setMeetingA(e.target.value)}
                >
                  <option value="">Select</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.meetingDate}>
                      {m.meetingDate} {m.title ? `— ${m.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] text-[var(--text-muted)]">
                Later meeting
                <select
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  value={meetingB}
                  onChange={(e) => setMeetingB(e.target.value)}
                >
                  <option value="">Select</option>
                  {meetings.map((m) => (
                    <option key={`b-${m.id}`} value={m.meetingDate}>
                      {m.meetingDate} {m.title ? `— ${m.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {preset === "custom" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex flex-col text-[11px] text-[var(--text-muted)]">
                Baseline as-of
                <select
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  value={customBaseline}
                  onChange={(e) => setCustomBaseline(e.target.value)}
                >
                  <option value="">Select date</option>
                  {snapshotDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] text-[var(--text-muted)]">
                Current as-of
                <select
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  value={customCurrent}
                  onChange={(e) => setCustomCurrent(e.target.value)}
                >
                  <option value="">Select date</option>
                  {snapshotDates.map((d) => (
                    <option key={`c-${d}`} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {compareHint && <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{compareHint}</p>}
          {preset !== "none" && resolvedDates.baseline && resolvedDates.current && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Baseline <span className="font-mono">{resolvedDates.baseline}</span> → Current{" "}
              <span className="font-mono">{resolvedDates.current}</span>
              {loadingCompare ? " · Loading…" : ""}
            </p>
          )}
        </div> */}

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Total Budget",
              value: formatCurrency(summaryTotals.totalBudget),
              sub: "All schemes (effective budget)",
            },
            {
              label: "SO Orders",
              value: formatCurrency(summaryTotals.totalSo),
              sub: `${summaryTotals.pct}% utilisation (scheme roll-up)`,
            },
            {
              label: "IFMS Actual",
              value: formatCurrency(summaryTotals.totalIfms),
              sub: "Utilised (scheme roll-up)",
            },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{card.value}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{card.sub}</p>
            </div>
          ))}
        </div>

        {fundingBarData.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 lg:col-span-2">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Budget estimate vs S.O. order vs expenditure (IFMS)
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">All funding sources • ₹ in Crores</p>
              <div className="mt-4 h-[340px] w-full min-w-0">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    layout="vertical"
                    data={fundingBarData}
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={148}
                      reversed
                      tick={{ fontSize: 11, fill: "var(--text-primary)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)} Cr`, String(name ?? "")]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="budgetEstimateCr" name="Budget estimate" fill={CHART_BUDGET} radius={[0, 4, 4, 0]} barSize={14} />
                    <Bar dataKey="ifmsExpenditureCr" name="Expenditure (IFMS)" fill={CHART_IFMS} radius={[0, 4, 4, 0]} barSize={14} />
                    <Bar dataKey="soExpenditureCr" name="S.O. order" fill={CHART_SO} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Utilisation</p>
                <div className="relative mx-auto mt-2 h-[168px] w-full max-w-[260px]">
                  <ResponsiveContainer width="100%" height={168}>
                    <PieChart margin={{ top: 4, right: 0, bottom: 8, left: 0 }}>
                      <Pie
                        data={[
                          { key: "used", value: Math.min(100, totalBudgetUtilisationPct), fill: CHART_BUDGET },
                          { key: "rest", value: Math.max(0, 100 - Math.min(100, totalBudgetUtilisationPct)), fill: "var(--border)" },
                        ]}
                        cx="50%"
                        cy="100%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius="58%"
                        outerRadius="88%"
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-x-0 bottom-2 top-0 flex flex-col items-center justify-center px-2 pb-10 text-center">
                    <p className="text-3xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
                      {totalBudgetUtilisationPct.toFixed(1)}%
                    </p>
                    <p className="mt-1.5 max-w-[12rem] text-[11px] leading-snug text-[var(--text-muted)]">
                      Total budget utilisation
                    </p>
                  </div>
                </div>
                <ul className="mt-2 space-y-2 border-t border-[var(--border)] pt-3 text-sm">
                  {schemeGaugeRows.map((row) => (
                    <li key={row.shortLabel} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--text-muted)]">{row.shortLabel}</span>
                      <span className="shrink-0 font-medium tabular-nums text-rose-600 dark:text-rose-400">
                        {row.pct.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Transfer from state</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Expenditure distribution</p>
                <ul className="mt-4 space-y-3">
                  {transferDistributionRows.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.dotClass}`} />
                        <span className="truncate text-[var(--text-primary)]">{row.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{formatCurrency(row.ifmsCr)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {totalsDelta && preset !== "none" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">Summary heads (FA) movement</span> vs baseline{" "}
            <span className="font-mono">{resolvedDates.baseline}</span>: IFMS{" "}
            <span className={totalsDelta.ifms >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {totalsDelta.ifms >= 0 ? "+" : ""}
              {totalsDelta.ifms.toFixed(1)} Cr
            </span>
            {" · "}
            SO{" "}
            <span className={totalsDelta.so >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {totalsDelta.so >= 0 ? "+" : ""}
              {totalsDelta.so.toFixed(1)} Cr
            </span>
            {" · "}
            Budget{" "}
            <span
              className={totalsDelta.budget >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            >
              {totalsDelta.budget >= 0 ? "+" : ""}
              {totalsDelta.budget.toFixed(1)} Cr
            </span>
          </div>
        )}

        {ifmsMeetingTrendChartData.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Department IFMS trend</p>
            <p className="text-sm text-[var(--text-muted)]">
              Illustrative IFMS by meeting date (₹ Cr; demo progression until live timeseries is available).
            </p>
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={ifmsMeetingTrendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                    formatter={(v) => [`${Number(v ?? 0).toFixed(1)} Cr`, "IFMS"]}
                  />
                  <Line type="natural" dataKey="ifmsCr" stroke="var(--text-primary)" dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {headChartData.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Summary heads — IFMS baseline vs current</p>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={headChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="baseline" name="Baseline IFMS" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="current" name="Current IFMS" fill="var(--text-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {preset !== "none" && loadingCompare && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Budget breakdown (summary heads)</p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">Loading summary comparison…</p>
          </div>
        )}

        {preset !== "none" && !loadingCompare && !activeHeadSummary && resolvedDates.baseline && resolvedDates.current && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Budget breakdown (summary heads)</p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Could not load finance summary for the selected dates. Check that FA summary data exists for both as-of dates.
            </p>
          </div>
        )}

        {activeHeadSummary && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Budget breakdown (summary heads)</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Plan type, transfer, and admin
                  {activeHeadSummary.asOfDate ? ` · as of ${activeHeadSummary.asOfDate}` : ""}.
                  {preset !== "none" && resolvedDates.current ? ` Current column uses snapshot ${resolvedDates.current}.` : ""}
                </p>
              </div>
            </div>
            {activeHeadSummary.rows.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-3 pr-4">Head</th>
                      <th className="py-3 pr-4">Budget (₹ Cr)</th>
                      <th className="py-3 pr-4">SO (₹ Cr)</th>
                      <th className="py-3 pr-4">IFMS (₹ Cr)</th>
                      {compareSummaryRows && <th className="py-3 pr-4">Δ IFMS</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {activeHeadSummary.rows.map((row) => {
                      const cmp = compareSummaryRows?.find((r) => r.headCode === row.headCode);
                      return (
                        <tr key={row.headCode} className="border-b border-[var(--border)] text-[var(--text-primary)]">
                          <td className="py-3 pr-4 font-medium">{row.label}</td>
                          <td className="py-3 pr-4">{row.budgetEstimateCr.toFixed(1)}</td>
                          <td className="py-3 pr-4">{row.soExpenditureCr.toFixed(1)}</td>
                          <td className="py-3 pr-4">{row.ifmsExpenditureCr.toFixed(1)}</td>
                          {compareSummaryRows && (
                            <td
                              className={`py-3 pr-4 font-medium ${
                                (cmp?.deltaIfms ?? 0) >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {cmp?.deltaIfms == null ? "—" : `${cmp.deltaIfms >= 0 ? "+" : ""}${cmp.deltaIfms.toFixed(1)}`}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    <tr className="font-semibold text-[var(--text-primary)]">
                      <td className="py-3 pr-4">Total</td>
                      <td className="py-3 pr-4">{activeHeadSummary.totals.budgetEstimateCr.toFixed(1)}</td>
                      <td className="py-3 pr-4">{activeHeadSummary.totals.soExpenditureCr.toFixed(1)}</td>
                      <td className="py-3 pr-4">{activeHeadSummary.totals.ifmsExpenditureCr.toFixed(1)}</td>
                      {totalsDelta && (
                        <td
                          className={`py-3 pr-4 ${totalsDelta.ifms >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                        >
                          {totalsDelta.ifms >= 0 ? "+" : ""}
                          {totalsDelta.ifms.toFixed(1)}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-muted)]">No finance summary heads recorded for this year yet.</p>
            )}
          </div>
        )}

        </div>
    </AppShell>
  );
}
