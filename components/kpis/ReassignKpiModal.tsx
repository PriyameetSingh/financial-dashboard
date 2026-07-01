"use client";

import { useEffect, useState } from "react";
import { KPISubmission } from "@/types";
import { SearchableKpiUserField } from "@/components/schemes/AddKpiModal";
import { fetchSchemesOverview } from "@/src/lib/services/schemeService";
import { updateKpiDefinitionAssignments } from "@/src/lib/services/kpiService";

type Props = {
  open: boolean;
  submission: KPISubmission | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ReassignKpiModal({ open, submission, onClose, onSaved }: Props) {
  const [users, setUsers] = useState<Array<{ id: string; code: string | null; name: string; email: string }> | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [performerIds, setPerformerIds] = useState<string[]>([""]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([""]);
  const [isSelfApproved, setIsSelfApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !submission) return;
    setUsers(null);
    setUsersError(null);
    const initialIsSelfApproved =
      submission.isSelfApproved === true ||
      (submission.reviewerUserIds !== undefined
        ? submission.reviewerUserIds.length === 0
        : (!submission.reviewerUserId || submission.reviewerUserId === "Self-Approved"));
    setIsSelfApproved(initialIsSelfApproved);

    const p =
      submission.performerUserIds?.length ?
        submission.performerUserIds
      : submission.assignedToUserId ? [submission.assignedToUserId]
      : [""];
    const r =
      initialIsSelfApproved ? [] :
      (submission.reviewerUserIds?.length ?
        submission.reviewerUserIds
      : (submission.reviewerUserId && submission.reviewerUserId !== "Self-Approved") ? [submission.reviewerUserId]
      : [""]);
    setPerformerIds(p);
    setReviewerIds(r);
    setMsg(null);
    let cancelled = false;
    fetchSchemesOverview()
      .then((data) => {
        if (!cancelled) setUsers(data.reference.users);
      })
      .catch((e: unknown) => {
        if (!cancelled) setUsersError(e instanceof Error ? e.message : "Could not load users");
      });
    return () => {
      cancelled = true;
    };
  }, [open, submission]);

  if (!open || !submission) return null;

  const allExcludedForPerformers = (index: number) =>
    [...reviewerIds.filter(Boolean), ...performerIds.filter((pid, i) => i !== index && Boolean(pid))];
  const allExcludedForReviewers = (index: number) =>
    [...performerIds.filter(Boolean), ...reviewerIds.filter((rid, i) => i !== index && Boolean(rid))];

  const handleSave = async () => {
    const performers = performerIds.map((id) => id.trim()).filter(Boolean);
    const reviewers = isSelfApproved ? [] : reviewerIds.map((id) => id.trim()).filter(Boolean);
    if (performers.length === 0) {
      setMsg("Select at least one action owner.");
      return;
    }
    if (!isSelfApproved && reviewers.length === 0) {
      setMsg("Select at least one reviewer when separate review is required.");
      return;
    }
    if (!isSelfApproved) {
      const overlap = performers.filter((id) => reviewers.includes(id));
      if (overlap.length > 0) {
        setMsg("Action owners and reviewers must not include the same user.");
        return;
      }
    }
    setBusy(true);
    setMsg(null);
    try {
      await updateKpiDefinitionAssignments(submission.id, {
        performerUserIds: performers,
        reviewerUserIds: reviewers,
        isSelfApproved,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const userPickerDisabled = !users || users.length < 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reassign-kpi-title"
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
            <h2 id="reassign-kpi-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Reassign KPI
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {submission.scheme} — {submission.description}
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

        <div className="mt-6 space-y-6">
          {usersError && <p className="text-sm text-[var(--alert-critical)]">{usersError}</p>}
          {!usersError && users === null && (
            <p className="text-sm text-[var(--text-muted)]">Loading user directory…</p>
          )}
          {users && users.length < 1 && (
            <p className="text-sm text-[var(--text-muted)]">The user directory is empty.</p>
          )}
          {users && users.length >= 1 && (
            <>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Action owners</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPerformerIds((prev) => [...prev, ""])}
                  className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
                >
                  Add owner
                </button>
                <div className="mt-3 space-y-3">
                  {performerIds.map((pid, index) => (
                    <div key={`p-${index}`} className="flex flex-col gap-2 md:flex-row md:items-end">
                      <div className="min-w-0 flex-1">
                        <SearchableKpiUserField
                          label={index === 0 ? "Action owner" : `Owner (${index + 1})`}
                          users={users}
                          value={pid}
                          onChange={(id) => setPerformerIds((prev) => prev.map((v, i) => (i === index ? id : v)))}
                          disabled={busy}
                          excludeUserId=""
                          excludeUserIds={allExcludedForPerformers(index)}
                        />
                      </div>
                      {performerIds.length > 1 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPerformerIds((prev) => prev.filter((_, i) => i !== index))}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <input
                  type="checkbox"
                  id="reassign-kpi-self-approve-checkbox"
                  checked={isSelfApproved}
                  disabled={userPickerDisabled}
                  onChange={(e) => {
                    setIsSelfApproved(e.target.checked);
                    if (e.target.checked) {
                      setReviewerIds([]);
                    } else {
                      setReviewerIds([""]);
                    }
                  }}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-card)] focus:ring-[var(--accent)]"
                />
                <label htmlFor="reassign-kpi-self-approve-checkbox" className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] cursor-pointer select-none">
                  No separate review needed — owner will self-approve
                </label>
              </div>
              {isSelfApproved && (
                <p className="text-xs text-[var(--alert-success)]">
                  ✓ KPI progress submissions will be approved immediately upon entry.
                </p>
              )}
              {!isSelfApproved && (
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Reviewers</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Optional. If none are listed, submitted updates are marked complete without a separate review step.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setReviewerIds((prev) => [...prev, ""])}
                    className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
                  >
                    Add reviewer
                  </button>
                  <div className="mt-3 space-y-3">
                    {reviewerIds.map((rid, index) => (
                      <div key={`r-${index}`} className="flex flex-col gap-2 md:flex-row md:items-end">
                        <div className="min-w-0 flex-1">
                          <SearchableKpiUserField
                            label={index === 0 ? "Reviewer" : `Reviewer (${index + 1})`}
                            users={users}
                            value={rid}
                            onChange={(id) => setReviewerIds((prev) => prev.map((v, i) => (i === index ? id : v)))}
                            disabled={busy}
                            excludeUserId=""
                            excludeUserIds={allExcludedForReviewers(index)}
                          />
                        </div>
                        {reviewerIds.length > 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setReviewerIds((prev) => prev.filter((_, i) => i !== index))}
                            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {msg && <p className="text-sm text-[var(--text-muted)]">{msg}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={busy || userPickerDisabled}
              onClick={handleSave}
              className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save assignments"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
