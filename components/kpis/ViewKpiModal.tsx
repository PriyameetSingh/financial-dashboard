"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { KPISubmission, KpiCompletionStatus } from "@/types";
import ReassignKpiModal from "@/components/kpis/ReassignKpiModal";
import { KpiMeasurementHistory, fetchKpiHistory, reviewKpiMeasurement, requestKpiCompletion, reviewKpiCompletion } from "@/src/lib/services/kpiService";

const ESCALATION_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  on_track: { label: "On track", color: "var(--alert-success)", bg: "rgba(0,200,83,0.08)", border: "rgba(0,200,83,0.35)" },
  needs_coordination: { label: "Needs coordination", color: "var(--alert-warning)", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.35)" },
  needs_acs_decision: { label: "Needs ACS decision", color: "var(--alert-critical)", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.4)" },
};

const COMPLETION_LABEL: Record<KpiCompletionStatus, { label: string; color: string; bg: string; border: string }> = {
  completed: { label: "Completed", color: "var(--alert-success)", bg: "rgba(0,200,83,0.12)", border: "rgba(0,200,83,0.4)" },
  pending_review: { label: "Completion Pending", color: "var(--alert-warning)", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)" },
  rejected: { label: "Completion Rejected", color: "var(--alert-critical)", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)" },
};

function isKpiBelowTarget(s: KPISubmission): boolean {
  if (s.type === "BINARY") return s.yes !== true;
  const d = s.denominator ?? 0;
  if (d <= 0) return false;
  const n = s.numerator ?? 0;
  return n < d;
}

type Props = {
  open: boolean;
  submission: KPISubmission | null;
  isReviewer: boolean;
  onClose: () => void;
  onReviewed: () => void;
};

function WorkflowBadge({ status }: { status: KpiMeasurementHistory["workflowStatus"] }) {
  const config: Record<KpiMeasurementHistory["workflowStatus"], { label: string; color: string; bg: string; border: string }> = {
    draft: { label: "Draft", color: "var(--text-muted)", bg: "rgba(136,136,136,0.16)", border: "rgba(136,136,136,0.32)" },
    submitted_pending: { label: "Pending Review", color: "var(--alert-warning)", bg: "rgba(255,184,0,0.12)", border: "rgba(255,184,0,0.4)" },
    approved: { label: "Approved", color: "var(--alert-success)", bg: "rgba(0,200,83,0.12)", border: "rgba(0,200,83,0.4)" },
    rejected: { label: "Rejected", color: "var(--alert-critical)", bg: "rgba(255,59,59,0.12)", border: "rgba(255,59,59,0.4)" },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em]"
      style={{ color: c.color, backgroundColor: c.bg, borderColor: c.border }}
    >
      {c.label}
    </span>
  );
}

function ValueDisplay({
  type,
  numerator,
  denominator,
  yes,
  unit,
  numeratorUnit,
  denominatorUnit,
}: {
  type: string;
  numerator: number | null;
  denominator: number | null;
  yes: boolean | null;
  unit: string;
  numeratorUnit?: string | null;
  denominatorUnit?: string | null;
}) {
  if (type === "BINARY") {
    return <span>{yes === null ? "—" : yes ? "Yes" : "No"}</span>;
  }
  if (numerator === null && denominator === null) return <span>—</span>;
  const num = numerator ?? 0;
  const den = denominator;
  
  const hasDiffUnits =
    numeratorUnit &&
    denominatorUnit &&
    numeratorUnit !== denominatorUnit;

  if (hasDiffUnits) {
    return (
      <span>
        {num} <span className="text-[var(--text-muted)] font-normal text-xs">{numeratorUnit}</span>
        {den !== null ? (
          <>
            {" / "}{den} <span className="text-[var(--text-muted)] font-normal text-xs">{denominatorUnit}</span>
          </>
        ) : ""}
      </span>
    );
  }

  return (
    <span>
      {num}
      {den !== null ? ` / ${den}` : ""} <span className="text-[var(--text-muted)]">{unit}</span>
    </span>
  );
}

