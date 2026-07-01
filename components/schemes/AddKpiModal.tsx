"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createKpiDefinition } from "@/src/lib/services/kpiService";
import { SchemeOverview, UserRole } from "@/types";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export type KpiUserOption = { id: string; code: string | null; name: string; email: string; role?: string };

function matchesUserSearch(u: KpiUserOption, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    u.name.toLowerCase().includes(s) ||
    u.email.toLowerCase().includes(s) ||
    !!(u.code && u.code.toLowerCase().includes(s))
  );
}

export function SearchableKpiUserField({
  label,
  hint,
  users,
  value,
  onChange,
  disabled,
  excludeUserId,
  excludeUserIds,
}: {
  label: string;
  hint?: string;
  users: KpiUserOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  excludeUserId: string;
  /** Extra user ids (directory ids / DB user ids) that cannot be selected. */
  excludeUserIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => users.find((u) => u.id === value) ?? null, [users, value]);

  const excludedIdSet = useMemo(() => {
    const s = new Set<string>();
    if (excludeUserId) s.add(excludeUserId);
    for (const x of excludeUserIds ?? []) {
      if (x) s.add(x);
    }
    return s;
  }, [excludeUserId, excludeUserIds]);

  const filtered = useMemo(() => {
    return users.filter((u) => matchesUserSearch(u, query));
  }, [users, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const formatUserLine = (u: KpiUserOption) => (
    <>
      {u.name}
      {u.code ? ` (${u.code})` : ""}
    </>
  );

  return (
    <div ref={rootRef} className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
      <span className="block">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
          {hint}
        </span>
      ) : null}
      <div className="relative mt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] disabled:opacity-50"
        >
          <span className="min-w-0 truncate">
            {selected ? formatUserLine(selected) : <span className="text-[var(--text-muted)]">Select user…</span>}
          </span>
          <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
            ▾
          </span>
        </button>
        {open && !disabled && (
          <div
            className="absolute left-0 right-0 z-10 mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-lg"
            role="listbox"
          >
            <label className="mb-2 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)]">
              Search
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Name, code, or email"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                autoFocus
              />
            </label>
            <ul className="max-h-48 overflow-y-auto text-sm font-normal normal-case tracking-normal">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  — Clear —
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-2 py-2 text-[var(--text-muted)] normal-case">No matches.</li>
              ) : (
                filtered.map((u) => {
                  const excluded = excludedIdSet.has(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        role="option"
                        disabled={excluded}
                        aria-selected={value === u.id}
                        title={excluded ? "Already assigned in another slot" : undefined}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          if (excluded) return;
                          onChange(u.id);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        {formatUserLine(u)}
                        <span className="mt-0.5 block text-[11px] lowercase text-[var(--text-muted)]">{u.email}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  scheme: SchemeOverview | null;
  users: KpiUserOption[];
  onSaved: () => void;
};

const KPI_TYPE_META: Record<
  "OUTPUT" | "OUTCOME" | "BINARY",
  { label: string; description: string; entry: string; unitLabel: string; unitHint: string; denominatorLabel: string; denominatorHint: string }
> = {
  OUTPUT: {
    label: "Output",
    description: "A numeric value — absolute count or percentage. Action owners enter a number each time they update progress.",
    entry: "numeric",
    unitLabel: "Unit",
    unitHint: "What is being measured (e.g. households, km, %)",
    denominatorLabel: "Target",
    denominatorHint: "The total target value to reach",
  },
  OUTCOME: {
    label: "Outcome",
    description: "A written update describing what was achieved. Action owners type a short qualitative note — no number is recorded.",
    entry: "text",
    unitLabel: "",
    unitHint: "",
    denominatorLabel: "",
    denominatorHint: "",
  },
  BINARY: {
    label: "Binary",
    description: "A yes / no milestone. Action owners mark it complete or not — no number or text entry required.",
    entry: "none",
    unitLabel: "",
    unitHint: "",
    denominatorLabel: "",
    denominatorHint: "",
  },
};

export default function AddKpiModal({ open, onClose, scheme, users, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [kpiType, setKpiType] = useState<"OUTPUT" | "OUTCOME" | "BINARY">("OUTPUT");
  const [subschemeId, setSubschemeId] = useState<string>("");
  const [unit, setUnit] = useState("");
  const [denominator, setDenominator] = useState("");
  const [monitoringLevel, setMonitoringLevel] = useState<"CS" | "ACS" | "CM" | "">("");
  const [performerIds, setPerformerIds] = useState<string[]>([""]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([""]);
  const [isSelfApproved, setIsSelfApproved] = useState(false);
  const [showNodalWarning, setShowNodalWarning] = useState(false);

  const handlePerformerChange = (id: string, index: number) => {
    const nextPerf = performerIds.map((v, i) => (i === index ? id : v));
    setPerformerIds(nextPerf);
    const hasNodal = nextPerf.some((pid) => {
      const u = users.find((user) => user.id === pid);
      return u?.role === UserRole.NODAL_OFFICER;
    });
    if (isSelfApproved && hasNodal) {
      setShowNodalWarning(true);
    }
  };

  const handleSelfApproveChange = (checked: boolean) => {
    setIsSelfApproved(checked);
    if (checked) {
      setReviewerIds([]);
      const hasNodal = performerIds.some((pid) => {
        const u = users.find((user) => user.id === pid);
        return u?.role === UserRole.NODAL_OFFICER;
      });
      if (hasNodal) {
        setShowNodalWarning(true);
      }
    } else {
      setReviewerIds([""]);
    }
  };

  const handleWarningCancel = () => {
    setShowNodalWarning(false);
    setIsSelfApproved(false);
    setReviewerIds([""]);
  };

  const derivedCategory: "STATE" | "CENTRAL" = scheme?.sponsorshipType === "STATE" ? "STATE" : "CENTRAL";

  useEffect(() => {
    if (!open || !scheme) return;
    setDescription("");
    setKpiType("OUTPUT");
    setSubschemeId("");
    setUnit("");
    setDenominator("");
    setMonitoringLevel("");
    setPerformerIds([""]);
    setReviewerIds([""]);
    setIsSelfApproved(false);
    setShowNodalWarning(false);
    setAlert(null);
  }, [open, scheme]);

  const handleSubmit = async () => {
    if (!scheme) return;
    const d = description.trim();
    if (!d) {
      setAlert("Description is required.");
      return;
    }
    const performers = performerIds.map((id) => id.trim()).filter(Boolean);
    const reviewers = isSelfApproved ? [] : reviewerIds.map((id) => id.trim()).filter(Boolean);
    if (performers.length === 0) {
      setAlert("Select at least one action owner.");
      return;
    }
    if (!isSelfApproved && reviewers.length === 0) {
      setAlert("Select at least one reviewer when separate review is required.");
      return;
    }
    if (!isSelfApproved) {
      const overlap = performers.filter((id) => reviewers.includes(id));
      if (overlap.length > 0) {
        setAlert("Action owners and reviewers must not include the same user.");
        return;
      }
    }
    setSaving(true);
    setAlert(null);
    try {
      const unitTrimmed = kpiType === "OUTPUT" ? (unit.trim() || null) : null;
      const denominatorValue = kpiType === "OUTPUT" && denominator.trim() ? Number(denominator.trim()) : null;
      await createKpiDefinition({
        schemeId: scheme.id,
        subschemeId: subschemeId || null,
        category: derivedCategory,
        description: d,
        kpiType,
        numeratorUnit: unitTrimmed,
        denominatorUnit: unitTrimmed,
        denominatorValue: isNaN(denominatorValue as number) ? null : denominatorValue,
        monitoringLevel: monitoringLevel || null,
        performerUserIds: performers,
        reviewerUserIds: reviewers,
        isSelfApproved,
      });
      onSaved();
      onClose();
    } catch (error: unknown) {
      setAlert(getErrorMessage(error, "Could not add KPI."));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !scheme) return null;

  const userPickerDisabled = users.length < 1;
  const allExcludedForPerformers = (index: number) =>
    [...reviewerIds.filter(Boolean), ...performerIds.filter((pid, i) => i !== index && Boolean(pid))];
  const allExcludedForReviewers = (index: number) =>
    [...performerIds.filter(Boolean), ...reviewerIds.filter((rid, i) => i !== index && Boolean(rid))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-kpi-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="add-kpi-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Add KPI
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {scheme.code} — {scheme.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
          >
            Close
          </button>
        </div>

        {alert && (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
            {alert}
          </div>
        )}

        {userPickerDisabled && (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
            At least one active user is required in the directory to assign owners.
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>

          {/* <div className="flex justify between">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Category</p>
            <span className="mt-2 inline-block rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)]">
              {derivedCategory}
            </span>
          </div> */}

          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Monitoring Level
            <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
              Which level will monitor this KPI
            </span>
            <select
              value={monitoringLevel}
              onChange={(e) => setMonitoringLevel(e.target.value as "CS" | "ACS" | "CM" | "")}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)]"
            >
              <option value="">Select level (optional)</option>
              <option value="CS">CS — Chief Secretary</option>
              <option value="ACS">ACS — Additional Chief Secretary</option>
              <option value="CM">CM — Chief Minister</option>
            </select>
          </label>

          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">KPI Type</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["OUTPUT", "OUTCOME", "BINARY"] as const).map((type) => {
                const meta = KPI_TYPE_META[type];
                const selected = kpiType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setKpiType(type);
                      if (type !== "OUTPUT") {
                        setUnit("");
                        setDenominator("");
                      }
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-[var(--text-primary)] bg-[var(--bg-hover)]"
                        : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-widest ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                      {meta.label}
                    </p>
                    <p className="mt-1 text-[11px] font-normal normal-case tracking-normal text-[var(--text-muted)] leading-snug">
                      {meta.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          {kpiType === "OUTCOME" && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
              When updating this KPI, the action owner will write a short text note describing what was achieved — no number is entered or stored.
            </p>
          )}
          {kpiType === "BINARY" && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
              When updating this KPI, the action owner simply marks it as complete or incomplete — no number or text is entered.
            </p>
          )}

          {scheme.subschemes.length > 0 && (
            <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Subscheme (optional)
              <select
                value={subschemeId}
                onChange={(e) => setSubschemeId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="">Scheme level (no subscheme)</option>
                {scheme.subschemes.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} — {sub.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Action owners</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Anyone listed may enter or update KPI progress.</p>
              <button
                type="button"
                disabled={userPickerDisabled}
                onClick={() => setPerformerIds((prev) => [...prev, ""])}
                className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
              >
                Add owner
              </button>
              <div className="mt-3 space-y-3">
                {performerIds.map((pid, index) => (
                  <div key={`perf-${index}`} className="flex flex-col gap-2 md:flex-row md:items-end">
                    <div className="min-w-0 flex-1">
                      <SearchableKpiUserField
                        label={index === 0 ? "Action owner" : `Action owner (${index + 1})`}
                        hint={index === 0 ? "Enters and updates KPI progress" : undefined}
                        users={users}
                        value={pid}
                        onChange={(id) => handlePerformerChange(id, index)}
                        disabled={userPickerDisabled}
                        excludeUserId=""
                        excludeUserIds={allExcludedForPerformers(index)}
                      />
                    </div>
                    {performerIds.length > 1 && (
                      <button
                        type="button"
                        disabled={userPickerDisabled}
                        onClick={() => setPerformerIds((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <input
                  type="checkbox"
                  id="kpi-self-approve-checkbox"
                  checked={isSelfApproved}
                  disabled={userPickerDisabled}
                  onChange={(e) => handleSelfApproveChange(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-card)] focus:ring-[var(--accent)]"
                />
                <label htmlFor="kpi-self-approve-checkbox" className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] cursor-pointer select-none">
                  No separate review needed — owner will self-approve
                </label>
              </div>
              {isSelfApproved && (
                <p className="text-xs text-[var(--alert-success)]">
                  ✓ KPI progress submissions will be approved immediately upon entry.
                </p>
              )}
            </div>
            {!isSelfApproved && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Reviewers</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Optional. Anyone listed may approve or reject submissions. If none are listed, submissions are marked
                  complete when saved (no separate review).
                </p>
                <button
                  type="button"
                  disabled={userPickerDisabled}
                  onClick={() => setReviewerIds((prev) => [...prev, ""])}
                  className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-50"
                >
                  Add reviewer
                </button>
                <div className="mt-3 space-y-3">
                  {reviewerIds.map((rid, index) => (
                    <div key={`rev-${index}`} className="flex flex-col gap-2 md:flex-row md:items-end">
                      <div className="min-w-0 flex-1">
                        <SearchableKpiUserField
                          label={index === 0 ? "Reviewer" : `Reviewer (${index + 1})`}
                          hint={index === 0 ? "Confirms submitted updates" : undefined}
                          users={users}
                          value={rid}
                          onChange={(id) => setReviewerIds((prev) => prev.map((v, i) => (i === index ? id : v)))}
                          disabled={userPickerDisabled}
                          excludeUserId=""
                          excludeUserIds={allExcludedForReviewers(index)}
                        />
                      </div>
                      {reviewerIds.length > 1 && (
                        <button
                          type="button"
                          disabled={userPickerDisabled}
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
          </div>
          {kpiType === "OUTPUT" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Measurement</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Unit
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
                    What is being measured (e.g. households, km, %)
                  </span>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. households"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)]"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Target
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)] opacity-80">
                    The total target value to reach
                  </span>
                  <input
                    type="number"
                    value={denominator}
                    onChange={(e) => setDenominator(e.target.value)}
                    placeholder="e.g. 500"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)]"
                  />
                </label>
              </div>
              {unit && denominator && (
                <p className="text-[11px] text-[var(--text-muted)] normal-case tracking-normal">
                  Progress will show as: <span className="font-medium text-[var(--text-primary)]">__ / {denominator} {unit}</span>
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={saving || userPickerDisabled}
            onClick={handleSubmit}
            className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add KPI"}
          </button>
        </div>
      </div>
      <ConfirmModal
        open={showNodalWarning}
        title="Warning: Nodal Officer Self-Approval"
        message="Assigning a Nodal Officer as a self-reviewer should technically never happen unless in a very specific case. Only TASU, FA, or Vertical Heads ideally should have self-approval privileges. Are you sure you want to proceed?"
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => setShowNodalWarning(false)}
        onCancel={handleWarningCancel}
      />
    </div>
  );
}
