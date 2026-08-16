"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  addSubscheme,
  archiveScheme,
  createScheme,
  updateScheme,
} from "@/src/lib/services/schemeService";
import { SchemeAssignmentKind, SchemeReferenceData, SchemeView, SponsorshipType } from "@/types";

const DASHBOARD_OWNER_KIND = "dashboard_owner" as const;

type DashboardAssignmentRow = {
  assigneeType: "user" | "role";
  sortOrder: number;
  subschemeId: string | null;
  userId: string | null;
  roleId: string | null;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function dashboardRowFromView(entry: SchemeView["assignments"][number]): DashboardAssignmentRow {
  const hasUser = Boolean(entry.userId);
  const hasRole = Boolean(entry.roleId);
  const assigneeType: "user" | "role" = hasRole && !hasUser ? "role" : "user";
  return {
    assigneeType,
    sortOrder: entry.sortOrder,
    subschemeId: entry.subschemeId,
    userId: assigneeType === "user" ? entry.userId : null,
    roleId: assigneeType === "role" ? entry.roleId : null,
  };
}

function SchemeAssignmentRowsEditor({
  title,
  hint,
  rows,
  setRows,
  reference,
}: {
  title: string;
  hint: string;
  rows: DashboardAssignmentRow[];
  setRows: Dispatch<SetStateAction<DashboardAssignmentRow[]>>;
  reference: SchemeReferenceData;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">{title}</p>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      <button
        type="button"
        onClick={() =>
          setRows((prev) => [
            ...prev,
            {
              assigneeType: "user",
              sortOrder: prev.length,
              subschemeId: null,
              userId: null,
              roleId: null,
            },
          ])
        }
        className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
      >
        Add assignment
      </button>
      {rows.map((item, index) => (
        <div
          key={`${title}-assignment-${index}`}
          className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 md:flex-row md:flex-wrap md:items-center"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-primary)]">
            <span className="text-[var(--text-muted)]">Assign to</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name={`${title}-scheme-assignee-${index}`}
                checked={item.assigneeType === "user"}
                onChange={() =>
                  setRows((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, assigneeType: "user", roleId: null } : entry,
                    ),
                  )
                }
                className="accent-[var(--text-primary)]"
              />
              User
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name={`${title}-scheme-assignee-${index}`}
                checked={item.assigneeType === "role"}
                onChange={() =>
                  setRows((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, assigneeType: "role", userId: null } : entry,
                    ),
                  )
                }
                className="accent-[var(--text-primary)]"
              />
              Role
            </label>
          </div>
          {item.assigneeType === "user" ? (
            <select
              value={item.userId ?? ""}
              onChange={(event) =>
                setRows((prev) =>
                  prev.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, userId: event.target.value || null } : entry,
                  ),
                )
              }
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="">Select user</option>
              {reference.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={item.roleId ?? ""}
              onChange={(event) =>
                setRows((prev) =>
                  prev.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, roleId: event.target.value || null } : entry,
                  ),
                )
              }
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="">Select role</option>
              {reference.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.code}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] md:ml-auto"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** When null, modal is in “create” mode. */
  scheme: SchemeView | null;
  reference: SchemeReferenceData;
  onSaved: () => void;
};

export default function SchemeFormModal({ open, onClose, scheme, reference, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    name: "",
    verticalName: "",
    sponsorshipType: "STATE" as SponsorshipType,
  });
  const [subschemes, setSubschemes] = useState<Array<{ code: string; name: string }>>([]);
  const [subschemeDraft, setSubschemeDraft] = useState({ code: "", name: "" });
  /** Dashboard ownership (`dashboard_owner`). */
  const [assignments, setAssignments] = useState<DashboardAssignmentRow[]>([]);
  const [kpiPerformerRows, setKpiPerformerRows] = useState<DashboardAssignmentRow[]>([]);
  const [kpiReviewerRows, setKpiReviewerRows] = useState<DashboardAssignmentRow[]>([]);
  const [actionPerformerRows, setActionPerformerRows] = useState<DashboardAssignmentRow[]>([]);
  const [actionReviewerRows, setActionReviewerRows] = useState<DashboardAssignmentRow[]>([]);

  const resetForm = useCallback(() => {
    setSelectedId(null);
    setForm({
      code: "",
      name: "",
      verticalName: "",
      sponsorshipType: "STATE",
    });
    setSubschemes([]);
    setSubschemeDraft({ code: "", name: "" });
    setAssignments([]);
    setKpiPerformerRows([]);
    setKpiReviewerRows([]);
    setActionPerformerRows([]);
    setActionReviewerRows([]);
    setAlert(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (scheme) {
      setSelectedId(scheme.id);
      setForm({
        code: scheme.code,
        name: scheme.name,
        verticalName: scheme.verticalName,
        sponsorshipType: scheme.sponsorshipType,
      });
      setSubschemes(scheme.subschemes.map((item) => ({ code: item.code, name: item.name })));
      const dashboard = scheme.assignments.filter((e) => e.assignmentKind === DASHBOARD_OWNER_KIND);
      setAssignments(dashboard.map(dashboardRowFromView));
      setKpiPerformerRows(
        scheme.assignments.filter((e) => e.assignmentKind === "kpi_owner_1").map(dashboardRowFromView),
      );
      setKpiReviewerRows(
        scheme.assignments.filter((e) => e.assignmentKind === "kpi_owner_2").map(dashboardRowFromView),
      );
      setActionPerformerRows(
        scheme.assignments.filter((e) => e.assignmentKind === "action_item_owner_1").map(dashboardRowFromView),
      );
      setActionReviewerRows(
        scheme.assignments.filter((e) => e.assignmentKind === "action_item_owner_2").map(dashboardRowFromView),
      );
      setSubschemeDraft({ code: "", name: "" });
    } else {
      resetForm();
    }
  }, [open, scheme, resetForm]);

  const buildAssignmentsPayload = (): Array<{
    assignmentKind: SchemeAssignmentKind;
    sortOrder: number;
    subschemeId: string | null;
    userId: string | null;
    roleId: string | null;
  }> => {
    const mapRows = (rows: DashboardAssignmentRow[], kind: SchemeAssignmentKind) =>
      rows.map((row, index) => ({
        assignmentKind: kind,
        sortOrder: row.sortOrder ?? index,
        subschemeId: row.subschemeId,
        userId: row.assigneeType === "user" ? row.userId : null,
        roleId: row.assigneeType === "role" ? row.roleId : null,
      }));
    const dashboardPayload = assignments.map((row, index) => ({
      assignmentKind: DASHBOARD_OWNER_KIND,
      sortOrder: row.sortOrder ?? index,
      subschemeId: row.subschemeId,
      userId: row.assigneeType === "user" ? row.userId : null,
      roleId: row.assigneeType === "role" ? row.roleId : null,
    }));
    return [
      ...mapRows(kpiPerformerRows, "kpi_owner_1"),
      ...mapRows(kpiReviewerRows, "kpi_owner_2"),
      ...mapRows(actionPerformerRows, "action_item_owner_1"),
      ...mapRows(actionReviewerRows, "action_item_owner_2"),
      ...dashboardPayload,
    ];
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.verticalName.trim()) {
      setAlert("Scheme code, name, and vertical are required.");
      return;
    }

    setSaving(true);
    setAlert(null);
    try {
      const assignmentsPayload = buildAssignmentsPayload();
      if (selectedId) {
        await updateScheme(selectedId, {
          code: form.code,
          name: form.name,
          verticalName: form.verticalName.trim(),
          sponsorshipType: form.sponsorshipType,
          assignments: assignmentsPayload,
        });
      } else {
        await createScheme({
          code: form.code,
          name: form.name,
          verticalName: form.verticalName.trim(),
          sponsorshipType: form.sponsorshipType,
          subschemes,
          assignments: assignmentsPayload,
        });
      }
      onSaved();
      onClose();
    } catch (error: unknown) {
      setAlert(getErrorMessage(error, "Unable to save scheme."));
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubschemeToExisting = async () => {
    if (!selectedId) return;
    if (!subschemeDraft.code.trim() || !subschemeDraft.name.trim()) {
      setAlert("Subscheme code and name are required.");
      return;
    }
    setSaving(true);
    setAlert(null);
    try {
      await addSubscheme(selectedId, {
        code: subschemeDraft.code.trim(),
        name: subschemeDraft.name.trim(),
      });
      setSubschemeDraft({ code: "", name: "" });
      onSaved();
    } catch (error: unknown) {
      setAlert(getErrorMessage(error, "Unable to add subscheme."));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedId) return;
    if (!window.confirm("Archive this scheme? It will be hidden from the active list but can be unarchived later.")) return;
    setSaving(true);
    setAlert(null);
    try {
      await archiveScheme(selectedId);
      onSaved();
      onClose();
    } catch (error: unknown) {
      setAlert(getErrorMessage(error, "Unable to archive scheme."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title = scheme ? "Edit scheme" : "Create scheme";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ax-scrim px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheme-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="scheme-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Scheme code, vertical, dashboard/KPI/action ownership (multiple rows allowed), and optional subschemes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-accent)]"
          >
            Close
          </button>
        </div>

        {alert && (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
            {alert}
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">
            Code
            <input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">
            Vertical
            <input
              value={form.verticalName}
              onChange={(event) => setForm((prev) => ({ ...prev, verticalName: event.target.value }))}
              placeholder="e.g. Housing, Water, SBM"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">
            Sponsorship Type
            <select
              value={form.sponsorshipType}
              onChange={(event) => setForm((prev) => ({ ...prev, sponsorshipType: event.target.value as SponsorshipType }))}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="STATE">State sector</option>
              <option value="CENTRAL">Centrally sponsored</option>
              <option value="CENTRAL_SECTOR">Central sector</option>
              <option value="NON_FINANCIAL">Non-financial scheme (KPI only)</option>
            </select>
          </label>

          {!selectedId && (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Optional subschemes (on create)</p>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  placeholder="Subscheme code"
                  value={subschemeDraft.code}
                  onChange={(event) => setSubschemeDraft((prev) => ({ ...prev, code: event.target.value }))}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <input
                  placeholder="Subscheme name"
                  value={subschemeDraft.name}
                  onChange={(event) => setSubschemeDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!subschemeDraft.code.trim() || !subschemeDraft.name.trim()) return;
                  setSubschemes((prev) => [...prev, { code: subschemeDraft.code, name: subschemeDraft.name }]);
                  setSubschemeDraft({ code: "", name: "" });
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
              >
                Add subscheme
              </button>
              {subschemes.length > 0 && (
                <div className="space-y-1 text-xs text-[var(--text-muted)]">
                  {subschemes.map((item, index) => (
                    <div key={`${item.code}-${index}`}>
                      {item.code} — {item.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedId && (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Add subscheme to this scheme</p>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  placeholder="Subscheme code"
                  value={subschemeDraft.code}
                  onChange={(event) => setSubschemeDraft((prev) => ({ ...prev, code: event.target.value }))}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <input
                  placeholder="Subscheme name"
                  value={subschemeDraft.name}
                  onChange={(event) => setSubschemeDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleAddSubschemeToExisting}
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-60"
              >
                Add subscheme
              </button>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-primary)]">Dashboard owner assignments</p>
            <p className="text-xs text-[var(--text-muted)]">Each row is a dashboard owner. Assign either a user or a role.</p>
            <button
              type="button"
              onClick={() =>
                setAssignments((prev) => [
                  ...prev,
                  {
                    assigneeType: "user",
                    sortOrder: prev.length,
                    subschemeId: null,
                    userId: null,
                    roleId: null,
                  },
                ])
              }
              className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
            >
              Add assignment
            </button>
            {assignments.map((item, index) => (
              <div
                key={`assignment-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 md:flex-row md:flex-wrap md:items-center"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)]">Assign to</span>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`scheme-assignee-${index}`}
                      checked={item.assigneeType === "user"}
                      onChange={() =>
                        setAssignments((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, assigneeType: "user", roleId: null } : entry,
                          ),
                        )
                      }
                      className="accent-[var(--text-primary)]"
                    />
                    User
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`scheme-assignee-${index}`}
                      checked={item.assigneeType === "role"}
                      onChange={() =>
                        setAssignments((prev) =>
                          prev.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, assigneeType: "role", userId: null } : entry,
                          ),
                        )
                      }
                      className="accent-[var(--text-primary)]"
                    />
                    Role
                  </label>
                </div>
                {item.assigneeType === "user" ? (
                  <select
                    value={item.userId ?? ""}
                    onChange={(event) =>
                      setAssignments((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, userId: event.target.value || null } : entry,
                        ),
                      )
                    }
                    className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">Select user</option>
                    {reference.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={item.roleId ?? ""}
                    onChange={(event) =>
                      setAssignments((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, roleId: event.target.value || null } : entry,
                        ),
                      )
                    }
                    className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">Select role</option>
                    {reference.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.code}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setAssignments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] md:ml-auto"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <SchemeAssignmentRowsEditor
            title="KPI action owners (scheme default)"
            hint="Who may enter KPI data when a KPI has no explicit owners. Add multiple rows for several people or roles."
            rows={kpiPerformerRows}
            setRows={setKpiPerformerRows}
            reference={reference}
          />
          <SchemeAssignmentRowsEditor
            title="KPI reviewers (scheme default)"
            hint="Who may review KPI submissions when a KPI has no explicit reviewers."
            rows={kpiReviewerRows}
            setRows={setKpiReviewerRows}
            reference={reference}
          />
          <SchemeAssignmentRowsEditor
            title="Action item performers (scheme default)"
            hint="Default performers for action-item workflows tied to this scheme."
            rows={actionPerformerRows}
            setRows={setActionPerformerRows}
            reference={reference}
          />
          <SchemeAssignmentRowsEditor
            title="Action item reviewers (scheme default)"
            hint="Default reviewers for action items under this scheme."
            rows={actionReviewerRows}
            setRows={setActionReviewerRows}
            reference={reference}
          />

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
            >
              {saving ? "Saving..." : selectedId ? "Update scheme" : "Create scheme"}
            </button>
            {selectedId && (
              <button
                type="button"
                disabled={saving}
                onClick={handleArchive}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] disabled:opacity-60"
              >
                Archive scheme
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
