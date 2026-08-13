"use client";

import { Fragment, useMemo, useState, useEffect, useCallback } from "react";
import { Loader2, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import ConfirmModal from "@/src/components/ui/ConfirmModal";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { getCurrentUser, Permission, hasPermission } from "@/lib/auth";
import { tenantLocale } from "@/lib/tenant-config/format";
import {
  fetchFinancialBudgets,
  submitFinancialSnapshot,
  patchFinancialBudget,
  createFinanceBudgetSupplement,
  patchFinancialSnapshot,
  deleteFinancialSnapshot,
} from "@/src/lib/services/financialService";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import { FinancialEntry } from "@/types";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

// We need a plugin for the horizontal line
const horizontalLinePlugin = {
  id: "horizontalLine",
  beforeDraw: (chart: any) => {
    const { ctx, chartArea, scales } = chart;
    const { y } = scales;

    if (chart.config.options.plugins.horizontalLine?.value !== undefined) {
      const yValue = chart.config.options.plugins.horizontalLine.value;
      const yPixel = y.getPixelForValue(yValue);

      if (yPixel >= chartArea.top && yPixel <= chartArea.bottom) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#95a5a6"; // gray dashed line
        ctx.moveTo(chartArea.left, yPixel);
        ctx.lineTo(chartArea.right, yPixel);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};
ChartJS.register(horizontalLinePlugin);

type SupplementRow = FinancialEntry["supplements"][number];

function appendSupplementToEntry(
  entry: FinancialEntry,
  opts: {
    hasSubschemes: boolean;
    subschemeCode: string | null;
    row: SupplementRow;
    amountCr: number;
  },
): FinancialEntry {
  const { hasSubschemes, subschemeCode, row, amountCr } = opts;
  if (hasSubschemes && subschemeCode && (entry.subschemes?.length ?? 0) > 0) {
    return {
      ...entry,
      subschemes: entry.subschemes!.map((sub) => {
        if (sub.code !== subschemeCode) return sub;
        const prevTotal = sub.totalSupplementCr ?? 0;
        const annual = sub.annualBudget ?? 0;
        const newTotal = prevTotal + amountCr;
        return {
          ...sub,
          totalSupplementCr: newTotal,
          effectiveBudgetCr: annual + newTotal,
          supplements: [row, ...(sub.supplements ?? [])],
        };
      }),
    };
  }
  const prevTotal = entry.totalSupplementCr ?? 0;
  const newTotal = prevTotal + amountCr;
  return {
    ...entry,
    totalSupplementCr: newTotal,
    effectiveBudgetCr: entry.annualBudget + newTotal,
    supplements: [row, ...entry.supplements],
  };
}

type SubmitIntent = "draft" | "submitted" | "supplement" | "revise" | "so";

const STATUS_COLORS: Record<string, string> = {
  submitted_this_week: "#2ecc71",
  submitted_pending: "#2ecc71",
  draft: "#3498db",
  overdue: "#e74c3c",
  not_started: "#95a5a6",
};

/** IFMS vs effective budget — same basis as main-panel utilisation; used for sidebar bars. */
function getSubschemeBudgetProgress(sub: {
  ifms?: number;
  effectiveBudgetCr?: number;
  annualBudget?: number;
}): { fillPct: number; color: string } {
  const eff = sub.effectiveBudgetCr ?? sub.annualBudget ?? 0;
  const ifms = sub.ifms ?? 0;
  if (eff <= 0) {
    return { fillPct: 0, color: "#95a5a6" };
  }
  const ratio = ifms / eff;
  const fillPct = Math.min(100, ratio * 100);
  let color: string;
  if (ratio > 1) color = "#e74c3c";
  else if (ratio >= 0.85) color = "#f39c12";
  else if (ratio >= 0.5) color = "#2ecc71";
  else color = "#3498db";
  return { fillPct, color };
}

export default function SchemeEntryPage() {
  useRequireAnyPermission([Permission.ENTER_FINANCIAL_DATA, Permission.MANAGE_FINANCIAL_DATA], "/");

  const [query, setQuery] = useState("");

  // Permission check for managing financial data
  const canManageFinancials = useMemo(() => {
    const user = getCurrentUser();
    return hasPermission(user, Permission.MANAGE_FINANCIAL_DATA);
  }, []);
  // Permission check for correcting/removing wrongly-entered financial entries
  const canEditFinancialEntries = useMemo(() => {
    const user = getCurrentUser();
    return hasPermission(user, Permission.EDIT_FINANCIAL_ENTRIES);
  }, []);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [financialYearLabel, setFinancialYearLabel] = useState<string | null>(null);
  const [selected, setSelected] = useState<FinancialEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<SubmitIntent | null>(null);

  // Subscheme selection
  const [selectedSubschemeCode, setSelectedSubschemeCode] = useState<string>("");

  // Card 3 state : IFMS
  const [ifmsValue, setIfmsValue] = useState<number | "">("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [ifmsMeetingId, setIfmsMeetingId] = useState("");

  const formatMeetingLabel = (m: MeetingListItem) => {
    const t = m.title?.trim();
    return t ? `${m.meetingDate} — ${t}` : m.meetingDate;
  };

  // Card 2 state : SO Edit
  const [isEditingSO, setIsEditingSO] = useState(false);
  const [editSoValue, setEditSoValue] = useState<number | "">("");
  const [editSoRemarks, setEditSoRemarks] = useState("");

  // Card 1 state : Supplement
  const [addingSupplement, setAddingSupplement] = useState(false);
  const [supplementAmount, setSupplementAmount] = useState<number | "">("");
  const [supplementReason, setSupplementReason] = useState("");
  const [supplementRefNo, setSupplementRefNo] = useState("");

  // Card 1 state: Revise Budget
  const [revisingBudget, setRevisingBudget] = useState(false);
  const [reviseBudgetAmount, setReviseBudgetAmount] = useState<number | "">("");
  const [reviseBudgetReason, setReviseBudgetReason] = useState("");

  // Local alert state
  const [alertInfo, setAlertInfo] = useState<{ type: "success" | "draft" | "error", message: string } | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Correction (EDIT_FINANCIAL_ENTRIES) state — edit/delete an existing snapshot row
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [editSnapSo, setEditSnapSo] = useState<number | "">("");
  const [editSnapIfms, setEditSnapIfms] = useState<number | "">("");
  const [editSnapRemarks, setEditSnapRemarks] = useState("");
  const [pendingCorrection, setPendingCorrection] = useState<"delete" | "correct" | null>(null);

  const triggerAlert = (type: "success" | "draft" | "error", message: string) => {
    setAlertInfo({ type, message });
    if (type !== "error") {
      setTimeout(() => setAlertInfo(null), 3500);
    }
  };

  const loadEntries = useCallback(async () => {
    try {
      const [data, meetingList] = await Promise.all([fetchFinancialBudgets(), fetchMeetings()]);
      setEntries(data.entries);
      setFinancialYearLabel(data.financialYearLabel);
      setMeetings(meetingList);
      if (meetingList.length > 0) setIfmsMeetingId(meetingList[0].id);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load financial data";
      setLoadError(msg);
      return null;
    }
  }, []);

  const applyEntry = useCallback((entry: FinancialEntry | null) => {
    setSelected(entry);
    setRemarks("");
    setAlertInfo(null);
    setAddingSupplement(false);
    setRevisingBudget(false);
    setIsEditingSO(false);
    setEditingSnapshotId(null);

    if (!entry) return;

    if (entry.subschemes && entry.subschemes.length > 0) {
      const first = entry.subschemes[0];
      setSelectedSubschemeCode(first.code);
      setIfmsValue("");
    } else {
      setSelectedSubschemeCode("");
      setIfmsValue("");
    }
    setAsOfDate(new Date().toISOString().slice(0, 10));
  }, []);

  const applySubscheme = useCallback((code: string, entry: FinancialEntry) => {
    const sub = entry.subschemes?.find((s) => s.code === code);
    if (!sub) return;
    setSelectedSubschemeCode(code);
    setIfmsValue("");
    setRemarks("");
    setAlertInfo(null);
    setAddingSupplement(false);
    setRevisingBudget(false);
    setIsEditingSO(false);
    setEditingSnapshotId(null);
    setAsOfDate(new Date().toISOString().slice(0, 10));
  }, []);

  /** Re-bind `selected` from a fresh fetch; `entries` alone does not update the detail panel. */
  const applyFreshEntries = useCallback(
    (
      data: { entries: FinancialEntry[]; financialYearLabel: string | null },
      schemeId: string,
      subschemeCode: string | null,
    ) => {
      const next = data.entries.find((e) => e.id === schemeId) ?? data.entries[0] ?? null;
      if (!next) return;
      applyEntry(next);
      if (subschemeCode && (next.subschemes?.length ?? 0) > 0) {
        const sub = next.subschemes?.find((s) => s.code === subschemeCode);
        if (sub) applySubscheme(subschemeCode, next);
      }
    },
    [applyEntry, applySubscheme],
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const [data, meetingList] = await Promise.all([fetchFinancialBudgets(), fetchMeetings()]);
        if (!active) return;
        setEntries(data.entries);
        setFinancialYearLabel(data.financialYearLabel);
        setMeetings(meetingList);
        if (meetingList.length > 0) setIfmsMeetingId(meetingList[0].id);
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
          applyEntry(data.entries[0] ?? null);
        } else {
          applyEntry(null);
        }
      } catch (e: unknown) {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load financial data");
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [applyEntry]);

  // Derived Values
  const hasSubschemes = (selected?.subschemes?.length ?? 0) > 0;
  const isBudgetLocked = selected?.locked ?? false;

  const activeOriginalBudgetCr = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.annualBudget ?? 0)
    : (selected?.annualBudget ?? 0);

  const activeTotalSupplementCr = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.totalSupplementCr ?? 0)
    : (selected?.totalSupplementCr ?? 0);

  const activeEffectiveBudgetCr = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.effectiveBudgetCr ?? 0)
    : (selected?.effectiveBudgetCr ?? 0);

  const activeSupplements = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.supplements ?? [])
    : (selected?.supplements ?? []);

  const activeHistory = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.history ?? [])
    : (selected?.history ?? []);

  const currentSO = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.so ?? 0)
    : (selected?.so ?? 0);

  const currentIFMS = hasSubschemes
    ? (selected?.subschemes?.find((s) => s.code === selectedSubschemeCode)?.ifms ?? 0)
    : (selected?.ifms ?? 0);

  const utilisation = activeEffectiveBudgetCr ? ((currentIFMS / activeEffectiveBudgetCr) * 100).toFixed(1) : "0.0";
  const lapseRisk = (100 - Number(utilisation)).toFixed(1);
  const soPercent = activeEffectiveBudgetCr ? ((currentSO / activeEffectiveBudgetCr) * 100).toFixed(1) : "0.0";

  // Aggregated supplement text
  let supCountText = "No adjustments";
  if (activeSupplements.length > 0) {
    const topups = activeSupplements.filter(s => s.amountCr > 0).length;
    const divs = activeSupplements.filter(s => s.amountCr < 0).length;
    const parts = [];
    if (topups > 0) parts.push(`${topups} top-up${topups > 1 ? 's' : ''}`);
    if (divs > 0) parts.push(`${divs} diversion${divs > 1 ? 's' : ''}`);
    supCountText = parts.join(", ");
  }

  // Submit operations
  const handleSaveDraft = () => persistSnapshot("draft");
  const handleSaveSubmit = () => persistSnapshot("submitted");

  const executePersistSnapshot = async (workflowStatus: "draft" | "submitted") => {
    if (!selected || !financialYearLabel) return;
    if (ifmsValue === "" || Number(ifmsValue) === 0) {
      triggerAlert("error", "Enter a valid IFMS expenditure value to add.");
      return;
    }

    const ifmsToAdd = Number(ifmsValue);
    if (isNaN(ifmsToAdd) || ifmsToAdd < 0) {
      triggerAlert("error", "Enter a valid non-negative IFMS value to add.");
      return;
    }
    if (!ifmsMeetingId.trim()) {
      triggerAlert("error", "Select the meeting this IFMS update is attributed to.");
      return;
    }

    setIsSubmitting(true);
    setPendingSubmit(workflowStatus);
    setAlertInfo(null);
    try {
      const totalIFMS = currentIFMS + ifmsToAdd;
      await submitFinancialSnapshot({
        schemeCode: selected.id,
        subschemeCode: hasSubschemes ? selectedSubschemeCode : null,
        asOfDate,
        soExpenditureCr: currentSO,
        ifmsExpenditureCr: totalIFMS,
        remarks,
        financialYearLabel,
        workflowStatus,
        meetingId: ifmsMeetingId.trim(),
      });

      if (workflowStatus === "draft") {
        triggerAlert("draft", "Draft saved.");
      } else {
        triggerAlert("success", "Update saved securely.");
        const data = await loadEntries();
        if (data) {
          applyFreshEntries(data, selected.id, hasSubschemes ? selectedSubschemeCode : null);
        }
      }
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(null);
    }
  };

  const persistSnapshot = async (workflowStatus: "draft" | "submitted") => {
    if (!selected || !financialYearLabel) return;
    if (addingSupplement || revisingBudget || isEditingSO) {
      setConfirmConfig({
        title: "Unsaved Changes",
        message: "You have open unsaved forms. Proceed anyway?",
        confirmLabel: "Proceed",
        cancelLabel: "Cancel",
        onConfirm: () => {
          void executePersistSnapshot(workflowStatus);
        },
      });
      return;
    }
    await executePersistSnapshot(workflowStatus);
  };

  const handleAddSupplement = async () => {
    if (!selected || !financialYearLabel) return;
    if (supplementAmount === "" || isNaN(Number(supplementAmount)) || Number(supplementAmount) === 0) {
      triggerAlert("error", "Enter a valid non-zero amount.");
      return;
    }
    if (!supplementReason.trim()) {
      triggerAlert("error", "Reason is required.");
      return;
    }
    setIsSubmitting(true);
    setPendingSubmit("supplement");
    try {
      const created = await createFinanceBudgetSupplement({
        schemeCode: selected.id,
        subschemeCode: hasSubschemes ? selectedSubschemeCode : null,
        financialYearLabel,
        amountCr: Number(supplementAmount),
        reason: supplementReason,
        referenceNo: supplementRefNo,
      });
      const amountCr = Number(created.amountCr);
      const actor = getCurrentUser()?.name ?? "You";
      const row: SupplementRow = {
        id: created.id,
        amountCr,
        reason: created.reason,
        referenceNo: created.referenceNo?.trim() || undefined,
        createdAt: created.createdAt,
        createdByName: actor,
      };
      const schemeId = selected.id;
      const subCode = hasSubschemes ? selectedSubschemeCode : null;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === schemeId
            ? appendSupplementToEntry(e, {
              hasSubschemes,
              subschemeCode: subCode,
              row,
              amountCr,
            })
            : e,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === schemeId
          ? appendSupplementToEntry(prev, {
            hasSubschemes,
            subschemeCode: subCode,
            row,
            amountCr,
          })
          : prev,
      );
      setAddingSupplement(false);
      setSupplementAmount("");
      setSupplementReason("");
      setSupplementRefNo("");
      triggerAlert("success", "Supplement added successfully.");
      void loadEntries().then((data) => {
        if (data) applyFreshEntries(data, schemeId, subCode);
      });
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Failed to add supplement.");
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(null);
    }
  };

  const handleReviseBudget = async () => {
    if (!selected || !financialYearLabel) return;
    if (reviseBudgetAmount === "" || isNaN(Number(reviseBudgetAmount)) || Number(reviseBudgetAmount) <= 0) {
      triggerAlert("error", "Enter a valid positive budget amount.");
      return;
    }
    setIsSubmitting(true);
    setPendingSubmit("revise");
    try {
      await patchFinancialBudget({
        schemeCode: selected.id,
        subschemeCode: hasSubschemes ? selectedSubschemeCode : null,
        financialYearLabel,
        newBudgetCr: Number(reviseBudgetAmount),
        reason: reviseBudgetReason.trim()
      });
      setRevisingBudget(false);
      setReviseBudgetAmount("");
      setReviseBudgetReason("");
      const schemeId = selected.id;
      const subCode = hasSubschemes ? selectedSubschemeCode : null;
      const data = await loadEntries();
      if (data) applyFreshEntries(data, schemeId, subCode);
      triggerAlert("success", "Budget revised successfully.");
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Failed to revise budget.");
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(null);
    }
  };

  const executeUpdateSO = async (totalSO: number) => {
    if (!selected || !financialYearLabel) return;
    setIsSubmitting(true);
    setPendingSubmit("so");
    try {
      // Per instructions SO update logic; substituting submitFinancialSnapshot for SO update
      await submitFinancialSnapshot({
        schemeCode: selected.id,
        subschemeCode: hasSubschemes ? selectedSubschemeCode : null,
        asOfDate: new Date().toISOString().slice(0, 10),
        soExpenditureCr: totalSO,
        ifmsExpenditureCr: currentIFMS,
        remarks: editSoRemarks,
        financialYearLabel,
        workflowStatus: "submitted",
        meetingId: ifmsMeetingId.trim(),
      });
      setIsEditingSO(false);
      setEditSoValue("");
      setEditSoRemarks("");
      const schemeId = selected.id;
      const subCode = hasSubschemes ? selectedSubschemeCode : null;
      const data = await loadEntries();
      if (data) applyFreshEntries(data, schemeId, subCode);
      triggerAlert("success", "SO updated successfully.");
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Failed to update SO.");
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(null);
    }
  };

  const handleUpdateSO = async () => {
    if (!selected || !financialYearLabel) return;
    const soToAdd = editSoValue === "" ? 0 : Number(editSoValue);
    if (isNaN(soToAdd) || soToAdd < 0) {
      triggerAlert("error", "Enter a valid non-negative SO amount to add.");
      return;
    }
    if (!ifmsMeetingId.trim()) {
      triggerAlert("error", "Select the meeting this financial update is attributed to.");
      return;
    }

    const totalSO = currentSO + soToAdd;
    if (totalSO > activeEffectiveBudgetCr) {
      setConfirmConfig({
        title: "Exceed Budget Warning",
        message: `Warning: Proposed total Sanction Order (SO) value of ₹${totalSO.toFixed(2)} Cr will exceed the Budget Estimate (BE) of ₹${activeEffectiveBudgetCr.toFixed(2)} Cr. Do you want to proceed?`,
        confirmLabel: "Proceed",
        cancelLabel: "Cancel",
        onConfirm: () => {
          void executeUpdateSO(totalSO);
        },
      });
      return;
    }

    await executeUpdateSO(totalSO);
  };

  const startEditSnapshot = (row: { id: string; so: number; ifms: number; remarks?: string | null }) => {
    setEditingSnapshotId(row.id);
    setEditSnapSo(row.so);
    setEditSnapIfms(row.ifms);
    setEditSnapRemarks(row.remarks ?? "");
    setAlertInfo(null);
  };

  const cancelEditSnapshot = () => {
    setEditingSnapshotId(null);
    setEditSnapSo("");
    setEditSnapIfms("");
    setEditSnapRemarks("");
  };

  const executeCorrectSnapshot = async (id: string) => {
    if (!selected || !financialYearLabel) return;
    const soVal = editSnapSo === "" ? 0 : Number(editSnapSo);
    const ifmsVal = editSnapIfms === "" ? 0 : Number(editSnapIfms);
    if (Number.isNaN(soVal) || soVal < 0 || Number.isNaN(ifmsVal) || ifmsVal < 0) {
      triggerAlert("error", "Enter valid non-negative SO and IFMS values.");
      return;
    }
    setIsSubmitting(true);
    setPendingCorrection("correct");
    setAlertInfo(null);
    try {
      await patchFinancialSnapshot({
        id,
        soExpenditureCr: soVal,
        ifmsExpenditureCr: ifmsVal,
        remarks: editSnapRemarks,
      });
      cancelEditSnapshot();
      const schemeId = selected.id;
      const subCode = hasSubschemes ? selectedSubschemeCode : null;
      const data = await loadEntries();
      if (data) applyFreshEntries(data, schemeId, subCode);
      triggerAlert("success", "Entry corrected successfully.");
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Failed to correct entry.");
    } finally {
      setIsSubmitting(false);
      setPendingCorrection(null);
    }
  };

  const executeDeleteSnapshot = async (id: string) => {
    if (!selected || !financialYearLabel) return;
    setIsSubmitting(true);
    setPendingCorrection("delete");
    setAlertInfo(null);
    try {
      await deleteFinancialSnapshot(id);
      const schemeId = selected.id;
      const subCode = hasSubschemes ? selectedSubschemeCode : null;
      const data = await loadEntries();
      if (data) applyFreshEntries(data, schemeId, subCode);
      triggerAlert("success", "Wrong entry removed successfully.");
    } catch (e: unknown) {
      triggerAlert("error", e instanceof Error ? e.message : "Failed to remove entry.");
    } finally {
      setIsSubmitting(false);
      setPendingCorrection(null);
    }
  };

  const requestDeleteSnapshot = (row: { id: string; asOfDate: string; ifms: number }) => {
    setConfirmConfig({
      title: "Remove financial entry",
      message: `Remove the expenditure snapshot dated ${new Date(row.asOfDate).toLocaleDateString(tenantLocale())} (IFMS ₹${row.ifms.toFixed(2)} Cr)? This cannot be undone.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void executeDeleteSnapshot(row.id);
      },
    });
  };

  const groupedSchemes = useMemo(() => {
    return entries.filter(e => e.scheme.toLowerCase().includes(query.toLowerCase()));
  }, [entries, query]);

  // Chart configuration
  const chartData = {
    labels: activeHistory.map(h => new Date(h.asOfDate).toLocaleString(tenantLocale(), { month: 'short', year: '2-digit' })),
    datasets: [
      {
        label: "IFMS Actual",
        data: activeHistory.map(h => h.ifms),
        backgroundColor: "rgba(46, 204, 113, 0.8)",
        borderRadius: 4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      horizontalLine: { value: currentSO }
    },
    scales: {
      x: {
        ticks: { autoSkip: false, maxRotation: 45, minRotation: 0, font: { size: 10 } },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 } }
      }
    }
  };

  return (
    <AppShell title="Financial Data Entry">
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-document)]">
        {/* SCHEME SELECTOR SIDEBAR */}
        <div className={`w-full md:w-72 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-[var(--border)]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search scheme..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-document)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {groupedSchemes.map(entry => {
              const isActive = selected?.id === entry.id;
              const hasSubs = (entry.subschemes?.length ?? 0) > 0;
              return (
                <div key={entry.id} className="space-y-1">
                  <button
                    onClick={() => applyEntry(entry)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left rounded-lg transition-colors ${isActive ? 'bg-[var(--bg-content-surface)] border border-[var(--accent)] shadow-sm' : 'hover:bg-[var(--bg-content-surface)] border border-transparent'}`}
                  >
                    <span className={`text-sm font-medium truncate pr-2 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{entry.scheme}</span>
                    <span
                      className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[entry.status] || '#95a5a6' }}
                    />
                  </button>
                  {isActive && hasSubs && (
                    <div className="ml-4 pl-3 border-l-2 border-[var(--accent)] space-y-1">
                      {entry.subschemes?.map(sub => {
                        const isActiveSub = sub.code === selectedSubschemeCode;
                        const progress = getSubschemeBudgetProgress(sub);
                        return (
                          <button
                            key={sub.code}
                            onClick={() => applySubscheme(sub.code, entry)}
                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${isActiveSub ? 'bg-[var(--bg-content-surface)] font-medium text-[var(--text-primary)] border border-[var(--accent)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent hover:bg-[var(--bg-content-surface)]'}`}
                          >
                            <span className="block font-semibold">{sub.code}</span>
                            <span className="block truncate opacity-80">{sub.name}</span>
                            <div
                              className="mt-1.5 h-1 w-full rounded-full bg-[var(--border)] overflow-hidden"
                              aria-hidden
                            >
                              <div
                                className="h-full rounded-full min-w-0 transition-[width] duration-200"
                                style={{
                                  width: `${progress.fillPct}%`,
                                  backgroundColor: progress.color,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN PANEL */}
        <div className={`flex-1 flex flex-col overflow-hidden relative ${selected ? "flex" : "hidden md:flex"}`}>

          {/* ALERTS */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            {alertInfo && (
              <div className={`px-4 py-3 rounded-lg shadow-lg border text-sm flex items-center gap-2 transition-all ${alertInfo.type === 'error' ? 'bg-[rgba(200,30,30,0.1)] border-[#f8b4b4] text-[#e74c3c]' :
                alertInfo.type === 'success' ? 'bg-[rgba(46,204,113,0.1)] border-[#b0e8ce] text-[#2ecc71]' :
                  'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)]'
                }`}>
                <span>{alertInfo.message}</span>
              </div>
            )}
          </div>

          {!loading && !loadError && selected && (
            <>
              {/* HEADER */}
              <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-[var(--border)] bg-[var(--bg-document)]">
                <button
                  type="button"
                  onClick={() => applyEntry(null)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden"
                >
                  ← Back to Schemes List
                </button>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
                      {selected.scheme}
                    </h1>
                    {hasSubschemes && selectedSubschemeCode && (
                      <div className="mt-2 flex gap-2">
                        {selected.subschemes?.map(sub => (
                          <button
                            key={sub.code}
                            onClick={() => applySubscheme(sub.code, selected)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition ${sub.code === selectedSubschemeCode ? 'bg-[var(--bg-hover)] text-black' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)]'}`}
                          >
                            {sub.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {isBudgetLocked && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] px-3 py-1.5 rounded-full border border-[var(--border)]">
                      <Lock className="w-3.5 h-3.5" />
                      Locked
                    </div>
                  )}
                </div>
              </div>

              {/* CARDS */}
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6 space-y-6">

                {/* CARD 1: Annual Budget */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-content-surface)]">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Annual Budget</h2>
                      {!canManageFinancials && (
                        <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-document)] px-2 py-0.5 rounded border border-[var(--border)]">View Only</span>
                      )}
                    </div>
                    {!isBudgetLocked && canManageFinancials && (
                      <button
                        onClick={() => setRevisingBudget(true)}
                        className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] px-3 py-1 rounded border border-[var(--border)]"
                      >
                        Revise Budget
                      </button>
                    )}
                  </div>
                  <div className="p-5">

                    {/* Revise Form */}
                    {revisingBudget && (
                      <div className="mb-5 p-4 rounded-lg bg-[rgba(0,0,0,0.02)] border border-[var(--border)]">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Revise Budget Estimate</h3>
                          <button onClick={() => setRevisingBudget(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <input type="number" step="0.01" min="0" placeholder="New Budget (₹ Cr)" className="w-full text-sm p-2 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md" value={reviseBudgetAmount} onChange={e => setReviseBudgetAmount(e.target.value ? Number(e.target.value) : "")} />
                          </div>
                          <div className="flex-[2]">
                            <input type="text" placeholder="Reason (optional)" className="w-full text-sm p-2 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md" value={reviseBudgetReason} onChange={e => setReviseBudgetReason(e.target.value)} />
                          </div>
                          <button
                            type="button"
                            onClick={handleReviseBudget}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-2 min-h-9 min-w-[5.5rem] bg-[var(--text-primary)] text-[var(--bg-document)] font-semibold text-sm px-4 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {pendingSubmit === "revise" ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                                Applying…
                              </>
                            ) : (
                              "Confirm"
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <div className="text-xs text-[var(--text-muted)] mb-1">Original</div>
                        <div className="text-2xl font-semibold">₹ {activeOriginalBudgetCr.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr</div>
                      </div>
                      <div>
                        <div className="text-xs text-[var(--text-muted)] mb-1">Supplementary</div>
                        <div className={`text-2xl font-semibold ${activeTotalSupplementCr > 0 ? 'text-[#2ecc71]' : activeTotalSupplementCr < 0 ? 'text-[#e74c3c]' : 'text-[var(--text-primary)]'}`}>
                          {activeTotalSupplementCr > 0 ? '+' : ''}{activeTotalSupplementCr.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">{supCountText}</div>
                      </div>
                      <div className="bg-[var(--bg-content-surface)] border border-[var(--border)] p-3 rounded-lg flex flex-col justify-center shadow-sm">
                        <div className="text-[11px] text-[#3498db] font-semibold mb-1 uppercase tracking-wider">Effective</div>
                        <div className="text-2xl font-bold text-[#3498db]">₹ {activeEffectiveBudgetCr.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr</div>
                      </div>
                    </div>

                    {activeSupplements.length > 0 && (
                      <div className="mt-6">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-3 border-b border-[var(--border)] pb-2">Recent Adjustments</div>
                        <div className="space-y-2.5">
                          {activeSupplements.map(sup => (
                            <div key={sup.id} className="flex items-start justify-between bg-[var(--bg-content-surface)] p-2.5 rounded border border-[var(--border)]">
                              <div>
                                <div className="font-medium text-sm text-[var(--text-primary)]">{sup.reason}</div>
                                <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex gap-2">
                                  <span>{new Date(sup.createdAt).toLocaleDateString(tenantLocale())}</span>
                                  <span>•</span>
                                  <span>{sup.createdByName}</span>
                                  {sup.referenceNo && (
                                    <><span>•</span><span>Ref: {sup.referenceNo}</span></>
                                  )}
                                </div>
                              </div>
                              <div className={`text-sm font-bold ${sup.amountCr > 0 ? 'text-[#2ecc71]' : 'text-[#e74c3c]'}`}>
                                {sup.amountCr > 0 ? '+' : ''}{sup.amountCr.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isBudgetLocked && canManageFinancials && !addingSupplement && (
                      <button
                        onClick={() => setAddingSupplement(true)}
                        className="mt-5 text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5 hover:underline"
                      >
                        <Plus className="w-4 h-4" /> Add supplement
                      </button>
                    )}

                    {addingSupplement && (
                      <div className="mt-5 p-4 rounded-lg bg-[var(--bg-document)] border border-[var(--border)] shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Supplement</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Amount (₹ Cr) — accepts negative</label>
                            <input type="number" step="0.01" className="w-full text-sm p-2.5 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md" value={supplementAmount} onChange={e => setSupplementAmount(e.target.value ? Number(e.target.value) : "")} />
                          </div>
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Reference No. (optional)</label>
                            <input type="text" className="w-full text-sm p-2.5 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md" value={supplementRefNo} onChange={e => setSupplementRefNo(e.target.value)} />
                          </div>
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Reason</label>
                          <textarea className="w-full text-sm p-2.5 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md resize-none h-20" value={supplementReason} onChange={e => setSupplementReason(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => setAddingSupplement(false)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium px-4 py-2">Cancel</button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleAddSupplement}
                            className="inline-flex items-center justify-center gap-2 min-h-9 min-w-[7rem] bg-[#2ecc71] hover:bg-[#27ae60] text-white font-semibold text-sm px-6 rounded-md shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#2ecc71]"
                          >
                            {pendingSubmit === "supplement" ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                                Adding…
                              </>
                            ) : (
                              "Confirm"
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {/* CARD 2: Expenditure Status */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-content-surface)]">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Expenditure Status</h2>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="grid grid-cols-2 gap-8 flex-1">
                      {/* Left: SO */}
                      <div className="flex flex-col border-r border-[var(--border)] pr-8">
                        {!isEditingSO ? (
                          <div className="flex items-center justify-between mb-8 pb-6 border-b border-[var(--border)]">
                            <div>
                              <div className="text-xs text-[var(--text-muted)] mb-1">SO Sanction Amount</div>
                              <div className="text-3xl font-light text-[var(--text-primary)]">₹ {currentSO.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr</div>
                            </div>
                            {canManageFinancials && (
                              <button onClick={() => setIsEditingSO(true)} className="px-4 py-1.5 rounded border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg-content-surface)]">Edit</button>
                            )}
                          </div>
                        ) : (
                          <div className="bg-[rgba(52,152,219,0.05)] border border-[rgba(52,152,219,0.2)] p-4 rounded-lg mb-8">
                            <div className="text-xs font-semibold text-[#2980b9] uppercase tracking-wider mb-1">Add to Sanction Amount</div>
                            <div className="text-[10px] text-[#2980b9] mb-3 opacity-80">Value will be added to the current total of ₹ {currentSO.toLocaleString(tenantLocale())} Cr</div>
                            <div className="space-y-3">
                              <div className="relative">
                                <input type="number" step="0.01" min="0" placeholder="Amount to add (₹ Cr)" className="w-full text-sm p-2 bg-[var(--bg-primary)] border border-[#b3d4ec] rounded-md shadow-sm text-[var(--text-primary)]" value={editSoValue} onChange={e => setEditSoValue(e.target.value ? Number(e.target.value) : "")} />
                                {editSoValue !== "" && Number(editSoValue) !== 0 && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#2980b9]">
                                    → Total: ₹ {(currentSO + Number(editSoValue)).toFixed(2)} Cr
                                  </div>
                                )}
                              </div>
                              <input type="text" placeholder="Remarks or Reference" className="w-full text-sm p-2 bg-[var(--bg-primary)] border border-[#b3d4ec] rounded-md shadow-sm text-[var(--text-primary)]" value={editSoRemarks} onChange={e => setEditSoRemarks(e.target.value)} />
                              <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setIsEditingSO(false)} className="text-xs font-medium text-[#2980b9] px-3 py-1.5 hover:bg-[rgba(52,152,219,0.1)] rounded">Cancel</button>
                                <button
                                  type="button"
                                  onClick={handleUpdateSO}
                                  disabled={isSubmitting || !ifmsMeetingId.trim()}
                                  className="inline-flex items-center justify-center gap-1.5 min-w-[5.25rem] text-xs font-semibold text-white bg-[#3498db] px-4 py-1.5 rounded shadow-sm hover:bg-[#2980b9] transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#3498db]"
                                >
                                  {pendingSubmit === "so" ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                                      Updating…
                                    </>
                                  ) : (
                                    "Confirm"
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-auto pt-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                <span>SO Sanctioned</span>
                                <span className="font-semibold text-[var(--text-primary)]">{soPercent}% of Effective Budget</span>
                              </div>
                              <div className="h-1.5 w-full bg-[var(--bg-content-surface)] rounded-full overflow-hidden">
                                <div className="h-full bg-[#3498db] transition-all" style={{ width: `${Math.min(100, Number(soPercent))}%` }} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                <span>IFMS Actual</span>
                                <span className="font-semibold text-[var(--text-primary)]">{utilisation}% of Effective Budget</span>
                              </div>
                              <div className="h-1.5 w-full bg-[var(--bg-content-surface)] rounded-full overflow-hidden">
                                <div className="h-full bg-[#2ecc71] transition-all" style={{ width: `${Math.min(100, Number(utilisation))}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Chart */}
                      <div className="flex flex-col">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">IFMS Spending History</h3>
                          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-[rgba(46,204,113,0.8)]" /> IFMS</span>
                            <span className="flex items-center gap-1.5"><div className="w-3 h-0 border-t-2 border-dashed border-[#95a5a6]" /> Current SO</span>
                          </div>
                        </div>
                        <div className="flex-1 relative min-h-[160px]">
                          {activeHistory.length > 0 ? (
                            <Bar data={chartData} options={chartOptions as any} />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)] font-medium">No IFMS history available.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom strip */}
                  <div className="bg-[var(--bg-content-surface)] border-t border-[var(--border)] p-4 flex items-center gap-6">
                    <div className="flex-1 flex items-center gap-4 bg-[var(--bg-primary)] p-2 border border-[var(--border)] rounded-lg">
                      <div className="w-12 h-12 rounded-full border-4 border-[#2ecc71] flex items-center justify-center font-bold text-sm text-[#2ecc71]">{utilisation}%</div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Utilisation</div>
                        <div className="text-xs mt-0.5"><span className="font-semibold text-[var(--text-primary)]">₹{currentIFMS.toLocaleString(tenantLocale(), { minimumFractionDigits: 2 })}</span> / ₹{activeEffectiveBudgetCr.toLocaleString(tenantLocale())}</div>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-4 bg-[var(--bg-primary)] p-2 border border-[var(--border)] rounded-lg">
                      <div className="w-12 h-12 rounded-full border-4 border-[#e74c3c] flex items-center justify-center font-bold text-sm text-[#e74c3c]">{lapseRisk}%</div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Lapse Risk</div>
                        <div className="text-xs mt-0.5"><span className="font-semibold text-[var(--text-primary)]">₹{(activeEffectiveBudgetCr - currentIFMS).toLocaleString(tenantLocale(), { minimumFractionDigits: 2 })}</span> remaining</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 3: Update IFMS */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
                  <div className="px-5 py-4 border-b border-[var(--border)]">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add IFMS Update</h2>
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                        Meeting <span className="text-[var(--alert-critical)]">*</span>
                      </label>
                      <select
                        value={ifmsMeetingId}
                        onChange={(e) => setIfmsMeetingId(e.target.value)}
                        className="w-full max-w-md p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm shadow-sm focus:border-[var(--text-primary)] focus:outline-none text-[var(--text-primary)]"
                      >
                        <option value="">Select meeting…</option>
                        {meetings.map((m) => (
                          <option key={m.id} value={m.id}>
                            {formatMeetingLabel(m)}
                          </option>
                        ))}
                      </select>
                      {meetings.length === 0 && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Create a meeting under Meetings before recording IFMS progress.</p>
                      )}
                    </div>
                    <div className="flex gap-4 items-end flex-wrap">
                      <div className="flex-1 min-w-[8rem]">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-2 flex justify-between items-center">
                          <span>Add IFMS Expenditure (₹ Cr)</span>
                          {ifmsValue !== "" && Number(ifmsValue) !== 0 && (
                            <span className="text-[10px] font-bold text-[#2ecc71]">
                              New Total: ₹ {(currentIFMS + Number(ifmsValue)).toFixed(2)} Cr
                            </span>
                          )}
                        </label>
                        <input type="number" min="0" step="0.01" placeholder="Amount to add..." className="w-full p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm font-semibold shadow-sm focus:border-[var(--text-primary)] focus:outline-none text-[var(--text-primary)]" value={ifmsValue} onChange={e => setIfmsValue(e.target.value ? Number(e.target.value) : "")} />
                      </div>
                      <div className="w-48">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Data as of Date</label>
                        <input type="date" className="w-full p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm shadow-sm focus:border-[var(--text-primary)] focus:outline-none text-[var(--text-primary)]" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
                      </div>
                      <div className="flex-[2] min-w-[12rem]">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Remarks</label>
                        <textarea rows={1} className="w-full p-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm resize-none shadow-sm focus:border-[var(--text-primary)] focus:outline-none text-[var(--text-primary)]" placeholder="Provide context..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 4: Update History */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-content-surface)]">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Update History</h2>
                  </div>
                  {activeHistory.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">No updates recorded yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--bg-content-surface)]">
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">#</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">As of Date</th>
                            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">IFMS (₹ Cr)</th>
                            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">SO (₹ Cr)</th>
                            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">IFMS Change</th>
                            {canEditFinancialEntries && (
                              <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {[...activeHistory].reverse().map((h, idx, arr) => {
                            const prev = arr[idx + 1];
                            const delta = prev !== undefined ? h.ifms - prev.ifms : null;
                            const isLatest = idx === 0;
                            const isEditing = editingSnapshotId === h.id;
                            const colCount = canEditFinancialEntries ? 6 : 5;
                            return (
                              <Fragment key={`${h.id}-${h.asOfDate}-${idx}`}>
                                <tr
                                  className={`border-b border-[var(--border)] last:border-0 ${isLatest ? 'bg-[rgba(46,204,113,0.04)]' : 'hover:bg-[var(--bg-content-surface)]'} transition-colors`}
                                >
                                  <td className="px-5 py-3 text-[var(--text-muted)] text-xs">{activeHistory.length - idx}</td>
                                  <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                                    {new Date(h.asOfDate).toLocaleDateString(tenantLocale(), { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {isLatest && (
                                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-[#2ecc71] bg-[rgba(46,204,113,0.12)] px-1.5 py-0.5 rounded">Latest</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-right font-semibold text-[var(--text-primary)]">
                                    {h.ifms.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-5 py-3 text-right text-[var(--text-secondary)]">
                                    {h.so.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    {delta === null ? (
                                      <span className="text-[var(--text-muted)] text-xs">—</span>
                                    ) : (
                                      <span className={`text-xs font-semibold ${delta > 0 ? 'text-[#2ecc71]' : delta < 0 ? 'text-[#e74c3c]' : 'text-[var(--text-muted)]'}`}>
                                        {delta > 0 ? '+' : ''}{delta.toLocaleString(tenantLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    )}
                                  </td>
                                  {canEditFinancialEntries && (
                                    <td className="px-5 py-3 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => startEditSnapshot(h)}
                                          disabled={isSubmitting || isEditing}
                                          title="Correct entry"
                                          className="inline-flex items-center justify-center h-7 w-7 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-content-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => requestDeleteSnapshot(h)}
                                          disabled={isSubmitting || isEditing}
                                          title="Remove entry"
                                          className="inline-flex items-center justify-center h-7 w-7 rounded border border-[var(--border)] text-[#e74c3c] hover:bg-[rgba(231,76,60,0.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                                {isEditing && (
                                  <tr key={`${h.id}-edit`} className="border-b border-[var(--border)] bg-[var(--bg-document)]">                                    <td colSpan={colCount} className="px-5 py-4">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                                        <div className="flex-1 min-w-[8rem]">
                                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">IFMS (₹ Cr)</label>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)]"
                                            value={editSnapIfms}
                                            onChange={(e) => setEditSnapIfms(e.target.value ? Number(e.target.value) : "")}
                                          />
                                        </div>
                                        <div className="flex-1 min-w-[8rem]">
                                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">SO (₹ Cr)</label>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)]"
                                            value={editSnapSo}
                                            onChange={(e) => setEditSnapSo(e.target.value ? Number(e.target.value) : "")}
                                          />
                                        </div>
                                        <div className="flex-[2] min-w-[12rem]">
                                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Remarks</label>
                                          <input
                                            type="text"
                                            className="w-full p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)]"
                                            value={editSnapRemarks}
                                            onChange={(e) => setEditSnapRemarks(e.target.value)}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={cancelEditSnapshot}
                                            disabled={isSubmitting}
                                            className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void executeCorrectSnapshot(h.id)}
                                            disabled={isSubmitting}
                                            className="inline-flex items-center justify-center gap-1.5 min-w-[6rem] bg-[var(--text-primary)] text-[var(--bg-document)] font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                                          >
                                            {pendingCorrection === "correct" ? (
                                              <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                                                Saving…
                                              </>
                                            ) : (
                                              "Save Correction"
                                            )}
                                          </button>
                                        </div>
                                      </div>
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
                </div>

              </div>

              {/* FOOTER BAR */}
              <div className="h-16 border-t border-[var(--border)] bg-[var(--bg-content-surface)] px-8 flex items-center justify-between shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] z-10 relative">
                <div className="text-xs text-[var(--text-muted)]">
                  Last updated {selected.lastUpdated} by <span className="font-medium text-[var(--text-primary)]">{selected.submitter || "Finance Desk"}</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* // draft commented for now* */}
                  {/* <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSubmitting || !ifmsMeetingId.trim()}
                    className="inline-flex items-center justify-center gap-2 min-w-[7.5rem] px-5 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-primary)] hover:bg-[rgba(0,0,0,0.02)] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {pendingSubmit === "draft" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                        Saving…
                      </>
                    ) : (
                      "Save Draft"
                    )}
                  </button> */}
                  <button
                    type="button"
                    onClick={handleSaveSubmit}
                    disabled={isSubmitting || !ifmsMeetingId.trim()}
                    className="inline-flex items-center justify-center gap-2 min-w-[8.5rem] px-6 py-2 rounded-lg text-sm font-semibold border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] shadow hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:opacity-90"
                  >
                    {pendingSubmit === "submitted" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                        Submitting…
                      </>
                    ) : (
                      "Save & Submit"
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {!loading && !loadError && !selected && (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-[var(--text-muted)] bg-[var(--bg-document)]">
              Select a scheme from the list to view or edit financial progress.
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[var(--text-muted)]">
              Loading data...
            </div>
          )}
          {!loading && loadError && !selected && (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center bg-[var(--bg-document)]">
              <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[#f8b4b4] rounded-xl p-6 shadow-sm">
                <h3 className="text-[#c81e1e] font-semibold mb-2">Initialization Error</h3>
                <p className="text-sm text-[var(--text-muted)]">{loadError}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded text-sm font-medium hover:bg-[var(--bg-surface)] transition">Retry</button>
              </div>
            </div>
          )}
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
