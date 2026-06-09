"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchKPISubmissions, reviewKpiMeasurement } from "@/src/lib/services/kpiService";
import { fetchFinancialBudgets } from "@/src/lib/services/financialService";
import { KPISubmission, KpiEscalationFlag } from "@/types";
import type { FinancialEntry } from "@/types";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import StatusBadge from "@/src/components/ui/StatusBadge";
import ViewKpiModal from "@/components/kpis/ViewKpiModal";
import EditKpiModal from "@/components/kpis/EditKpiModal";
import { AlertTriangle, Clock, Pencil, Search, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const CHART_KPI_PROGRESS_FILL = "#0d9488";

const MEASUREMENT_PACE_BAR: Record<string, string> = {
  on_track: "var(--alert-success)",
  delayed: "var(--alert-warning)",
  overdue: "var(--alert-critical)",
  none: "var(--text-muted)",
};

const ESCALATION_CONFIG: Record<
  KpiEscalationFlag,
  { label: string; color: string; bg: string; border: string; icon?: boolean }
> = {
  on_track: {
    label: "On track",
    color: "var(--alert-success)",
    bg: "rgba(0,200,83,0.08)",
    border: "rgba(0,200,83,0.35)",
  },
  needs_coordination: {
    label: "Needs coordination",
    color: "var(--alert-warning)",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.35)",
    icon: true,
  },
  needs_acs_decision: {
    label: "Needs ACS decision",
    color: "var(--alert-critical)",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.4)",
    icon: true,
  },
};

function EscalationBadge({ flag }: { flag: KpiEscalationFlag | null | undefined }) {
  if (!flag || flag === "on_track") return null;
  const cfg = ESCALATION_CONFIG[flag];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.25em]"
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.icon && <AlertTriangle className="h-2.5 w-2.5" />}
      {cfg.label}
    </span>
  );
}

function StalenessChip({ staleDays }: { staleDays: number | null | undefined }) {
  if (staleDays == null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
        <Clock className="h-3 w-3" />
        Never updated
      </span>
    );
  }
  const urgent = staleDays > 21;
  const warn = staleDays > 7;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: urgent ? "var(--alert-critical)" : warn ? "var(--alert-warning)" : "var(--text-muted)" }}
    >
      <Clock className="h-3 w-3" />
      {staleDays === 0 ? "Today" : staleDays === 1 ? "1d ago" : `${staleDays}d ago`}
    </span>
  );
}

function VelocityTrail({
  trail,
  type,
  denominator,
}: {
  trail: KPISubmission["velocityTrail"];
  type: string;
  denominator: number | null | undefined;
}) {
  if (!trail || trail.length === 0) return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  const pts = [...trail].reverse().slice(-4);
  if (type === "BINARY") {
    return (
      <span className="flex items-center gap-1">
        {pts.map((p, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.yesValue === true ? "var(--alert-success)" : p.yesValue === false ? "var(--alert-critical)" : "var(--border)" }}
            title={p.measuredAt}
          />
        ))}
      </span>
    );
  }
  const values = pts.map((p) => p.numeratorValue ?? 0);
  const max = Math.max(...values, 1);
  const isFlat = values.length > 1 && values.every((v) => v === values[0]);
  const isGrowing = values.length > 1 && values[values.length - 1] > values[0];
  const color = isFlat && values[0] === 0
    ? "var(--alert-critical)"
    : isFlat
      ? "var(--alert-warning)"
      : isGrowing
        ? "var(--alert-success)"
        : "var(--text-muted)";
  return (
    <span className="flex items-end gap-0.5" title={pts.map((p) => `${p.measuredAt}: ${p.numeratorValue ?? "—"}`).join(" → ")}>
      {pts.map((v, i) => (
        <span
          key={i}
          className="w-2 rounded-sm transition-[height]"
          style={{
            height: `${Math.max(4, Math.round((v.numeratorValue ?? 0) / max * 16))}px`,
            backgroundColor: i === pts.length - 1 ? color : "var(--border)",
          }}
        />
      ))}
      {denominator != null && (
        <span className="ml-1 text-[10px] tabular-nums" style={{ color }}>
          {values[values.length - 1]}/{denominator}
        </span>
      )}
    </span>
  );
}

