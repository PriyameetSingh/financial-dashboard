"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import { ArrowDown, ArrowUp, ArrowUpDown, Gauge, Lightbulb, Star, TriangleAlert } from "lucide-react";
import { formatCurrency } from "@/lib/tenant-config/format";
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORICAL, CHART_AXIS, CHART_GRID, CHART_REFERENCE_LINE } from "@/src/lib/chart-tokens";

type SchemeFilter =
  | "all"
  | "PMAY-U"
  | "MSBY"
  | "SUJALA"
  | "SBM"
  | "Urban Mobility"
  | "Storm Water Drainage"
  | "AMRUT 2.0"
  | "Sanitation"
  | "Samruddha Sahara";

type EfficiencyTier = "efficient" | "balanced" | "inefficient" | "na";

type ExecutionRow = {
  key: string;
  /** Bold primary label in table */
  scheme: string;
  /** Subtitle / programme */
  programme: string;
  expenditureCr: number | null;
  financialPct: number;
  physicalPct: number;
  /** Which filter pill includes this row */
  filterTags: SchemeFilter[];
};

type CostCard = {
  key: string;
  label: string;
  valueDisplay: string;
  unit: string;
  footer: string;
  tier: "good" | "mid" | "bad";
};

type RiskInsight = {
  id: string;
  tier: "risk" | "good" | "watch";
  text: string;
};

const SCHEME_FILTERS: { id: SchemeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PMAY-U", label: "PMAY-U" },
  { id: "MSBY", label: "MSBY" },
  { id: "SUJALA", label: "SUJALA" },
  { id: "SBM", label: "SBM" },
  { id: "Urban Mobility", label: "Urban Mobility" },
  { id: "Storm Water Drainage", label: "Storm Water Drainage" },
  { id: "AMRUT 2.0", label: "AMRUT 2.0" },
  { id: "Sanitation", label: "Sanitation" },
  { id: "Samruddha Sahara", label: "Samruddha Sahara" },
];

/** Static figures aligned with dashboard screenshots */
const EXECUTION_ROWS: ExecutionRow[] = [
  {
    key: "sbm",
    scheme: "SBM",
    programme: "SBM",
    expenditureCr: 85.19,
    financialPct: 23.81,
    physicalPct: 31,
    filterTags: ["SBM"],
  },
  {
    key: "sujala",
    scheme: "SUJALA",
    programme: "SUJALA",
    expenditureCr: 805.455,
    financialPct: 99.69,
    physicalPct: 98.52,
    filterTags: ["SUJALA"],
  },
  {
    key: "fstp",
    scheme: "FSTP",
    programme: "Sanitation",
    expenditureCr: 99.99,
    financialPct: 99.99,
    physicalPct: 99,
    filterTags: ["Sanitation"],
  },
  {
    key: "swm",
    scheme: "SWM",
    programme: "Sanitation",
    expenditureCr: 211,
    financialPct: 100,
    physicalPct: 99,
    filterTags: ["Sanitation"],
  },
  {
    key: "storm-drain",
    scheme: "Storm Drain",
    programme: "Storm Water Drainage",
    expenditureCr: 330,
    financialPct: 100,
    physicalPct: 80,
    filterTags: ["Storm Water Drainage"],
  },
  {
    key: "amrut",
    scheme: "AMRUT 2.0",
    programme: "AMRUT 2.0",
    expenditureCr: 844.87,
    financialPct: 89,
    physicalPct: 55,
    filterTags: ["AMRUT 2.0"],
  },
  {
    key: "urban-mobility",
    scheme: "Urban Mobility",
    programme: "Urban Mobility",
    expenditureCr: 331.25,
    financialPct: 98.88,
    physicalPct: 43,
    filterTags: ["Urban Mobility"],
  },
  {
    key: "pmay",
    scheme: "PMAY-U",
    programme: "PMAY-U",
    expenditureCr: 200.68,
    financialPct: 25.22,
    physicalPct: 10.14,
    filterTags: ["PMAY-U"],
  },
  {
    key: "msby",
    scheme: "MSBY",
    programme: "MSBY",
    expenditureCr: 1166.4,
    financialPct: 97.2,
    physicalPct: 22,
    filterTags: ["MSBY"],
  },
  {
    key: "sewerage",
    scheme: "Sewerage",
    programme: "Samruddha Sahara",
    expenditureCr: 300,
    financialPct: 100,
    physicalPct: 5,
    filterTags: ["Samruddha Sahara"],
  },
  {
    key: "garima",
    scheme: "GARIMA",
    programme: "Sanitation",
    expenditureCr: null,
    financialPct: 0,
    physicalPct: 97,
    filterTags: ["Sanitation"],
  },
  {
    key: "led-light",
    scheme: "LED Light",
    programme: "Urban Mobility",
    expenditureCr: null,
    financialPct: 0,
    physicalPct: 63,
    filterTags: ["Urban Mobility"],
  },
];

