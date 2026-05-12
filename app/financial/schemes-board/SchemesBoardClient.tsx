"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import SchemeModal from "@/components/schemes/SchemeModal";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import { fetchFinancialBudgets } from "@/src/lib/services/financialService";
import type { FinancialEntry } from "@/types";

function effBudget(e: FinancialEntry) {
  return e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0);
}

function utilPct(e: FinancialEntry): number {
  const b = effBudget(e);
  if (!b || b <= 0) return 0;
  return (e.ifms / b) * 100;
}

type Bucket = "on_track" | "at_risk" | "critical";

/** Bucketing based on quarterly target variance (not annual utilization).
 *  Q1 target is 25%, so a scheme at 21% spending is nearly on track.
 */
function bucketForQuarterlyVariance(variancePct: number): Bucket {
  // variance = actual% - target% (positive = ahead of target)
  if (variancePct >= -5) return "on_track";     // Within 5% of target = on track
  if (variancePct >= -15) return "at_risk";    // 5-15% behind = at risk
  return "critical";                            // >15% behind = critical
}

function bucketLabel(bucket: Bucket): string {
  switch (bucket) {
    case "critical":
      return "Critical";
    case "at_risk":
      return "At risk";
    case "on_track":
      return "On track";
    default:
      return "";
  }
}

type SponsorshipKind = "SS" | "CSS";

function sponsorshipKind(e: FinancialEntry): SponsorshipKind {
  const t = e.metadata?.sponsorshipType;
  if (t === "STATE") return "SS";
  return "CSS";
}

function subEffBudget(
  s: NonNullable<FinancialEntry["subschemes"]>[number],
): number {
  return (
    s.effectiveBudgetCr ??
    (s.annualBudget ?? 0) + (s.totalSupplementCr ?? 0)
  );
}

function subUtilPct(s: NonNullable<FinancialEntry["subschemes"]>[number]): number {
  const b = subEffBudget(s);
  if (!b || b <= 0) return 0;
  return ((s.ifms ?? 0) / b) * 100;
}

type Quarter = 1 | 2 | 3 | 4;

const QUARTER_ALLOCATIONS: Record<Quarter, number> = {
  1: 0.25, // 25% in Q1 (Apr-Jun)
  2: 0.15, // 15% in Q2 (Jul-Sep)
  3: 0.20, // 20% in Q3 (Oct-Dec)
  4: 0.40, // 40% in Q4 (Jan-Mar)
};

function getCurrentQuarter(): Quarter {
  const month = new Date().getMonth(); // 0-11
  // FY starts in April (month 3)
  if (month >= 3 && month <= 5) return 1; // Apr-Jun
  if (month >= 6 && month <= 8) return 2; // Jul-Sep
  if (month >= 9 && month <= 11) return 3; // Oct-Dec
  return 4; // Jan-Mar
}

function getCumulativeTargetUpToQuarter(q: Quarter): number {
  let cumulative = 0;
  for (let i = 1; i <= q; i++) {
    cumulative += QUARTER_ALLOCATIONS[i as Quarter];
  }
  return cumulative;
}

function getQuarterlyProgress(e: FinancialEntry): {
  quarter: Quarter;
  quarterTargetPct: number;
  cumulativeTargetPct: number;
  actualPct: number;
  variancePct: number;
} {
  const quarter = getCurrentQuarter();
  const actualPct = utilPct(e);
  const cumulativeTargetPct = getCumulativeTargetUpToQuarter(quarter) * 100;
  const quarterTargetPct = QUARTER_ALLOCATIONS[quarter] * 100;
  const variancePct = actualPct - cumulativeTargetPct;

  return {
    quarter,
    quarterTargetPct,
    cumulativeTargetPct,
    actualPct,
    variancePct,
  };
}

const BUCKET_ORDER: Bucket[] = ["critical", "at_risk", "on_track"];

const COLUMN_UI: Record<
  Bucket,
  {
    title: string;
    range: string;
    headerBg: string;
    headerText: string;
    countBg: string;
    barFill: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    cardBorder: string;
    accentBorder: string;
  }
