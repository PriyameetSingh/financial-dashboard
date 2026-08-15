"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchKPISubmissions, reviewKpiMeasurement, reviewKpiCompletion } from "@/src/lib/services/kpiService";
import { fetchFinancialBudgets } from "@/src/lib/services/financialService";
import { KPISubmission, KpiEscalationFlag, KpiCompletionStatus } from "@/types";
import type { FinancialEntry } from "@/types";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PromptModal from "@/src/components/ui/PromptModal";
import ViewKpiModal from "@/components/kpis/ViewKpiModal";
import EditKpiModal from "@/components/kpis/EditKpiModal";
import { AlertTriangle, CheckCircle2, Clock, Inbox, Menu, Pencil, Search, TrendingUp, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORICAL, CHART_AXIS, CHART_GRID, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "@/src/lib/chart-tokens";

/*
 * Reskin Gate C.
 *
 * The two badge configs below used to carry a colour, a background and a border
 * each, as `rgba()` literals — a fixed green, amber and red that ignored the
 * tenant palette and, being tuned for a white page, sat at roughly 3.5:1 on a
 * dark one. They are now `ax-chip` tones, which is the borrowed ActionCard
 * treatment: a tint, a foreground measured against that tint, and the same
 * label and icon as before. Nothing about which badge appears when has changed.
 */
const CHART_KPI_PROGRESS_FILL = CATEGORICAL[1];

const MEASUREMENT_PACE_BAR: Record<string, string> = {
  on_track: "var(--ax-status-ok)",
  delayed: "var(--ax-status-warning)",
  overdue: "var(--ax-status-critical)",
  none: "var(--ax-muted)",
};

const ESCALATION_CONFIG: Record<
  KpiEscalationFlag,
  { label: string; chip: string; icon?: boolean }
> = {
  on_track: {
    label: "On track",
    chip: "ax-chip-ok",
  },
  needs_coordination: {
    label: "Needs coordination",
    chip: "ax-chip-warning",
    icon: true,
  },
  needs_acs_decision: {
    label: "Needs ACS decision",
    chip: "ax-chip-critical",
    icon: true,
  },
};

function EscalationBadge({ flag }: { flag: KpiEscalationFlag | null | undefined }) {
  if (!flag || flag === "on_track") return null;
  const cfg = ESCALATION_CONFIG[flag];
  return (
    <span
      className={`ax-chip ${cfg.chip} text-[9px] font-semibold uppercase tracking-[0.25em]`}
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

const COMPLETION_BADGE_CONFIG: Record<KpiCompletionStatus, { label: string; chip: string }> = {
  completed: { label: "Completed", chip: "ax-chip-ok" },
  pending_review: { label: "Completion Pending", chip: "ax-chip-warning" },
  rejected: { label: "Completion Rejected", chip: "ax-chip-critical" },
};

function CompletionBadge({ status }: { status: KpiCompletionStatus }) {
  const cfg = COMPLETION_BADGE_CONFIG[status];
  return (
    <span className={`ax-chip ${cfg.chip} text-[9px] font-bold uppercase tracking-[0.2em]`}>
      {status === "completed" && <CheckCircle2 className="h-2.5 w-2.5" />}
      {status === "pending_review" && <Clock className="h-2.5 w-2.5" />}
      {status === "rejected" && <AlertTriangle className="h-2.5 w-2.5" />}
      {cfg.label}
    </span>
  );
}

function TrajectoryValue({ item }: { item: KPISubmission }) {
  if (item.type === "BINARY") {
    return (
      <span className="text-base font-bold text-[var(--text-primary)]">
        {item.yes === true ? "Yes" : item.yes === false ? "No" : "—"}
      </span>
    );
  }
  if (item.type === "OUTCOME") {
    return (
      <p className="max-w-xs text-xs font-medium text-[var(--text-primary)]">
        {item.remarks?.trim() || "—"}
      </p>
    );
  }
  if (item.numerator != null || item.denominator != null) {
    return (
      <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">
        {item.numeratorUnit && item.denominatorUnit && item.numeratorUnit !== item.denominatorUnit ? (
          <>
            {item.numerator ?? 0} <span className="text-xs font-normal text-[var(--text-muted)]">{item.numeratorUnit}</span>
            {item.denominator != null && (
              <>
                <span className="font-bold"> / </span>
                {item.denominator} <span className="text-xs font-normal text-[var(--text-muted)]">{item.denominatorUnit}</span>
              </>
            )}
          </>
        ) : (
          <>
            {item.numerator ?? 0}
            {item.denominator != null && <span className="font-bold"> / {item.denominator}</span>}
            {item.unit && <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">{item.unit}</span>}
          </>
        )}
      </p>
    );
  }
  return <span className="text-[var(--text-muted)]">—</span>;
}

interface KpiStatusCellProps {
  item: KPISubmission;
  isViewer: boolean;
  canManageSchemes: boolean;
  completeBusyId: string | null;
  onApproveCompletion: (item: KPISubmission) => void;
  onRejectCompletion: (item: KPISubmission) => void;
  onEdit: (item: KPISubmission) => void;
}

function KpiStatusCell({
  item,
  isViewer,
  canManageSchemes,
  completeBusyId,
  onApproveCompletion,
  onRejectCompletion,
  onEdit,
}: KpiStatusCellProps) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.status} />
        {item.isSelfApproved && (
          <span className="ax-chip ax-chip-ok text-[9px] font-bold uppercase tracking-[0.2em]">
            Self-Approved
          </span>
        )}
        {item.completionStatus && (
          <CompletionBadge status={item.completionStatus} />
        )}
      </div>
      {!isViewer && (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.currentUserCanReviewCompletion && (
            <>
              <button
                type="button"
                title="Approve completion request"
                disabled={completeBusyId === item.id}
                onClick={(e) => { e.stopPropagation(); onApproveCompletion(item); }}
                className="rounded-lg bg-[var(--text-primary)] px-2 py-1 text-[11px] font-semibold text-[var(--bg-primary)] disabled:opacity-50"
              >
                Approve Completion
              </button>
              <button
                type="button"
                title="Reject completion request (note required)"
                disabled={completeBusyId === item.id}
                onClick={(e) => { e.stopPropagation(); onRejectCompletion(item); }}
                className="ax-chip ax-chip-critical text-[11px] font-semibold disabled:opacity-50"
              >
                Reject Completion
              </button>
            </>
          )}
          {canManageSchemes && (
            <button
              type="button"
              title="Edit KPI"
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] hover:text-[var(--text-primary)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const [completeBusyId, setCompleteBusyId] = useState<string | null>(null);
  const [viewKpi, setViewKpi] = useState<KPISubmission | null>(null);
  const [editKpi, setEditKpi] = useState<KPISubmission | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rejectState, setRejectState] = useState<{ kind: "review" | "completion"; item: KPISubmission } | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);

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
        id: "completed",
        label: "Completed",
        filter: (item) => item.completionStatus === "completed",
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
    const completed = submissions.filter((item) => item.completionStatus === "completed").length;
    return { total, pending, approved, awaiting, completed };
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

  const schemeStats = useMemo(() => {
    const map = new Map<string, { pending: number; escalated: number }>();
    for (const s of submissions) {
      const key = s.scheme.trim();
      if (!key) continue;
      const entry = map.get(key) ?? { pending: 0, escalated: 0 };
      if (s.status === "submitted_pending") entry.pending += 1;
      if (s.escalationFlag === "needs_acs_decision") entry.escalated += 1;
      map.set(key, entry);
    }
    return map;
  }, [submissions]);

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
      { name: "Budget utilisation", pct: schemeAnalytics.budgetU, fill: CATEGORICAL[0] },
      { name: "KPI progress (est.)", pct: schemeAnalytics.kpiAvg ?? 0, fill: CHART_KPI_PROGRESS_FILL },
    ];
  }, [schemeAnalytics]);

  const handleApproveCompletion = (item: KPISubmission) => {
    setCompleteBusyId(item.id);
    setActionMessage(null);
    reviewKpiCompletion(item.id, { decision: "approve" })
      .then(async () => {
        await refreshData();
        setActionMessage(`Approved completion for ${item.scheme} — ${item.description}.`);
      })
      .catch((err: unknown) => {
        setActionMessage(err instanceof Error ? err.message : "Approval failed");
      })
      .finally(() => setCompleteBusyId(null));
  };

  const handleRejectCompletion = (item: KPISubmission) => {
    setRejectState({ kind: "completion", item });
  };

  const handleEditKpi = (item: KPISubmission) => {
    setEditKpi(item);
  };

  const confirmReject = async (note: string) => {
    const ctx = rejectState;
    if (!ctx) return;
    setRejectBusy(true);
    try {
      if (ctx.kind === "review") {
        if (!ctx.item.latestMeasurementId) return;
        setReviewBusyId(ctx.item.id);
        await reviewKpiMeasurement(ctx.item.latestMeasurementId, { decision: "reject", note });
        await refreshData();
        setActionMessage(`Rejected ${ctx.item.scheme} — ${ctx.item.description}.`);
      } else {
        setCompleteBusyId(ctx.item.id);
        await reviewKpiCompletion(ctx.item.id, { decision: "reject", note });
        await refreshData();
        setActionMessage(`Rejected completion for ${ctx.item.scheme} — ${ctx.item.description}.`);
      }
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setRejectBusy(false);
      setReviewBusyId(null);
      setCompleteBusyId(null);
      setRejectState(null);
    }
  };

  return (
    <AppShell title="KPI Tracker">
      <div className="flex h-[calc(100vh-64px)] min-h-0 overflow-hidden bg-[var(--bg-document)]">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="ax-scrim fixed inset-0 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-card)] transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="border-b border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Schemes</p>
              <button
                type="button"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close schemes panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
              onClick={() => { setFocusScheme(null); setSidebarOpen(false); }}
              className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                focusScheme === null
                  ? "border-[var(--accent)] bg-[var(--bg-content-surface)] shadow-sm"
                  : "border-transparent bg-[var(--bg-content-surface)] text-[var(--text-primary)] hover:brightness-[0.98]"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-medium">Full registry</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">All KPIs · table & reviews</span>
                </span>
              </span>
            </button>
            {filteredSchemes.map((name, schemeIndex) => {
              const stats = schemeStats.get(name);
              const pendingCount = stats?.pending ?? 0;
              const escalatedCount = stats?.escalated ?? 0;
              const hasEscalated = escalatedCount > 0;
              const hasCoordination = submissions.some(
                (s) => s.scheme === name && s.escalationFlag === "needs_coordination",
              );
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setFocusScheme(name); setSidebarOpen(false); }}
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
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {(pendingCount > 0 || escalatedCount > 0) && (
                      <span className="flex shrink-0 items-center gap-1">
                        {pendingCount > 0 && (
                          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full ax-chip ax-chip-warning px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                            {pendingCount}
                          </span>
                        )}
                        {escalatedCount > 0 && (
                          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full ax-chip ax-chip-critical px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                            {escalatedCount}
                          </span>
                        )}
                      </span>
                    )}
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
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="mt-0.5 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 text-[var(--text-primary)] transition hover:bg-[var(--bg-content-surface)] md:hidden"
                  aria-label="Open schemes panel"
                >
                  <Menu className="h-4 w-4" />
                </button>
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
                    { label: "Completed", value: submissionsForFocus.filter((s) => s.completionStatus === "completed").length },
                    { label: "Not Submitted", value: submissionsForFocus.filter((s) => s.status === "not_submitted" || s.status === "draft").length, muted: true },
                  ]
                : [
                    { label: "Total KPIs", value: summary.total },
                    { label: "Pending Review", value: summary.pending },
                    { label: "Approved", value: summary.approved },
                    { label: "Completed", value: summary.completed },
                    { label: "Not Submitted", value: summary.awaiting, muted: true },
                  ]
              ).map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">{card.label}</p>
                  <p
                    className="mt-3 text-2xl font-semibold"
                    style={{
                      color: card.muted && (card.value as number) > 0
                        ? "var(--alert-warning)"
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
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_AXIS }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: CHART_AXIS }} unit="%" />
                        <Tooltip
                          formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, ""]}
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
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
                              backgroundColor: MEASUREMENT_PACE_BAR[key] ?? "var(--ax-muted)",
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
                <div className="ax-chip ax-chip-ok mb-4 w-full px-4 py-2 text-sm">
                  {actionMessage}
                </div>
              )}
              {loading && <div className="text-sm text-[var(--text-muted)]">Loading KPI submissions...</div>}
              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-document)] text-[var(--text-muted)]">
                    <Inbox className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">No KPI submissions match this filter</p>
                  <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">
                    Try switching to a different tab, clearing the scheme filter, or check back after the next reporting cycle.
                  </p>
                </div>
              )}

              {/* Pending review queue — card layout */}
              {!loading && activeTab === "pending_review" && (
                <div className="space-y-4">
                  {pendingQueue.length === 0 && (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-document)] text-[var(--text-muted)]">
                        <CheckCircle2 className="h-5 w-5" />
                      </span>
                      <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">No KPI submissions awaiting your review</p>
                      <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">
                        You're all caught up. New submissions from nodal officers will appear here for approval.
                      </p>
                    </div>
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
                          <div className="flex items-center gap-2">
                            <StatusBadge status={item.status} />
                            {item.isSelfApproved && (
                              <span className="ax-chip ax-chip-ok text-[9px] font-bold uppercase tracking-[0.2em]">
                                Self-Approved
                              </span>
                            )}
                          </div>
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
                          <p className="text-[10px] uppercase tracking-[0.3em]">Owner (Reviewer)</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.reviewerName?.trim() || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Action owner</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.assignedToName?.trim() || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Submitted</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{item.lastUpdated}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Values</p>
                          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                            {item.type === "BINARY" ? (
                              item.yes ? "Yes" : "No"
                            ) : item.numeratorUnit && item.denominatorUnit && item.numeratorUnit !== item.denominatorUnit ? (
                              `${item.numerator ?? 0} ${item.numeratorUnit} / ${item.denominator ?? 0} ${item.denominatorUnit}`
                            ) : (
                              `${item.numerator ?? 0} / ${item.denominator ?? 0}`
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em]">Unit</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">
                            {item.numeratorUnit && item.denominatorUnit && item.numeratorUnit !== item.denominatorUnit ? (
                              `${item.numeratorUnit} (Num) / ${item.denominatorUnit} (Den)`
                            ) : (
                              item.unit
                            )}
                          </p>
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
                            onClick={() => {
                              if (!item.latestMeasurementId) return;
                              setRejectState({ kind: "review", item });
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

              {/* All other tabs — signal-first table (desktop) */}
              {!loading && activeTab !== "pending_review" && filtered.length > 0 && (
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="py-3 pr-6">Metric</th>
                        <th className="py-3 pr-6">Last update</th>
                        <th className="py-3 pr-6">Trajectory</th>
                        <th className="py-3 pr-6">Owner</th>
                        <th className="py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] ${
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
                            {item.staleDays != null && (
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.lastUpdated}</p>
                            )}
                          </td>
                          <td className="py-3 pr-6">
                            <TrajectoryValue item={item} />
                          </td>
                          <td className="py-3 pr-6 text-sm text-[var(--text-muted)]">{item.reviewerName?.trim() || "—"}</td>
                          <td className="py-3">
                            <KpiStatusCell
                              item={item}
                              isViewer={isViewer}
                              canManageSchemes={canManageSchemes}
                              completeBusyId={completeBusyId}
                              onApproveCompletion={handleApproveCompletion}
                              onRejectCompletion={handleRejectCompletion}
                              onEdit={handleEditKpi}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* All other tabs — stacked card layout (mobile) */}
              {!loading && activeTab !== "pending_review" && filtered.length > 0 && (
                <div className="space-y-4 md:hidden">
                  {filtered.map((item, index) => (
                    <div
                      key={item.id}
                      className={`cursor-pointer rounded-2xl border border-[var(--border)] p-4 transition hover:brightness-[0.98] ${
                        index % 2 === 0 ? "bg-[var(--bg-content-surface)]" : "bg-[var(--bg-alternate-card)]"
                      }`}
                      onClick={() => setViewKpi(item)}
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{item.scheme} · {item.vertical}</p>
                      <h3 className="mt-1 text-base font-semibold leading-snug text-[var(--text-primary)]">{item.description}</h3>
                      {item.monitoringLevel && (
                        <span className="mt-1.5 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-accent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
                          {item.monitoringLevel}
                        </span>
                      )}

                      <dl className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Last update</dt>
                          <dd className="flex flex-col items-end text-right">
                            <StalenessChip staleDays={item.staleDays} />
                            {item.staleDays != null && (
                              <span className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.lastUpdated}</span>
                            )}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Trajectory</dt>
                          <dd className="text-right">
                            <TrajectoryValue item={item} />
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Owner</dt>
                          <dd className="text-sm text-[var(--text-primary)]">{item.reviewerName?.trim() || "—"}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 border-t border-[var(--border)] pt-3">
                        <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Status</p>
                        <KpiStatusCell
                          item={item}
                          isViewer={isViewer}
                          canManageSchemes={canManageSchemes}
                          completeBusyId={completeBusyId}
                          onApproveCompletion={handleApproveCompletion}
                          onRejectCompletion={handleRejectCompletion}
                          onEdit={handleEditKpi}
                        />
                      </div>
                    </div>
                  ))}
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

      <PromptModal
        open={!!rejectState}
        title={rejectState?.kind === "completion" ? "Reject completion request" : "Reject submission"}
        message={
          rejectState?.kind === "completion"
            ? "Add a note explaining why this completion request is being rejected. The requester will see this note."
            : "Add a note explaining why this submission is being rejected. The nodal officer will see this note."
        }
        placeholder="Rejection note (required)..."
        confirmLabel={rejectState?.kind === "completion" ? "Reject Completion" : "Reject with Comment"}
        tone="danger"
        busy={rejectBusy}
        onCancel={() => { if (!rejectBusy) setRejectState(null); }}
        onConfirm={(note) => confirmReject(note)}
      />
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