const COST_CARDS: CostCard[] = [
  {
    key: "pmay-cost",
    label: "PMAY-U",
    valueDisplay: "₹0.21 Cr",
    unit: "per house completed",
    footer: "975 houses completed of 9,620 grounded",
    tier: "bad",
  },
  {
    key: "msby-cost",
    label: "MSBY",
    valueDisplay: "₹17.94 Cr",
    unit: "per project completed",
    footer: "65 of 284 infra projects completed",
    tier: "bad",
  },
  {
    key: "sujala-cost",
    label: "SUJALA",
    valueDisplay: "₹7,153",
    unit: "per tap connection",
    footer: "11.26 lakh households with tap connections",
    tier: "mid",
  },
  {
    key: "sbm-cost",
    label: "SBM",
    valueDisplay: "₹31,981",
    unit: "per IHHL toilet constructed",
    footer: "26,950 IHHLs constructed",
    tier: "good",
  },
  {
    key: "urban-cost",
    label: "URBAN MOBILITY",
    valueDisplay: "₹1.14 Cr",
    unit: "per electric bus deployed",
    footer: "290 electric buses deployed",
    tier: "bad",
  },
  {
    key: "amrut-cost",
    label: "AMRUT 2.0",
    valueDisplay: "₹18.77 Cr",
    unit: "per ULB covered",
    footer: "45 ULBs covered under AMRUT 2.0",
    tier: "bad",
  },
  {
    key: "fstp-cost",
    label: "FSTP",
    valueDisplay: "₹0.84 Cr",
    unit: "per FSTP operational",
    footer: "119 FSTPs managed by MSG/FSG",
    tier: "mid",
  },
  {
    key: "swm-cost",
    label: "SWM",
    valueDisplay: "₹12,71,084",
    unit: "per MT/day capacity",
    footer: "2,037 of 2,955 wards with 100% D2D collection",
    tier: "mid",
  },
];

const RISK_INSIGHTS: RiskInsight[] = [
  {
    id: "1",
    tier: "risk",
    text: "MSBY shows 97% financial progress but only 22% project completion — critical implementation bottleneck despite near-full budget utilisation.",
  },
  {
    id: "2",
    tier: "risk",
    text: "PMAY-U has spent ₹200.68 Cr (25% of RE) but only 975 houses completed of 9,620 grounded — execution gap persists.",
  },
  {
    id: "3",
    tier: "good",
    text: "SUJALA (Water Supply) near-perfect: 98.52% household coverage achieved at 99.7% expenditure — end-of-FY alignment.",
  },
  {
    id: "4",
    tier: "watch",
    text: "SBM delivers 31% physical progress at 24% expenditure — reasonable alignment; scaling up still needed.",
  },
  {
    id: "5",
    tier: "watch",
    text: "FSTP & SWM show excellent alignment: both at ~99% physical progress matching near-full expenditure.",
  },
  {
    id: "6",
    tier: "risk",
    text: "Sewerage & Drainage now at 100% expenditure but near-zero physical progress — funds fully disbursed ahead of ground work.",
  },
  {
    id: "7",
    tier: "watch",
    text: "End-of-FY spending surge: State Sector Schemes at 98% utilisation (up from 87% at 61st meeting).",
  },
  {
    id: "8",
    tier: "watch",
    text: "Urban Mobility (CRUT) at 99% expenditure but 43% physical progress — spending accelerated ahead of deployment.",
  },
];

