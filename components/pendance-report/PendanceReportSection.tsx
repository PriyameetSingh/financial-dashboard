"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import { fetchKPISubmissions, reviewKpiMeasurement } from "@/src/lib/services/kpiService";
import { fetchActionItems, updateActionItem } from "@/src/lib/services/actionItemService";
import type { ActionItem, KPISubmission, ActionItemPriority } from "@/types";
import { SessionUser, UserRole, Permission, hasPermission } from "@/lib/auth";
import { isAssignedActionOfficer, isDesignatedReviewer } from "@/src/lib/actionItemAssignment";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PriorityBadge from "@/src/components/ui/PriorityBadge";
import { Calendar, Check, X, Clock, AlertCircle, RefreshCw, ThumbsUp, ThumbsDown, User, ClipboardList, ListTodo } from "lucide-react";

interface PendanceReportTask {
  id: string;
  type: "KPI" | "ActionItem";
  title: string;
  scheme: string;
  vertical: string;
  priority: ActionItemPriority;
  performers: string;
  lastUpdated: string;
  staleDays: number | null;
  dueDate?: string;
  rawKpi?: KPISubmission;
  rawActionItem?: ActionItem;
}

interface PendanceReportSectionProps {
  user: SessionUser;
}

export default function PendanceReportSection({ user }: PendanceReportSectionProps) {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [kpiSubmissions, setKpiSubmissions] = useState<KPISubmission[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  // Rejection modal state
  const [rejectingItem, setRejectingItem] = useState<{ id: string; type: "KPI" | "ActionItem"; title: string } | null>(null);
  const [rejectionComment, setRejectionComment] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meetingsList, kpiData, actionItemsList] = await Promise.all([
        fetchMeetings(),
        fetchKPISubmissions().catch(() => ({ submissions: [] })),
        fetchActionItems().catch(() => []),
      ]);

      // Sort meetings by date descending
      const sortedMeetings = [...meetingsList].sort(
        (a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime()
      );
      setMeetings(sortedMeetings);
      
      setKpiSubmissions(kpiData.submissions);
      setActionItems(actionItemsList);

      if (sortedMeetings.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(sortedMeetings[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedMeeting = useMemo(() => {
    return meetings.find((m) => m.id === selectedMeetingId) || null;
  }, [meetings, selectedMeetingId]);

  // Filter tasks that the Vertical Head is responsible for (performer or reviewer)
  const filteredTasks = useMemo<PendanceReportTask[]>(() => {
    const kpis = kpiSubmissions.filter((kpi) => {
      const isPerformer = kpi.performerUserIds?.includes(user.id) || kpi.currentUserCanEnter;
      const isReviewer = kpi.reviewerUserIds?.includes(user.id) || kpi.currentUserCanReview;
      return isPerformer || isReviewer;
    }).map((kpi): PendanceReportTask => {
      // Calculate staleness
      const lastUpdateStr = kpi.lastUpdated;
      const daysAgo = kpi.staleDays;

      return {
        id: kpi.id,
        type: "KPI",
        title: kpi.description,
        scheme: kpi.scheme,
        vertical: kpi.vertical,
        priority: "Medium", // Default priority for KPIs
        performers: kpi.assignedToName?.trim() || "—",
        lastUpdated: lastUpdateStr,
        staleDays: daysAgo ?? null,
        rawKpi: kpi,
      };
    });

    const actions = actionItems.filter((item) => {
      return isAssignedActionOfficer(item, user) || isDesignatedReviewer(item, user);
    }).map((item): PendanceReportTask => {
      // Calculate staleness from last update or creation
      let daysAgo: number | null = null;
      let lastUpdateStr = item.dueDate;
      
      if (item.updates.length > 0) {
        const sortedUpdates = [...item.updates].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        lastUpdateStr = sortedUpdates[0].timestamp;
        const diffMs = Date.now() - new Date(lastUpdateStr).getTime();
        daysAgo = Math.floor(diffMs / 86400000);
      } else {
        const diffMs = Date.now() - new Date(item.createdAt).getTime();
        daysAgo = Math.floor(diffMs / 86400000);
        lastUpdateStr = item.createdAt.slice(0, 10);
      }

      return {
        id: item.id,
        type: "ActionItem",
        title: item.title,
        scheme: item.schemeId || "Global",
        vertical: item.vertical,
        priority: item.priority,
        performers: item.assignedTo?.trim() || "—",
        lastUpdated: lastUpdateStr,
        staleDays: daysAgo ?? null,
        dueDate: item.dueDate,
        rawActionItem: item,
      };
    });

    return [...kpis, ...actions];
  }, [kpiSubmissions, actionItems, user]);

  const handleApprove = async (task: PendanceReportTask) => {
    setBusyItemId(task.id);
    setActionMessage(null);
    try {
      if (task.type === "KPI" && task.rawKpi) {
        const measurement = task.rawKpi.velocityTrail?.find((m: any) => m.meetingId === selectedMeetingId);
        if (!measurement?.id) {
          throw new Error("No measurement found for this meeting to approve.");
        }
        await reviewKpiMeasurement(measurement.id, { decision: "approve" });
        setActionMessage({ text: "KPI measurement approved successfully.", type: "success" });
      } else if (task.type === "ActionItem" && task.rawActionItem) {
        await updateActionItem(task.id, { 
          reviewerDecision: "approve",
          meetingId: selectedMeetingId 
        });
        setActionMessage({ text: "Action item completed status approved successfully.", type: "success" });
      }
      await loadData();
    } catch (err: unknown) {
      setActionMessage({ 
        text: err instanceof Error ? err.message : "Approval failed", 
        type: "error" 
      });
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRejectClick = (task: PendanceReportTask) => {
    setRejectingItem({
      id: task.id,
      type: task.type,
      title: task.title,
    });
    setRejectionComment("");
  };

  const handleConfirmReject = async () => {
    if (!rejectingItem) return;
    if (!rejectionComment.trim()) {
      setActionMessage({ text: "Rejection note is required.", type: "error" });
      return;
    }

    const taskId = rejectingItem.id;
    const taskType = rejectingItem.type;
    setBusyItemId(taskId);
    setRejectingItem(null);
    setActionMessage(null);

    try {
      if (taskType === "KPI") {
        const targetKpi = kpiSubmissions.find((k) => k.id === taskId);
        const measurement = targetKpi?.velocityTrail?.find((m: any) => m.meetingId === selectedMeetingId);
        if (!measurement?.id) {
          throw new Error("No measurement found for this meeting to reject.");
        }
        await reviewKpiMeasurement(measurement.id, { 
          decision: "reject", 
          note: rejectionComment.trim() 
        });
        setActionMessage({ text: "KPI measurement rejected successfully.", type: "success" });
      } else {
        await updateActionItem(taskId, {
          reviewerDecision: "reject",
          rejectionReason: rejectionComment.trim(),
          meetingId: selectedMeetingId,
        });
        setActionMessage({ text: "Action item rejected successfully.", type: "success" });
      }
      await loadData();
    } catch (err: unknown) {
      setActionMessage({ 
        text: err instanceof Error ? err.message : "Rejection failed", 
        type: "error" 
      });
    } finally {
      setBusyItemId(null);
    }
  };

  if (loading && meetings.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">Loading pendance report...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <ClipboardList className="text-[var(--accent)]" size={20} />
            Pendance Report
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Review data entries, updates, and pending approvals for KPIs and action items assigned to you.
          </p>
        </div>

        {/* Meeting Selector & Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 shadow-sm">
            <Calendar size={16} className="text-[var(--text-muted)]" />
            <select
              value={selectedMeetingId}
              onChange={(e) => setSelectedMeetingId(e.target.value)}
              className="border-none bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-0"
            >
              {meetings.length === 0 ? (
                <option value="">No meetings available</option>
              ) : (
                meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meetingDate} {m.title ? `— ${m.title}` : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:bg-[var(--sidebar-hover-bg)]/60 disabled:opacity-50"
            title="Refresh Report"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {actionMessage && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${
            actionMessage.type === "success"
              ? "border-[var(--alert-success)] bg-[rgba(0,200,83,0.08)] text-[var(--alert-success)]"
              : "border-[var(--alert-critical)] bg-[rgba(239,68,68,0.08)] text-[var(--alert-critical)]"
          }`}
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{actionMessage.type === "success" ? "Success" : "Error"}</p>
            <p className="mt-0.5 text-xs opacity-90">{actionMessage.text}</p>
          </div>
          <button onClick={() => setActionMessage(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-document)]/45 text-[10px] uppercase tracking-[0.25em] text-[var(--text-secondary)] font-semibold">
              <th className="pb-3 pt-3 pl-4 pr-4 font-semibold">Task Details</th>
              <th className="pb-3 pt-3 pr-4 font-semibold">Owner / Performer</th>
              <th className="pb-3 pt-3 pr-4 font-semibold">Update for Selected Meeting</th>
              <th className="pb-3 pt-3 pr-4 font-semibold">Last Update Date</th>
              <th className="pb-3 pt-3 pr-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No pending KPIs or Action Items assigned to you.
                </td>
              </tr>
            ) : (
              filteredTasks.map((task, index) => {
                // Determine update for selected meeting
                let meetingUpdateNode = null;
                let isKpiPendingReview = false;
                let canApproveKpi = false;
                let isActionPendingReview = false;
                let canApproveAction = false;
                let measurementId = "";

                if (task.type === "KPI" && task.rawKpi) {
                  const m = task.rawKpi.velocityTrail?.find((v: any) => v.meetingId === selectedMeetingId);
                  if (m) {
                    measurementId = m.id;
                    isKpiPendingReview = m.workflowStatus === "submitted";
                    canApproveKpi = isKpiPendingReview && !!task.rawKpi.currentUserCanReview;

                    const formattedVal = task.rawKpi.type === "BINARY"
                      ? (m.yesValue === true ? "Yes" : m.yesValue === false ? "No" : "—")
                      : `${m.numeratorValue ?? 0} / ${task.rawKpi.denominator ?? 0} ${task.rawKpi.unit}`;

                    meetingUpdateNode = (
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">{formattedVal}</div>
                        {m.remarks && (
                          <div className="mt-1 text-xs italic text-[var(--text-muted)] max-w-xs truncate" title={m.remarks}>
                            &ldquo;{m.remarks}&rdquo;
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5">
                          <StatusBadge size="sm" status={m.workflowStatus === "submitted" ? "submitted_pending" : m.workflowStatus === "reviewed" ? "approved" : "draft"} />
                        </div>
                      </div>
                    );
                  } else {
                    meetingUpdateNode = (
                      <span className="text-xs text-[var(--text-muted)] italic flex items-center gap-1.5">
                        <AlertCircle size={12} /> No entry for this meeting
                      </span>
                    );
                  }
                } else if (task.type === "ActionItem" && task.rawActionItem) {
                  // Action Item
                  const updatesForMeeting = task.rawActionItem.updates.filter((up: any) => up.meetingId === selectedMeetingId);
                  
                  isActionPendingReview = task.rawActionItem.status === "UNDER_REVIEW";
                  canApproveAction = isActionPendingReview && isDesignatedReviewer(task.rawActionItem, user);

                  if (updatesForMeeting.length > 0) {
                    // Show the latest update for this meeting
                    const latestUp = updatesForMeeting[updatesForMeeting.length - 1];
                    meetingUpdateNode = (
                      <div>
                        <div className="font-medium text-[var(--text-primary)] max-w-xs truncate" title={latestUp.note}>
                          {latestUp.note}
                        </div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                          Posted by {latestUp.actor} · <StatusBadge size="sm" status={latestUp.status} />
                        </div>
                      </div>
                    );
                  } else {
                    meetingUpdateNode = (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-[var(--text-muted)] italic flex items-center gap-1.5">
                          No updates this meeting
                        </span>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          Current status: <StatusBadge size="sm" status={task.rawActionItem.status} />
                        </div>
                      </div>
                    );
                  }
                }

                // Show approve/reject action status
                const canAct = (task.type === "KPI" && canApproveKpi) || (task.type === "ActionItem" && canApproveAction);

                // Additional metrics layout
                const stalenessColor = task.staleDays === null 
                  ? "text-[var(--text-muted)]" 
                  : task.staleDays > 21 
                    ? "text-[var(--alert-critical)] font-medium" 
                    : task.staleDays > 7 
                      ? "text-[var(--alert-warning)] font-medium" 
                      : "text-[var(--text-muted)]";

                return (
                  <tr
                    key={`${task.type}-${task.id}-${index}`}
                    className={`border-b border-[var(--border)] hover:bg-[var(--bg-content-surface)]/30 transition ${
                      index % 2 === 0 ? "bg-[var(--bg-card)]" : "bg-[var(--bg-document)]/30"
                    }`}
                  >
                    {/* Task details */}
                    <td className="py-4 pl-4 pr-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              task.type === "KPI"
                                ? "bg-teal-500/10 text-teal-600 border border-teal-500/20"
                                : "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20"
                            }`}
                          >
                            {task.type === "KPI" ? <ClipboardList size={10} /> : <ListTodo size={10} />}
                            {task.type === "KPI" ? "KPI" : "Action"}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                            {task.scheme}
                          </span>
                          {task.type === "ActionItem" && (
                            <PriorityBadge priority={task.priority} />
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)] leading-snug">
                          {task.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {task.vertical}
                        </p>
                        {task.type === "ActionItem" && (
                          <p className="mt-1 text-[11px] text-[var(--alert-warning)] font-medium">
                            Due: {task.dueDate}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Performer */}
                    <td className="py-4 pr-4 text-xs text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-[var(--text-muted)]" />
                        <span className="truncate max-w-[150px]" title={task.performers}>
                          {task.performers}
                        </span>
                      </div>
                    </td>

                    {/* Meeting update */}
                    <td className="py-4 pr-4 text-xs">
                      {meetingUpdateNode}
                    </td>

                    {/* Last update date (staleness) */}
                    <td className="py-4 pr-4 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-[var(--text-primary)]">{task.lastUpdated}</span>
                        <span className={`text-[10px] flex items-center gap-1 ${stalenessColor}`}>
                          <Clock size={10} />
                          {task.staleDays === null 
                            ? "Never updated" 
                            : task.staleDays === 0 
                              ? "Updated today" 
                              : task.staleDays === 1 
                                ? "1 day ago" 
                                : `${task.staleDays} days ago`}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 pr-4 text-right">
                      {canAct ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(task)}
                            disabled={busyItemId === task.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-[rgba(0,200,83,0.1)] px-2.5 py-1 text-xs font-semibold text-[var(--alert-success)] transition hover:bg-[rgba(0,200,83,0.18)] disabled:opacity-50"
                            title="Approve Update"
                          >
                            <ThumbsUp size={12} />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleRejectClick(task)}
                            disabled={busyItemId === task.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-[rgba(239,68,68,0.1)] px-2.5 py-1 text-xs font-semibold text-[var(--alert-critical)] transition hover:bg-[rgba(239,68,68,0.18)] disabled:opacity-50"
                            title="Reject Update"
                          >
                            <ThumbsDown size={12} />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--text-muted)] italic pr-2">
                          {task.type === "KPI" && isKpiPendingReview && !task.rawKpi?.currentUserCanReview 
                            ? "Awaiting review (no access)" 
                            : task.type === "ActionItem" && isActionPendingReview && task.rawActionItem && !isDesignatedReviewer(task.rawActionItem, user)
                              ? "Awaiting review (no access)"
                              : "No actions pending"}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rejection Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Reject Completion</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Are you sure you want to reject the update for: <span className="font-semibold text-[var(--text-primary)]">{rejectingItem.title}</span>?
            </p>
            
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Reason for Rejection <span className="text-[var(--alert-critical)]">*</span>
              </label>
              <textarea
                value={rejectionComment}
                onChange={(e) => setRejectionComment(e.target.value)}
                placeholder="Specify what needs to be fixed or updated..."
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-document)]/50 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-document)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={!rejectionComment.trim()}
                className="rounded-xl bg-[var(--alert-critical)] px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-95 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
