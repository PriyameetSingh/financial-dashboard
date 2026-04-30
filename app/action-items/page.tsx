"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AiAlertsCard from "@/components/command-centre/AiAlertsCard";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchActionItems, updateActionItem } from "@/src/lib/services/actionItemService";
import { ActionItem, ActionItemStatus } from "@/types";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import SearchableUserSelector from "@/src/components/ui/SearchableUserSelector";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PriorityBadge from "@/src/components/ui/PriorityBadge";

const STATUS_FILTERS: { id: string; label: string; match: (status: ActionItemStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "pending", label: "Pending Action", match: (status) => ["OPEN", "IN_PROGRESS", "PROOF_UPLOADED"].includes(status) },
  { id: "review", label: "Under Review", match: (status) => status === "UNDER_REVIEW" },
  { id: "completed", label: "Completed", match: (status) => status === "COMPLETED" },
  { id: "overdue", label: "Overdue", match: (status) => status === "OVERDUE" },
];

const STATUS_STEPS: ActionItemStatus[] = ["OPEN", "IN_PROGRESS", "PROOF_UPLOADED", "UNDER_REVIEW", "COMPLETED"];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-[var(--alert-critical)]",
  High: "bg-[var(--alert-warning)]",
  Medium: "bg-blue-500",
  Low: "bg-[var(--text-muted)]",
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** True when this user is one of the item's reviewers (`users.code` or display name). */
function isDesignatedReviewer(item: ActionItem, u: { id: string; name: string }): boolean {
  if (item.reviewers?.length) {
    return item.reviewers.some(
      (r) =>
        (!!r.code && r.code.trim().toLowerCase() === u.id.trim().toLowerCase()) ||
        normalize(r.name) === normalize(u.name),
    );
  }
  const code = item.reviewerUserCode?.trim().toLowerCase();
  if (code && code === u.id.trim().toLowerCase()) return true;
  return normalize(item.reviewer) === normalize(u.name);
}

function lastActivityMs(item: ActionItem): number {
  if (item.updates?.length) {
    return Math.max(...item.updates.map((u) => new Date(u.timestamp).getTime()));
  }
  return new Date(item.dueDate).getTime();
}

