"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AiAlertsCard from "@/components/command-centre/AiAlertsCard";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchActionItems, updateActionItem, deleteActionItem } from "@/src/lib/services/actionItemService";
import { ActionItem, ActionItemStatus } from "@/types";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import SearchableUserSelector from "@/src/components/ui/SearchableUserSelector";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PriorityBadge from "@/src/components/ui/PriorityBadge";
import { isAssignedActionOfficer, isDesignatedReviewer } from "@/src/lib/actionItemAssignment";
import { useSearchParams } from "next/navigation";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

const STATUS_FILTERS: { id: string; label: string; match: (status: ActionItemStatus, item: ActionItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  {
    id: "pending",
    label: "Pending Action",
    match: (status) => ["OPEN", "IN_PROGRESS", "PROOF_UPLOADED"].includes(status),
  },
  { id: "review", label: "Under Review", match: (status) => status === "UNDER_REVIEW" },
  {
    id: "my_tasks",
    label: "My tasks",
    match: (status) => status === "UNDER_REVIEW",
  },
  { id: "completed", label: "Completed", match: (status) => status === "COMPLETED" },
  {
    id: "overdue",
    label: "Overdue",
    match: (status, item) => status === "OVERDUE" || (status !== "COMPLETED" && new Date(item.dueDate) < new Date()),
  },
  { id: "archived", label: "Archived", match: () => true },
];

const STATUS_STEPS: ActionItemStatus[] = ["OPEN", "IN_PROGRESS", "PROOF_UPLOADED", "UNDER_REVIEW", "COMPLETED"];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-[var(--alert-critical)]",
  High: "bg-[var(--alert-warning)]",
  Medium: "bg-blue-500",
  Low: "bg-[var(--text-muted)]",
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

function lastActivityMs(item: ActionItem): number {
  if (item.updates?.length) {
    return Math.max(...item.updates.map((u) => new Date(u.timestamp).getTime()));
  }
  return new Date(item.dueDate).getTime();
}

function formatDateTime(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function ActionItemsContent() {
  const user = useRequireAuth();
  const searchParams = useSearchParams();
  const initialFilterFromUrl = searchParams.get("filter");
  const initialFilterId =
    initialFilterFromUrl && STATUS_FILTERS.some((entry) => entry.id === initialFilterFromUrl)
      ? initialFilterFromUrl
      : "all";
  const [items, setItems] = useState<ActionItem[]>([]);
  const [archivedItems, setArchivedItems] = useState<ActionItem[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initialFilterId);
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [pageTab, setPageTab] = useState<"list" | "tracker">("list");
  const [sortBy, setSortBy] = useState<"meeting" | "date" | "latest_updates">("meeting");
  const [trackerActivity, setTrackerActivity] = useState<
    "all" | "recent_7" | "recent_30" | "inactive_14" | "inactive_30"
  >("all");
  const [trackerStatus, setTrackerStatus] = useState<string>("all");
  const [reassignItem, setReassignItem] = useState<ActionItem | null>(null);
  const [reassignPerformers, setReassignPerformers] = useState<string[]>([""]);
  const [reassignReviewers, setReassignReviewers] = useState<string[]>([""]);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignIsSelfApproved, setReassignIsSelfApproved] = useState(false);
  const [showReassignNodalWarning, setShowReassignNodalWarning] = useState(false);

  const handleReassignPerformerChange = (value: string, index: number) => {
    const nextPerf = reassignPerformers.map((v, i) => (i === index ? value : v));
    setReassignPerformers(nextPerf);
    const hasNodal = nextPerf.some((pid) => {
      const user = directoryUsers.find((u) => u.id === pid);
      return user?.role === UserRole.NODAL_OFFICER;
    });
    if (reassignIsSelfApproved && hasNodal) {
      setShowReassignNodalWarning(true);
    }
  };

  const handleReassignSelfApproveChange = (checked: boolean) => {
    setReassignIsSelfApproved(checked);
    if (checked) {
      setReassignReviewers([]);
      const hasNodal = reassignPerformers.some((pid) => {
        const user = directoryUsers.find((u) => u.id === pid);
        return user?.role === UserRole.NODAL_OFFICER;
      });
      if (hasNodal) {
        setShowReassignNodalWarning(true);
      }
    } else {
      const firstPerf = reassignPerformers[0] || "";
      const pick = directoryUsers.find((u) => u.id !== firstPerf)?.id || directoryUsers[0]?.id || "";
      setReassignReviewers([pick]);
    }
  };

  const handleReassignWarningCancel = () => {
    setShowReassignNodalWarning(false);
    setReassignIsSelfApproved(false);
    const firstPerf = reassignPerformers[0] || "";
    const pick = directoryUsers.find((u) => u.id !== firstPerf)?.id || directoryUsers[0]?.id || "";
    setReassignReviewers([pick]);
  };

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  

  const pickAnotherUserId = (exclude: string) => directoryUsers.find((u) => u.id !== exclude)?.id ?? "";

  const openReassignModal = (item: ActionItem) => {
    const isSelfApproved = item.isSelfApproved === true;
    setReassignIsSelfApproved(isSelfApproved);

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
    let rev = "";
    if (!isSelfApproved) {
      rev =
        revCodes[0] ||
        item.reviewerUserCode?.trim() ||
        directoryUsers.find((u) => normalize(u.name) === normalize(item.reviewer))?.id ||
        "";
      if (!rev) rev = pickAnotherUserId(assign);
      if (rev === assign) rev = pickAnotherUserId(assign) || rev;
    }
    setReassignPerformers(perfCodes.length > 0 ? perfCodes : [assign]);
    setReassignReviewers(!isSelfApproved ? (revCodes.length > 0 ? revCodes : [rev]) : []);
    setReassignError(null);
    setReassignItem(item);
  };

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;
  const canViewAllItems =
    !!user &&
    (hasPermission(user, Permission.VIEW_ALL_DATA) ||
      hasPermission(user, Permission.UPDATE_ACTION_ITEMS) ||
      hasPermission(user, Permission.CREATE_ACTION_ITEMS));

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, archivedData, roster] = await Promise.all([
          fetchActionItems(false),
          fetchActionItems(true),
          fetchDirectoryUsers(),
        ]);
        if (!active) return;
        setItems(data);
        setArchivedItems(archivedData);
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

  /**
   * If the user is an admin (has create/update permissions) or has view-all, they see all items.
   * Otherwise, they only see items where they are an assigned officer or reviewer.
   */
  const listItems = useMemo(() => {
    if (!user) return [];
    const sourceItems = filter === "archived" ? archivedItems : items;
    if (canViewAllItems) return sourceItems;
    return sourceItems.filter((item) => isAssignedActionOfficer(item, user) || isDesignatedReviewer(item, user));
  }, [user, items, archivedItems, canViewAllItems, filter]);

  const filtered = useMemo(() => {
    const activeFilter = STATUS_FILTERS.find((entry) => entry.id === filter) ?? STATUS_FILTERS[0];
    const isMyTasks = activeFilter.id === "my_tasks";

    const results = listItems.filter((item) => {
      const matchesQuery =
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.vertical.toLowerCase().includes(query.toLowerCase()) ||
        item.schemeId.toLowerCase().includes(query.toLowerCase());
      const matchesVertical = verticalFilter === "all" || item.vertical === verticalFilter;
      const matchesAssignee = (() => {
        if (assigneeFilter === "all") return true;
        const selectedUser = directoryUsers.find((u) => u.id === assigneeFilter);
        if (!selectedUser) return false;
        return isAssignedActionOfficer(item, selectedUser);
      })();
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      const matchesMyTasksScope =
        !isMyTasks ||
        (!!user && item.status === "UNDER_REVIEW" && isDesignatedReviewer(item, user));
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
      return (
        matchesQuery &&
        activeFilter.match(item.status, item) &&
        matchesVertical &&
        matchesAssignee &&
        matchesPriority &&
        matchesDue &&
        matchesMyTasksScope
      );
    });

    return results.sort((a, b) => {
      if (sortBy === "meeting") {
        const da = a.meetingDate ? new Date(a.meetingDate).getTime() : 0;
        const db = b.meetingDate ? new Date(b.meetingDate).getTime() : 0;
        if (da !== db) return db - da;
      } else if (sortBy === "date") {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        if (da !== db) return db - da;
      } else if (sortBy === "latest_updates") {
        const da = lastActivityMs(a);
        const db = lastActivityMs(b);
        if (da !== db) return db - da;
      }
      return a.title.localeCompare(b.title);
    });
  }, [listItems, query, filter, verticalFilter, assigneeFilter, priorityFilter, dueFilter, sortBy, user, directoryUsers]);

  const trackerFiltered = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const activeFilter = STATUS_FILTERS.find((entry) => entry.id === filter) ?? STATUS_FILTERS[0];
    const isMyTasks = activeFilter.id === "my_tasks";

    const results = listItems.filter((item) => {
      if (!activeFilter.match(item.status, item)) return false;

      const matchesMyTasksScope =
        !isMyTasks ||
        (!!user && item.status === "UNDER_REVIEW" && isDesignatedReviewer(item, user));
      if (!matchesMyTasksScope) return false;

      if (trackerStatus !== "all" && item.status !== trackerStatus && filter !== "archived") return false;
      const last = lastActivityMs(item);
      const age = now - last;
      if (trackerActivity === "recent_7") return age <= 7 * day;
      if (trackerActivity === "recent_30") return age <= 30 * day;
      if (trackerActivity === "inactive_14") return age > 14 * day;
      if (trackerActivity === "inactive_30") return age > 30 * day;
      return true;
    });

    return results.sort((a, b) => {
      if (sortBy === "meeting") {
        const da = a.meetingDate ? new Date(a.meetingDate).getTime() : 0;
        const db = b.meetingDate ? new Date(b.meetingDate).getTime() : 0;
        if (da !== db) return db - da;
      } else if (sortBy === "date") {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        if (da !== db) return db - da;
      } else if (sortBy === "latest_updates") {
        const da = lastActivityMs(a);
        const db = lastActivityMs(b);
        if (da !== db) return db - da;
      }
      return a.title.localeCompare(b.title);
    });
  }, [listItems, trackerActivity, trackerStatus, sortBy, filter, user]);

  const now = useMemo(() => new Date(), []);

  /** True when due date has passed and the item is not completed. */
  const isItemOverdue = (item: ActionItem) =>
    item.status !== "COMPLETED" && new Date(item.dueDate) < now;

  /** Number of days past the due date (0 if not overdue). */
  const daysOverdueFor = (item: ActionItem): number => {
    if (!isItemOverdue(item)) return 0;
    return Math.ceil((now.getTime() - new Date(item.dueDate).getTime()) / (1000 * 60 * 60 * 24));
  };

  const stats = useMemo(() => {
    const baseList = !user ? [] : (canViewAllItems ? items : items.filter((item) => isAssignedActionOfficer(item, user) || isDesignatedReviewer(item, user)));
    const activeList = baseList.filter((item) => !item.archived);
    const total = activeList.length;
    const overdue = activeList.filter(isItemOverdue).length;
    const completed = activeList.filter((item) => item.status === "COMPLETED").length;
    const dueThisWeek = activeList.filter((item) => {
      const due = new Date(item.dueDate);
      const week = new Date(now);
      week.setDate(now.getDate() + 7);
      return due >= now && due <= week;
    }).length;
    return { total, overdue, dueThisWeek, completed };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, now, user, canViewAllItems]);

  const verticalOptions = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          items
            .map((item) => item.vertical?.trim())
            .filter((v): v is string => Boolean(v))
        )
      ),
    ],
    [items]
  );
  const priorityOptions = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.priority)))], [items]);

  const showStats = !!user;
  const canReassignActionItems =
    !!user &&
    !isViewer &&
    (hasPermission(user, Permission.UPDATE_ACTION_ITEMS) ||
      hasPermission(user, Permission.CREATE_ACTION_ITEMS));
  const canDeleteActionItems =
    !!user &&
    !isViewer &&
    hasPermission(user, Permission.UPDATE_ACTION_ITEMS);

  return (
    <AppShell title="Action Items">
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-document)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
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
                onClick={() => {
                  setPageTab("list");
                  setSortBy("meeting");
                }}
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
                onClick={() => {
                  setPageTab("tracker");
                  setSortBy("latest_updates");
                }}
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
          {!!user && !isViewer && hasPermission(user, Permission.CREATE_ACTION_ITEMS) && (
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
              {filter !== "archived" && (
                <select
                  value={trackerStatus}
                  onChange={(e) => {
                    setTrackerStatus(e.target.value);
                    if (e.target.value !== "all") {
                      setFilter("all");
                    }
                  }}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="all">All statuses</option>
                  {(["OPEN", "IN_PROGRESS", "PROOF_UPLOADED", "UNDER_REVIEW", "COMPLETED", "OVERDUE"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="latest_updates">Latest updates</option>
                <option value="meeting">Meeting wise</option>
                <option value="date">Date wise</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                setFilter(entry.id);
                setTrackerStatus("all");
              }}
              className={`rounded-full border px-4 py-1 text-[11px] uppercase tracking-[0.3em] transition ${filter === entry.id
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

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
          <SearchableUserSelector
            users={directoryUsers}
            value={assigneeFilter}
            onChange={(val) => setAssigneeFilter(val)}
            label=""
            placeholder="Assigned to"
            showAllOption={true}
            allOptionLabel="Assigned to"
            className="w-[220px]"
          />
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="meeting">Meeting wise</option>
            <option value="date">Date wise</option>
            <option value="latest_updates">Latest updates</option>
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
              const overdue = isItemOverdue(item);
              const daysOv = daysOverdueFor(item);
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
                        {item.isSelfApproved && (
                          <span className="inline-flex items-center rounded-full border border-[var(--alert-success)] bg-[rgba(0,200,83,0.08)] px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-[var(--alert-success)]">
                            Self-Approved
                          </span>
                        )}
                        {overdue && (
                          <span className="inline-flex items-center rounded-full border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)] px-2.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-[var(--alert-critical)]">
                            {daysOv} {daysOv === 1 ? "day" : "days"} overdue
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
                    <span className={overdue ? "font-semibold text-[var(--alert-critical)]" : ""}>
                      Due {item.dueDate}
                    </span>
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
                    {item.status === "COMPLETED" && (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                        onClick={() => {
                          setSelectedItem(item);
                          setActionError(null);
                          setConfirmArchive(true);
                        }}
                      >
                        {item.archived ? "Unarchive" : "Archive"}
                      </button>
                    )}
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
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                          onClick={() => {
                            setSelectedItem(item);
                            setActionError(null);
                            setConfirmApprove(true);
                          }}
                        >
                          Approve
                        </button>
                        <button
                        type="button"
                        className="rounded-lg border border-red-500 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          setSelectedItem(item);
                          setRejectComment("");
                          setActionError(null);
                          setConfirmReject(true);
                        }}
                      >
                        Reject
                      </button>
                        
                      </>
                    )}
                    {canDeleteActionItems && (
                      <button
                        type="button"
                        className="rounded-lg border border-red-500 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          setSelectedItem(item);
                          setDeleteError(null);
                          setConfirmDelete(true);
                        }}
                      >
                        Delete
                      </button>
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
              const sorted = [...(item.updates ?? [])]
                .filter((u) => {
                  const note = u.note?.trim() ?? "";
                  return (
                    note !== "Action item created" &&
                    note !== "Marked in progress" &&
                    !note.startsWith("Reassigned: performers") &&
                    !note.startsWith("Reviewer rejected:")
                  );
                })
                .sort(
                  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                );
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-6 transition hover:border-[var(--border-strong)] ${cardToneClasses}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold leading-tight text-[var(--text-primary)]">{item.title}</h3>
                        {item.isSelfApproved && (
                          <span className="inline-flex items-center rounded-full border border-[var(--alert-success)] bg-[rgba(0,200,83,0.08)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--alert-success)]">
                            Self-Approved
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-[var(--text-muted)]">
                        {item.vertical} <span className="mx-1.5 opacity-40">|</span> {item.schemeId} <span className="mx-1.5 opacity-40">|</span> <span className="text-[var(--text-primary)]">Due {item.dueDate}</span>
                      </p>
                    </div>
                    <StatusBadge status={item.status} size="md" />
                  </div>
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Latest status updates</p>
                      {sorted.length > 2 && (
                        <span className="text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-document)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                          Showing 2 of {sorted.length}
                        </span>
                      )}
                    </div>
                    {sorted.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--text-muted)] italic">No recorded updates yet.</p>
                    ) : (
                      <ul className="space-y-5 border-l-2 border-[var(--border)] ml-1 pl-6">
                        {sorted.slice(0, 2).map((u, idx) => (
                          <li key={u.id ?? `${item.id}-u-${idx}`} className="relative">
                            <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-[var(--bg-card)] bg-[var(--text-primary)] ring-2 ring-[var(--border)]" />
                            <div className="space-y-1.5">
                              <p className="text-sm font-bold text-[var(--text-primary)]">
                                {formatDateTime(u.timestamp)}
                                {u.actor ? ` · ${u.actor}` : ""}
                                <span className="ml-2 inline-flex items-center rounded-md bg-[var(--bg-document)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-[var(--border)]">
                                  {u.status.replace(/_/g, " ")}
                                </span>
                              </p>
                              {u.note ? (
                                <p className="text-sm leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-document)] p-3 rounded-xl border border-[var(--border)]/50">
                                  {u.note}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-[var(--border)]/50 flex items-center justify-between">
                    <Link
                      href={`/action-items/${item.id}`}
                      className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] hover:underline underline-offset-4"
                    >
                      View full details
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                    </Link>
                    {item.status === "COMPLETED" && (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition"
                        onClick={() => {
                          setSelectedItem(item);
                          setActionError(null);
                          setConfirmArchive(true);
                        }}
                      >
                        {item.archived ? "Unarchive" : "Archive"}
                      </button>
                    )}
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
                            if (reassignPerformers.some((p, i) => i !== index && p === u.id)) return false;
                            return true;
                          })}
                          value={pid}
                          onChange={(value) => handleReassignPerformerChange(value, index)}
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
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <input
                  type="checkbox"
                  id="reassign-self-approve-checkbox"
                  checked={reassignIsSelfApproved}
                  disabled={reassignBusy}
                  onChange={(e) => handleReassignSelfApproveChange(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-card)] focus:ring-[var(--accent)]"
                />
                <label htmlFor="reassign-self-approve-checkbox" className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] cursor-pointer select-none">
                  No separate review needed — owner will self-approve
                </label>
              </div>
              {reassignIsSelfApproved && (
                <p className="text-xs text-[var(--alert-success)]">
                  ✓ Marked approved immediately upon owner submission.
                </p>
              )}
              {!reassignIsSelfApproved && (
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
              )}
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
                  const rev = reassignIsSelfApproved ? [] : reassignReviewers.map((c) => c.trim()).filter(Boolean);
                  if (perf.length === 0) {
                    setReassignError("Select at least one performer.");
                    return;
                  }
                  if (!reassignIsSelfApproved && rev.length === 0) {
                    setReassignError("Select at least one reviewer when separate review is required.");
                    return;
                  }
                  if (!reassignIsSelfApproved) {
                    const overlap = perf.filter((c) => rev.includes(c));
                    if (overlap.length > 0) {
                      setReassignError("Performers and reviewers must be different users.");
                      return;
                    }
                  }
                  setReassignBusy(true);
                  setReassignError(null);
                  try {
                    const updated = await updateActionItem(reassignItem.id, {
                      performerUserCodes: perf,
                      reviewerUserCodes: rev,
                      isSelfApproved: reassignIsSelfApproved,
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
          <ConfirmModal
            open={showReassignNodalWarning}
            title="Warning: Nodal Officer Self-Approval"
            message="Assigning a Nodal Officer as a self-reviewer should technically never happen unless in a very specific case. Only TASU, FA, or Vertical Heads ideally should have self-approval privileges. Are you sure you want to proceed?"
            confirmLabel="Proceed"
            cancelLabel="Cancel"
            onConfirm={() => setShowReassignNodalWarning(false)}
            onCancel={handleReassignWarningCancel}
          />
        </div>
      )}
      {confirmApprove && selectedItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            Confirm Approval
          </h3>

          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Are you sure you want to approve &ldquo;{selectedItem.title}&rdquo;?
          </p>

          {actionError && (
            <p className="mt-3 text-sm text-[var(--alert-critical)]">
              {actionError}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
              disabled={actionBusy}
              onClick={() => {
                setConfirmApprove(false);
                setSelectedItem(null);
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={actionBusy}
              onClick={async () => {
                if (!selectedItem) return;

                setActionBusy(true);
                setActionError(null);

                try {
                  const updated = await updateActionItem(selectedItem.id, {
                    status: "COMPLETED",
                  });

                  setItems((prev) =>
                    prev.map((row) =>
                      row.id === updated.id ? updated : row
                    )
                  );

                  setConfirmApprove(false);
                  setSelectedItem(null);
                } catch (e: unknown) {
                  setActionError(
                    e instanceof Error ? e.message : "Approval failed"
                  );
                } finally {
                  setActionBusy(false);
                }
              }}
            >
              {actionBusy ? "Approving..." : "Approve"}
            </button>
          </div>
        </div>
      </div>
    )}
    {confirmReject && selectedItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Reject Action Item
      </h3>

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Please provide rejection remarks for
        {" "}
        &ldquo;{selectedItem.title}&rdquo;.
      </p>

      <textarea
        value={rejectComment}
        onChange={(e) => setRejectComment(e.target.value)}
        rows={4}
        placeholder="Enter rejection remarks..."
        className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-red-500"
      />

      {actionError && (
        <p className="mt-3 text-sm text-[var(--alert-critical)]">
          {actionError}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
          disabled={actionBusy}
          onClick={() => {
            setConfirmReject(false);
            setSelectedItem(null);
            setRejectComment("");
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={actionBusy || !rejectComment.trim()}
          onClick={async () => {
            if (!selectedItem) return;

            setActionBusy(true);
            setActionError(null);

            try {
              const updated = await updateActionItem(selectedItem.id, {
              status: "IN_PROGRESS",
              rejectionReason: rejectComment.trim(),  // ← was rejectionComment
            });

              setItems((prev) =>
                prev.map((row) =>
                  row.id === updated.id ? updated : row
                )
              );

              setConfirmReject(false);
              setSelectedItem(null);
              setRejectComment("");
            } catch (e: unknown) {
              setActionError(
                e instanceof Error ? e.message : "Reject failed"
              );
            } finally {
              setActionBusy(false);
            }
          }}
        >
          {actionBusy ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </div>
  </div>
)}

{confirmDelete && selectedItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Confirm Delete
      </h3>

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Are you sure you want to delete &ldquo;{selectedItem.title}&rdquo;? This action cannot be undone.
      </p>

      {deleteError && (
        <p className="mt-3 text-sm text-[var(--alert-critical)]">
          {deleteError}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
          disabled={deleteBusy}
          onClick={() => {
            setConfirmDelete(false);
            setSelectedItem(null);
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={deleteBusy}
          onClick={async () => {
            if (!selectedItem) return;

            setDeleteBusy(true);
            setDeleteError(null);

            try {
              await deleteActionItem(selectedItem.id);

              setItems((prev) =>
                prev.filter((row) => row.id !== selectedItem.id)
              );

              setConfirmDelete(false);
              setSelectedItem(null);
            } catch (e: unknown) {
              setDeleteError(
                e instanceof Error ? e.message : "Delete failed"
              );
            } finally {
              setDeleteBusy(false);
            }
          }}
        >
          {deleteBusy ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
)}

{confirmArchive && selectedItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        {selectedItem.archived ? "Confirm Unarchive" : "Confirm Archive"}
      </h3>

      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {selectedItem.archived
          ? `Are you sure you want to unarchive "${selectedItem.title}"?`
          : `Are you sure you want to archive "${selectedItem.title}"?`}
      </p>

      {actionError && (
        <p className="mt-3 text-sm text-[var(--alert-critical)]">
          {actionError}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
          disabled={actionBusy}
          onClick={() => {
            setConfirmArchive(false);
            setSelectedItem(null);
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-50"
          disabled={actionBusy}
          onClick={async () => {
            if (!selectedItem) return;

            setActionBusy(true);
            setActionError(null);

            try {
              const nextArchived = !selectedItem.archived;
              const updated = await updateActionItem(selectedItem.id, {
                archived: nextArchived,
              });

              if (nextArchived) {
                setItems((prev) => prev.filter((row) => row.id !== updated.id));
                setArchivedItems((prev) => {
                  if (prev.some((row) => row.id === updated.id)) {
                    return prev.map((row) => row.id === updated.id ? updated : row);
                  }
                  return [...prev, updated];
                });
              } else {
                setArchivedItems((prev) => prev.filter((row) => row.id !== updated.id));
                setItems((prev) => {
                  if (prev.some((row) => row.id === updated.id)) {
                    return prev.map((row) => row.id === updated.id ? updated : row);
                  }
                  return [...prev, updated];
                });
              }

              setConfirmArchive(false);
              setSelectedItem(null);
            } catch (e: unknown) {
              setActionError(
                e instanceof Error ? e.message : "Archiving failed"
              );
            } finally {
              setActionBusy(false);
            }
          }}
        >
          {actionBusy ? "Saving..." : (selectedItem.archived ? "Unarchive" : "Archive")}
        </button>
      </div>
    </div>
  </div>
)}

    </AppShell>
  );
}

export default function ActionItemsPage() {
  return (
    <Suspense fallback={
      <AppShell title="Action Items">
        <div className="relative space-y-6 px-6 py-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
            Loading action items...
          </div>
        </div>
      </AppShell>
    }>
      <ActionItemsContent />
    </Suspense>
  );
}