> = {
  critical: {
    title: "CRITICAL",
    range: ">15% behind Q target",
    // Clean header with only top accent border
    headerBg: "bg-[var(--bg-card)]",
    headerText: "text-rose-700 dark:text-rose-300",
    countBg: "bg-rose-600 text-white dark:bg-rose-500",
    barFill: "bg-rose-500",
    // Subtle badge with better contrast
    badgeBg: "bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100",
    badgeText: "", // uses combined with badgeBg
    // Neutral column border, cards get left accent
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-rose-500",
  },
  at_risk: {
    title: "AT RISK",
    range: "5-15% behind Q target",
    headerBg: "bg-[var(--bg-card)]",
    headerText: "text-amber-700 dark:text-amber-300",
    countBg: "bg-amber-600 text-white dark:bg-amber-500",
    barFill: "bg-amber-500",
    badgeBg: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
    badgeText: "",
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-amber-500",
  },
  on_track: {
    title: "ON TRACK",
    range: "Within 5% of Q target",
    headerBg: "bg-[var(--bg-card)]",
    headerText: "text-emerald-700 dark:text-emerald-300",
    countBg: "bg-emerald-600 text-white dark:bg-emerald-500",
    barFill: "bg-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100",
    badgeText: "",
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-emerald-500",
  },
};

type ViewTab = "board" | "list";
type SortKey = "scheme" | "vertical" | "re" | "spent" | "pct" | "bucket";
type SortDir = "asc" | "desc";

