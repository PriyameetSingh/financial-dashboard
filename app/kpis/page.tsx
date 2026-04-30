"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchKPISubmissions, reviewKpiMeasurement } from "@/src/lib/services/kpiService";
import { fetchFinancialBudgets } from "@/src/lib/services/financialService";
import { KPISubmission } from "@/types";
import type { FinancialEntry } from "@/types";
import { UserRole } from "@/lib/auth";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PendingBadge from "@/src/components/ui/PendingBadge";
import ViewKpiModal from "@/components/kpis/ViewKpiModal";
import { Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Bar chart: budget (accent) vs KPI (teal) — distinct from near-black text. */
const CHART_KPI_PROGRESS_FILL = "#0d9488";

const MEASUREMENT_PACE_BAR: Record<string, string> = {
  on_track: "var(--alert-success)",
  delayed: "var(--alert-warning)",
  overdue: "var(--alert-critical)",
  none: "var(--text-muted)",
};

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

/** Rough progress score for aggregation (0–100); null if not computable. */
function kpiProgressScore(s: KPISubmission): number | null {
  if (s.type === "BINARY") return s.yes === true ? 100 : s.yes === false ? 0 : null;
  const d = s.denominator ?? 0;
  const n = s.numerator ?? 0;
  if (d > 0) return Math.min(100, (n / d) * 100);
  if (s.status === "approved") return 100;
  return null;
}

export default function KPIsPage() {
  const user = useRequireAuth();
  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [focusScheme, setFocusScheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [viewKpi, setViewKpi] = useState<KPISubmission | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, fin] = await Promise.all([fetchKPISubmissions(), fetchFinancialBudgets().catch(() => ({ entries: [] }))]);
        if (!active) return;
        setSubmissions(data.submissions);
        setFinancialEntries(fin.entries);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
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
      setActiveTab(tabs[0]?.id ?? "all");
    }
  }, [tabs, activeTab]);

  const filtered = useMemo(() => {
    const tab = tabs.find((item) => item.id === activeTab) ?? tabs[0];
    return submissions.filter(tab.filter).filter((item) => !focusScheme || item.scheme === focusScheme);
  }, [submissions, tabs, activeTab, focusScheme]);

  const summary = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter((item) => item.status === "submitted_pending").length;
    const approved = submissions.filter((item) => item.status === "approved").length;
    const awaiting = submissions.filter((item) => item.status === "not_submitted" || item.status === "draft").length;
    return { total, pending, approved, awaiting };
  }, [submissions]);

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;

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
    const set = new Set(submissions.map((s) => s.scheme.trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [submissions]);

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
            {filteredSchemes.map((name, schemeIndex) => (
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
                {name}
              </button>
            ))}
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
                ? `${schemeAnalytics?.vertical ?? "—"} · Budget utilisation vs estimated KPI progress.`
                : "Latest outcome and output submissions across priority schemes."}
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

        <div className="grid gap-4 md:grid-cols-4">
          {(focusScheme
            ? [
                { label: "KPIs (this scheme)", value: submissionsForFocus.length },
                {
                  label: "Pending Review",
                  value: submissionsForFocus.filter((s) => s.status === "submitted_pending").length,
                },
                { label: "Approved", value: submissionsForFocus.filter((s) => s.status === "approved").length },
                {
                  label: "Awaiting Entry",
                  value: submissionsForFocus.filter((s) => s.status === "not_submitted" || s.status === "draft").length,
                },
              ]
            : [
                { label: "Total KPIs", value: summary.total },
                { label: "Pending Review", value: summary.pending },
                { label: "Approved", value: summary.approved },
                { label: "Awaiting Entry", value: summary.awaiting },
              ]
          ).map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{card.value}</p>
            </div>
          ))}
        </div>

        {focusScheme && schemeAnalytics && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Budget utilisation vs KPI progress
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Budget from finance snapshots (effective budget vs IFMS). KPI progress is an average of measurable submissions
                (numeric targets or approved).
              </p>
              <div className="mt-4 h-52 w-full">
                <ResponsiveContainer width="100%" height={208}>
                  <BarChart data={compareBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} unit="%" />
                    <Tooltip
                      formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, ""]}
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
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
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: CHART_KPI_PROGRESS_FILL }}
                    aria-hidden
                  />
                  KPI progress (est.)
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                <div>
                  <span className="text-[var(--text-muted)]">IFMS utilisation</span>
                  <p className="font-semibold tabular-nums text-[var(--accent)]">
                    {schemeAnalytics.budgetU.toFixed(1)}%
                    {!financialForFocus && (
                      <span className="ml-1 font-normal text-[var(--text-muted)]">(no finance row)</span>
                    )}
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

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full border px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition ${activeTab === tab.id
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                : "border-[var(--border)] text-[var(--text-primary)]"
                }`}
            >
              {tab.label}
            </button>
          ))}
          {/* {(focusScheme
            ? submissionsForFocus.filter((s) => s.status === "submitted_pending").length
            : summary.pending) > 0 && (
            <PendingBadge
              count={
                focusScheme
                  ? submissionsForFocus.filter((s) => s.status === "submitted_pending").length
                  : summary.pending
              }
            />
          )} */}
        </div>

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
          {!loading && activeTab === "pending_review" && (
            <div className="space-y-4">
              {pendingQueue.length === 0 && (
                <div className="text-sm text-[var(--text-muted)]">No KPI submissions awaiting your review.</div>
              )}
              {pendingQueue.map((item, index) => (
                <div
                  key={item.id}
                  className={`cursor-pointer rounded-2xl border border-[var(--border)] p-4 transition ${
                    index % 2 === 0 ? "bg-[var(--bg-content-surface)]" : "bg-[var(--bg-alternate-card)]"
                  }`}
                  onClick={() => setViewKpi(item)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{item.scheme}</p>
                      <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{item.description}</h3>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">{item.vertical} · {item.category}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5 text-sm text-[var(--text-muted)]">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Action owner</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{item.assignedToName?.trim() || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Reviewer</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{item.reviewerName?.trim() || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Submitted On</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{item.lastUpdated}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Values</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">
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
                            const data = await fetchKPISubmissions();
                            setSubmissions(data.submissions);
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
                            const data = await fetchKPISubmissions();
                            setSubmissions(data.submissions);
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
          {!loading && activeTab !== "pending_review" && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-3 pr-4">Scheme</th>
                    <th className="py-3 pr-4">Metric</th>
                    <th className="py-3 pr-4">Action owner</th>
                    <th className="py-3 pr-4">Reviewer</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Unit</th>
                    <th className="py-3 pr-4">Last Updated</th>
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
                      <td className="py-3 pr-4 font-medium">{item.scheme}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{item.description}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.vertical} · {item.category}</p>
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{item.assignedToName?.trim() || "—"}</td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{item.reviewerName?.trim() || "—"}</td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{item.type}</td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{item.unit}</td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{item.lastUpdated}</td>
                      <td className="py-3">
                        <StatusBadge status={item.status} />
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
          const data = await fetchKPISubmissions();
          setSubmissions(data.submissions);
          if (viewKpi) {
            const updated = data.submissions.find((s) => s.id === viewKpi.id);
            if (updated) setViewKpi(updated);
          }
        }}
      />
    </AppShell>
  );
}