interface TabConfig {
  id: string;
  label: string;
  filter: (item: KPISubmission) => boolean;
}

function effBudgetEntry(e: FinancialEntry) {
  return e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0);
}

function budgetUtilPct(e: FinancialEntry | undefined): number {
  if (!e) return 0;
  const b = effBudgetEntry(e);
  if (!b || b <= 0) return 0;
  return (e.ifms / b) * 100;
}

function kpiProgressScore(s: KPISubmission): number | null {
  if (s.type === "BINARY") return s.yes === true ? 100 : s.yes === false ? 0 : null;
  const d = s.denominator ?? 0;
  const n = s.numerator ?? 0;
  if (d > 0) return Math.min(100, (n / d) * 100);
  if (s.status === "approved") return 100;
  return null;
}

function KPIsPageContent() {
  const user = useRequireAuth();
  const searchParams = useSearchParams();
  const initialTabFromUrl = searchParams.get("tab");
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [archivedSubmissions, setArchivedSubmissions] = useState<KPISubmission[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [focusScheme, setFocusScheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTabFromUrl ?? "all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [viewKpi, setViewKpi] = useState<KPISubmission | null>(null);
  const [editKpi, setEditKpi] = useState<KPISubmission | null>(null);

  const refreshData = async () => {
    try {
      const [data, archivedData] = await Promise.all([
        fetchKPISubmissions(false),
        fetchKPISubmissions(true)
      ]);
      setSubmissions(data.submissions);
      setArchivedSubmissions(archivedData.submissions);
      return { submissions: data.submissions, archivedSubmissions: archivedData.submissions };
    } catch (e) {
      console.error(e);
      return { submissions: [], archivedSubmissions: [] };
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, archivedData, fin] = await Promise.all([
          fetchKPISubmissions(false),
          fetchKPISubmissions(true),
          fetchFinancialBudgets().catch(() => ({ entries: [] }))
        ]);
        if (!active) return;
        setSubmissions(data.submissions);
        setArchivedSubmissions(archivedData.submissions);
        setFinancialEntries(fin.entries);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const hasReviewablePending = useMemo(
    () => submissions.some((s) => s.status === "submitted_pending" && s.currentUserCanReview),
    [submissions],
  );

  const tabs = useMemo<TabConfig[]>(() => {
    const baseTabs: TabConfig[] = [
      { id: "all", label: "All KPIs", filter: () => true },
      {
        id: "submitted",
        label: "Submitted",
        filter: (item) => item.status === "submitted" || item.status === "submitted_pending",
      },
      {
        id: "approved",
        label: "Approved",
        filter: (item) => item.status === "approved",
      },
      {
        id: "not_submitted",
        label: "Not Submitted",
        filter: (item) => item.status === "not_submitted" || item.status === "draft",
      },
      {
        id: "archived",
        label: "Archived",
        filter: () => true,
      },
    ];
    if (hasReviewablePending) {
      const pendingTab: TabConfig = {
        id: "pending_review",
        label: "Pending Review",
        filter: (item) => item.status === "submitted_pending" && Boolean(item.currentUserCanReview),
      };
      return [baseTabs[0], pendingTab, ...baseTabs.slice(1)];
    }
    return baseTabs;
  }, [hasReviewablePending]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      // If the URL explicitly requested a tab (e.g. ?tab=pending_review), avoid
      // immediately overriding it while data is still loading.
      if (initialTabFromUrl && activeTab === initialTabFromUrl) return;
      setActiveTab(tabs[0]?.id ?? "all");
    }
  }, [tabs, activeTab, initialTabFromUrl]);

  const filtered = useMemo(() => {
    if (activeTab === "archived") {
      return archivedSubmissions.filter((item) => !focusScheme || item.scheme === focusScheme);
    }
    const tab = tabs.find((item) => item.id === activeTab) ?? tabs[0];
    return submissions.filter(tab.filter).filter((item) => !focusScheme || item.scheme === focusScheme);
  }, [submissions, archivedSubmissions, tabs, activeTab, focusScheme]);

  const summary = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter((item) => item.status === "submitted_pending").length;
    const approved = submissions.filter((item) => item.status === "approved").length;
    const awaiting = submissions.filter((item) => item.status === "not_submitted" || item.status === "draft").length;
    const escalated = submissions.filter((item) => item.escalationFlag === "needs_acs_decision").length;
    return { total, pending, approved, awaiting, escalated };
  }, [submissions]);

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;
  const canManageSchemes = user ? hasPermission(user, Permission.MANAGE_SCHEMES) : false;

  const pendingQueue = useMemo(
    () =>
      submissions.filter(
        (item) =>
          item.status === "submitted_pending" &&
          item.currentUserCanReview &&
          (!focusScheme || item.scheme === focusScheme),
      ),
    [submissions, focusScheme],
  );

  const schemeNames = useMemo(() => {
    const set = new Set([
      ...submissions.map((s) => s.scheme.trim()),
      ...archivedSubmissions.map((s) => s.scheme.trim())
    ].filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [submissions, archivedSubmissions]);

  const filteredSchemes = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (!q) return schemeNames;
    return schemeNames.filter((n) => n.toLowerCase().includes(q));
  }, [schemeNames, sidebarQuery]);

  const financialForFocus = useMemo(() => {
    if (!focusScheme) return undefined;
    return financialEntries.find((e) => e.scheme === focusScheme);
  }, [financialEntries, focusScheme]);

  const submissionsForFocus = useMemo(
    () => (focusScheme ? submissions.filter((s) => s.scheme === focusScheme) : []),
    [submissions, focusScheme],
  );

  const schemeAnalytics = useMemo(() => {
    if (!focusScheme) return null;
    const scores = submissionsForFocus.map(kpiProgressScore).filter((x): x is number => x != null);
    const kpiAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const budgetU = budgetUtilPct(financialForFocus);
    const progressBuckets = { on_track: 0, delayed: 0, overdue: 0, none: 0 };
    for (const s of submissionsForFocus) {
      const st = s.measurementProgressStatus;
      if (st === "on_track") progressBuckets.on_track += 1;
      else if (st === "delayed") progressBuckets.delayed += 1;
      else if (st === "overdue") progressBuckets.overdue += 1;
      else progressBuckets.none += 1;
    }
    const vertical = submissionsForFocus[0]?.vertical ?? "—";
    return { kpiAvg, budgetU, progressBuckets, vertical };
  }, [focusScheme, submissionsForFocus, financialForFocus]);

  const compareBarData = useMemo(() => {
    if (!schemeAnalytics) return [];
    return [
      { name: "Budget utilisation", pct: schemeAnalytics.budgetU, fill: "var(--accent)" },
      { name: "KPI progress (est.)", pct: schemeAnalytics.kpiAvg ?? 0, fill: CHART_KPI_PROGRESS_FILL },
    ];
  }, [schemeAnalytics]);

  return (
    <AppShell title="KPI Tracker">
      <div className="flex h-[calc(100vh-64px)] min-h-0 overflow-hidden bg-[var(--bg-document)]">
        <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border)] p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Schemes</p>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Search scheme..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-document)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setFocusScheme(null)}
              className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                focusScheme === null
                  ? "border-[var(--accent)] bg-[var(--bg-content-surface)] shadow-sm"
                  : "border-transparent bg-[var(--bg-content-surface)] text-[var(--text-primary)] hover:brightness-[0.98]"
              }`}
            >
              <span className="font-medium">Full registry</span>
              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">All KPIs · table & reviews</span>
            </button>
            {filteredSchemes.map((name, schemeIndex) => {
              const schemeSubmissions = submissions.filter((s) => s.scheme === name);
              const hasEscalated = schemeSubmissions.some((s) => s.escalationFlag === "needs_acs_decision");
              const hasCoordination = schemeSubmissions.some((s) => s.escalationFlag === "needs_coordination");
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFocusScheme(name)}
                  className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    focusScheme === name
                      ? "border-[var(--accent)] bg-[var(--bg-content-surface)] shadow-sm"
                      : `border-transparent text-[var(--text-primary)] hover:brightness-[0.98] ${
                          (schemeIndex + 1) % 2 === 0 ? "bg-[var(--bg-content-surface)]" : "bg-[var(--bg-alternate-card)]"
                        }`
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {hasEscalated && (
                      <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--alert-critical)]" />
                    )}
                    {!hasEscalated && hasCoordination && (
                      <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--alert-warning)]" />
                    )}
                    <span className="min-w-0 truncate">{name}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-6 px-6 py-6">
            {isViewer && (
              <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Read-only
              </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">HUDD</p>
                <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
                  {focusScheme ? focusScheme : "KPI Performance Monitor"}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {focusScheme
                    ? `${schemeAnalytics?.vertical ?? "—"} · Velocity, staleness & escalation signals.`
                    : "Velocity, staleness & escalation signals across priority schemes."}
                </p>
              </div>
              {user?.role === UserRole.NODAL_OFFICER && (
                <Link
                  href="/kpis/entry"
                  className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
                >
                  Enter KPIs
                </Link>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
              {(focusScheme
                ? [
                    { label: "KPIs (this scheme)", value: submissionsForFocus.length },
                    { label: "Pending Review", value: submissionsForFocus.filter((s) => s.status === "submitted_pending").length },
                    { label: "Approved", value: submissionsForFocus.filter((s) => s.status === "approved").length },
                    { label: "Awaiting Entry", value: submissionsForFocus.filter((s) => s.status === "not_submitted" || s.status === "draft").length },
                    { label: "ACS Escalations", value: submissionsForFocus.filter((s) => s.escalationFlag === "needs_acs_decision").length, alert: true },
                  ]
                : [
                    { label: "Total KPIs", value: summary.total },
                    { label: "Pending Review", value: summary.pending },
                    { label: "Approved", value: summary.approved },
                    { label: "Awaiting Entry", value: summary.awaiting },
                    { label: "ACS Escalations", value: summary.escalated, alert: true },
                  ]
              ).map((card) => (
                <div
                  key={card.label}
                  className={`rounded-2xl border p-4 ${
                    card.alert && (card.value as number) > 0
                      ? "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.06)]"
                      : "border-[var(--border)] bg-[var(--bg-card)]"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">{card.label}</p>
                  <p
                    className="mt-3 text-2xl font-semibold"
                    style={{
                      color:
                        card.alert && (card.value as number) > 0
                          ? "var(--alert-critical)"
                          : "var(--text-primary)",
                    }}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Scheme analytics */}
            {focusScheme && schemeAnalytics && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Budget utilisation vs KPI progress
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Budget from finance snapshots (effective budget vs IFMS). KPI progress is an average of measurable submissions.
                  </p>
                  <div className="mt-4 h-52 w-full">
                    <ResponsiveContainer width="100%" height={208}>
                      <BarChart data={compareBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} unit="%" />
                        <Tooltip
                          formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, ""]}
                          contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", fontSize: 12 }}
                        />
                        <Bar dataKey="pct" name="Value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                          {compareBarData.map((entry, i) => (
                            <Cell key={`compare-bar-${i}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--accent)]" aria-hidden />
                      Budget utilisation
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: CHART_KPI_PROGRESS_FILL }} aria-hidden />
                      KPI progress (est.)
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                    <div>
                      <span className="text-[var(--text-muted)]">IFMS utilisation</span>
                      <p className="font-semibold tabular-nums text-[var(--accent)]">
                        {schemeAnalytics.budgetU.toFixed(1)}%
                        {!financialForFocus && <span className="ml-1 font-normal text-[var(--text-muted)]">(no finance row)</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Avg. KPI score (est.)</span>
                      <p className="font-semibold tabular-nums" style={{ color: CHART_KPI_PROGRESS_FILL }}>
                        {schemeAnalytics.kpiAvg != null ? `${schemeAnalytics.kpiAvg.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Measurement pace</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Latest measurement status across KPIs for this scheme.</p>
                  <div className="mt-6 space-y-3">
                    {(
                      [
                        ["on_track", "On track", schemeAnalytics.progressBuckets.on_track],
                        ["delayed", "Delayed", schemeAnalytics.progressBuckets.delayed],
                        ["overdue", "Overdue", schemeAnalytics.progressBuckets.overdue],
                        ["none", "Not set", schemeAnalytics.progressBuckets.none],
                      ] as const
                    ).map(([key, label, count]) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-[var(--text-primary)]">{label}</span>
                          <span className="tabular-nums text-[var(--text-muted)]">{count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{
                              width: `${submissionsForFocus.length ? (count / submissionsForFocus.length) * 100 : 0}%`,
                              backgroundColor: MEASUREMENT_PACE_BAR[key] ?? "var(--text-muted)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full border px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition ${
                    activeTab === tab.id
                      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "border-[var(--border)] text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Main content */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              {actionMessage && (
                <div className="mb-4 rounded-xl border border-[var(--alert-success)] bg-[rgba(0,200,83,0.1)] px-4 py-2 text-sm text-[var(--alert-success)]">
                  {actionMessage}
                </div>
              )}
              {loading && <div className="text-sm text-[var(--text-muted)]">Loading KPI submissions...</div>}
              {!loading && filtered.length === 0 && (
                <div className="text-sm text-[var(--text-muted)]">No KPI submissions match this filter.</div>
              )}

              {/* Pending review queue — card layout */}
              {!loading && activeTab === "pending_review" && (
                <div className="space-y-4">
                  {pendingQueue.length === 0 && (
                    <div className="text-sm text-[var(--text-muted)]">No KPI submissions awaiting your review.</div>
                  )}
                  {pendingQueue.map((item, index) => (
                    <div
                      key={item.id}
                      className={`cursor-pointer rounded-2xl border border-[var(--border)] p-4 transition hover:brightness-[0.98] ${
                        index % 2 === 0 ? "bg-[var(--bg-content-surface)]" : "bg-[var(--bg-alternate-card)]"
                      }`}
                      onClick={() => setViewKpi(item)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{item.scheme}</p>
                          <h3 className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">{item.description}</h3>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{item.vertical} · {item.category}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <StatusBadge status={item.status} />
                          <EscalationBadge flag={item.escalationFlag} />
                        </div>
                      </div>

                      {/* Signal row */}
                      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-3">
                        <div className="flex items-center gap-2">
                          <StalenessChip staleDays={item.staleDays} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-[var(--text-muted)]" />
                          <VelocityTrail trail={item.velocityTrail} type={item.type} denominator={item.denominator} />
                        </div>
                        {item.bottleneckReason && (
                          <p className="min-w-0 flex-1 text-xs italic text-[var(--text-muted)]">
                            &ldquo;{item.bottleneckReason}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5 text-sm text-[var(--text-muted)]">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Action owner</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.assignedToName?.trim() || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Reviewer</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.reviewerName?.trim() || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Submitted</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.lastUpdated}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Values</p>
                          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                            {item.type === "BINARY" ? (item.yes ? "Yes" : "No") : `${item.numerator ?? 0} / ${item.denominator ?? 0}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Unit</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.unit}</p>
                        </div>
                      </div>
                      {!isViewer && item.latestMeasurementId && item.currentUserCanReview && (
                        <div className="mt-4 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
                            disabled={reviewBusyId === item.id}
                            onClick={async () => {
                              if (!item.latestMeasurementId) return;
                              setReviewBusyId(item.id);
                              try {
                                await reviewKpiMeasurement(item.latestMeasurementId, { decision: "approve" });
                                await refreshData();
                                setActionMessage(`Approved ${item.scheme} — ${item.description}.`);
                              } catch (e: unknown) {
                                setActionMessage(e instanceof Error ? e.message : "Approval failed");
                              } finally {
                                setReviewBusyId(null);
                              }
                            }}
                          >
                            {reviewBusyId === item.id ? "Working..." : "Approve"}
                          </button>
                          <button
                            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
                            disabled={reviewBusyId === item.id}
                            onClick={async () => {
                              if (!item.latestMeasurementId) return;
                              const note = typeof window !== "undefined" ? window.prompt("Rejection note (required)") : null;
                              if (!note?.trim()) {
                                setActionMessage("Rejection cancelled or empty note.");
                                return;
                              }
                              setReviewBusyId(item.id);
                              try {
                                await reviewKpiMeasurement(item.latestMeasurementId, { decision: "reject", note });
                                await refreshData();
                                setActionMessage(`Rejected ${item.scheme} — ${item.description}.`);
                              } catch (e: unknown) {
                                setActionMessage(e instanceof Error ? e.message : "Reject failed");
                              } finally {
                                setReviewBusyId(null);
                              }
                            }}
                          >
                            Reject with Comment
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* All other tabs — signal-first table */}
              {!loading && activeTab !== "pending_review" && filtered.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="py-3 pr-6">Metric</th>
                        <th className="py-3 pr-6">Last update</th>
                        <th className="py-3 pr-6">Trajectory</th>
                        <th className="py-3 pr-6">Action owner</th>
                        <th className="py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] ${
                            index % 2 === 0 ? "bg-[var(--bg-content-surface)]" : "bg-[var(--bg-alternate-card)]"
                          }`}
                          onClick={() => setViewKpi(item)}
                        >
                          <td className="py-3 pr-6">
                            <p className="font-medium leading-snug">{item.description}</p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.scheme} · {item.vertical}</p>
                            {item.monitoringLevel && (
                              <span className="mt-1.5 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-accent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
                                {item.monitoringLevel}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-6">
                            <StalenessChip staleDays={item.staleDays} />
                            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.lastUpdated}</p>
                          </td>
                          <td className="py-3 pr-6">
                            {item.type === "BINARY" ? (
                              <span className="text-base font-bold text-[var(--text-primary)]">
                                {item.yes === true ? "Yes" : item.yes === false ? "No" : "—"}
                              </span>
                            ) : item.type === "OUTCOME" ? (
                              <p className="max-w-xs text-xs font-medium text-[var(--text-primary)]">
                                {item.remarks?.trim() || "—"}
                              </p>
                            ) : item.numerator != null || item.denominator != null ? (
                              <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">
                                {item.numerator ?? 0}
                                {item.denominator != null && <span className="font-bold"> / {item.denominator}</span>}
                                {item.unit && <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">{item.unit}</span>}
                              </p>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-6 text-sm text-[var(--text-muted)]">{item.assignedToName?.trim() || "—"}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={item.status} />
                              {canManageSchemes && (
                                <button
                                  type="button"
                                  title="Edit KPI"
                                  onClick={(e) => { e.stopPropagation(); setEditKpi(item); }}
                                  className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ViewKpiModal
        open={!!viewKpi}
        submission={viewKpi}
        isReviewer={viewKpi?.currentUserCanReview === true}
        onClose={() => setViewKpi(null)}
        onReviewed={async () => {
          const res = await refreshData();
          if (viewKpi) {
            const updated = res.submissions.find((s) => s.id === viewKpi.id) || res.archivedSubmissions.find((s) => s.id === viewKpi.id);
            if (updated) setViewKpi(updated);
          }
        }}
      />

      {canManageSchemes && (
        <EditKpiModal
          open={!!editKpi}
          submission={editKpi}
          onClose={() => setEditKpi(null)}
          onSaved={async () => {
            await refreshData();
            setActionMessage("KPI updated successfully.");
          }}
        />
      )}
    </AppShell>
  );
}

export default function KPIsPage() {
  return (
    <Suspense fallback={
      <AppShell title="KPI Tracker">
        <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[var(--bg-document)]">
          <div className="text-sm text-[var(--text-muted)]">Loading KPI Performance Monitor...</div>
        </div>
      </AppShell>
    }>
      <KPIsPageContent />
    </Suspense>
  );
}
