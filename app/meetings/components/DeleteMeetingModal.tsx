"use client";

import { useState, useEffect } from "react";
import { X, AlertTriangle, ShieldAlert, CheckCircle2, Trash2 } from "lucide-react";
import { MeetingListItem } from "@/src/lib/services/meetingService";

type BlockingActionItem = {
  id: string;
  title: string;
  status: string;
};

export default function DeleteMeetingModal({
  meeting,
  blockingActionItems,
  onClose,
  onConfirm,
  deleting = false,
  error = null,
}: {
  meeting: MeetingListItem;
  blockingActionItems?: BlockingActionItem[] | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
  error?: string | null;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
  }, [meeting.id]);

  const blockers = (blockingActionItems ?? meeting.actionItems ?? []) as BlockingActionItem[];
  const hasBlockers = blockers.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ax-scrim px-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--ax-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">
          <AlertTriangle size={12} className="text-[var(--ax-status-critical)]" />
          Delete Meeting
        </div>

        <h2 className="mt-2 text-xl font-semibold text-[var(--color-text)]">
          {meeting.title || "Untitled Meeting"}
        </h2>
        <p className="mt-1 text-xs text-[var(--ax-muted)]">{meeting.meetingDate}</p>

        {hasBlockers ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--ax-status-critical)]/40 bg-[var(--ax-status-critical)]/5 p-4">
              <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[var(--ax-status-critical)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--ax-status-critical)]">
                  This meeting has {blockers.length} active action item{blockers.length !== 1 ? "s" : ""}.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text)]">
                  You must delete or archive each action item before this meeting can be deleted.
                  Open the Action Items page, handle the items below, then return here to delete the meeting.
                </p>
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ax-muted)]">
                <CheckCircle2 size={14} className="text-[var(--ax-status-critical)]" />
                Active Action Items ({blockers.length})
              </h3>
              <ul className="mt-3 space-y-2">
                {blockers.map((ai) => (
                  <li
                    key={ai.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]/30 px-3 py-2 text-xs text-[var(--color-text)]"
                  >
                    <span className="truncate pr-2">{ai.title}</span>
                    <span className="ax-chip ax-chip-warning shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                      {ai.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {error && <p className="text-sm text-[var(--ax-status-critical)]">{error}</p>}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--ax-status-critical)]/40 bg-[var(--ax-status-critical)]/5 p-4">
              <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[var(--ax-status-critical)]" />
              <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text)]">
                <p className="text-sm font-semibold text-[var(--ax-status-critical)]">
                  Proceed with caution — this cannot be undone.
                </p>
                <p>
                  Deleting this meeting will permanently remove its discussion topics, uploaded
                  presentation files, and any already-archived action items linked to it.
                </p>
                <p>
                  KPI measurements and finance expenditure snapshots recorded during this meeting
                  will <strong>not</strong> be deleted, but their link to this meeting will be removed,
                  so you will no longer be able to trace them back to it.
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]/30 px-4 py-3 text-xs text-[var(--color-text)]">
              <input
                id="input-delete-meeting-ack"
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={deleting}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ax-status-critical)]"
              />
              <span>
                I understand this action is permanent and that KPI and finance data linked to this
                meeting will lose its meeting reference.
              </span>
            </label>

            {error && <p className="text-sm text-[var(--ax-status-critical)]">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-60 sm:w-auto"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-meeting"
                type="button"
                onClick={onConfirm}
                disabled={!acknowledged || deleting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--ax-status-critical)]/40 bg-[var(--ax-status-critical)]/10 px-4 py-3 text-sm font-semibold text-[var(--ax-status-critical)] transition-colors hover:bg-[var(--ax-status-critical)]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <Trash2 size={16} />
                {deleting ? "Deleting…" : "Delete Meeting"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