export default function SchemesBoardClient() {
  const currentUser = useHydratedCurrentUser();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedSchemeId, setExpandedSchemeId] = useState<string | null>(null);
  const [schemeModalEntry, setSchemeModalEntry] = useState<FinancialEntry | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("board");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchFinancialBudgets();
        if (!alive) return;
        setEntries(data.entries);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.scheme.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.vertical.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const columns = useMemo(() => {
    const cols: Record<Bucket, FinancialEntry[]> = {
      on_track: [],
      at_risk: [],
      critical: [],
    };
    for (const e of filtered) {
      const qp = getQuarterlyProgress(e);
      cols[bucketForQuarterlyVariance(qp.variancePct)].push(e);
    }
    for (const k of BUCKET_ORDER) {
      // Sort by how close they are to their quarterly target (best first)
      cols[k].sort((a, b) => {
        const qa = getQuarterlyProgress(a);
        const qb = getQuarterlyProgress(b);
        return qb.variancePct - qa.variancePct;
      });
    }
    return cols;
  }, [filtered]);

  const totals = useMemo(() => {
    const totalRe = filtered.reduce((s, e) => s + effBudget(e), 0);
    const spent = filtered.reduce((s, e) => s + e.ifms, 0);
    const overallPct = totalRe > 0 ? (spent / totalRe) * 100 : 0;
    const verticalCount = new Set(filtered.map((e) => e.vertical)).size;
    return { totalRe, spent, overallPct, verticalCount };
  }, [filtered]);

  const isViewer = isReadOnlyWatermarkUser(currentUser);

  const fmtCr = (n: number) =>
    n >= 100 ? n.toFixed(0) : n.toFixed(1);

  const sortedList = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "scheme":
          cmp = a.scheme.localeCompare(b.scheme);
          break;
        case "vertical":
          cmp = a.vertical.localeCompare(b.vertical);
          break;
        case "re":
          cmp = effBudget(a) - effBudget(b);
          break;
        case "spent":
          cmp = a.ifms - b.ifms;
          break;
        case "pct":
          cmp = utilPct(a) - utilPct(b);
          break;
        case "bucket": {
          const order: Record<Bucket, number> = { critical: 0, at_risk: 1, on_track: 2 };
          const qa = getQuarterlyProgress(a);
          const qb = getQuarterlyProgress(b);
          cmp = order[bucketForQuarterlyVariance(qa.variancePct)] - order[bucketForQuarterlyVariance(qb.variancePct)];
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <AppShell title="Scheme utilisation board">
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">
              Financial
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Scheme Budget vs. Expenditure
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              {filtered.length} schemes across {totals.verticalCount} verticals — each card is a
              scheme; expand to see sub-schemes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" />
                SS — State Scheme
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-orange-500" />
                CSS — Centrally Sponsored Scheme
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-end">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schemes or verticals…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs tabular-nums text-[var(--text-primary)]">
                Total RE ₹{fmtCr(totals.totalRe)} Cr
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs tabular-nums text-[var(--text-primary)]">
                Spent ₹{fmtCr(totals.spent)} Cr
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                {totals.overallPct.toFixed(1)}% overall
              </span>
              {(() => {
                const q = getCurrentQuarter();
                const allocations = [
                  { q: 1, pct: 25, label: "Q1" },
                  { q: 2, pct: 15, label: "Q2" },
                  { q: 3, pct: 20, label: "Q3" },
                  { q: 4, pct: 40, label: "Q4" },
                ];
                const current = allocations.find((a) => a.q === q)!;
                const cumulative = allocations.filter((a) => a.q <= q).reduce((s, a) => s + a.pct, 0);
                return (
                  <span
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium tabular-nums text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                    title={`FY spending pattern: Q1=25%, Q2=15%, Q3=20%, Q4=40%. Current target up to Q${q} is ${cumulative}%`}
                  >
                    Q{q} Target: {cumulative}% (Q{q}={current.pct}%)
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1 w-fit">
          {(["board", "list"] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "bg-[var(--bg-document)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab === "board" ? (
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="4" height="14" rx="1" />
                  <rect x="6" y="1" width="4" height="14" rx="1" />
                  <rect x="11" y="1" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 4h14M1 8h14M1 12h14" strokeLinecap="round" />
                </svg>
              )}
              {tab === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--alert-warning)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-[var(--text-muted)]">Loading schemes…</p>
        )}

        {!loading && !error && activeTab === "board" && (
          <div className="grid gap-4 lg:grid-cols-3">
            {BUCKET_ORDER.map((key) => {
              const ui = COLUMN_UI[key];
              const list = columns[key];
              return (
                <div
                  key={key}
                  className={`flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] ${ui.accentBorder} border-t-4`}
                >
                  <div
                    className={`flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 ${ui.headerBg}`}
                  >
                    <div>
                      <p className={`text-sm font-bold ${ui.headerText}`}>
                        {ui.title}{" "}
                        <span className="font-normal opacity-80">({ui.range})</span>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${ui.countBg}`}
                    >
                      {list.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                    {list.map((entry) => {
                      const pct = utilPct(entry);
                      const kind = sponsorshipKind(entry);
                      const qp = getQuarterlyProgress(entry);
                      const entryBucket = bucketForQuarterlyVariance(qp.variancePct);
                      const hasSubs =
                        !!entry.subschemes?.length;
                      const expanded =
                        hasSubs && expandedSchemeId === entry.id;

                      const cardClass = `cursor-pointer rounded-lg border bg-[var(--bg-document)] p-3 shadow-sm outline-none ring-offset-2 ring-offset-[var(--bg-document)] focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] ${ui.cardBorder} ${ui.accentBorder} border-l-4`;

                      return (
                        <div
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open scheme details for ${entry.scheme}`}
                          onClick={() => setSchemeModalEntry(entry)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSchemeModalEntry(entry);
                            }
                          }}
                          className={cardClass}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                                {entry.scheme}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                {entry.vertical} · {entry.id}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.badgeBg}`}
                            >
                              {bucketLabel(entryBucket)} — {pct.toFixed(1)}%
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                            RE ₹{fmtCr(effBudget(entry))} Cr · Spent ₹
                            {fmtCr(entry.ifms)} Cr
                          </p>

                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`mt-0.5 size-2 shrink-0 rounded-full ${
                                kind === "SS" ? "bg-sky-500" : "bg-orange-500"
                              }`}
                              title={kind === "SS" ? "State Scheme" : "Centrally Sponsored"}
                            />
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full transition-all ${ui.barFill}`}
                                style={{
                                  width: `${Math.min(100, pct)}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                              {pct.toFixed(1)}%
                            </span>
                          </div>

                          {/* Quarterly Progress */}
                          {(() => {
                            const qp = getQuarterlyProgress(entry);
                            const isBehind = qp.variancePct < 0;
                            const isOnTrack = qp.variancePct >= -5;

                            // Define colors properly for each state
                            const accentColors = isBehind
                              ? isOnTrack
                                ? { border: "border-l-amber-500", text: "text-amber-700 dark:text-amber-300" }
                                : { border: "border-l-rose-500", text: "text-rose-700 dark:text-rose-300" }
                              : { border: "border-l-emerald-500", text: "text-emerald-700 dark:text-emerald-300" };
                            const barColor = isBehind
                              ? isOnTrack ? "bg-amber-500" : "bg-rose-500"
                              : "bg-emerald-500";
                            const varianceColor = qp.variancePct >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : accentColors.text;

                            return (
                              <div className={`mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] border-l-4 ${accentColors.border} ${accentColors.text} px-2 py-1.5`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-medium text-[var(--text-muted)]">
                                    Q{qp.quarter} Target
                                  </span>
                                  <span className={`text-[10px] font-semibold tabular-nums ${accentColors.text}`}>
                                    {qp.actualPct.toFixed(1)}% / {qp.cumulativeTargetPct.toFixed(0)}%
                                  </span>
                                </div>
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--border)]">
                                  <div
                                    className={`h-full rounded-full ${barColor}`}
                                    style={{
                                      width: `${Math.min(100, (qp.actualPct / qp.cumulativeTargetPct) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <div className="mt-0.5 flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-muted)]">
                                    Q{qp.quarter} allocation: {qp.quarterTargetPct.toFixed(0)}%
                                  </span>
                                  <span className={`text-[9px] font-semibold tabular-nums ${varianceColor}`}>
                                    {qp.variancePct >= 0 ? "+" : ""}
                                    {qp.variancePct.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {hasSubs && (
                            <div
                              className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-2"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={`text-[11px] font-medium ${ui.headerText} hover:underline`}
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedSchemeId((id) =>
                                    id === entry.id ? null : entry.id,
                                  )
                                }
                              >
                                {expanded ? "Collapse ∨" : "View sub-schemes >"}
                              </button>
                            </div>
                          )}

                          {expanded && entry.subschemes && (
                            <ul
                              className="mt-3 space-y-2 border-t border-[var(--border)] pt-3"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {entry.subschemes.map((sub) => {
                                const sp = subUtilPct(sub);
                                const re = subEffBudget(sub);
                                return (
                                  <li
                                    key={sub.id}
                                    className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 text-[11px]"
                                  >
                                    <span
                                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                                        kind === "SS"
                                          ? "bg-sky-400"
                                          : "bg-orange-400"
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-[var(--text-primary)]">
                                        {sub.name}
                                      </p>
                                      <p className="text-[10px] text-[var(--text-muted)]">
                                        {sub.code}
                                      </p>
                                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-[var(--text-secondary)]">
                                        <span>RE ₹{fmtCr(re)} Cr</span>
                                        <span>
                                          Spent ₹{fmtCr(sub.ifms ?? 0)} Cr
                                        </span>
                                      </div>
                                    </div>
                                    <span className="shrink-0 self-start rounded bg-[var(--bg-document)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                                      {sp.toFixed(1)}%
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {list.length === 0 && (
                      <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                        No schemes in this band.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && activeTab === "list" && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-surface)] text-xs uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {(
                      [
                        { key: "scheme" as SortKey, label: "Scheme" },
                        { key: "vertical" as SortKey, label: "Vertical" },
                        { key: "re" as SortKey, label: "RE (Cr)" },
                        { key: "spent" as SortKey, label: "Spent (Cr)" },
                        { key: "pct" as SortKey, label: "Utilisation" },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        scope="col"
                        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left font-semibold hover:text-[var(--text-primary)] ${
                          key === "re" || key === "spent" || key === "pct"
                            ? "text-right"
                            : ""
                        }`}
                        onClick={() => handleSort(key)}
                      >
                        {label}
                        <SortIcon col={key} />
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sortedList.map((entry) => {
                    const pct = utilPct(entry);
                    const qp = getQuarterlyProgress(entry);
                    const bucket = bucketForQuarterlyVariance(qp.variancePct);
                    const kind = sponsorshipKind(entry);

                    const barFill =
                      bucket === "critical"
                        ? "bg-rose-500"
                        : bucket === "at_risk"
                          ? "bg-amber-500"
                          : "bg-emerald-500";

                    return (
                      <tr
                        key={entry.id}
                        className="group cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        onClick={() => setSchemeModalEntry(entry)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 shrink-0 rounded-full ${kind === "SS" ? "bg-sky-500" : "bg-orange-500"}`}
                              title={kind === "SS" ? "State Scheme" : "Centrally Sponsored"}
                            />
                            <div>
                              <p className="font-medium leading-snug text-[var(--text-primary)]">
                                {entry.scheme}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">{entry.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {entry.vertical}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                          ₹{fmtCr(effBudget(entry))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                          ₹{fmtCr(entry.ifms)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full ${barFill}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-medium text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                            View →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedList.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-12 text-center text-xs text-[var(--text-muted)]"
                      >
                        No schemes match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SchemeModal
          open={schemeModalEntry !== null}
          onClose={() => setSchemeModalEntry(null)}
          scheme={
            schemeModalEntry
              ? {
                  id: schemeModalEntry.schemeId ?? schemeModalEntry.id,
                  code: schemeModalEntry.id,
                  name: schemeModalEntry.scheme,
                  verticalName: schemeModalEntry.vertical,
                }
              : null
          }
        />
      </div>
    </AppShell>
  );
}
