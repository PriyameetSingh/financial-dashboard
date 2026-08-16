"use client";

import { X, Calendar, FileText, ListTodo, Play, Edit3, CheckCircle2 } from "lucide-react";
import { MeetingListItem } from "@/src/lib/services/meetingService";
import { getFinancialYear } from "../meetingUtils";

export default function ViewMeetingModal({
  meeting,
  onClose,
  onStartMeeting,
  onEdit,
  canEdit = false,
}: {
  meeting: MeetingListItem;
  onClose: () => void;
  onStartMeeting: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}) {
  const fy = getFinancialYear(meeting.meetingDate);
  const materials = meeting.materials ?? [];
  const topics = meeting.topics ?? [];
  const actionItems = meeting.actionItems ?? [];

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
          <Calendar size={12} />
          {meeting.meetingDate}
          <span className="mx-2 opacity-30">|</span>
          FY {fy}
        </div>
        
        <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
          {meeting.title || "Untitled Meeting"}
        </h2>
        
        {meeting.notes && (
          <p className="mt-2 text-sm text-[var(--ax-muted)]">{meeting.notes}</p>
        )}

        <div className="mt-8 space-y-6">
          {/* Topics Section */}
          <div>
            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ax-muted)]">
              <ListTodo size={14} className="text-[var(--color-accent)]" />
              Discussion Topics ({topics.length})
            </h3>
            {topics.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {topics.map((t, idx) => (
                  <li key={t.id} className="flex gap-3 text-sm text-[var(--color-text)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-bg)] text-[10px] font-bold text-[var(--ax-muted)]">
                      {idx + 1}
                    </span>
                    {t.topic}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--ax-muted)] italic">No topics recorded.</p>
            )}
          </div>

          {/* Materials Section */}
          <div>
            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ax-muted)]">
              <FileText size={14} className="text-[var(--color-accent)]" />
              Materials ({materials.length})
            </h3>
            {materials.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]/30 px-3 py-2 text-xs text-[var(--color-text)]">
                    <FileText size={14} className="text-[var(--ax-muted)]" />
                    <span className="truncate">{m.fileName}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--ax-muted)] italic">No materials uploaded.</p>
            )}
          </div>

          {/* Action Items Section */}
          {actionItems.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ax-muted)]">
                <CheckCircle2 size={14} className="text-[var(--color-accent)]" />
                Action Items ({actionItems.length})
              </h3>
              <ul className="mt-3 space-y-2">
                {actionItems.map((ai) => (
                  <li key={ai.id} className="flex items-center justify-between rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]/30 px-3 py-2 text-xs text-[var(--color-text)]">
                    <span className="truncate">{ai.title}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      ai.status === 'COMPLETED' ? 'ax-chip ax-chip-ok' : 'ax-chip ax-chip-warning'
                    }`}>
                      {ai.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            onClick={onStartMeeting}
            className="btn btn-primary w-full py-3.5 text-sm font-semibold"
          >
            <Play size={16} fill="white" />
            Enter Meeting Dashboard
          </button>
          
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] py-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
            >
              <Edit3 size={16} />
              Edit Meeting Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