export default function ActionItemsPage() {
  const user = useRequireAuth();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [pageTab, setPageTab] = useState<"list" | "tracker">("list");
  const [trackerActivity, setTrackerActivity] = useState<
    "all" | "recent_7" | "recent_30" | "inactive_14" | "inactive_30"
  >("all");
  const [trackerStatus, setTrackerStatus] = useState<string>("all");
  const [reassignItem, setReassignItem] = useState<ActionItem | null>(null);
  const [reassignPerformers, setReassignPerformers] = useState<string[]>([""]);
  const [reassignReviewers, setReassignReviewers] = useState<string[]>([""]);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const pickAnotherUserId = (exclude: string) => directoryUsers.find((u) => u.id !== exclude)?.id ?? "";

  const openReassignModal = (item: ActionItem) => {
    const perfCodes =
      item.performers?.map((p) => p.code).filter((c): c is string => Boolean(c)) ?? [];
    const revCodes =
      item.reviewers?.map((r) => r.code).filter((c): c is string => Boolean(c)) ?? [];
    const assign =
      perfCodes[0] ||
      item.assignedToUserCode?.trim() ||
      directoryUsers.find((u) => normalize(u.name) === normalize(item.assignedTo))?.id ||
      directoryUsers[0]?.id ||
      "";
    let rev =
      revCodes[0] ||
      item.reviewerUserCode?.trim() ||
      directoryUsers.find((u) => normalize(u.name) === normalize(item.reviewer))?.id ||
      "";
    if (!rev) rev = pickAnotherUserId(assign);
    if (rev === assign) rev = pickAnotherUserId(assign) || rev;
    setReassignPerformers(perfCodes.length > 0 ? perfCodes : [assign]);
    setReassignReviewers(revCodes.length > 0 ? revCodes : [rev]);
    setReassignError(null);
    setReassignItem(item);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, roster] = await Promise.all([fetchActionItems(), fetchDirectoryUsers()]);
        if (!active) return;
        setItems(data);
        setDirectoryUsers(roster);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  /** Full list for every role; only per-item actions are gated by assignment / permissions. */
  const listItems = useMemo(() => (user ? items : []), [user, items]);

  const filtered = useMemo(() => {
    const activeFilter = STATUS_FILTERS.find((entry) => entry.id === filter) ?? STATUS_FILTERS[0];
    return listItems.filter((item) => {
      const matchesQuery =
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.vertical.toLowerCase().includes(query.toLowerCase()) ||
        item.schemeId.toLowerCase().includes(query.toLowerCase());
      const matchesVertical = verticalFilter === "all" || item.vertical === verticalFilter;
      const matchesAssignee = assigneeFilter === "all" || item.assignedTo === assigneeFilter;
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      const matchesDue = (() => {
        if (dueFilter === "all") return true;
        const due = new Date(item.dueDate);
        const now = new Date();
        if (dueFilter === "overdue") return due < now;
        if (dueFilter === "week") {
          const week = new Date();
          week.setDate(now.getDate() + 7);
          return due >= now && due <= week;
        }
        if (dueFilter === "month") {
          const month = new Date();
          month.setDate(now.getDate() + 30);
          return due >= now && due <= month;
        }
        return true;
      })();
      return matchesQuery && activeFilter.match(item.status) && matchesVertical && matchesAssignee && matchesPriority && matchesDue;
    });
  }, [listItems, query, filter, verticalFilter, assigneeFilter, priorityFilter, dueFilter]);

  const trackerFiltered = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return listItems.filter((item) => {
      if (trackerStatus !== "all" && item.status !== trackerStatus) return false;
      const last = lastActivityMs(item);
      const age = now - last;
      if (trackerActivity === "recent_7") return age <= 7 * day;
      if (trackerActivity === "recent_30") return age <= 30 * day;
      if (trackerActivity === "inactive_14") return age > 14 * day;
      if (trackerActivity === "inactive_30") return age > 30 * day;
      return true;
    });
  }, [listItems, trackerActivity, trackerStatus]);

  const stats = useMemo(() => {
    const total = listItems.length;
    const overdue = listItems.filter((item) => item.status === "OVERDUE").length;
    const completed = listItems.filter((item) => item.status === "COMPLETED").length;
    const dueThisWeek = listItems.filter((item) => {
      const due = new Date(item.dueDate);
      const now = new Date();
      const week = new Date();
      week.setDate(now.getDate() + 7);
      return due >= now && due <= week;
    }).length;
    return { total, overdue, dueThisWeek, completed };
  }, [listItems]);

  const verticalOptions = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.vertical)))], [items]);
  const assigneeOptions = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.assignedTo)))], [items]);
  const priorityOptions = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.priority)))], [items]);

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;
  const showStats = !!user;
  const canReassignActionItems =
    !!user && !isViewer && hasPermission(user, Permission.UPDATE_ACTION_ITEMS);

  return (
    <AppShell title="Action Items">
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Priority Actions</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Key Decisions from last dashboard Meetings </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Follow up on critical directives, approvals, and escalations across HUDD schemes.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPageTab("list")}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] transition ${
                  pageTab === "list"
                    ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setPageTab("tracker")}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] transition ${
                  pageTab === "tracker"
                    ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                Decision tracker
              </button>
            </div>
          </div>
          {user?.role === UserRole.TASU && (
            <Link
              href="/action-items/create"
              className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
            >
              Create Item
            </Link>
          )}
        </div>

        {pageTab === "tracker" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <select
                value={trackerActivity}
                onChange={(e) => setTrackerActivity(e.target.value as typeof trackerActivity)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="all">All activity</option>
                <option value="recent_7">Recent activity (7d)</option>
                <option value="recent_30">Recent activity (30d)</option>
                <option value="inactive_14">Inactive &gt; 14 days</option>
                <option value="inactive_30">Inactive &gt; 30 days</option>
              </select>
              <select
                value={trackerStatus}
                onChange={(e) => setTrackerStatus(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="all">All statuses</option>
                {(["OPEN", "IN_PROGRESS", "PROOF_UPLOADED", "UNDER_REVIEW", "COMPLETED", "OVERDUE"] as const).map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <AiAlertsCard />
          </div>
        )}

        {pageTab === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setFilter(entry.id)}
              className={`rounded-full border px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition ${filter === entry.id
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        )}

        {pageTab === "list" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by scheme or title"
            className="min-w-[220px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          <select
            value={verticalFilter}
            onChange={(event) => setVerticalFilter(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
          >
            {verticalOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Vertical" : option}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
          >
            {assigneeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Assigned to" : option}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
          >
            {priorityOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Priority" : option}
              </option>
            ))}
          </select>
          <select
            value={dueFilter}
            onChange={(event) => setDueFilter(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
          >
            <option value="all">Due Date</option>
            <option value="week">Due this week</option>
            <option value="month">Due this month</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        )}

        {pageTab === "list" && showStats && (
          <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 text-sm text-[var(--text-muted)]">
            <span>Total: <strong className="text-[var(--text-primary)]">{stats.total}</strong></span>
            <span>Overdue: <strong className="text-[var(--alert-critical)]">{stats.overdue}</strong></span>
            <span>Due This Week: <strong className="text-[var(--text-primary)]">{stats.dueThisWeek}</strong></span>
            <span>Completed: <strong className="text-[var(--text-primary)]">{stats.completed}</strong></span>
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
            Loading action items...
          </div>
        )}

        {pageTab === "list" && !loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
            No action items match your current filters.
          </div>
        )}

        {pageTab === "list" && !loading && filtered.length > 0 && (
          <div className="grid gap-4 md:grid-cols-1">
            {filtered.map((item, index) => {
              const currentStatus = item.status === "OVERDUE" ? "OPEN" : item.status;
              const currentIndex = STATUS_STEPS.indexOf(currentStatus);
              const cardToneClasses =
                index % 2 === 0
                  ? "border-[var(--border)] bg-[var(--bg-card)]"
                  : "border-[var(--border)] bg-[var(--bg-alternate-card)]";
              return (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-2xl border p-5 transition hover:border-[var(--border-strong)] ${cardToneClasses}`}
                >
                  {/* <div className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_COLORS[item.priority] ?? "bg-[var(--border)]"}`} /> */}
                  
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={item.priority} size="md" />
                        <span className="inline-flex max-w-full items-center rounded-full border border-[var(--border)] bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-[var(--accent-text)]">
                          {item.vertical}
                        </span>
                        {item.status === "OVERDUE" && (
                          <span className="inline-flex items-center rounded-full border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-[var(--alert-critical)]">
                            {item.daysOverdue ?? 1} days overdue
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold leading-snug text-[var(--text-primary)]">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={item.status} size="md" />
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">{item.schemeId}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-normal text-[var(--text-secondary)]">
                    <span>Assigned to {item.assignedTo}</span>
                    <span>·</span>
                    <span>Reviewer {item.reviewer}</span>
                    <span>·</span>
                    <span>Due {item.dueDate}</span>
                    <span>·</span>
                    <span>{item.vertical}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em]">
                    {STATUS_STEPS.map((step, index) => (
                      <span
                        key={step}
                        className={`rounded-full border px-2.5 py-1 leading-none ${index <= currentIndex ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-card)]" : "border-[var(--border-strong)] text-[var(--text-secondary)]"}`}
                      >
                        {step.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/action-items/${item.id}`}
                      className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                    >
                      View Details
                    </Link>
                    {/* {user?.role === UserRole.NODAL_OFFICER && !isViewer && (
                      <>
                        <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">Update Status</button>
                        <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">Upload Proof</button>
                      </>
                    )} */}
                    {canReassignActionItems && (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                        onClick={() => openReassignModal(item)}
                      >
                        Reassign
                      </button>
                    )}
                    {user &&
                      hasPermission(user, Permission.APPROVE_ACTION_ITEMS) &&
                      !isViewer &&
                      item.status === "UNDER_REVIEW" &&
                      isDesignatedReviewer(item, user) && (
                      <>
                        <button type="button" className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]">
                          Approve
                        </button>
                        <button type="button" className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pageTab === "tracker" && !loading && trackerFiltered.length === 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
            No items match the tracker filters.
          </div>
        )}

        {pageTab === "tracker" && !loading && trackerFiltered.length > 0 && (
          <div className="space-y-5">
            {trackerFiltered.map((item, index) => {
              const cardToneClasses =
                index % 2 === 0
                  ? "border-[var(--border)] bg-[var(--bg-card)]"
                  : "border-[var(--border)] bg-[var(--bg-alternate-card)]";
              const sorted = [...(item.updates ?? [])].sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
              );
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 transition hover:border-[var(--border-strong)] ${cardToneClasses}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{item.title}</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {item.vertical} · {item.schemeId} · Due {item.dueDate}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Status updates</p>
                    {sorted.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">No recorded updates yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-3 border-l-2 border-[var(--border)] pl-4">
                        {sorted.map((u, idx) => (
                          <li key={u.id ?? `${item.id}-u-${idx}`} className="relative">
                            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--text-primary)]" />
                            <p className="text-xs font-medium text-[var(--text-primary)]">
                              {u.timestamp}
                              {u.actor ? ` · ${u.actor}` : ""} · {u.status.replace(/_/g, " ")}
                            </p>
                            {u.note ? <p className="mt-1 text-sm text-[var(--text-muted)]">{u.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-4">
                    <Link
                      href={`/action-items/${item.id}`}
                      className="text-xs font-medium text-[var(--text-primary)] underline underline-offset-2"
                    >
                      Open item
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reassignItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-title"
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
          >
            <h3 id="reassign-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Reassign
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Update performers and reviewers for &ldquo;{reassignItem.title}&rdquo;.
            </p>
            {reassignError && (
              <p className="mt-3 text-sm text-[var(--alert-critical)]">{reassignError}</p>
            )}
            <div className="mt-4 max-h-[60vh] space-y-6 overflow-y-auto">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Performers</p>
                <button
                  type="button"
                  disabled={reassignBusy}
                  className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
                  onClick={() => setReassignPerformers((prev) => [...prev, ""])}
                >
                  Add performer
                </button>
                <div className="mt-3 space-y-3">
                  {reassignPerformers.map((pid, index) => (
                    <div key={`rp-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <SearchableUserSelector
                          label={index === 0 ? "Assigned to" : `Performer ${index + 1}`}
                          catalog={directoryUsers}
                          users={directoryUsers.filter((u) => {
                            if (reassignReviewers.some((r) => r === u.id)) return false;
                            if (reassignPerformers.some((p, i) => i !== index && p === u.id)) return false;
                            return true;
                          })}
                          value={pid}
                          onChange={(value) =>
                            setReassignPerformers((prev) => prev.map((v, i) => (i === index ? value : v)))
                          }
                        />
                      </div>
                      {reassignPerformers.length > 1 && (
                        <button
                          type="button"
                          disabled={reassignBusy}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                          onClick={() => setReassignPerformers((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Reviewers</p>
                <button
                  type="button"
                  disabled={reassignBusy}
                  className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
                  onClick={() => setReassignReviewers((prev) => [...prev, ""])}
                >
                  Add reviewer
                </button>
                <div className="mt-3 space-y-3">
                  {reassignReviewers.map((rid, index) => (
                    <div key={`rr-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <SearchableUserSelector
                          label={index === 0 ? "Reviewer" : `Reviewer ${index + 1}`}
                          catalog={directoryUsers}
                          users={directoryUsers.filter((u) => {
                            if (reassignPerformers.some((p) => p === u.id)) return false;
                            if (reassignReviewers.some((r, i) => i !== index && r === u.id)) return false;
                            return true;
                          })}
                          value={rid}
                          onChange={(value) =>
                            setReassignReviewers((prev) => prev.map((v, i) => (i === index ? value : v)))
                          }
                        />
                      </div>
                      {reassignReviewers.length > 1 && (
                        <button
                          type="button"
                          disabled={reassignBusy}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                          onClick={() => setReassignReviewers((prev) => prev.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
                disabled={reassignBusy}
                onClick={() => setReassignItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-50"
                disabled={reassignBusy}
                onClick={async () => {
                  const perf = reassignPerformers.map((c) => c.trim()).filter(Boolean);
                  const rev = reassignReviewers.map((c) => c.trim()).filter(Boolean);
                  if (perf.length === 0 || rev.length === 0) {
                    setReassignError("Select at least one performer and one reviewer.");
                    return;
                  }
                  const overlap = perf.filter((c) => rev.includes(c));
                  if (overlap.length > 0) {
                    setReassignError("Performers and reviewers must be different users.");
                    return;
                  }
                  setReassignBusy(true);
                  setReassignError(null);
                  try {
                    const updated = await updateActionItem(reassignItem.id, {
                      performerUserCodes: perf,
                      reviewerUserCodes: rev,
                    });
                    setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
                    setReassignItem(null);
                  } catch (e: unknown) {
                    setReassignError(e instanceof Error ? e.message : "Reassign failed");
                  } finally {
                    setReassignBusy(false);
                  }
                }}
              >
                {reassignBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
