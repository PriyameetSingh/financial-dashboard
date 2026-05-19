"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Permission, hasPermission } from "@/lib/auth";
import { useRequireMyTasksHub } from "@/src/lib/route-guards";
import {
  filterAssignedPendingActionItems,
  hasAnyAssignedActionItems,
} from "@/src/lib/actionItemAssignment";
import { fetchActionItems } from "@/src/lib/services/actionItemService";
import type { ActionItem } from "@/types";
import { ArrowRight, ClipboardList, IndianRupee, Layers, ListChecks } from "lucide-react";

export default function MyTasksHubPage() {
  const user = useRequireMyTasksHub();
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchActionItems()
      .then((data) => {
        if (active) setActionItems(data);
      })
      .catch(() => {
        if (active) setActionItems([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const assignedPending = useMemo(
    () => (user ? filterAssignedPendingActionItems(actionItems, user) : []),
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
  const showActions = showActionsByPermission || hasAnyAssignedActionItems(actionItems, user);

  return (
    <AppShell title="My tasks">
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <header className="max-w-3xl">
          <h1 className="text-xl font-semibold text-[var(--sidebar-text-primary)]">My tasks</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Jump to the work you own: KPI measurements, financial scheme entry, and decision-tracker items — without
            hunting through the rest of the sidebar.
          </p>
        </header>

        <div className="grid max-w-3xl gap-4 sm:grid-cols-1">
          {showKpi && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-primary)]">
                  <ClipboardList size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[var(--sidebar-text-primary)]">KPI monitoring</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Enter or update measurements assigned to you as KPI action owner.
                  </p>
                  <Link
                    href="/kpis/entry"
                    className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active-bg)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-primary)] transition hover:opacity-90"
                  >
                    Open KPI entry
                    <ArrowRight size={14} aria-hidden />
                  </Link>
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
                  {/* {assignedPending.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                      {assignedPending.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/action-items/${item.id}`}
                            className="flex flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-xs transition hover:bg-[var(--sidebar-hover-bg)]/50"
                          >
                            <span className="font-medium text-[var(--sidebar-text-primary)]">{item.title}</span>
                            <span className="text-[var(--text-muted)]">
                              Due {item.dueDate} · {item.status.replace(/_/g, " ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )} */}
                  <Link
                    href="/action-items"
                    className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active-bg)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-primary)] transition hover:opacity-90"
                  >
                    Open full action list
                    <ArrowRight size={14} aria-hidden />
                  </Link>
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
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60"
                    >
                      Summary entry
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                    {showBulkFinancial && (
                      <Link
                        href="/financial/entry/bulk"
                        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--sidebar-hover-bg)]/60"
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
      </div>
    </AppShell>
  );
}
