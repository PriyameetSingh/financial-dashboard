"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, FileText, Edit3 } from "lucide-react";
import { updateMeeting, uploadMeetingMaterial, MeetingListItem, MeetingMaterialMeta } from "@/src/lib/services/meetingService";
import { MEETING_MATERIAL_MAX_BYTES } from "@/lib/meeting-materials";
import { getFinancialYear } from "../meetingUtils";
import { deleteMeetingMaterial } from "@/src/lib/services/meetingService";

const ACCEPT =
  ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function EditMeetingModal({
  meeting,
  onClose,
  onUpdated,
}: {
  meeting: MeetingListItem;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [date, setDate] = useState(meeting.meetingDate);
  const [title, setTitle] = useState(meeting.title || "");
  const [topics, setTopics] = useState<string[]>(meeting.topics.map(t => t.topic));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [materialsToRemove, setMaterialsToRemove] = useState<string[]>([]);

  const fy = getFinancialYear(date);

  useEffect(() => {
    setDate(meeting.meetingDate);
    setTitle(meeting.title || "");
    setTopics(meeting.topics.map(t => t.topic));
    setMaterialsToRemove([]);
    setPendingFiles([]);
    setFormError(null);
  }, [meeting]);

  const addTopic = () => setTopics((prev) => [...prev, ""]);
  const removeTopic = (idx: number) => setTopics((prev) => prev.filter((_, i) => i !== idx));
  const updateTopic = (idx: number, value: string) =>
    setTopics((prev) => prev.map((t, i) => (i === idx ? value : t)));

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MEETING_MATERIAL_MAX_BYTES) {
        setFormError(`"${f.name}" exceeds ${MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)} MB.`);
        return;
      }
      next.push(f);
    }
    setPendingFiles((prev) => [...prev, ...next]);
    setFormError(null);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleMaterialRemoval = (materialId: string) => {
    setMaterialsToRemove((prev) =>
      prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId]
    );
  };

  const handleSubmit = async () => {
    if (!date) {
      setFormError("Please select a date.");
      return;
    }
    if (!title.trim()) {
      setFormError("Please enter a meeting name.");
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      // Update meeting details
      await updateMeeting(meeting.id, {
        meetingDate: date,
        title: title.trim(),
        topics: topics.map(t => t.trim()).filter(t => t.length > 0),
      });

      // Remove marked materials
      for (const materialId of materialsToRemove) {
        await deleteMeetingMaterial(meeting.id, materialId);
      }

      // Upload new materials
      const failed: string[] = [];
      for (const file of pendingFiles) {
        try {
          await uploadMeetingMaterial(meeting.id, file);
        } catch {
          failed.push(file.name);
        }
      }

      if (failed.length) {
        window.alert(
          `Meeting updated, but ${failed.length} file(s) could not be uploaded:\n${failed.join("\n")}\n\nPlease check the file size and format.`,
        );
      }

      onUpdated();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to update meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const remainingMaterials = meeting.materials.filter(m => !materialsToRemove.includes(m.id));

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

        <h2 className="text-xl font-semibold text-[var(--color-text)]">Edit Meeting</h2>
        <p className="mt-1 text-sm text-[var(--ax-muted)]">
          Update meeting details, topics, and materials.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Meeting Date</span>
            <input
              id="input-edit-meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Meeting Name</span>
            <input
              id="input-edit-meeting-title"
              type="text"
              placeholder="e.g. Monthly Review — PMAY Urban"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)]/50 outline-none transition-all focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Financial Year</span>
            <input
              id="input-edit-meeting-fy"
              type="text"
              readOnly
              value={fy}
              className="mt-1 w-full cursor-default rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)]/50 px-4 py-2.5 text-sm text-[var(--ax-muted)]"
            />
          </label>

          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Current Materials</span>
            {remainingMaterials.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {remainingMaterials.map((material) => (
                  <li
                    key={material.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)]"
                  >
                    <span className="truncate pr-2">{material.fileName}</span>
                    <button
                      type="button"
                      onClick={() => toggleMaterialRemoval(material.id)}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--ax-muted)] hover:bg-[var(--ax-status-critical)]/10 hover:text-[var(--ax-status-critical)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--ax-muted)]">No materials uploaded yet.</p>
            )}
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Add New Materials</span>
            <p className="mt-1 text-xs text-[var(--ax-muted)]">
              PDF, PPT, PPTX, DOC, DOCX, XLS, XLSX (max {MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)} MB each).
            </p>
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-6 text-center transition-colors hover:border-[var(--color-accent)]/40">
              <FileText className="mb-2 text-[var(--ax-muted)]" size={22} />
              <span className="text-sm font-medium text-[var(--color-text)]">Drop or click to add files</span>
              <input
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {pendingFiles.length > 0 && (
              <ul className="mt-3 space-y-2">
                {pendingFiles.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)]"
                  >
                    <span className="truncate pr-2">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--ax-muted)] hover:bg-[var(--ax-status-critical)]/10 hover:text-[var(--ax-status-critical)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">Topics for Discussion</span>
            <button
              type="button"
              onClick={addTopic}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent)]/80"
            >
              <Plus size={14} /> Add another topic
            </button>
            <div className="mt-2 space-y-2">
              {topics.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    id={`input-edit-topic-${idx}`}
                    type="text"
                    placeholder={`Topic ${idx + 1}`}
                    value={t}
                    onChange={(e) => updateTopic(idx, e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)]/50 outline-none transition-all focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  />
                  {topics.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTopic(idx)}
                      className="rounded-lg p-1.5 text-[var(--ax-muted)] transition-colors hover:bg-[var(--ax-status-critical)]/10 hover:text-[var(--ax-status-critical)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-[var(--ax-status-critical)]">{formError}</p>}

          <button
            id="btn-update-meeting"
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="btn btn-primary w-full px-4 py-3 text-sm font-semibold"
          >
            {submitting ? "Updating…" : "Update Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
