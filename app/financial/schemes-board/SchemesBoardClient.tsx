"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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

type SponsorshipKind = "SS" | "CSS" | "CS";

function sponsorshipKind(e: FinancialEntry): SponsorshipKind {
  const t = e.metadata?.sponsorshipType;
  if (t === "STATE") return "SS";
  if (t === "CENTRAL_SECTOR") return "CS";
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
    headerText: "text-red-900 dark:text-red-200",
    countBg: "bg-red-800 text-white dark:bg-red-700",
    barFill: "bg-red-600",
    // High-contrast badge
    badgeBg: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-200",
    badgeText: "", // uses combined with badgeBg
    // Neutral column border, cards get left accent
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-red-600 dark:border-l-red-500",
  },
  at_risk: {
    title: "AT RISK",
    range: "5-15% behind Q target",
    headerBg: "bg-[var(--bg-card)]",
    headerText: "text-amber-950 dark:text-amber-200",
    countBg: "bg-amber-700 text-white dark:bg-amber-600",
    barFill: "bg-amber-600",
    badgeBg: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200",
    badgeText: "",
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-amber-600 dark:border-l-amber-500",
  },
  on_track: {
    title: "ON TRACK",
    range: "Within 5% of Q target",
    headerBg: "bg-[var(--bg-card)]",
    headerText: "text-emerald-900 dark:text-emerald-200",
    countBg: "bg-emerald-800 text-white dark:bg-emerald-700",
    barFill: "bg-emerald-600",
    badgeBg: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200",
    badgeText: "",
    border: "border-[var(--border)]",
    cardBorder: "border-[var(--border)]",
    accentBorder: "border-l-emerald-600 dark:border-l-emerald-500",
  },
};

type ViewTab = "board" | "list";
type SortKey = "default" | "scheme" | "vertical" | "re" | "spent" | "pct" | "bucket";
type SortDir = "asc" | "desc";

