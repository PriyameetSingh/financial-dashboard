"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Permission, UserRole, hasPermission } from "@/lib/auth";
import { useRequireMyTasksHub } from "@/src/lib/route-guards";
import { hasAnyAssignedActionItems, isDesignatedReviewer } from "@/src/lib/actionItemAssignment";
import {
  BADGE_TONE_CLASS,
  pendingAssignedBadgeState,
  pendingKpiEntryBadgeState,
  pendingKpiReviewBadgeState,
  pendingActionReviewBadgeState,
} from "@/src/lib/myTasksPendingBadges";
import { fetchActionItems } from "@/src/lib/services/actionItemService";
import { fetchKPISubmissions, type KpiLatestMeeting } from "@/src/lib/services/kpiService";
import type { ActionItem, KPISubmission } from "@/types";
import { ArrowRight, ClipboardList, IndianRupee, Layers, ListChecks } from "lucide-react";
import PendanceReportSection from "@/components/pendance-report/PendanceReportSection";

function PendingCountLabel({
  count,
  tone,
  singular,
  plural,
}: {
  count: number;
  tone: "red" | "yellow" | "green" | null;
  singular: string;
  plural: string;
}) {
  const label = count === 1 ? singular : plural;
  const toneClass = tone ? BADGE_TONE_CLASS[tone] : "text-[var(--text-muted)]";
  return (
    <p className={`mt-2 text-xs font-semibold tabular-nums ${toneClass}`}>
      {count} {label}
    </p>
  );
}

