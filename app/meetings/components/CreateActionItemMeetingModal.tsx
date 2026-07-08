"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { createActionItem } from "@/src/lib/services/actionItemService";
import { fetchSchemesAdmin } from "@/src/lib/services/schemeService";
import { ActionItemPriority, UserRole } from "@/types";
import SchemeSelector from "@/src/components/ui/SchemeSelector";
import SearchableUserSelector from "@/src/components/ui/SearchableUserSelector";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

const PRIORITIES: ActionItemPriority[] = ["Critical", "High", "Medium", "Low"];

export default function CreateActionItemMeetingModal({
  open,
  onClose,
  meetingId,
  meetingLabel,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  meetingLabel: string;
  onCreated?: () => void;
}) {
  const [schemes, setSchemes] = useState<string[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheme, setScheme] = useState("");
  const [priority, setPriority] = useState<ActionItemPriority>("High");
  const [assignee, setAssignee] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSelfApproved, setIsSelfApproved] = useState(false);
  const [showNodalWarning, setShowNodalWarning] = useState(false);

  const handleAssigneeChange = (value: string) => {
    setAssignee(value);
    const user = directoryUsers.find((u) => u.id === value);
    if (isSelfApproved && user?.role === UserRole.NODAL_OFFICER) {
      setShowNodalWarning(true);
    }
  };

  const handleSelfApproveChange = (checked: boolean) => {
    setIsSelfApproved(checked);
    if (checked) {
      setReviewer("");
      const user = directoryUsers.find((u) => u.id === assignee);
      if (user?.role === UserRole.NODAL_OFFICER) {
        setShowNodalWarning(true);
      }
    } else {
      const first = directoryUsers[0]?.id ?? "";
      const second = directoryUsers.find((u) => u.id !== assignee)?.id ?? directoryUsers.find((u) => u.id !== first)?.id ?? first;
      setReviewer(second);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle("");
    setDescription("");
    setScheme("");
    setPriority("High");
    setDueDate("");
    setIsSelfApproved(false);
    setShowNodalWarning(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchSchemesAdmin(), fetchDirectoryUsers()])
      .then(([schemeData, roster]) => {
        if (!active) return;
        setSchemes(schemeData.schemes.map((s) => s.code));
        setDirectoryUsers(roster);
        const first = roster[0]?.id ?? "";
        const second = roster.find((u) => u.id !== first)?.id ?? roster[1]?.id ?? first;
        setAssignee(first);
        setReviewer(second);
      })
      .catch(() => {
        if (active) setError("Could not load schemes or user directory.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    dueDate &&
    (isSelfApproved || (reviewer && assignee !== reviewer));

  const selectedAssignee = useMemo(() => directoryUsers.find((user) => user.id === assignee), [assignee, directoryUsers]);
  const selectedReviewer = useMemo(() => directoryUsers.find((user) => user.id === reviewer), [reviewer, directoryUsers]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (!isSelfApproved && assignee === reviewer) {
        setError("Assigned officer and reviewer must be different people.");
      } else {
        setError("Please complete title, description, and due date.");
      }
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createActionItem({
        meetingId,
        schemeCode: scheme || null,
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate,
        performerUserCodes: [assignee],
        reviewerUserCodes: isSelfApproved ? [] : [reviewer],
        isSelfApproved,
      });
      onCreated?.();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h2 className="pr-10 text-xl font-semibold text-[var(--text-primary)]">New action item</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Linked to this meeting. Officers will see it like any other action item.
        </p>
        <p className="mt-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2 text-xs text-[var(--text-primary)]">
          <span className="font-medium text-[var(--accent)]">Meeting</span>
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          {meetingLabel}
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--alert-critical)]/40 bg-[var(--alert-critical)]/5 px-3 py-2 text-sm text-[var(--alert-critical)]">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-4">
          {loading && <p className="text-sm text-[var(--text-muted)]">Loading schemes…</p>}
          {!loading && (
            <>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Title <span className="text-[var(--alert-critical)] ml-0.5" aria-hidden="true">*</span>
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  placeholder="Short title"
                  autoFocus
                  required
                  aria-required="true"
                />
              </label>
              <SchemeSelector schemes={schemes} value={scheme} onChange={setScheme} label="Scheme (optional)" />
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Description <span className="text-[var(--alert-critical)] ml-0.5" aria-hidden="true">*</span>
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  rows={3}
                  placeholder="What needs to be done"
                  required
                  aria-required="true"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Priority</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ActionItemPriority)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  >
                    {PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Due date <span className="text-[var(--alert-critical)] ml-0.5" aria-hidden="true">*</span>
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    required
                    aria-required="true"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <SearchableUserSelector users={directoryUsers} value={assignee} onChange={handleAssigneeChange} label="Assigned officer" required={true} />
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="meeting-self-approve-checkbox"
                      checked={isSelfApproved}
                      onChange={(e) => handleSelfApproveChange(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-card)] focus:ring-[var(--accent)]"
                    />
                    <label htmlFor="meeting-self-approve-checkbox" className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] cursor-pointer select-none">
                      Owner will self-approve
                    </label>
                  </div>
                  {isSelfApproved && (
                    <p className="text-[10px] text-[var(--alert-success)]">
                      ✓ Marked approved immediately upon owner submission.
                    </p>
                  )}
                </div>
                {!isSelfApproved ? (
                  <SearchableUserSelector users={directoryUsers} value={reviewer} onChange={setReviewer} label="Reviewer" required={true} />
                ) : (
                  <div />
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Assigned to <span className="text-[var(--text-primary)]">{selectedAssignee?.name ?? "—"}</span>
                {!isSelfApproved && (
                  <>
                    {" · "}
                    Reviewer <span className="text-[var(--text-primary)]">{selectedReviewer?.name ?? "—"}</span>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <button
          id="btn-submit-meeting-action-item"
          type="button"
          disabled={!canSubmit || submitting || loading}
          onClick={handleSubmit}
          className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-text)] shadow-lg shadow-[var(--accent)]/20 transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create action item"}
        </button>
      </div>

      <ConfirmModal
        open={showNodalWarning}
        title="Warning: Nodal Officer Auto-Review Permissions"
        message="Are you sure you want a Nodal Officer to have auto review permissions as they usually shouldn't? We cannot disable this in the system."
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => setShowNodalWarning(false)}
        onCancel={() => {
          setShowNodalWarning(false);
          setIsSelfApproved(false);
          const first = directoryUsers[0]?.id ?? "";
          const second = directoryUsers.find((u) => u.id !== assignee)?.id ?? directoryUsers.find((u) => u.id !== first)?.id ?? first;
          setReviewer(second);
        }}
      />
    </div>
  );
}
