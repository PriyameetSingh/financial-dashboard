"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, FileText } from "lucide-react";
import { createMeeting, uploadMeetingMaterial } from "@/src/lib/services/meetingService";
import { MEETING_MATERIAL_MAX_BYTES } from "@/lib/meeting-materials";
import { getFinancialYear, todayISO, fetchFinancialYears } from "../meetingUtils";

const ACCEPT =
  ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function ScheduleMeetingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState<string[]>([""]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string; startDate: string; endDate: string }>>([]);
  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string>("");
  const [loadingFinancialYears, setLoadingFinancialYears] = useState(true);

  const fy = getFinancialYear(date);

  useEffect(() => {
    const loadFinancialYears = async () => {
      try {
        const years = await fetchFinancialYears();
        setFinancialYears(years);
        
        // Set current financial year as default
        const currentFy = getFinancialYear(todayISO());
        const currentYear = years.find(y => y.label === currentFy);
        if (currentYear) {
          setSelectedFinancialYearId(currentYear.id);
        } else if (years.length > 0) {
          setSelectedFinancialYearId(years[0].id);
        }
      } catch (error) {
        console.error("Failed to load financial years:", error);
      } finally {
        setLoadingFinancialYears(false);
      }
    };

    loadFinancialYears();
  }, []);

  const addTopic = () => setTopics((prev) => [...prev, ""]);
  const removeTopic = (idx: number) => setTopics((prev) => prev.filter((_, i) => i !== idx));
  const updateTopic = (idx: number, value: string) =>
    setTopics((prev) => prev.map((t, i) => (i === idx ? value : t)));

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      console.log('File details:', {
        name: f.name,
        size: f.size,
        sizeMB: f.size / (1024 * 1024),
        type: f.type,
        maxSize: MEETING_MATERIAL_MAX_BYTES,
        maxSizeMB: MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)
      });
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

  const handleSubmit = async () => {
    if (!date) {
      setFormError("Please select a date.");
      return;
    }
    if (!title.trim()) {
      setFormError("Please enter a meeting name.");
      return;
    }
    const validTopics = topics.filter((t) => t.trim());
    try {
      setSubmitting(true);
      setFormError(null);
      const { id } = await createMeeting({
        meetingDate: date,
        title: title.trim(),
        topics: validTopics.map((t) => ({ topic: t.trim() })),
        financialYearId: selectedFinancialYearId || null,
      });

      const failed: string[] = [];
      const errorMessages: string[] = [];
      for (const file of pendingFiles) {
        try {
          console.log('Uploading file:', {
            name: file.name,
            size: file.size,
            sizeMB: file.size / (1024 * 1024),
            type: file.type
          });
          await uploadMeetingMaterial(id, file);
          console.log('Upload successful for:', file.name);
        } catch (error) {
          console.error('Upload failed for file:', file.name, error);
          failed.push(file.name);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errorMessages.push(`${file.name}: ${errorMessage}`);
        }
      }
      if (failed.length) {
        const errorDetails = errorMessages.length > 0 ? `\n\nError details:\n${errorMessages.join('\n')}` : '';
        window.alert(
          `Meeting created, but ${failed.length} file(s) could not be uploaded:\n${failed.join("\n")}${errorDetails}\n\nPlease check the file size and format.`,
        );
      }
      onCreated();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create meeting");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ax-scrim px-4 backdrop-blur-sm"
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

        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Schedule a Meeting</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Fill in the details below. Attach PDF, PowerPoint, Word, or Excel files to present during the meeting.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Meeting Date</span>
            <input
              id="input-meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Meeting Name</span>
            <input
              id="input-meeting-title"
              type="text"
              placeholder="e.g. Monthly Review — PMAY Urban"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Financial Year</span>
            {loadingFinancialYears ? (
              <input
                type="text"
                readOnly
                value="Loading..."
                className="mt-1 w-full cursor-default rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 px-4 py-2.5 text-sm text-[var(--text-muted)]"
              />
            ) : (
              <select
                id="input-meeting-fy"
                value={selectedFinancialYearId}
                onChange={(e) => setSelectedFinancialYearId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                {financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Presentation files</span>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              PDF, PPT, PPTX, DOC, DOCX, XLS, XLSX (max {MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)} MB each).
            </p>
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-4 py-6 text-center transition-colors hover:border-[var(--accent)]/40">
              <FileText className="mb-2 text-[var(--text-muted)]" size={22} />
              <span className="text-sm font-medium text-[var(--text-primary)]">Drop or click to add files</span>
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
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <span className="truncate pr-2">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--alert-critical)]/10 hover:text-[var(--alert-critical)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Topics for Discussion</span>
            <button
              type="button"
              onClick={addTopic}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent)]/80"
            >
              <Plus size={14} /> Add another topic
            </button>
            <div className="mt-2 space-y-2">
              {topics.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    id={`input-topic-${idx}`}
                    type="text"
                    placeholder={`Topic ${idx + 1}`}
                    value={t}
                    onChange={(e) => updateTopic(idx, e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  {topics.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTopic(idx)}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--alert-critical)]/10 hover:text-[var(--alert-critical)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
          </div>

          {formError && <p className="text-sm text-[var(--alert-critical)]">{formError}</p>}

          <button
            id="btn-submit-meeting"
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="btn btn-primary w-full px-4 py-3 text-sm font-semibold"
          >
            {submitting ? "Scheduling…" : "Schedule Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