export default function MyTasksHubPage() {
  const user = useRequireMyTasksHub();
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [kpiSubmissions, setKpiSubmissions] = useState<KPISubmission[]>([]);
  const [latestKpiMeeting, setLatestKpiMeeting] = useState<KpiLatestMeeting | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadMyTasksData = async () => {
      try {
        const actionItemsData = await fetchActionItems();
        if (active) setActionItems(actionItemsData);
      } catch {
        if (active) setActionItems([]);
      }

      if (hasPermission(user, Permission.ENTER_KPI_DATA)) {
        try {
          const kpiData = await fetchKPISubmissions();
          if (active) {
            setLatestKpiMeeting(kpiData.latestMeeting);
            setKpiSubmissions(kpiData.submissions);
          }
        } catch {
          if (active) {
            setLatestKpiMeeting(null);
            setKpiSubmissions([]);
          }
        }
      } else {
        if (active) {
          setLatestKpiMeeting(null);
          setKpiSubmissions([]);
        }
      }
    };

    void loadMyTasksData();

    const handleDataChanged = () => {
      void loadMyTasksData();
    };

    window.addEventListener("my-tasks-data-changed", handleDataChanged);

    return () => {
      active = false;
      window.removeEventListener("my-tasks-data-changed", handleDataChanged);
    };
  }, [user]);

  const actionItemsBadge = useMemo(
    () => (user ? pendingAssignedBadgeState(actionItems, user, latestKpiMeeting) : { count: 0, tone: null }),
    [actionItems, user, latestKpiMeeting],
  );

  const kpiEntryBadge = useMemo(
    () => pendingKpiEntryBadgeState(kpiSubmissions, latestKpiMeeting),
    [kpiSubmissions, latestKpiMeeting],
  );

  const kpiReviewBadge = useMemo(
    () => pendingKpiReviewBadgeState(kpiSubmissions),
    [kpiSubmissions],
  );

  const actionReviewBadge = useMemo(
    () => (user ? pendingActionReviewBadgeState(actionItems, user) : { count: 0, tone: null }),
    [actionItems, user],
  );

  if (!user) {
    return null;
  }

  const showKpi = hasPermission(user, Permission.ENTER_KPI_DATA);
  const showFinance = hasPermission(user, Permission.ENTER_FINANCIAL_DATA);
  const showBulkFinancial = hasPermission(user, Permission.MANAGE_FINANCIAL_DATA);
  const showActionsByPermission =
    hasPermission(user, Permission.UPDATE_ACTION_ITEMS) ||
    hasPermission(user, Permission.CREATE_ACTION_ITEMS);
  const hasAnyReviewItems = actionItems.some((item) => isDesignatedReviewer(item, user));
  const showActions = showActionsByPermission || hasAnyAssignedActionItems(actionItems, user) || hasAnyReviewItems;

  const isTasuOrVerticalHead = user.role === UserRole.TASU || user.role === UserRole.VERTICAL_HEAD;
  const showKpiReviewButton = isTasuOrVerticalHead || kpiReviewBadge.count > 0;
  const showActionReviewButton = isTasuOrVerticalHead || actionReviewBadge.count > 0;

  return (
    <AppShell title="My tasks">
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <header className="max-w-3xl">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">My tasks</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Jump to the work you own: KPI measurements, financial scheme entry, and decision-tracker items — without
            hunting through the rest of the sidebar.
          </p>
        </header>

        <div className="grid max-w-5xl gap-4 sm:grid-cols-2">
          {showKpi && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-primary)]">
                  <ClipboardList size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[var(--sidebar-text-primary)]">KPI monitoring</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Enter or update measurements assigned to you for the latest dashboard meeting
                    {latestKpiMeeting ? ` (${latestKpiMeeting.meetingDate})` : ""}.
                  </p>
                  <PendingCountLabel
                    count={kpiEntryBadge.count}
                    tone={kpiEntryBadge.tone}
                    singular="KPI still to enter for this meeting"
                    plural="KPIs still to enter for this meeting"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/kpis/entry"
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active-bg)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-primary)] transition hover:opacity-90"
                    >
                      Open KPI entry
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    {showKpiReviewButton && (
                      <Link
                        href={{ pathname: "/kpis", query: { tab: "pending_review" } }}
                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60 hover:text-[var(--sidebar-text-primary)]"
                      >
                        <span>Pending review</span>
                        <span
                          className={`ml-1 text-[11px] font-semibold tabular-nums ${
                            kpiReviewBadge.tone ? BADGE_TONE_CLASS[kpiReviewBadge.tone] : "text-[var(--text-muted)]"
                          }`}
                        >
                          {kpiReviewBadge.count}
                        </span>
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {showActions && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-primary)]">
                  <ListChecks size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[var(--sidebar-text-primary)]">Decision tracker</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    {showActionsByPermission
                      ? "View and update action items assigned to you, upload proof, and track status in one place."
                      : "You have decision items assigned to you. Open one below or go to the full tracker."}
                  </p>
                  <PendingCountLabel
                    count={actionItemsBadge.count}
                    tone={actionItemsBadge.tone}
                    singular="pending action item"
                    plural="pending action items"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/action-items"
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active-bg)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-primary)] transition hover:opacity-90"
                    >
                      Open full action list
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    {showActionReviewButton && (
                      <Link
                        href={{ pathname: "/action-items", query: { filter: "my_tasks" } }}
                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60 hover:text-[var(--sidebar-text-primary)]"
                      >
                        <span>Pending review</span>
                        <span
                          className={`ml-1 text-[11px] font-semibold tabular-nums ${
                            actionReviewBadge.tone
                              ? BADGE_TONE_CLASS[actionReviewBadge.tone]
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {actionReviewBadge.count}
                        </span>
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {showFinance && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-primary)]">
                  <IndianRupee size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[var(--sidebar-text-primary)]">Financial progress</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Record scheme-level expenditure and the finance summary heads you maintain.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/financial/entry/scheme"
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active-bg)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-primary)] transition hover:opacity-90"
                    >
                      Scheme entry
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    <Link
                      href="/financial/entry/summary"
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60 hover:text-[var(--sidebar-text-primary)]"
                    >
                      Summary entry
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    {showBulkFinancial && (
                      <Link
                        href="/financial/entry/bulk"
                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60 hover:text-[var(--sidebar-text-primary)]"
                      >
                        <Layers size={13} aria-hidden />
                        Bulk entry
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {user.role === UserRole.VERTICAL_HEAD && (
          <PendanceReportSection user={user} />
        )}
      </div>
    </AppShell>
  );
}
