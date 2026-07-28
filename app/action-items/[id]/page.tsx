"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { addActionItemProof, getActionItemById, updateActionItem } from "@/src/lib/services/actionItemService";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import { ActionItem, UserRole, ActionItemStatus } from "@/types";
import { hasPermission, Permission } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import RoleBadge from "@/src/components/ui/RoleBadge";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PriorityBadge from "@/src/components/ui/PriorityBadge";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

const DESIGNATIONS: Record<UserRole, string> = {
  [UserRole.ACS]: "Additional Chief Secretary",
  [UserRole.VERTICAL_HEAD]: "Vertical Head",
  [UserRole.FA]: "Finance Advisor",
  [UserRole.TASU]: "TASU Lead",
  [UserRole.NODAL_OFFICER]: "Nodal Officer",
};

const DOT_COLORS: Record<ActionItemStatus, string> = {
  OPEN: "var(--text-muted)",
  IN_PROGRESS: "var(--alert-warning)",
  PROOF_UPLOADED: "var(--alert-warning)",
  UNDER_REVIEW: "var(--alert-warning)",
  COMPLETED: "var(--alert-success)",
  OVERDUE: "var(--alert-critical)",
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

function matchUser(catalog: SessionUser[], name: string) {
  const target = normalize(name);
  return (
    catalog.find((user) => {
      const normalized = normalize(user.name);
      return normalized.includes(target) || target.includes(normalized);
    }) ?? null
  );
}

function isDesignatedReviewer(item: ActionItem, u: { id: string; name: string }): boolean {
  // Prefer explicit reviewer user ids from the API (DB ids, same as SessionUser.id).
  if (item.reviewerUserIds?.length) {
    if (item.reviewerUserIds.includes(u.id)) return true;
  }
  if (item.reviewerUserId && item.reviewerUserId === u.id) {
    return true;
  }

  // Fallback to legacy code/name matching for older data shapes.
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

function isAssignedOfficer(item: ActionItem, u: { id: string; name: string }): boolean {
  if (item.performers?.length) {
    return item.performers.some(
      (p) =>
        (!!p.code && p.code.trim().toLowerCase() === u.id.trim().toLowerCase()) ||
        normalize(p.name) === normalize(u.name),
    );
  }
  const code = item.assignedToUserCode?.trim().toLowerCase();
  if (code && code === u.id.trim().toLowerCase()) return true;
  return normalize(item.assignedTo) === normalize(u.name);
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

function ActionItemDetailContent() {
  const user = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const searchParams = useSearchParams();
  const fromTab = searchParams.get("from") === "tracker" ? "tracker" : "list";

  const handleBackToList = () => {
    // Prefer router.back() so the browser restores scroll position and the
    // list page rehydrates the previously active tab from its URL (?tab=...).
    // Fall back to a direct navigation when there is no prior history entry
    // (e.g. the user landed directly on the detail page via a shared link).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      const target =
        fromTab === "tracker" ? "/action-items?tab=tracker" : "/action-items";
      router.push(target);
    }
  };

  const [item, setItem] = useState<ActionItem | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [manualUpdateText, setManualUpdateText] = useState("");
  const [busy, setBusy] = useState(false);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [progressMeetingId, setProgressMeetingId] = useState("");
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState("");
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateNote, setEditingUpdateNote] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [editingPriority, setEditingPriority] = useState(false);
  const [priorityValue, setPriorityValue] = useState("");

  const formatMeetingLabel = (m: MeetingListItem) => {
    const t = m.title?.trim();
    return t ? `${m.meetingDate} — ${t}` : m.meetingDate;
  };

  const refresh = async () => {
    const data = await getActionItemById(id);
    setItem(data ?? null);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [data, roster, meetingList] = await Promise.all([
          getActionItemById(id),
          fetchDirectoryUsers(),
          fetchMeetings(),
        ]);
        if (!active) return;
        setItem(data ?? null);
        setDirectoryUsers(roster);
        setMeetings(meetingList);
        if (data?.meetingId) {
          setProgressMeetingId(data.meetingId);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;
  const canReviewerAct = Boolean(
    item &&
      user &&
      hasPermission(user, Permission.APPROVE_ACTION_ITEMS) &&
      item.status === "UNDER_REVIEW" &&
      isDesignatedReviewer(item, user),
  );
  const showNodalActions = Boolean(
    item && !isViewer && user && isAssignedOfficer(item, user),
  );

  const canEdit = useMemo(() => {
    if (!user || isViewer) return false;
    return (
      hasPermission(user, Permission.UPDATE_ACTION_ITEMS) ||
      hasPermission(user, Permission.CREATE_ACTION_ITEMS)
    );
  }, [user, isViewer]);

  const canAddManualUpdate = useMemo(() => {
    if (!item || !user || isViewer) return false;
    return canEdit || isAssignedOfficer(item, user);
  }, [item, user, isViewer, canEdit]);

  const needsProgressMeetingUi = Boolean(
    item && user && !isViewer && (canAddManualUpdate || showNodalActions),
  );

  const closeLabel = actionSuccess ? "Completed" : "Mark Completed";

  const thread = useMemo(() => {
    if (!item) return [];
    const systemNotes = [
      "Action item created",
      "Marked in progress",
      "Action item archived",
      "Action item unarchived",
      "Reviewer approved completion",
      "Submitted for reviewer approval",
      "Completed & reviewed automatically",
    ];
    return item.updates.map((update, index) => {
      const note = update.note || "";
      const isSystem = systemNotes.includes(note) ||
        note.startsWith("Reassigned: performers") ||
        note.startsWith("Reviewer rejected: ") ||
        note.includes("Completed & reviewed automatically");
      return {
        id: update.id ?? `${item.id}-upd-${index}`,
        author: update.actor,
        note: update.note,
        status: update.status,
        timestamp: update.timestamp,
        isSystem,
      };
    });
  }, [item]);

  const hasManualUpdates = useMemo(() => {
    if (!item) return false;
    const systemNotes = [
      "Action item created",
      "Marked in progress",
      "Action item archived",
      "Action item unarchived",
      "Reviewer approved completion",
      "Submitted for reviewer approval",
      "Completed & reviewed automatically",
    ];
    return item.updates.some((u) => {
      const note = u.note || "";
      if (systemNotes.includes(note)) return false;
      if (note.startsWith("Reassigned: performers")) return false;
      if (note.startsWith("Reviewer rejected: ")) return false;
      if (note.includes("Completed & reviewed automatically")) return false;
      return true;
    });
  }, [item]);

  const sortedThread = useMemo(() => {
    return [...thread].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [thread]);

  if (loading) {
    return (
      <AppShell title="Action Item">
        <div className="px-6 py-6 text-sm text-[var(--text-muted)]">Loading action item...</div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="Action Item">
        <div className="px-6 py-6 text-sm text-[var(--text-muted)]">Action item not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Action Item">
      <div className="relative space-y-6 px-6 py-6 animate-fadeIn">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
        >
          <ArrowLeft size={16} /> {fromTab === "tracker" ? "Back to Action Tracker" : "Back to list"}
        </button>

        {actionSuccess && (
          <div className="rounded-xl border border-[var(--alert-success)] bg-[rgba(0,200,83,0.1)] px-4 py-3 text-sm text-[var(--alert-success)]">
            {actionSuccess}
          </div>
        )}

        {/* Combined Details Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)] font-semibold">
                <span>Scheme: {item.schemeId}</span>
                <span>•</span>
                <span>Vertical: {item.vertical}</span>
              </div>

              {/* Title */}
              {editingTitle ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xl font-semibold text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    disabled={busy || !titleValue.trim()}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-primary)] disabled:opacity-50"
                    onClick={async () => {
                      if (!titleValue.trim()) return;
                      setBusy(true);
                      try {
                        await updateActionItem(id, { title: titleValue.trim() });
                        await refresh();
                        setEditingTitle(false);
                        setActionSuccess("Title updated.");
                      } catch (e: unknown) {
                        setActionSuccess(e instanceof Error ? e.message : "Update failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)]"
                    onClick={() => setEditingTitle(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2">
                  <h1 className="text-2xl font-semibold text-[var(--text-primary)] leading-tight">{item.title}</h1>
                  {canEdit && (
                    <button
                      type="button"
                      className="mt-1 shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => { setTitleValue(item.title); setEditingTitle(true); }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Description */}
              {editingDescription ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    autoFocus
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await updateActionItem(id, { description: descriptionValue });
                          await refresh();
                          setEditingDescription(false);
                          setActionSuccess("Description updated.");
                        } catch (e: unknown) {
                          setActionSuccess(e instanceof Error ? e.message : "Update failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Check size={12} /> Save
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
                      onClick={() => setEditingDescription(false)}
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2">
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{item.description}</p>
                  {canEdit && (
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => { setDescriptionValue(item.description); setEditingDescription(true); }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-[var(--border)]">
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
              </div>
              
              {/* Priority */}
              {editingPriority ? (
                <div className="flex items-center gap-1.5">
                  <select
                    autoFocus
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  >
                    {(["Critical", "High", "Medium", "Low"] as const).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-[var(--border)] p-1 text-[var(--text-primary)] disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await updateActionItem(id, { priority: priorityValue });
                        await refresh();
                        setEditingPriority(false);
                        setActionSuccess("Priority updated.");
                      } catch (e: unknown) {
                        setActionSuccess(e instanceof Error ? e.message : "Update failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] p-1 text-[var(--text-muted)]"
                    onClick={() => setEditingPriority(false)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-[var(--text-muted)] md:hidden">Priority:</span>
                  <PriorityBadge priority={item.priority} />
                  {canEdit && (
                    <button
                      type="button"
                      className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => { setPriorityValue(item.priority); setEditingPriority(true); }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}

              {/* Due Date */}
              <div className="text-sm">
                {editingDueDate ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">Due</span>
                    <input
                      type="date"
                      value={dueDateValue}
                      onChange={(e) => setDueDateValue(e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={busy || !dueDateValue}
                      className="rounded-lg border border-[var(--border)] p-1 text-[var(--text-primary)] disabled:opacity-50"
                      onClick={async () => {
                        if (!dueDateValue) return;
                        setBusy(true);
                        try {
                          await updateActionItem(id, { dueDate: dueDateValue });
                          await refresh();
                          setEditingDueDate(false);
                          setActionSuccess("Due date updated.");
                        } catch (e: unknown) {
                          setActionSuccess(e instanceof Error ? e.message : "Update failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] p-1 text-[var(--text-muted)]"
                      onClick={() => setEditingDueDate(false)}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text-muted)]">Due {item.dueDate}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={() => {
                          setDueDateValue(item.dueDate);
                          setEditingDueDate(true);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {item.daysOverdue && item.daysOverdue > 0 ? (
                <span className="text-xs font-semibold text-[var(--alert-critical)]">{item.daysOverdue} days overdue</span>
              ) : null}
            </div>
          </div>

          <hr className="border-[var(--border)]" />

          {/* Officers & Reviewers Grid */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)] mb-3">Assigned Officers</p>
              <div className="space-y-3">
                {(item.performers?.length ? item.performers : [{ id: item.assignedToUserId ?? "", name: item.assignedTo, code: item.assignedToUserCode ?? null }]).map((p, idx) => {
                  const profile = p.code ? directoryUsers.find((u) => u.id === p.code) : matchUser(directoryUsers, p.name);
                  const designation = profile?.designationName?.trim() || (profile ? DESIGNATIONS[profile.role] : (p as { designation?: string }).designation?.trim() || "HUDD Officer");
                  return (
                    <div key={`perf-${p.id}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{profile?.name ?? p.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{designation}</p>
                      </div>
                      {profile && <div className="shrink-0"><RoleBadge role={profile.role} /></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)] mb-3">Reviewers</p>
              <div className="space-y-3">
                {(item.reviewers?.length ? item.reviewers : [{ id: item.reviewerUserId ?? "", name: item.reviewer, code: item.reviewerUserCode ?? null }]).map((r, idx) => {
                  const profile = r.code ? directoryUsers.find((u) => u.id === r.code) : matchUser(directoryUsers, r.name);
                  const designation = profile?.designationName?.trim() || (profile ? DESIGNATIONS[profile.role] : (r as { designation?: string }).designation?.trim() || "HUDD Officer");
                  return (
                    <div key={`rev-${r.id}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{profile?.name ?? r.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{designation}</p>
                      </div>
                      {profile && <div className="shrink-0"><RoleBadge role={profile.role} /></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Responsive Grid Layout */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Main Activity and Updates Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Activity & Updates</h2>
              </div>

              {/* Composer for manual updates & progress meeting attribution */}
              {canAddManualUpdate && (
                <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Add Progress Note</p>
                  <textarea
                    value={manualUpdateText}
                    onChange={(event) => setManualUpdateText(event.target.value)}
                    rows={3}
                    disabled={busy}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-inner"
                    placeholder="Add an update for this action item…"
                  />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {needsProgressMeetingUi && (
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                          Attribute progress to meeting <span className="text-[var(--alert-critical)]">*</span>
                        </label>
                        <select
                          value={progressMeetingId}
                          onChange={(e) => setProgressMeetingId(e.target.value)}
                          className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)] shadow-sm"
                        >
                          <option value="">Select meeting…</option>
                          {meetings.map((m) => (
                            <option key={m.id} value={m.id}>
                              {formatMeetingLabel(m)}
                            </option>
                          ))}
                        </select>
                        {meetings.length === 0 && (
                          <p className="mt-1 text-[10px] text-[var(--text-muted)]">No meetings found. Create one under Meetings first.</p>
                        )}
                      </div>
                    )}
                    
                    <button
                      type="button"
                      className="sm:self-end rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-50 transition hover:opacity-90 shadow-sm"
                      disabled={busy || !manualUpdateText.trim().length || (needsProgressMeetingUi && !progressMeetingId.trim())}
                      onClick={async () => {
                        const note = manualUpdateText.trim();
                        if (!note || (needsProgressMeetingUi && !progressMeetingId.trim())) return;
                        setBusy(true);
                        try {
                          const shouldMarkInProgress = (item.status === "OPEN" || item.status === "OVERDUE") && !hasManualUpdates;
                          await updateActionItem(id, {
                            note,
                            meetingId: progressMeetingId.trim(),
                            ...(shouldMarkInProgress ? { status: "IN_PROGRESS" } : {}),
                          });
                          await refresh();
                          setManualUpdateText("");
                          setActionSuccess(shouldMarkInProgress ? "Update posted and marked In Progress." : "Update posted.");
                        } catch (e: unknown) {
                          setActionSuccess(e instanceof Error ? e.message : "Could not post update");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Post Update
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline showing chronological activity updates */}
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)]">Activity Log & History</p>
                <div className="relative pl-4 border-l border-[var(--border)] ml-2 space-y-6">
                  {sortedThread.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)] italic">No activity logged yet.</p>
                  )}
                  {sortedThread.map((entry) => {
                    const dotColor = DOT_COLORS[entry.status as ActionItemStatus] ?? "var(--text-muted)";
                    
                    return (
                      <div key={entry.id} className="relative group">
                        {/* Bullet marker */}
                        <div 
                          className="absolute -left-[21px] top-[4px] h-2.5 w-2.5 rounded-full border bg-[var(--bg-card)] transition group-hover:scale-110 shadow-sm" 
                          style={{ 
                            borderColor: dotColor,
                            backgroundColor: entry.isSystem ? 'transparent' : dotColor 
                          }}
                        />
                        
                        {/* Timestamp & Status Badge Row */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-secondary)]">{entry.author}</span>
                          <span>•</span>
                          <span>{formatDateTime(entry.timestamp)}</span>
                          <span>•</span>
                          <span className="scale-90 origin-left">
                            <StatusBadge status={entry.status} />
                          </span>
                        </div>

                        {/* Content Block */}
                        {entry.isSystem ? (
                          <div className="mt-1 text-sm text-[var(--text-muted)] italic leading-relaxed">
                            {entry.note}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 shadow-sm hover:shadow transition">
                            {editingUpdateId === entry.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingUpdateNote}
                                  onChange={(e) => setEditingUpdateNote(e.target.value)}
                                  rows={3}
                                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-inner"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy || !editingUpdateNote.trim()}
                                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50 shadow-sm"
                                    onClick={async () => {
                                      if (!editingUpdateNote.trim() || !entry.id) return;
                                      setBusy(true);
                                      try {
                                        await updateActionItem(id, {
                                          updateId: entry.id,
                                          updateNote: editingUpdateNote.trim(),
                                        });
                                        await refresh();
                                        setEditingUpdateId(null);
                                        setActionSuccess("Update history edited.");
                                      } catch (e: unknown) {
                                        setActionSuccess(e instanceof Error ? e.message : "Edit failed");
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    <Check size={12} /> Save
                                  </button>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
                                    onClick={() => setEditingUpdateId(null)}
                                  >
                                    <X size={12} /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{entry.note}</p>
                                {canEdit && entry.id && (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition"
                                    onClick={() => {
                                      setEditingUpdateId(entry.id!);
                                      setEditingUpdateNote(entry.note ?? "");
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            {/* Proof Files Card */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)]">Proof Files</p>
              <div className="space-y-2">
                {item.proofFiles.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] italic">No files uploaded yet.</p>
                ) : (
                  item.proofFiles.map((file) => (
                    <div key={file.name} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm shadow-sm hover:shadow transition">
                      <span className="font-medium text-[var(--text-primary)] truncate max-w-[160px]" title={file.name}>{file.name}</span>
                      <a 
                        href={file.link} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="shrink-0 text-xs text-[var(--text-primary)] underline hover:text-[var(--text-secondary)] font-semibold transition"
                      >
                        Open
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Performer Task Actions Card */}
            {showNodalActions && (item.status === "OPEN" || item.status === "OVERDUE" || item.status === "IN_PROGRESS") && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)]">Task Actions</p>
                
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {item.status === "IN_PROGRESS" ? (
                    "Ready to finish this task? Submit it to the reviewer for final approval and completion."
                  ) : (
                    "Start working on this task by marking it In Progress, or submit directly if complete."
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  {(item.status === "OPEN" || item.status === "OVERDUE" || item.status === "IN_PROGRESS") && (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50 transition hover:bg-[var(--bg-card)] shadow-sm"
                      disabled={item.status === "IN_PROGRESS" ? true : (busy || !progressMeetingId.trim() || hasManualUpdates)}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await updateActionItem(id, {
                            status: "IN_PROGRESS",
                            note: "Marked in progress",
                            meetingId: progressMeetingId.trim(),
                          });
                          await refresh();
                          setActionSuccess("Marked as in progress.");
                        } catch (e: unknown) {
                          setActionSuccess(e instanceof Error ? e.message : "Update failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {item.status === "IN_PROGRESS" ? "In Progress" : "Mark In Progress"}
                    </button>
                  )}
                  
                  <button
                    type="button"
                    className="w-full rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60 transition hover:opacity-90 shadow-sm"
                    disabled={busy || !progressMeetingId.trim()}
                    onClick={() => setConfirmClose(true)}
                  >
                    Submit for Review & Completion
                  </button>

                  {!progressMeetingId.trim() && (
                    <p className="text-[10px] text-[var(--alert-critical)] text-center font-medium">
                      * Select a progress meeting in the updates section to enable actions.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Reviewer / Admin Actions Card */}
            {((canReviewerAct && !isViewer) || (item.status === "COMPLETED" && !isViewer)) && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[var(--text-muted)]">Reviewer & Admin Actions</p>
                
                {canReviewerAct && !isViewer && (
                  <div className="space-y-4">
                    <button
                      className="w-full rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] transition hover:opacity-90 shadow-sm"
                      onClick={() => setConfirmApprove(true)}
                    >
                      Approve Completion
                    </button>
                    
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 space-y-3 shadow-inner">
                      <label className="block text-xs font-semibold text-[var(--text-muted)]">Rejection Comment</label>
                      <textarea
                        value={rejectComment}
                        onChange={(event) => setRejectComment(event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-inner"
                        placeholder="Reason required before reject..."
                      />
                      <button
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50 transition hover:bg-[var(--bg-primary)] shadow-sm"
                        onClick={() => setConfirmReject(true)}
                        disabled={!rejectComment.trim().length}
                      >
                        Reject with Comment
                      </button>
                    </div>
                  </div>
                )}

                {item.status === "COMPLETED" && !isViewer && (
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-card)] transition shadow-sm"
                    onClick={() => setConfirmArchive(true)}
                  >
                    {item.archived ? "Unarchive Action Item" : "Archive Action Item"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmClose}
        title="Confirm completion"
        message="This action item will be marked as completed and moved to the completed queue."
        confirmLabel="Confirm & Close"
        onCancel={() => setConfirmClose(false)}
        onConfirm={async () => {
          setConfirmClose(false);
          if (!progressMeetingId.trim()) {
            setActionSuccess("Select a meeting before submitting for review.");
            return;
          }
          setBusy(true);
          try {
            const updated = await updateActionItem(id, {
              status: "UNDER_REVIEW",
              note: "Submitted for reviewer approval",
              meetingId: progressMeetingId.trim(),
            });
            await refresh();
            const isAutoApproved = updated?.status === "COMPLETED";
            setActionSuccess(isAutoApproved ? "Action item completed and reviewed automatically." : "Submitted for review.");
          } catch (e: unknown) {
            setActionSuccess(e instanceof Error ? e.message : "Update failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmModal
        open={confirmApprove}
        title="Approve completion"
        message="This action item will be marked as approved and closed."
        confirmLabel="Approve"
        onCancel={() => setConfirmApprove(false)}
        onConfirm={async () => {
          setConfirmApprove(false);
          setBusy(true);
          try {
            await updateActionItem(id, { reviewerDecision: "approve" });
            await refresh();
            setActionSuccess("Action item approved and closed.");
          } catch (e: unknown) {
            setActionSuccess(e instanceof Error ? e.message : "Approval failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmModal
        open={confirmReject}
        title="Reject completion"
        message="A rejection note will be sent back to the assigned officer."
        confirmLabel="Reject"
        tone="danger"
        onCancel={() => setConfirmReject(false)}
        onConfirm={async () => {
          setConfirmReject(false);
          setBusy(true);
          try {
            await updateActionItem(id, { reviewerDecision: "reject", rejectionReason: rejectComment });
            await refresh();
            setActionSuccess("Action item rejected with comment.");
            setRejectComment("");
          } catch (e: unknown) {
            setActionSuccess(e instanceof Error ? e.message : "Reject failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmModal
        open={confirmArchive}
        title={item.archived ? "Confirm Unarchive" : "Confirm Archive"}
        message={
          item.archived
            ? `Are you sure you want to unarchive "${item.title}"?`
            : `Are you sure you want to archive "${item.title}"?`
        }
        confirmLabel={item.archived ? "Unarchive" : "Archive"}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          setConfirmArchive(false);
          setBusy(true);
          try {
            await updateActionItem(id, { archived: !item.archived });
            await refresh();
            setActionSuccess(item.archived ? "Action item unarchived." : "Action item archived.");
          } catch (e: unknown) {
            setActionSuccess(e instanceof Error ? e.message : "Operation failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </AppShell>
  );
}

export default function ActionItemDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Action Item">
          <div className="px-6 py-6 text-sm text-[var(--text-muted)]">Loading action item...</div>
        </AppShell>
      }
    >
      <ActionItemDetailContent />
    </Suspense>
  );
}