export default function ViewKpiModal({ open, submission, isReviewer, onClose, onReviewed }: Props) {
  const [loading, setLoading] = useState(false);
  const [measurements, setMeasurements] = useState<KpiMeasurementHistory[]>([]);
  const [kpiMeta, setKpiMeta] = useState<{
    scheme: string;
    vertical: string;
    unit: string;
    numeratorUnit?: string | null;
    denominatorUnit?: string | null;
    type: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const rejectRef = useRef<HTMLTextAreaElement>(null);
  const [reassignOpen, setReassignOpen] = useState(false);

  useEffect(() => {
    if (!open || !submission) return;
    setMeasurements([]);
    setError(null);
    setActionMsg(null);
    setShowRejectInput(false);
    setRejectNote("");
    setLoading(true);

    fetchKpiHistory(submission.id)
      .then((data) => {
        setMeasurements(data.measurements);
        setKpiMeta({
          scheme: data.kpi.scheme,
          vertical: data.kpi.vertical,
          unit: data.kpi.unit,
          numeratorUnit: data.kpi.numeratorUnit,
          denominatorUnit: data.kpi.denominatorUnit,
          type: data.kpi.type,
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load KPI history");
      })
      .finally(() => setLoading(false));
  }, [open, submission]);

  useEffect(() => {
    if (!open) setReassignOpen(false);
  }, [open]);

  useEffect(() => {
    if (showRejectInput) rejectRef.current?.focus();
  }, [showRejectInput]);

  if (!open || !submission) return null;

  const latestPending = measurements.find((m) => m.workflowStatus === "submitted_pending");
  const canReview = isReviewer && !!latestPending;

  const handleApprove = async () => {
    if (!latestPending) return;
    setReviewBusy(true);
    setActionMsg(null);
    try {
      await reviewKpiMeasurement(latestPending.id, { decision: "approve" });
      setActionMsg("Measurement approved successfully.");
      const refreshed = await fetchKpiHistory(submission.id);
      setMeasurements(refreshed.measurements);
      onReviewed();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleReject = async () => {
    if (!latestPending || !rejectNote.trim()) return;
    setReviewBusy(true);
    setActionMsg(null);
    try {
      await reviewKpiMeasurement(latestPending.id, { decision: "reject", note: rejectNote.trim() });
      setActionMsg("Measurement rejected.");
      const refreshed = await fetchKpiHistory(submission.id);
      setMeasurements(refreshed.measurements);
      setShowRejectInput(false);
      setRejectNote("");
      onReviewed();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-6 pb-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">
              {kpiMeta?.scheme ?? submission.scheme} · {kpiMeta?.vertical ?? submission.vertical}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-[var(--text-primary)]">{submission.description}</h2>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 uppercase tracking-[0.2em]">
                {kpiMeta?.type ?? submission.type}
              </span>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 uppercase tracking-[0.2em]">
                {submission.category}
              </span>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
                {kpiMeta?.numeratorUnit && kpiMeta?.denominatorUnit && kpiMeta.numeratorUnit !== kpiMeta.denominatorUnit ? (
                  <span>Units: {kpiMeta.numeratorUnit} (Num) / {kpiMeta.denominatorUnit} (Den)</span>
                ) : (
                  <span>Unit: {kpiMeta?.unit ?? submission.unit}</span>
                )}
              </span>
              {submission.completionStatus && (() => {
                const cfg = COMPLETION_LABEL[submission.completionStatus];
                return (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                  >
                    {submission.completionStatus === "completed" && <CheckCircle2 className="h-2.5 w-2.5" />}
                    {submission.completionStatus === "pending_review" && <AlertTriangle className="h-2.5 w-2.5" />}
                    {submission.completionStatus === "rejected" && <AlertTriangle className="h-2.5 w-2.5" />}
                    {cfg.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)]"
          >
            Close
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-6 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">Ownership</p>
            {submission.currentUserCanReassignOwners && (
              <button
                type="button"
                onClick={() => setReassignOpen(true)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                Reassign
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Action owner</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{submission.assignedToName?.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Reviewer</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{submission.reviewerName?.trim() || "—"}</p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Reviewer approval panel */}
          {canReview && (
            <div className="mb-6 rounded-2xl border border-[rgba(255,184,0,0.4)] bg-[rgba(255,184,0,0.06)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--alert-warning)]">Awaiting Your Review</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Submitted on {latestPending.measuredAt}
                {latestPending.submittedBy ? ` by ${latestPending.submittedBy}` : ""} · FY {latestPending.financialYear}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
                <span className="font-medium">
                  <ValueDisplay
                    type={kpiMeta?.type ?? submission.type}
                    numerator={latestPending.numeratorValue}
                    denominator={latestPending.denominatorValue}
                    yes={latestPending.yesValue}
                    unit={kpiMeta?.unit ?? submission.unit}
                    numeratorUnit={kpiMeta?.numeratorUnit ?? submission.numeratorUnit}
                    denominatorUnit={kpiMeta?.denominatorUnit ?? submission.denominatorUnit}
                  />
                </span>
                {latestPending.remarks && (
                  <span className="text-[var(--text-muted)]">· "{latestPending.remarks}"</span>
                )}
              </div>

              {actionMsg && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-muted)]">
                  {actionMsg}
                </div>
              )}

              {!showRejectInput && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onClick={handleApprove}
                    className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] disabled:opacity-50"
                  >
                    {reviewBusy ? "Working..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onClick={() => setShowRejectInput(true)}
                    className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)] disabled:opacity-50"
                  >
                    Reject with Comment
                  </button>
                </div>
              )}

              {showRejectInput && (
                <div className="mt-4 space-y-3">
                  <label className="block text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Rejection note (required)
                    <textarea
                      ref={rejectRef}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border)]"
                      placeholder="Explain why this submission is being rejected..."
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reviewBusy || !rejectNote.trim()}
                      onClick={handleReject}
                      className="rounded-xl border border-[rgba(255,59,59,0.5)] bg-[rgba(255,59,59,0.1)] px-4 py-2 text-xs font-semibold text-[var(--alert-critical)] disabled:opacity-50"
                    >
                      {reviewBusy ? "Working..." : "Confirm Reject"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewBusy}
                      onClick={() => { setShowRejectInput(false); setRejectNote(""); }}
                      className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Completion workflow panel */}
          {(submission.currentUserCanRequestCompletion || submission.currentUserCanReviewCompletion || submission.completionStatus) && (
            <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">KPI Completion</p>

              {submission.completionStatus && (
                <div className="mt-2 text-sm text-[var(--text-primary)]">
                  {(() => {
                    const cfg = COMPLETION_LABEL[submission.completionStatus];
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em]"
                        style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                      >
                        {submission.completionStatus === "completed" && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {submission.completionStatus !== "completed" && <AlertTriangle className="h-2.5 w-2.5" />}
                        {cfg.label}
                      </span>
                    );
                  })()}
                  {submission.completionRequestedAt && (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Requested on {submission.completionRequestedAt.slice(0, 10)}
                    </p>
                  )}
                  {submission.completionNote && (
                    <p className="mt-1 text-xs italic text-[var(--text-muted)]">&ldquo;{submission.completionNote}&rdquo;</p>
                  )}
                  {submission.completionReviewedAt && submission.completionReviewNote && (
                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
                      <span className="font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Review note: </span>
                      <span className="text-[var(--text-primary)]">{submission.completionReviewNote}</span>
                    </div>
                  )}
                </div>
              )}

              {actionMsg && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-muted)]">
                  {actionMsg}
                </div>
              )}

              {submission.currentUserCanRequestCompletion && isKpiBelowTarget(submission) && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] px-3 py-1 text-[11px] font-medium text-[var(--alert-warning)]">
                  <AlertTriangle className="h-3 w-3" />
                  Progress is below 100% — you can still mark this KPI complete.
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {submission.currentUserCanRequestCompletion && (
                  <button
                    type="button"
                    disabled={completeBusy}
                    onClick={async () => {
                      setCompleteBusy(true);
                      setActionMsg(null);
                      try {
                        await requestKpiCompletion(submission.id, {});
                        setActionMsg("Completion request submitted.");
                        onReviewed();
                      } catch (e: unknown) {
                        setActionMsg(e instanceof Error ? e.message : "Failed to mark complete");
                      } finally {
                        setCompleteBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {completeBusy ? "Working…" : "Mark Complete"}
                  </button>
                )}
                {submission.currentUserCanReviewCompletion && (
                  <>
                    <button
                      type="button"
                      disabled={completeBusy}
                      onClick={async () => {
                        setCompleteBusy(true);
                        setActionMsg(null);
                        try {
                          await reviewKpiCompletion(submission.id, { decision: "approve" });
                          setActionMsg("Completion approved.");
                          onReviewed();
                        } catch (e: unknown) {
                          setActionMsg(e instanceof Error ? e.message : "Approval failed");
                        } finally {
                          setCompleteBusy(false);
                        }
                      }}
                      className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] disabled:opacity-50"
                    >
                      Approve Completion
                    </button>
                    <button
                      type="button"
                      disabled={completeBusy}
                      onClick={async () => {
                        const note = typeof window !== "undefined" ? window.prompt("Rejection note (required)") : null;
                        if (!note?.trim()) {
                          setActionMsg("Rejection cancelled or empty note.");
                          return;
                        }
                        setCompleteBusy(true);
                        setActionMsg(null);
                        try {
                          await reviewKpiCompletion(submission.id, { decision: "reject", note });
                          setActionMsg("Completion rejected.");
                          onReviewed();
                        } catch (e: unknown) {
                          setActionMsg(e instanceof Error ? e.message : "Rejection failed");
                        } finally {
                          setCompleteBusy(false);
                        }
                      }}
                      className="rounded-xl border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.08)] px-4 py-2 text-xs font-semibold text-[var(--alert-critical)] disabled:opacity-50"
                    >
                      Reject Completion
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* History section */}
          <div>
            <p className="mb-4 text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">Update History</p>

            {loading && (
              <div className="text-sm text-[var(--text-muted)]">Loading history...</div>
            )}
            {error && (
              <div className="text-sm text-[var(--alert-critical)]">{error}</div>
            )}
            {!loading && !error && measurements.length === 0 && (
              <div className="text-sm text-[var(--text-muted)]">No measurements recorded yet.</div>
            )}

            {!loading && !error && measurements.length > 0 && (
              <div className="space-y-3">
                {measurements.map((m, i) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">
                          FY {m.financialYear} · {m.measuredAt}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[8px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                            Latest
                          </span>
                        )}
                      </div>
                      <WorkflowBadge status={m.workflowStatus} />
                    </div>

                    <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                      <ValueDisplay
                        type={kpiMeta?.type ?? submission.type}
                        numerator={m.numeratorValue}
                        denominator={m.denominatorValue}
                        yes={m.yesValue}
                        unit={kpiMeta?.unit ?? submission.unit}
                        numeratorUnit={kpiMeta?.numeratorUnit ?? submission.numeratorUnit}
                        denominatorUnit={m.denominatorValue !== null ? kpiMeta?.denominatorUnit ?? submission.denominatorUnit : undefined}
                      />
                    </div>

                    {m.remarks && (
                      <p className="mt-1 text-xs italic text-[var(--text-muted)]">"{m.remarks}"</p>
                    )}

                    {/* Bottleneck reason */}
                    {m.bottleneckReason && (
                      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)]">Bottleneck</p>
                        <p className="mt-0.5 text-xs text-[var(--text-primary)]">{m.bottleneckReason}</p>
                      </div>
                    )}

                    {/* Escalation flag */}
                    {m.escalationFlag && m.escalationFlag !== "on_track" && (() => {
                      const cfg = ESCALATION_LABEL[m.escalationFlag];
                      if (!cfg) return null;
                      return (
                        <span
                          className="mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.25em]"
                          style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {cfg.label}
                        </span>
                      );
                    })()}

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--text-muted)]">
                      {m.submittedBy && (
                        <span>
                          <span className="uppercase tracking-[0.2em]">Submitted by</span>{" "}
                          <span className="text-[var(--text-primary)]">{m.submittedBy}</span>
                        </span>
                      )}
                      {m.reviewedBy && (
                        <span>
                          <span className="uppercase tracking-[0.2em]">
                            {m.workflowStatus === "approved" ? "Approved" : "Rejected"} by
                          </span>{" "}
                          <span className="text-[var(--text-primary)]">{m.reviewedBy}</span>
                          {m.reviewedAt && <span> on {m.reviewedAt}</span>}
                        </span>
                      )}
                    </div>

                    {m.reviewNote && (
                      <div className="mt-2 rounded-xl border border-[rgba(255,59,59,0.3)] bg-[rgba(255,59,59,0.06)] px-3 py-2 text-xs text-[var(--alert-critical)]">
                        <span className="font-semibold uppercase tracking-[0.2em]">Rejection note: </span>
                        {m.reviewNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ReassignKpiModal
        open={reassignOpen}
        submission={submission}
        onClose={() => setReassignOpen(false)}
        onSaved={() => {
          onReviewed();
        }}
      />
    </div>
  );
}
