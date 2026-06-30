"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import ConfirmModal from "@/src/components/ui/ConfirmModal";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission } from "@/lib/auth";
import { fetchFyBudgetAllocation, saveFyBudgetAllocation } from "@/src/lib/services/financialService";
import type { FinanceYearBudgetAllocationLineRow } from "@/types";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";

function roundCr(n: number): number {
  return Math.round(n * 100) / 100;
}

const MANUAL_CATEGORY_SET = new Set<string>(FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES);

function defaultLines(): FinanceYearBudgetAllocationLineRow[] {
  return FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => ({
    category,
    label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
    budgetEstimateCr: 0,
    soExpenditureCr: 0,
    ifmsExpenditureCr: 0,
  }));
}

export default function SummaryEntryPage() {
  useRequireAnyPermission([Permission.ENTER_FINANCIAL_DATA, Permission.MANAGE_FINANCIAL_DATA], "/");

  const [financialYearLabel, setFinancialYearLabel] = useState<string | null>(null);
  const [allocationLines, setAllocationLines] = useState<FinanceYearBudgetAllocationLineRow[]>(defaultLines);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const loadAllocation = useCallback(async (fyLabel?: string) => {
    setLoading(true);
    try {
      const data = await fetchFyBudgetAllocation(fyLabel ? { financialYearLabel: fyLabel } : undefined);
      setFinancialYearLabel(data.financialYearLabel ?? null);
      setAllocationLines(data.lines.length === 0 ? defaultLines() : data.lines);
    } catch {
      setAllocationLines(defaultLines());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllocation();
  }, [loadAllocation]);

  const totals = useMemo(
    () =>
      allocationLines.reduce(
        (acc, r) => ({
          budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
          soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
          ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
        }),
        { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
      ),
    [allocationLines],
  );

  const executeSave = async () => {
    if (!financialYearLabel) return;
    setIsSubmitting(true);
    try {
      await saveFyBudgetAllocation({
        financialYearLabel,
        lines: allocationLines
          .filter((r) => MANUAL_CATEGORY_SET.has(r.category))
          .map((r) => ({
            category: r.category,
            budgetEstimateCr: roundCr(r.budgetEstimateCr),
            soExpenditureCr: roundCr(r.soExpenditureCr),
            ifmsExpenditureCr: roundCr(r.ifmsExpenditureCr),
          })),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadAllocation(financialYearLabel);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!financialYearLabel) {
      setError("Financial year not loaded.");
      return;
    }
    setError(null);

    const exceedingCategories = allocationLines.filter(
      (r) => MANUAL_CATEGORY_SET.has(r.category) && r.soExpenditureCr > r.budgetEstimateCr
    );
    if (exceedingCategories.length > 0) {
      const names = exceedingCategories.map((r) => r.label);
      const confirmMsg = exceedingCategories.length === 1
        ? `Warning: The Sanction Order (SO) value for "${names[0]}" exceeds its Budget Estimate (BE). Do you want to proceed?`
        : `Warning: The Sanction Order (SO) values for the following categories exceed their Budget Estimates (BE):\n${names.map((n) => `- ${n}`).join("\n")}\n\nDo you want to proceed?`;
      
      setConfirmConfig({
        title: "Exceed Budget Warning",
        message: confirmMsg,
        confirmLabel: "Proceed",
        cancelLabel: "Cancel",
        onConfirm: () => {
          void executeSave();
        },
      });
      return;
    }

    await executeSave();
  };

  const updateRow = (
    category: string,
    field: keyof Pick<FinanceYearBudgetAllocationLineRow, "budgetEstimateCr" | "soExpenditureCr" | "ifmsExpenditureCr">,
    value: number,
  ) => {
    setAllocationLines((prev) =>
      prev.map((r) => (r.category === category ? { ...r, [field]: roundCr(Number.isFinite(value) ? value : 0) } : r)),
    );
  };

  return (
    <AppShell title="Financial Entry — FY budget summary">
      <div className="px-6 py-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-lg space-y-6">
          {success && (
            <div className="rounded-xl border border-[var(--alert-success)] bg-[rgba(0,200,83,0.1)] px-4 py-3 text-sm text-[var(--alert-success)]">
              FY budget summary saved.
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.1)] px-4 py-3 text-sm text-[var(--alert-critical)]">
              {error}
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Summary-level Financial Entry</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Financial year budget allocation</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {financialYearLabel ? `FY ${financialYearLabel}` : "Loading financial year..."}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">
              State, centrally sponsored, and central sector scheme rows are calculated from scheme budgets, supplements, and
              expenditure. Edit only the commission, transfer, and admin lines below; total budget (₹ Cr) is the sum of estimates
              across all categories.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)] mb-3">Category breakdown</p>
            {loading && <p className="text-sm text-[var(--text-muted)]">Loading...</p>}
            {!loading && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <tr>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Budget estimate (₹ Cr)</th>
                      <th className="py-2 pr-4">SO expenditure (₹ Cr)</th>
                      <th className="py-2 pr-4">IFMS expenditure (₹ Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationLines.map((row) => {
                      const editable = MANUAL_CATEGORY_SET.has(row.category);
                      const inputClass =
                        "w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm " +
                        (editable
                          ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
                          : "bg-[var(--bg-primary)]/60 text-[var(--text-muted)] cursor-not-allowed");
                      return (
                        <tr key={row.category} className="border-t border-[var(--border)]">
                          <td className="py-3 pr-4 text-[var(--text-primary)] font-medium">
                            {row.label}
                            {!editable && (
                              <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-[var(--text-muted)]">
                                (auto filled)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              readOnly={!editable}
                              value={row.budgetEstimateCr}
                              onChange={(e) => updateRow(row.category, "budgetEstimateCr", Number(e.target.value))}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              readOnly={!editable}
                              value={row.soExpenditureCr}
                              onChange={(e) => updateRow(row.category, "soExpenditureCr", Number(e.target.value))}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              readOnly={!editable}
                              value={row.ifmsExpenditureCr}
                              onChange={(e) => updateRow(row.category, "ifmsExpenditureCr", Number(e.target.value))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--border)] font-semibold text-[var(--text-primary)]">
                      <td className="py-3">Totals</td>
                      <td className="py-3 pr-4">{totals.budgetEstimateCr.toFixed(2)}</td>
                      <td className="py-3 pr-4">{totals.soExpenditureCr.toFixed(2)}</td>
                      <td className="py-3 pr-4">{totals.ifmsExpenditureCr.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-[var(--text-primary)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSubmitting || loading}
              onClick={handleSave}
            >
              {isSubmitting ? "Saving..." : "Save summary"}
            </button>
          </div>
        </div>
      </div>
      {confirmConfig && (
        <ConfirmModal
          open={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(null);
          }}
          onCancel={() => {
            setConfirmConfig(null);
          }}
        />
      )}
    </AppShell>
  );
}
