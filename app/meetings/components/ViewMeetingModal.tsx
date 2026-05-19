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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
          <Calendar size={12} />
          {meeting.meetingDate}
          <span className="mx-2 opacity-30">|</span>
          FY {fy}
        </div>
        
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
          {meeting.title || "Untitled Meeting"}
        </h2>
        
        {meeting.notes && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{meeting.notes}</p>
        )}

        <div className="mt-8 space-y-6">
          {/* Topics Section */}
          <div>
            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <ListTodo size={14} className="text-[var(--accent)]" />
              Discussion Topics ({topics.length})
            </h3>
            {topics.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {topics.map((t, idx) => (
                  <li key={t.id} className="flex gap-3 text-sm text-[var(--text-primary)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--bg-primary)] text-[10px] font-bold text-[var(--text-muted)]">
                      {idx + 1}
                    </span>
                    {t.topic}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)] italic">No topics recorded.</p>
            )}
          </div>

          {/* Materials Section */}
          <div>
            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <FileText size={14} className="text-[var(--accent)]" />
              Materials ({materials.length})
            </h3>
            {materials.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-3 py-2 text-xs text-[var(--text-primary)]">
                    <FileText size={14} className="text-[var(--text-muted)]" />
                    <span className="truncate">{m.fileName}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)] italic">No materials uploaded.</p>
            )}
          </div>

          {/* Action Items Section */}
          {actionItems.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <CheckCircle2 size={14} className="text-[var(--accent)]" />
                Action Items ({actionItems.length})
              </h3>
              <ul className="mt-3 space-y-2">
                {actionItems.map((ai) => (
                  <li key={ai.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/30 px-3 py-2 text-xs text-[var(--text-primary)]">
                    <span className="truncate">{ai.title}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      ai.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Play size={16} fill="white" />
            Enter Meeting Dashboard
          </button>
          
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-primary)]"
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
