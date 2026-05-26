"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AddKpiModal from "@/components/schemes/AddKpiModal";
import SchemeFormModal from "@/components/schemes/SchemeFormModal";
import SchemeModal from "@/components/schemes/SchemeModal";
import EditKpiModal from "@/components/kpis/EditKpiModal";
import { useRequireAuth } from "@/src/lib/route-guards";
import { fetchSchemesOverview } from "@/src/lib/services/schemeService";
import { KPISubmission, SchemeKpiSummary, SchemeOverview, SchemeReferenceData } from "@/types";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { withNextBasePath } from "@/lib/next-base-path";

function formatCurrency(value: number) {
  return `₹${value.toFixed(1)} Cr`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function kpiSummaryToSubmission(k: SchemeKpiSummary): KPISubmission {
  return {
    id: k.id,
    scheme: "",
    vertical: "",
    category: k.category as "STATE" | "CENTRAL",
    description: k.description,
    type: k.kpiType as "OUTPUT" | "OUTCOME" | "BINARY",
    unit: "",
    status: "not_submitted",
    lastUpdated: "",
    monitoringLevel: k.monitoringLevel,
  };
}

export default function SchemesPage() {
  useRequireAuth();
  const [schemes, setSchemes] = useState<SchemeOverview[]>([]);
  const [reference, setReference] = useState<SchemeReferenceData | null>(null);
  const [financialYearLabel, setFinancialYearLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [archivedFilter, setArchivedFilter] = useState<"all" | "active" | "archived">("active");

  const [schemeFormOpen, setSchemeFormOpen] = useState(false);
  const [schemeFormTarget, setSchemeFormTarget] = useState<SchemeOverview | null>(null);
  const [kpiModalScheme, setKpiModalScheme] = useState<SchemeOverview | null>(null);
  const [schemeProgressModal, setSchemeProgressModal] = useState<SchemeOverview | null>(null);
  const [editKpiTarget, setEditKpiTarget] = useState<KPISubmission | null>(null);

  const canManageSchemes = permissions.includes("MANAGE_SCHEMES");

  const reloadOverview = useCallback(async () => {
    const archivedParam = archivedFilter === "all" ? undefined : archivedFilter === "archived" ? "true" : "false";
    const url = archivedParam ? `/api/v1/schemes/overview?archived=${archivedParam}` : "/api/v1/schemes/overview";
    const response = await fetch(withNextBasePath(url), { cache: "no-store" });
    const data = await response.json();
    setSchemes(data.schemes);
    setFinancialYearLabel(data.financialYearLabel);
    setReference(data.reference);
  }, [archivedFilter]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [overviewRes, rbacRes] = await Promise.all([
          reloadOverview(),
          fetch(withNextBasePath("/api/v1/rbac/me"), { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!active) return;
        const rbacPerms = rbacRes?.user?.permissions;
        setPermissions(Array.isArray(rbacPerms) ? rbacPerms : []);
      } catch (e: unknown) {
        if (!active) return;
        setError(getErrorMessage(e, "Failed to load schemes"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [reloadOverview]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateScheme = () => {
    setSchemeFormTarget(null);
    setSchemeFormOpen(true);
  };

  const openEditScheme = (s: SchemeOverview) => {
    setSchemeFormTarget(s);
    setSchemeFormOpen(true);
  };

  const unarchiveScheme = async (id: string) => {
    try {
      const response = await fetch(withNextBasePath(`/api/v1/schemes/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!response.ok) throw new Error("Failed to unarchive scheme");
      await reloadOverview();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to unarchive scheme"));
    }
  };

  const deleteScheme = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the scheme "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(withNextBasePath(`/api/v1/schemes/${id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete scheme");
      }
      await reloadOverview();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to delete scheme"));
    }
  };

  const deleteKpi = async (kpiId: string, description: string, schemeId: string) => {
    if (!confirm(`Are you sure you want to delete the KPI "${description}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(withNextBasePath(`/api/v1/kpis/${kpiId}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete KPI");
      }
      await reloadOverview();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to delete KPI"));
    }
  };

  return (
    <AppShell title="Schemes">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Programme registry</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Schemes</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              All schemes with KPI definitions, latest expenditure ({financialYearLabel ?? "current FY"}), and subschemes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArchivedFilter("active")}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                  archivedFilter === "active"
                    ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setArchivedFilter("archived")}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                  archivedFilter === "archived"
                    ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                }`}
              >
                Archived
              </button>
              <button
                type="button"
                onClick={() => setArchivedFilter("all")}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                  archivedFilter === "all"
                    ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                }`}
              >
                All
              </button>
            </div>
            {canManageSchemes && reference && (
              <button
                type="button"
                onClick={openCreateScheme}
                className="shrink-0 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)]"
              >
                Create scheme
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--alert-critical)]">
            {error}
          </div>
        )}

        {loading && <div className="text-sm text-[var(--text-muted)]">Loading schemes...</div>}

        {!loading && schemes.length === 0 && !error && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-muted)]">
            No schemes found.
          </div>
        )}

        {!loading && schemes.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-surface)] text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                <tr>
                  <th className="w-10 px-2 py-3" />
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Scheme</th>
                  <th className="px-4 py-3">Vertical</th>
                  <th className="px-4 py-3">KPIs</th>
                  <th className="px-4 py-3">Budget (Cr)</th>
                  <th className="px-4 py-3">SO</th>
                  <th className="px-4 py-3">IFMS</th>
                  <th className="px-4 py-3">Subschemes</th>
                  {canManageSchemes && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {schemes.map((s) => {
                  const open = expanded.has(s.id);
                  const exp = s.expenditure;
                  return (
                    <Fragment key={s.id}>
                      <tr className="border-t border-[var(--border)]">
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(s.id)}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--border)]"
                            aria-expanded={open}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{s.code}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-[var(--text-primary)]">{s.name}</span>
                            <button
                              type="button"
                              onClick={() => setSchemeProgressModal(s)}
                              className="w-fit text-left text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
                            >
                              Progress & analytics
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{s.verticalName}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{s.kpis.length}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {exp ? formatCurrency(exp.annualBudgetCr) : "—"}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{exp ? formatCurrency(exp.soExpenditureCr) : "—"}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{exp ? formatCurrency(exp.ifmsExpenditureCr) : "—"}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{s.subschemes.length}</td>
                        {canManageSchemes && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => setKpiModalScheme(s)}
                                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                              >
                                Add KPIs
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditScheme(s)}
                                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                              >
                                Edit
                              </button>
                              {s.archived && (
                                <button
                                  type="button"
                                  onClick={() => unarchiveScheme(s.id)}
                                  className="rounded-lg border border-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent)]"
                                >
                                  Unarchive
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteScheme(s.id, s.name)}
                                className="rounded-lg border border-[var(--alert-critical)] px-2 py-1 text-[11px] text-[var(--alert-critical)] hover:bg-[var(--alert-critical)] hover:text-white"
                                title="Delete scheme"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="border-t border-[var(--border)] bg-[var(--bg-card)]" style={{ backgroundColor: 'var(--bg-card) !important' }}>
                          <td colSpan={canManageSchemes ? 10 : 9} className="px-6 py-4">
                            <div className="grid gap-6 lg:grid-cols-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Components</p>
                                {s.subschemes.length === 0 ? (
                                  <p className="mt-2 text-sm text-[var(--text-muted)]">None</p>
                                ) : (
                                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
                                    {s.subschemes.map((sub) => (
                                      <li key={sub.id}>
                                        <span className="font-medium">{sub.code}</span> — {sub.name}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="lg:col-span-2">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">KPI definitions</p>
                                {s.kpis.length === 0 ? (
                                  <p className="mt-2 text-sm text-[var(--text-muted)]">No KPIs linked to this scheme.</p>
                                ) : (
                                  <div className="mt-2 overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-left text-[var(--text-muted)]">
                                          <th className="pb-2 pr-3">Description</th>
                                          <th className="pb-2 pr-3">Type</th>
                                          <th className="pb-2 pr-3">Category</th>
                                          <th className="pb-2 pr-3">Monitoring</th>
                                          <th className="pb-2">Component</th>
                                          {canManageSchemes && <th className="pb-2 pl-2" />}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {s.kpis.map((k) => (
                                          <tr key={k.id} className="border-t border-[var(--border)] text-[var(--text-primary)]">
                                            <td className="py-2 pr-3 align-top">{k.description}</td>
                                            <td className="py-2 pr-3 align-top">{k.kpiType}</td>
                                            <td className="py-2 pr-3 align-top">{k.category}</td>
                                            <td className="py-2 pr-3 align-top">
                                              {k.monitoringLevel ? (
                                                <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-primary)]">
                                                  {k.monitoringLevel}
                                                </span>
                                              ) : (
                                                <span className="text-[var(--text-muted)]">—</span>
                                              )}
                                            </td>
                                            <td className="py-2 align-top">
                                              {k.subschemeCode ? `${k.subschemeCode} (${k.subschemeName})` : "—"}
                                            </td>
                                            {canManageSchemes && (
                                              <td className="py-2 pl-2 align-top">
                                                <div className="flex gap-1">
                                                  <button
                                                    type="button"
                                                    title="Edit KPI"
                                                    onClick={() => setEditKpiTarget(kpiSummaryToSubmission(k))}
                                                    className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--border)] hover:text-[var(--text-primary)]"
                                                  >
                                                    <Pencil className="h-3 w-3" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    title="Delete KPI"
                                                    onClick={() => deleteKpi(k.id, k.description, s.id)}
                                                    className="rounded p-1 text-[var(--alert-critical)] transition hover:bg-[var(--alert-critical)] hover:text-white"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              </td>
                                            )}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                            {exp && (
                              <p className="mt-4 text-xs text-[var(--text-muted)]">
                                Expenditure as of {exp.asOfDate ?? "—"} · FY {exp.financialYearLabel ?? "—"}
                              </p>
                            )}
                            {s.assignments.length > 0 && (
                              <div className="mt-4 border-t border-[var(--border)] pt-4">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Assignments</p>
                                <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                                  {s.assignments.map((a) => (
                                    <li key={a.id}>
                                      {a.assignmentKind}
                                      {a.userName ? ` · ${a.userName}` : ""}
                                      {a.roleCode ? ` · ${a.roleCode}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {reference && (
          <SchemeFormModal
            open={schemeFormOpen}
            onClose={() => {
              setSchemeFormOpen(false);
              setSchemeFormTarget(null);
            }}
            scheme={schemeFormTarget}
            reference={reference}
            onSaved={reloadOverview}
          />
        )}

        <AddKpiModal
          open={kpiModalScheme !== null}
          onClose={() => setKpiModalScheme(null)}
          scheme={kpiModalScheme}
          users={reference?.users ?? []}
          onSaved={reloadOverview}
        />

        <SchemeModal
          open={schemeProgressModal !== null}
          onClose={() => setSchemeProgressModal(null)}
          scheme={
            schemeProgressModal
              ? {
                  id: schemeProgressModal.id,
                  code: schemeProgressModal.code,
                  name: schemeProgressModal.name,
                  verticalName: schemeProgressModal.verticalName,
                }
              : null
          }
        />

        <EditKpiModal
          open={editKpiTarget !== null}
          submission={editKpiTarget}
          onClose={() => setEditKpiTarget(null)}
          onSaved={reloadOverview}
        />
      </div>
    </AppShell>
  );
}
