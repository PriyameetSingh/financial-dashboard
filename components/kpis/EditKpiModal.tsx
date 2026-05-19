"use client";

import { useEffect, useState } from "react";
import { KPISubmission } from "@/types";
import { updateKpiDefinition } from "@/src/lib/services/kpiService";

type Props = {
  open: boolean;
  submission: KPISubmission | null;
  onClose: () => void;
  onSaved: () => void;
};

const MONITORING_LEVELS = [
  { value: "", label: "None (not set)" },
  { value: "CS", label: "CS — Chief Secretary" },
  { value: "ACS", label: "ACS — Additional Chief Secretary" },
  { value: "CM", label: "CM — Chief Minister" },
] as const;

export default function EditKpiModal({ open, submission, onClose, onSaved }: Props) {
  const [description, setDescription] = useState("");
  const [monitoringLevel, setMonitoringLevel] = useState<"CS" | "ACS" | "CM" | "">("");
  const [denominatorValue, setDenominatorValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !submission) return;
    setDescription(submission.description);
    setMonitoringLevel((submission.monitoringLevel as "CS" | "ACS" | "CM") ?? "");
    setDenominatorValue(submission.denominator != null ? String(submission.denominator) : "");
    setMsg(null);
  }, [open, submission]);

  if (!open || !submission) return null;

  const handleSave = async () => {
    const d = description.trim();
    if (!d) {
      setMsg("Description is required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await updateKpiDefinition(submission.id, {
        description: d,
        monitoringLevel: monitoringLevel || null,
        denominatorValue: denominatorValue.trim() ? Number(denominatorValue) : null,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-kpi-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="edit-kpi-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Edit KPI
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {submission.scheme} · {submission.vertical}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] disabled:opacity-50"
            />
          </label>

          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Monitoring Level
            <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
              Which level will monitor this KPI
            </span>
            <select
              value={monitoringLevel}
              onChange={(e) => setMonitoringLevel(e.target.value as "CS" | "ACS" | "CM" | "")}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] disabled:opacity-50"
            >
              {MONITORING_LEVELS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {submission.type !== "BINARY" && (
            <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Target Denominator
              <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
                Annual target or total possible value
              </span>
              <input
                type="number"
                value={denominatorValue}
                onChange={(e) => setDenominatorValue(e.target.value)}
                disabled={busy}
                placeholder="e.g. 100"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] disabled:opacity-50"
              />
            </label>
          )}

          {msg && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
              {msg}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
