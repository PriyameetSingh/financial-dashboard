"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { addActionItemProof, getActionItemById, updateActionItem } from "@/src/lib/services/actionItemService";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import { ActionItem, UserRole } from "@/types";
import { hasPermission, Permission } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import RoleBadge from "@/src/components/ui/RoleBadge";
import StatusBadge from "@/src/components/ui/StatusBadge";
import PriorityBadge from "@/src/components/ui/PriorityBadge";
import StatusTimeline from "@/src/components/ui/StatusTimeline";
import ProofUpload from "@/src/components/ui/ProofUpload";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

const DESIGNATIONS: Record<UserRole, string> = {
  [UserRole.ACS]: "Additional Chief Secretary",
  [UserRole.VERTICAL_HEAD]: "Vertical Head",
  [UserRole.FA]: "Finance Advisor",
  [UserRole.TASU]: "TASU Lead",
  [UserRole.NODAL_OFFICER]: "Nodal Officer",
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

export default function ActionItemDetailPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [item, setItem] = useState<ActionItem | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
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
  const isNodal = user?.role === UserRole.NODAL_OFFICER;
  const canReviewerAct = Boolean(
    item &&
      user &&
      hasPermission(user, Permission.APPROVE_ACTION_ITEMS) &&
      item.status === "UNDER_REVIEW" &&
      isDesignatedReviewer(item, user),
  );
  const showNodalActions = Boolean(
    item && isNodal && !isViewer && user && isAssignedOfficer(item, user),
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
    return item.updates.map((update, index) => ({
      id: update.id ?? `${item.id}-upd-${index}`,
      author: update.actor,
      note: update.note,
      status: update.status,
      timestamp: update.timestamp,
    }));
  }, [item]);

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
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-[var(--text-muted)]"
        >
          <ArrowLeft size={16} /> Back to list
        </button>

        {actionSuccess && (
          <div className="rounded-xl border border-[var(--alert-success)] bg-[rgba(0,200,83,0.1)] px-4 py-3 text-sm text-[var(--alert-success)]">
            {actionSuccess}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{item.schemeId}</p>

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
                  <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{item.title}</h1>
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
                  <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
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

            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge status={item.status} />
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
                <div className="flex items-center gap-1.5">
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
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
            <span>Vertical: {item.vertical}</span>
            {editingDueDate ? (
              <span className="flex items-center gap-2">
                <span>Due</span>
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
              <span className="flex items-center gap-1.5">
                <span>Due {item.dueDate}</span>
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
              </span>
            )}
            {item.daysOverdue && item.daysOverdue > 0 && (
              <span className="text-[var(--alert-critical)]">{item.daysOverdue} days overdue</span>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Assigned officers</p>
            <div className="mt-3 space-y-4">
              {(item.performers?.length ? item.performers : [{ id: item.assignedToUserId ?? "", name: item.assignedTo, code: item.assignedToUserCode ?? null }]).map((p, idx) => {
                const profile = p.code ? directoryUsers.find((u) => u.id === p.code) : matchUser(directoryUsers, p.name);
                const designation = profile?.designationName?.trim() || (profile ? DESIGNATIONS[profile.role] : (p as { designation?: string }).designation?.trim() || "HUDD Officer");
                return (
                  <div key={`perf-${p.id}-${idx}`} className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{profile?.name ?? p.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{designation}</p>
                    </div>
                    {profile && <RoleBadge role={profile.role} />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Reviewers</p>
            <div className="mt-3 space-y-4">
              {(item.reviewers?.length ? item.reviewers : [{ id: item.reviewerUserId ?? "", name: item.reviewer, code: item.reviewerUserCode ?? null }]).map((r, idx) => {
                const profile = r.code ? directoryUsers.find((u) => u.id === r.code) : matchUser(directoryUsers, r.name);
                const designation = profile?.designationName?.trim() || (profile ? DESIGNATIONS[profile.role] : (r as { designation?: string }).designation?.trim() || "HUDD Officer");
                return (
                  <div key={`rev-${r.id}-${idx}`} className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{profile?.name ?? r.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{designation}</p>
                    </div>
                    {profile && <RoleBadge role={profile.role} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {needsProgressMeetingUi && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Attribute progress to meeting <span className="text-[var(--alert-critical)]">*</span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Required when posting updates or changing status from this page.
            </p>
            <select
              value={progressMeetingId}
              onChange={(e) => setProgressMeetingId(e.target.value)}
              className="mt-3 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="">Select meeting…</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMeetingLabel(m)}
                </option>
              ))}
            </select>
            {meetings.length === 0 && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">No meetings found. Create one under Meetings first.</p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Status Timeline</p>
            <div className="mt-4">
              <StatusTimeline updates={item.updates} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Proof Files</p>
              <div className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
                {item.proofFiles.length === 0 && "No files uploaded yet."}
                {item.proofFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                    <span>{file.name}</span>
                    <a href={file.link} target="_blank" rel="noreferrer" className="text-xs text-[var(--text-primary)] underline">
                      Open
                    </a>
                  </div>
                ))}
              </div>
            </div>
            {showNodalActions && (
              <>
                <button
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
                  disabled={busy || !progressMeetingId.trim()}
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
                  Mark In Progress
                </button>
                <ProofUpload
                  accept="application/pdf,image/*,*/*"
                  disabled={isViewer || busy}
                  onUpload={async (files) => {
                    const f = files[0];
                    if (!f) return;
                    setBusy(true);
                    try {
                      const url = typeof window !== "undefined" ? URL.createObjectURL(f) : "";
                      await addActionItemProof(id, { name: f.name, url: url || `https://local.invalid/${encodeURIComponent(f.name)}` });
                      await refresh();
                      setActionSuccess("Proof uploaded.");
                    } catch (e: unknown) {
                      setActionSuccess(e instanceof Error ? e.message : "Upload failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <button
                  className="w-full rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
                  onClick={() => setConfirmClose(true)}
                >
                  Upload Proof + Mark Complete
                </button>
              </>
            )}

            {canReviewerAct && !isViewer && (
              <>
                <button
                  className="w-full rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
                  onClick={() => setConfirmApprove(true)}
                >
                  Approve Completion
                </button>
                
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Rejection Comment</p>
                  <textarea
                    value={rejectComment}
                    onChange={(event) => setRejectComment(event.target.value)}
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    placeholder="Reason required before reject"
                  />
                  <button
                    className="mt-3 w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
                    onClick={() => setConfirmReject(true)}
                    disabled={!rejectComment.trim().length}
                  >
                    Reject with Comment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Updates</p>
          {canAddManualUpdate && (
            <div className="mt-4 space-y-3">
              <textarea
                value={manualUpdateText}
                onChange={(event) => setManualUpdateText(event.target.value)}
                rows={3}
                disabled={busy}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                placeholder="Add an update for this action item…"
              />
              <button
                type="button"
                className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-50"
                disabled={busy || !manualUpdateText.trim().length || !progressMeetingId.trim()}
                onClick={async () => {
                  const note = manualUpdateText.trim();
                  if (!note || !progressMeetingId.trim()) return;
                  setBusy(true);
                  try {
                    await updateActionItem(id, { note, meetingId: progressMeetingId.trim() });
                    await refresh();
                    setManualUpdateText("");
                    setActionSuccess("Update posted.");
                  } catch (e: unknown) {
                    setActionSuccess(e instanceof Error ? e.message : "Could not post update");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Post update
              </button>
            </div>
          )}
          <div className="mt-4 space-y-3 text-sm text-[var(--text-muted)]">
            {thread.length === 0 && "No updates yet."}
            {thread.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>{entry.author}</span>
                  <span>{entry.timestamp}</span>
                </div>
                {editingUpdateId === entry.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editingUpdateNote}
                      onChange={(e) => setEditingUpdateNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || !editingUpdateNote.trim()}
                        className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-primary)] disabled:opacity-50"
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
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <span className="text-sm text-[var(--text-primary)]">{entry.note}</span>
                    {canEdit && entry.id && (
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">{entry.status.replace(/_/g, " ")}</div>
              </div>
            ))}
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
            await updateActionItem(id, {
              status: "UNDER_REVIEW",
              note: "Submitted for reviewer approval",
              meetingId: progressMeetingId.trim(),
            });
            await refresh();
            setActionSuccess("Submitted for review.");
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
    </AppShell>
  );
}