export default function SchemesBoardClient() {
  const currentUser = useHydratedCurrentUser();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSponsorship, setSelectedSponsorship] = useState<"ALL" | "STATE" | "CENTRAL" | "CENTRAL_SECTOR">("ALL");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [schemeModalEntry, setSchemeModalEntry] = useState<FinancialEntry | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("board");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [boardSorts, setBoardSorts] = useState<Record<Bucket, "default" | "asc" | "desc">>({
    critical: "default",
    at_risk: "default",
    on_track: "default",
  });

  useEffect(() => {
    setExpandedIds(new Set());
  }, [activeTab]);

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
    let result = entries;

    if (selectedSponsorship !== "ALL") {
      result = result.filter(
        (e) => (e.metadata?.sponsorshipType as string | undefined) === selectedSponsorship
      );
    }

    const q = query.trim().toLowerCase();
    if (!q) return result;

    return result.filter(
      (e) =>
        e.scheme.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.vertical.toLowerCase().includes(q),
    );
  }, [entries, query, selectedSponsorship]);

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
      const sortVal = boardSorts[k];
      if (sortVal === "default") {
        // Sort by how close they are to their quarterly target (best first)
        cols[k].sort((a, b) => {
          const qa = getQuarterlyProgress(a);
          const qb = getQuarterlyProgress(b);
          return qb.variancePct - qa.variancePct;
        });
      } else {
        cols[k].sort((a, b) => {
          const pctA = utilPct(a);
          const pctB = utilPct(b);
          return sortVal === "asc" ? pctA - pctB : pctB - pctA;
        });
      }
    }
    return cols;
  }, [filtered, boardSorts]);

  const totals = useMemo(() => {
    const totalRe = filtered.reduce((s, e) => s + effBudget(e), 0);
    const spent = filtered.reduce((s, e) => s + e.ifms, 0);
    const overallPct = totalRe > 0 ? (spent / totalRe) * 100 : 0;
    const verticalCount = new Set(filtered.map((e) => e.vertical)).size;
    let ss = 0;
    let css = 0;
    let cs = 0;
    for (const e of filtered) {
      const kind = sponsorshipKind(e);
      if (kind === "SS") ss++;
      else if (kind === "CSS") css++;
      else if (kind === "CS") cs++;
    }
    return { totalRe, spent, overallPct, verticalCount, ss, css, cs };
  }, [filtered]);

  const isViewer = isReadOnlyWatermarkUser(currentUser);

  const fmtCr = (n: number) =>
    n >= 100 ? n.toFixed(0) : n.toFixed(1);

  const sortedList = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "default":
          cmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (cmp === 0) {
            cmp = a.scheme.localeCompare(b.scheme);
          }
          break;
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
    if (key === "scheme") {
      if (sortKey === "scheme") {
        setSortKey("default");
        setSortDir("asc");
      } else if (sortKey === "default") {
        setSortKey("scheme");
        setSortDir("desc");
      } else {
        setSortKey("default");
        setSortDir("asc");
      }
    } else {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(filtered.map((e) => e.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col && !(sortKey === "default" && col === "scheme")) {
      return <span className="ml-1 opacity-30">↕</span>;
    }
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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-sm sm:gap-6 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Total RE
                </span>
                <span className="text-base font-black tabular-nums text-[var(--text-primary)]">
                  ₹{fmtCr(totals.totalRe)} Cr
                </span>
              </div>
            </div>
            
            <div className="hidden h-8 w-px bg-[var(--border)] sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Expenditure
                </span>
                <span className="text-base font-black tabular-nums text-[var(--text-primary)]">
                  ₹{fmtCr(totals.spent)} Cr
                </span>
              </div>
            </div>

            <div className="hidden h-8 w-px bg-[var(--border)] sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Utilisation
                </span>
                <span className="text-base font-black tabular-nums text-[var(--text-primary)]">
                  {totals.overallPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>




        {/* Legend / Info Section */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Targets Card */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              QTR Wise Spending Targets
            </h3>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {[
                { label: "Q1", pct: 25, cum: 25 },
                { label: "Q2", pct: 15, cum: 40 },
                { label: "Q3", pct: 20, cum: 60 },
                { label: "Q4", pct: 40, cum: 100 },
              ].map((q) => {
                const isCurrent = getCurrentQuarter() === (q.label === "Q1" ? 1 : q.label === "Q2" ? 2 : q.label === "Q3" ? 3 : 4);
                return (
                  <div
                    key={q.label}
                    className={`flex flex-col items-center rounded-lg py-2 transition-all ${isCurrent
                      ? "bg-blue-600 text-white shadow-lg ring-2 ring-blue-400"
                      : "bg-white dark:bg-slate-800 border border-[var(--border)] text-slate-900 dark:text-slate-100"
                      }`}
                  >
                    <span className="text-[10px] font-bold uppercase">{q.label}</span>
                    <span className="text-sm font-black">{q.pct}%</span>
                    <span className={`text-[9px] font-bold ${isCurrent ? "text-blue-100" : "text-slate-600 dark:text-slate-300"}`}>
                      Σ {q.cum}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Classification Card */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Classification Rules
            </h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full bg-emerald-500 shadow-sm" />
                <span className="text-[11px] font-bold text-[var(--text-primary)]">On Track: &lt;5% behind target</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full bg-amber-500 shadow-sm" />
                <span className="text-[11px] font-bold text-[var(--text-primary)]">At Risk: 5–15% behind target</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full bg-red-500 shadow-sm" />
                <span className="text-[11px] font-bold text-[var(--text-primary)]">Critical: &gt;15% behind target</span>
              </div>
            </div>
          </div>

          {/* Scheme Categories Card */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Scheme Categories
            </h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-sky-500 shadow-sm" />
                  <span className="text-[11px] font-bold text-[var(--text-primary)]">State Sector (SS)</span>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {totals.ss}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-orange-500 shadow-sm" />
                  <span className="text-[11px] font-bold text-[var(--text-primary)]">Centrally Sponsored (CSS)</span>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {totals.css}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-purple-500 shadow-sm" />
                  <span className="text-[11px] font-bold text-[var(--text-primary)]">Central Sector (CS)</span>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {totals.cs}
                </span>
              </div>
            </div>
          </div>

          {/* Current Status Card */}
          <div className="rounded-xl border-2 border-blue-500 bg-blue-700 p-4 shadow-lg">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white">
              Current Target Status
            </h3>
            {(() => {
              const q = getCurrentQuarter();
              const cumulative = getCumulativeTargetUpToQuarter(q) * 100;
              return (
                <div className="mt-2">
                  <p className="text-2xl font-black text-white">
                    Q{q} Target: {cumulative}%
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-blue-100">
                    Cumulative utilization target as of today.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Tab switcher & Global controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1 w-fit">
            {(["board", "list"] as ViewTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${activeTab === tab
                  ? "bg-[var(--bg-document)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--sidebar-text-primary)]"
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

          {!loading && !error && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search schemes or verticals…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-secondary)] shadow-sm"
                />
                <svg
                  className="absolute left-2.5 top-2.5 size-3.5 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <select
                value={selectedSponsorship}
                onChange={(e) => setSelectedSponsorship(e.target.value as any)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-all shadow-sm focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Sponsorships</option>
                <option value="STATE">State Sector</option>
                <option value="CENTRAL">Central Sponsor</option>
                <option value="CENTRAL_SECTOR">Central Sector</option>
              </select>

              <button
                type="button"
                onClick={expandAll}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all shadow-sm active:scale-95"
              >
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                </svg>
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all shadow-sm active:scale-95"
              >
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8h10" strokeLinecap="round" />
                </svg>
                Collapse All
              </button>
            </div>
          )}
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBoardSorts((prev) => {
                            const current = prev[key];
                            let next: "default" | "asc" | "desc" = "default";
                            if (current === "default") next = "desc";
                            else if (current === "desc") next = "asc";
                            else next = "default";
                            return { ...prev, [key]: next };
                          });
                        }}
                        className="flex size-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text-primary)] transition-all"
                        title={`Sort by utilization % (currently: ${
                          boardSorts[key] === "default"
                            ? "Default Target Variance"
                            : boardSorts[key] === "desc"
                            ? "Descending %"
                            : "Ascending %"
                        })`}
                      >
                        {boardSorts[key] === "default" && (
                          <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 10h18M3 16h18" />
                          </svg>
                        )}
                        {boardSorts[key] === "desc" && (
                          <svg className="size-4 text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h14M3 18h10M19 12v6m0 0l-3-3m3 3l3-3" />
                          </svg>
                        )}
                        {boardSorts[key] === "asc" && (
                          <svg className="size-4 text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h10M3 12h14M3 18h18M19 18V12m0 0l-3 3m3-3l3 3" />
                          </svg>
                        )}
                      </button>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${ui.countBg}`}
                      >
                        {list.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                    {list.map((entry) => {
                      const pct = utilPct(entry);
                      const kind = sponsorshipKind(entry);
                      const qp = getQuarterlyProgress(entry);
                      const entryBucket = bucketForQuarterlyVariance(qp.variancePct);
                      const hasSubs = !!entry.subschemes?.length;
                      const expanded = expandedIds.has(entry.id);

                      const cardClass = `rounded-lg border bg-[var(--bg-document)] p-3 shadow-sm outline-none ring-offset-2 ring-offset-[var(--bg-document)] focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] ${ui.cardBorder} ${ui.accentBorder} border-l-4`;

                      return (
                        <div
                          key={entry.id}
                          className={cardClass}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="min-w-0 flex-1 cursor-pointer"
                              role="button"
                              tabIndex={0}
                              onClick={() => setSchemeModalEntry(entry)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSchemeModalEntry(entry);
                                }
                              }}
                            >
                              <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                                {entry.scheme}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                {entry.vertical} · {entry.id}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.badgeBg}`}
                              >
                                {bucketLabel(entryBucket)} — {pct.toFixed(1)}%
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(entry.id);
                                }}
                                className={`flex size-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--sidebar-text-primary)] transition-transform ${expanded ? "rotate-180" : ""
                                  }`}
                              >
                                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div
                            className="cursor-pointer"
                            onClick={() => setSchemeModalEntry(entry)}
                          >
                            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                              RE ₹{fmtCr(effBudget(entry))} Cr · Spent ₹
                              {fmtCr(entry.ifms)} Cr
                            </p>

                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`mt-0.5 size-2 shrink-0 rounded-full ${kind === "SS" ? "bg-sky-500" : kind === "CS" ? "bg-purple-500" : "bg-orange-500"
                                  }`}
                                title={
                                  kind === "SS"
                                    ? "State Scheme"
                                    : kind === "CS"
                                      ? "Central Sector"
                                      : "Centrally Sponsored"
                                }
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
                          </div>

                          {/* Expanded Content */}
                          {expanded && (
                            <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              {/* Quarterly Progress */}
                              {(() => {
                                const qp = getQuarterlyProgress(entry);
                                const isBehind = qp.variancePct < 0;
                                const isOnTrack = qp.variancePct >= -5;

                                const accentColors = isBehind
                                  ? isOnTrack
                                    ? { border: "border-l-amber-600 dark:border-l-amber-500", text: "text-amber-950 dark:text-amber-200" }
                                    : { border: "border-l-red-600 dark:border-l-red-500", text: "text-red-900 dark:text-red-200" }
                                  : { border: "border-l-emerald-600 dark:border-l-emerald-500", text: "text-emerald-900 dark:text-emerald-200" };
                                const barColor = isBehind
                                  ? isOnTrack ? "bg-amber-500" : "bg-red-500"
                                  : "bg-emerald-500";
                                const varianceColor = qp.variancePct >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : accentColors.text;

                                return (
                                  <div className={`rounded-md border border-[var(--border)] bg-[var(--bg-card)] border-l-4 ${accentColors.border} ${accentColors.text} px-2 py-1.5`}>
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
                                        Q{qp.quarter} allocation: ₹{fmtCr((qp.cumulativeTargetPct / 100) * effBudget(entry))} Cr
                                      </span>
                                      <span className={`text-[9px] font-semibold tabular-nums ${varianceColor}`}>
                                        {qp.variancePct >= 0 ? "+" : ""}
                                        {qp.variancePct.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Sub-schemes */}
                              {hasSubs && entry.subschemes && (
                                <div className="space-y-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Sub-schemes
                                  </p>
                                  <ul className="space-y-2">
                                    {entry.subschemes.map((sub) => {
                                      const sp = subUtilPct(sub);
                                      const re = subEffBudget(sub);
                                      return (
                                        <li
                                          key={sub.id}
                                          className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 text-[11px]"
                                        >
                                          <span
                                            className={`mt-1 size-1.5 shrink-0 rounded-full ${kind === "SS"
                                              ? "bg-sky-400"
                                              : kind === "CS"
                                                ? "bg-purple-400"
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
                                </div>
                              )}
                            </div>
                          )}

                          {!expanded && (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(entry.id);
                                }}
                                className={`text-[10px] font-semibold ${ui.headerText} hover:underline`}
                              >
                                {hasSubs ? "View progress & sub-schemes >" : "View quarterly progress >"}
                              </button>
                            </div>
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
                    <th scope="col" className="w-10 px-4 py-3" />
                    {(
                      [
                        { key: "scheme" as SortKey, label: "Scheme" },
                        { key: "vertical" as SortKey, label: "Vertical" },
                        { key: "re" as SortKey, label: "RE (Cr)" },
                        { key: "spent" as SortKey, label: "Expenditure (Cr)" },
                        { key: "pct" as SortKey, label: "Utilisation" },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        scope="col"
                        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left font-semibold hover:text-[var(--sidebar-text-primary)] ${key === "re" || key === "spent" || key === "pct"
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
                    const expanded = expandedIds.has(entry.id);

                    const barFill =
                      bucket === "critical"
                        ? "bg-red-500"
                        : bucket === "at_risk"
                          ? "bg-amber-500"
                          : "bg-emerald-500";

                    return (
                      <Fragment key={entry.id}>
                        <tr
                          className="group cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                          onClick={() => setSchemeModalEntry(entry)}
                        >
                          <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleExpand(entry.id)}
                              className={`flex size-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-transform ${expanded ? "rotate-180" : ""
                                }`}
                            >
                              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`size-2 shrink-0 rounded-full ${kind === "SS" ? "bg-sky-500" : kind === "CS" ? "bg-purple-500" : "bg-orange-500"
                                  }`}
                                title={
                                  kind === "SS"
                                    ? "State Scheme"
                                    : kind === "CS"
                                      ? "Central Sector"
                                      : "Centrally Sponsored"
                                }
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
                        {expanded && (
                          <tr className="bg-[var(--bg-surface)]/20">
                            <td colSpan={7} className="p-4 border-b border-[var(--border)]">
                              <div className="mx-auto max-w-5xl grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {/* Quarterly Progress */}
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Quarterly Target Details
                                  </p>
                                  {(() => {
                                    const qp = getQuarterlyProgress(entry);
                                    const isBehind = qp.variancePct < 0;
                                    const isOnTrack = qp.variancePct >= -5;

                                    const accentColors = isBehind
                                      ? isOnTrack
                                        ? { border: "border-l-amber-600 dark:border-l-amber-500", text: "text-amber-950 dark:text-amber-200" }
                                        : { border: "border-l-red-600 dark:border-l-red-500", text: "text-red-900 dark:text-red-200" }
                                      : { border: "border-l-emerald-600 dark:border-l-emerald-500", text: "text-emerald-900 dark:text-emerald-200" };
                                    const barColor = isBehind
                                      ? isOnTrack ? "bg-amber-500" : "bg-red-500"
                                      : "bg-emerald-500";
                                    const varianceColor = qp.variancePct >= 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : accentColors.text;

                                    return (
                                      <div className={`rounded-lg border border-[var(--border)] bg-[var(--bg-card)] border-l-4 ${accentColors.border} ${accentColors.text} p-3`}>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                                            Q{qp.quarter} Target Progress
                                          </span>
                                          <span className={`text-xs font-bold tabular-nums ${accentColors.text}`}>
                                            {qp.actualPct.toFixed(1)}% / {qp.cumulativeTargetPct.toFixed(0)}%
                                          </span>
                                        </div>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                                          <div
                                            className={`h-full rounded-full ${barColor}`}
                                            style={{
                                              width: `${Math.min(100, (qp.actualPct / qp.cumulativeTargetPct) * 100)}%`,
                                            }}
                                          />
                                        </div>
                                        <div className="mt-2 flex items-center justify-between">
                                          <span className="text-xs text-[var(--text-muted)]">
                                            Q{qp.quarter} allocation: ₹{fmtCr((qp.cumulativeTargetPct / 100) * effBudget(entry))} Cr
                                          </span>
                                          <span className={`text-xs font-bold tabular-nums ${varianceColor}`}>
                                            {qp.variancePct >= 0 ? "+" : ""}
                                            {qp.variancePct.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Sub-schemes */}
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Sub-schemes
                                  </p>
                                  {entry.subschemes && entry.subschemes.length > 0 ? (
                                    <ul className="space-y-2">
                                      {entry.subschemes.map((sub) => {
                                        const sp = subUtilPct(sub);
                                        const re = subEffBudget(sub);
                                        return (
                                          <li
                                            key={sub.id}
                                            className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs"
                                          >
                                            <span
                                              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${kind === "SS"
                                                ? "bg-sky-400"
                                                : kind === "CS"
                                                  ? "bg-purple-400"
                                                  : "bg-orange-400"
                                                }`}
                                            />
                                            <div className="min-w-0 flex-1">
                                              <p className="font-semibold text-[var(--text-primary)]">
                                                {sub.name}
                                              </p>
                                              <p className="text-[10px] text-[var(--text-muted)]">
                                                {sub.code}
                                              </p>
                                              <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-secondary)]">
                                                <span>RE ₹{fmtCr(re)} Cr</span>
                                                <span>
                                                  Spent ₹{fmtCr(sub.ifms ?? 0)} Cr
                                                </span>
                                              </div>
                                            </div>
                                            <span className="shrink-0 self-start rounded bg-[var(--bg-document)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                                              {sp.toFixed(1)}%
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : (
                                    <div className="flex h-[88px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-4 text-xs text-[var(--text-muted)]">
                                      No sub-schemes configured
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {sortedList.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
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