function computeScore(physicalPct: number, financialPct: number): number | null {
  if (financialPct <= 0) return null;
  return physicalPct / financialPct;
}

function tierFromScore(score: number | null): EfficiencyTier {
  if (score === null) return "na";
  if (score >= 1.2) return "efficient";
  if (score >= 0.8) return "balanced";
  return "inefficient";
}

function tierBarClass(tier: EfficiencyTier): string {
  switch (tier) {
    case "efficient":
      return "ax-fill-ok";
    case "balanced":
      return "ax-fill-warning";
    case "inefficient":
      return "ax-fill-critical";
    default:
      return "ax-fill-critical opacity-80";
  }
}

function costTierValueClass(tier: CostCard["tier"]): string {
  if (tier === "good") return "ax-tone-ok";
  if (tier === "mid") return "ax-tone-warning";
  return "ax-tone-critical";
}

function formatExpenditureCr(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 3, withUnit: false });
}

function formatPct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace(/\.?0+$/, "")}%`;
}

type SortKey = "scheme" | "expenditure" | "financial" | "physical" | "score";
type SortDir = "asc" | "desc";

function matchesFilter(row: ExecutionRow, filter: SchemeFilter): boolean {
  if (filter === "all") return true;
  return row.filterTags.includes(filter);
}

type ScatterPoint = {
  key: string;
  name: string;
  physicalPct: number;
  financialPct: number;
  fill: string;
};

function scatterColor(score: number | null): string {
  const t = tierFromScore(score);
  if (t === "efficient") return "var(--ax-status-ok)";
  if (t === "balanced") return "var(--ax-status-warning)";
  return "var(--ax-status-critical)";
}

export default function ExecutionEfficiencyClient() {
  const currentUser = useHydratedCurrentUser();
  const [schemeFilter, setSchemeFilter] = useState<SchemeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const isViewer = isReadOnlyWatermarkUser(currentUser);

  const visibleRows = useMemo(
    () => EXECUTION_ROWS.filter((r) => matchesFilter(r, schemeFilter)),
    [schemeFilter],
  );

  const tableRows = useMemo(() => {
    const enriched = visibleRows.map((r) => {
      const score = computeScore(r.physicalPct, r.financialPct);
      return { ...r, score, tier: tierFromScore(score) };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...enriched].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "scheme":
          cmp = a.scheme.localeCompare(b.scheme);
          break;
        case "expenditure": {
          const av = a.expenditureCr ?? -1;
          const bv = b.expenditureCr ?? -1;
          cmp = av - bv;
          break;
        }
        case "financial":
          cmp = a.financialPct - b.financialPct;
          break;
        case "physical":
          cmp = a.physicalPct - b.physicalPct;
          break;
        case "score": {
          const as = a.score ?? -Infinity;
          const bs = b.score ?? -Infinity;
          cmp = as - bs;
          break;
        }
        default:
          break;
      }
      return cmp * dir;
    });
  }, [visibleRows, sortKey, sortDir]);

  const scatterData: ScatterPoint[] = useMemo(
    () =>
      visibleRows
        .filter((r) => r.financialPct > 0)
        .map((r) => {
          const score = computeScore(r.physicalPct, r.financialPct);
          return {
            key: r.key,
            name: r.scheme,
            physicalPct: r.physicalPct,
            financialPct: r.financialPct,
            fill: scatterColor(score),
          };
        }),
    [visibleRows],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "scheme" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="size-3.5 text-[var(--ax-nav-active)]" aria-hidden />
    ) : (
      <ArrowDown className="size-3.5 text-[var(--ax-nav-active)]" aria-hidden />
    );
  };

  return (
    <AppShell title="Execution Efficiency">
      <div className="relative space-y-8 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">
            Read-only
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--ax-muted)]">Financial vs physical</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            <Gauge className="size-7 shrink-0 text-[var(--ax-nav-active)]" aria-hidden />
            Execution Efficiency
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ax-muted)]">
            Financial vs Physical Progress · 2025-26 ·{" "}
            <span className="italic">Combined metric methodology under discussion</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SCHEME_FILTERS.map((f) => {
            const active = schemeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSchemeFilter(f.id)}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "ax-accent-panel"
                    : "border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--ax-muted)] hover:border-[var(--ax-muted)]/40 hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <section className="overflow-hidden rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Financial vs Physical Progress</h2>
              <p className="mt-0.5 text-xs text-[var(--ax-muted)]">
                X-axis: physical % · Y-axis: financial % · Reference lines at 50%
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[var(--ax-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="ax-fill-ok size-2 rounded-full" aria-hidden />
                Efficient (Score ≥ 1.2)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="ax-fill-warning size-2 rounded-full" aria-hidden />
                Balanced (Score 0.8 – 1.2)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="ax-fill-critical size-2 rounded-full" aria-hidden />
                Inefficient (Score &lt; 0.8)
              </span>
            </div>
          </div>

          <div className="relative min-h-[380px] w-full">
            <div className="pointer-events-none absolute left-12 right-4 top-10 z-10 grid h-[calc(100%-4.5rem)] grid-cols-2 grid-rows-2 gap-0 text-[10px] font-medium leading-snug text-[var(--ax-muted)]">
              <div className="flex items-start justify-start pr-2 pt-0">
                <span className="inline-flex max-w-[9rem] items-start gap-1">
                  <TriangleAlert className="ax-tone-warning mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>High Spend Low Progress</span>
                </span>
              </div>
              <div className="flex items-start justify-end pl-2 pt-0 text-right">
                <span className="inline-flex max-w-[9rem] flex-row-reverse items-start gap-1">
                  <Star className="ax-tone-ok mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>High Spend High Progress</span>
                </span>
              </div>
              <div className="flex items-end justify-start pr-2 pb-0">
                <span className="inline-flex max-w-[9rem] items-start gap-1">
                  <TriangleAlert className="ax-tone-warning mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>Low Spend Low Progress</span>
                </span>
              </div>
              <div className="flex items-end justify-end pl-2 pb-0 text-right">
                <span className="inline-flex max-w-[9rem] flex-row-reverse items-start gap-1">
                  <Star className="ax-tone-ok mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>Low Spend High Progress</span>
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} opacity={0.6} />
                <XAxis
                  type="number"
                  dataKey="physicalPct"
                  name="Physical"
                  unit="%"
                  domain={[0, 105]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                  label={{ value: "Physical Progress (%)", position: "bottom", offset: 18, fill: CHART_AXIS, fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="financialPct"
                  name="Financial"
                  unit="%"
                  domain={[0, 105]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                  label={{
                    value: "Financial (%)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    fill: CHART_AXIS,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine x={50} stroke={CHART_REFERENCE_LINE} strokeDasharray="4 4" strokeOpacity={0.7} />
                <ReferenceLine y={50} stroke={CHART_REFERENCE_LINE} strokeDasharray="4 4" strokeOpacity={0.7} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as ScatterPoint;
                    return (
                      <div
                        className="rounded-lg border border-[var(--color-divider)] px-3 py-2 text-xs shadow-md"
                        style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
                      >
                        <p className="font-semibold">{p.name}</p>
                        <p className="mt-1 tabular-nums text-[var(--ax-muted)]">
                          Physical: {p.physicalPct.toFixed(2)}%
                        </p>
                        <p className="tabular-nums text-[var(--ax-muted)]">Financial: {p.financialPct.toFixed(2)}%</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill={CATEGORICAL[0]}>
                  {scatterData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                  <LabelList dataKey="name" position="top" offset={6} fill="var(--color-text)" fontSize={10} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] shadow-sm">
          <div className="border-b border-[var(--color-divider)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Scheme Execution Efficiency</h2>
            <p className="mt-0.5 text-xs text-[var(--ax-muted)]">
              Score = Physical% ÷ Financial% · &gt; 1.2 Efficient · 0.8 – 1.2 Balanced · &lt; 0.8 Inefficient
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-divider)] bg-[var(--color-bg)]/30 text-[11px] uppercase tracking-wide text-[var(--ax-muted)]">
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("scheme")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-text)]"
                    >
                      Scheme
                      <SortIcon column="scheme" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("expenditure")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-text)]"
                    >
                      Expend. (Cr)
                      <SortIcon column="expenditure" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("financial")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-text)]"
                    >
                      Financial%
                      <SortIcon column="financial" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("physical")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-text)]"
                    >
                      Physical%
                      <SortIcon column="physical" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("score")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[var(--color-text)]"
                    >
                      Score
                      <SortIcon column="score" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const physDisplayTier = row.tier === "na" ? "inefficient" : row.tier;
                  return (
                    <tr key={row.key} className="border-b border-[var(--color-divider)]/80 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--color-text)]">{row.scheme}</div>
                        <div className="text-xs text-[var(--ax-muted)]">{row.programme}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--color-text)]">{formatExpenditureCr(row.expenditureCr)}</td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[140px] flex-col gap-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                            <div
                              className="ax-fill-muted h-full rounded-full"
                              style={{ width: `${Math.min(100, row.financialPct)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--ax-muted)]">
                            {row.financialPct <= 0 ? "0%" : formatPct(row.financialPct)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[140px] flex-col gap-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                            <div
                              className={["h-full rounded-full", tierBarClass(physDisplayTier)].join(" ")}
                              style={{ width: `${Math.min(100, row.physicalPct)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--ax-muted)]">{formatPct(row.physicalPct)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.score === null ? (
                          <span className="inline-flex rounded-full border border-[var(--color-divider)] px-2.5 py-0.5 text-xs font-medium text-[var(--ax-muted)]">
                            N/A
                          </span>
                        ) : (
                          <span
                            className={[
                              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                              row.tier === "efficient" && "ax-chip ax-chip-ok",
                              row.tier === "balanced" && "ax-chip ax-chip-warning",
                              row.tier === "inefficient" && "ax-chip ax-chip-critical",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {row.score.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-base font-bold text-[var(--color-text)]">Cost Efficiency Indicators</h2>
          <p className="mt-1 text-sm text-[var(--ax-muted)]">Cost per output unit = Total Expenditure ÷ Physical Output</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {COST_CARDS.map((c) => (
              <div
                key={c.key}
                className="rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)]/20 px-4 py-4 shadow-sm"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ax-muted)]">{c.label}</p>
                <p className={["mt-2 text-2xl font-bold tabular-nums", costTierValueClass(c.tier)].join(" ")}>{c.valueDisplay}</p>
                <p className="mt-1 text-sm text-[var(--color-text)]">{c.unit}</p>
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--ax-muted)]">{c.footer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ax-chip ax-chip-warning">
              <Lightbulb className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">Execution Risk Insights</h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--ax-muted)]">
                {RISK_INSIGHTS.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span
                      className={[
                        "mt-2 size-2 shrink-0 rounded-full",
                        item.tier === "risk" && "ax-fill-critical",
                        item.tier === "good" && "ax-fill-ok",
                        item.tier === "watch" && "ax-fill-warning",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-hidden
                    />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
