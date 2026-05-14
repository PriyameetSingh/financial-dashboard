"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  LayoutGrid,
  IndianRupee,
  RefreshCw,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import {
  fetchFinancialBudgets,
  submitFinancialSnapshot,
  patchFinancialBudget,
} from "@/src/lib/services/financialService";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import type { FinancialEntry } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "snapshot" | "budget";
type RowStatus = "idle" | "submitting" | "success" | "error";

interface FlatRow {
  key: string;
  schemeCode: string;
  subschemeCode: string | null;
  schemeName: string;
  componentCode: string | null;
  componentName: string | null;
  isSubrow: boolean;
  currentBudget: number;
  currentSo: number;
  currentIfms: number;
  effectiveBudget: number;
  locked: boolean;
}

interface RowDraft {
  so: string;
  ifms: string;
  budget: string;
  budgetReason: string;
}

const emptyDraft = (): RowDraft => ({ so: "", ifms: "", budget: "", budgetReason: "" });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCr(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function utilizationColor(pct: number): string {
  if (pct > 100) return "#e74c3c";
  if (pct >= 85) return "#f39c12";
  if (pct >= 50) return "#2ecc71";
  return "#3498db";
}

function formatMeetingLabel(m: MeetingListItem): string {
  const t = m.title?.trim();
  return t ? `${m.meetingDate} — ${t}` : m.meetingDate;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkEntryPage() {
  useRequireRole([UserRole.FA, UserRole.TASU], "/");

  // ── Remote state ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [financialYearLabel, setFinancialYearLabel] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Input controls ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("snapshot");
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");

  // ── Inline draft values ───────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [rowStatuses, setRowStatuses] = useState<Record<string, { state: RowStatus; error?: string }>>({});

  // ── Submit state ──────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [data, meetingList] = await Promise.all([fetchFinancialBudgets(), fetchMeetings()]);
      setEntries(data.entries);
      setFinancialYearLabel(data.financialYearLabel);
      setMeetings(meetingList);
      if (meetingList.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(meetingList[0].id);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedMeetingId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Flatten entries → rows ────────────────────────────────────────────────
  const allRows = useMemo((): FlatRow[] => {
    const result: FlatRow[] = [];
    for (const entry of entries) {
      if ((entry.subschemes?.length ?? 0) > 0) {
        for (const sub of entry.subschemes!) {
          result.push({
            key: `${entry.id}:${sub.code}`,
            schemeCode: entry.id,
            subschemeCode: sub.code,
            schemeName: entry.scheme,
            componentCode: sub.code,
            componentName: sub.name,
            isSubrow: true,
            currentBudget: sub.annualBudget ?? 0,
            currentSo: sub.so ?? 0,
            currentIfms: sub.ifms ?? 0,
            effectiveBudget: sub.effectiveBudgetCr ?? sub.annualBudget ?? 0,
            locked: entry.locked,
          });
        }
      } else {
        result.push({
          key: `${entry.id}:`,
          schemeCode: entry.id,
          subschemeCode: null,
          schemeName: entry.scheme,
          componentCode: null,
          componentName: null,
          isSubrow: false,
          currentBudget: entry.annualBudget,
          currentSo: entry.so,
          currentIfms: entry.ifms,
          effectiveBudget: entry.effectiveBudgetCr,
          locked: entry.locked,
        });
      }
    }
    return result;
  }, [entries]);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return allRows;
    const q = query.toLowerCase();
    return allRows.filter(
      (r) =>
        r.schemeName.toLowerCase().includes(q) ||
        r.componentCode?.toLowerCase().includes(q) ||
        r.componentName?.toLowerCase().includes(q),
    );
  }, [allRows, query]);

  // ── Draft helpers ─────────────────────────────────────────────────────────
  const getDraft = (key: string): RowDraft => drafts[key] ?? emptyDraft();

  const setDraftField = (key: string, field: keyof RowDraft, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...getDraft(key), [field]: value } }));
    setRowStatuses((prev) => {
      const next = { ...prev };
      if (next[key]?.state !== "submitting") delete next[key];
      return next;
    });
  };

  const isDirty = (key: string): boolean => {
    const d = getDraft(key);
    if (mode === "snapshot") return d.so !== "" || d.ifms !== "";
    return d.budget !== "";
  };

  const dirtyRows = useMemo(
    () =>
      filteredRows.filter((r) => {
        const d = drafts[r.key] ?? emptyDraft();
        if (mode === "snapshot") return d.so !== "" || d.ifms !== "";
        return d.budget !== "";
      }),
    [filteredRows, drafts, mode],
  );

  const clearAllDrafts = () => {
    setDrafts({});
    setRowStatuses({});
    setGlobalMsg(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitAll = async () => {
    if (!financialYearLabel) return;

    if (mode === "snapshot" && !selectedMeetingId.trim()) {
      setGlobalMsg({ type: "error", text: "Select a meeting before submitting." });
      return;
    }

    if (dirtyRows.length === 0) {
      setGlobalMsg({ type: "error", text: "No changes to submit. Edit SO or IFMS values to proceed." });
      return;
    }

    setIsSubmitting(true);
    setGlobalMsg(null);

    setRowStatuses((prev) => {
      const next = { ...prev };
      for (const r of dirtyRows) next[r.key] = { state: "submitting" };
      return next;
    });

    let successCount = 0;
    let errorCount = 0;

    await Promise.all(
      dirtyRows.map(async (row) => {
        const d = getDraft(row.key);
        try {
          if (mode === "snapshot") {
            const soVal = d.so !== "" ? row.currentSo + Number(d.so) : row.currentSo;
            const ifmsVal = d.ifms !== "" ? row.currentIfms + Number(d.ifms) : row.currentIfms;
            await submitFinancialSnapshot({
              schemeCode: row.schemeCode,
              subschemeCode: row.subschemeCode,
              asOfDate,
              soExpenditureCr: soVal,
              ifmsExpenditureCr: ifmsVal,
              financialYearLabel,
              workflowStatus: "submitted",
              meetingId: selectedMeetingId.trim(),
            });
          } else {
            if (d.budget === "") return;
            await patchFinancialBudget({
              schemeCode: row.schemeCode,
              subschemeCode: row.subschemeCode,
              financialYearLabel,
              newBudgetCr: Number(d.budget),
              reason: d.budgetReason.trim() || "Bulk budget update",
            });
          }
          setRowStatuses((prev) => ({ ...prev, [row.key]: { state: "success" } }));
          successCount++;
        } catch (e) {
          setRowStatuses((prev) => ({
            ...prev,
            [row.key]: { state: "error", error: e instanceof Error ? e.message : "Failed" },
          }));
          errorCount++;
        }
      }),
    );

    setIsSubmitting(false);

    if (errorCount === 0) {
      setGlobalMsg({
        type: "success",
        text: `${successCount} ${successCount === 1 ? "entry" : "entries"} saved successfully.`,
      });
      setDrafts({});
      try {
        const data = await fetchFinancialBudgets();
        setEntries(data.entries);
      } catch (_) {}
    } else {
      setGlobalMsg({
        type: "error",
        text: `${errorCount} ${errorCount === 1 ? "row" : "rows"} failed — ${successCount} succeeded.`,
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell title="Bulk Financial Entry">
        <div className="flex h-64 items-center justify-center gap-3 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading financial data…
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell title="Bulk Financial Entry">
        <div className="flex h-64 items-center justify-center p-8">
          <div className="max-w-sm rounded-xl border border-[#f8b4b4] bg-[var(--bg-card)] p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-[#e74c3c]" />
            <p className="text-sm text-[var(--text-muted)]">{loadError}</p>
            <button
              onClick={() => { setLoading(true); load(); }}
              className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-content-surface)]"
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const noMeeting = mode === "snapshot" && meetings.length === 0;

  return (
    <AppShell title="Bulk Financial Entry">
      <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-[var(--bg-document)]">

        {/* ── Top Controls ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 space-y-3">

          {/* Header row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Finance Desk {financialYearLabel ? `· ${financialYearLabel}` : ""}
              </p>
              <h1 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">Bulk Financial Entry</h1>
            </div>

            {/* Mode tabs */}
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] p-0.5">
              <button
                onClick={() => { setMode("snapshot"); clearAllDrafts(); }}
                className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  mode === "snapshot"
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                Snapshot (SO / IFMS)
              </button>
              <button
                onClick={() => { setMode("budget"); clearAllDrafts(); }}
                className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  mode === "budget"
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <IndianRupee className="h-3 w-3" />
                Budget Revision
              </button>
            </div>
          </div>

          {/* Filters & Search Row */}
          <div className="flex items-end gap-3 flex-wrap">
            {mode === "snapshot" && (
              <>
                <div className="min-w-[200px] max-w-xs">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Meeting <span className="text-[var(--alert-critical)]">*</span>
                  </label>
                  <select
                    value={selectedMeetingId}
                    onChange={(e) => setSelectedMeetingId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] shadow-sm focus:border-[var(--text-primary)] focus:outline-none"
                  >
                    <option value="">Select meeting…</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatMeetingLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Data As Of
                  </label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] shadow-sm focus:border-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </>
            )}

            {/* Search */}
            <div className="relative min-w-[200px] max-w-xs">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Search
              </label>
              <Search className="absolute left-3 top-7.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Scheme or component…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mb-1.5 ml-auto">
              <p className="text-xs text-[var(--text-muted)]">
                {filteredRows.length} rows
                {dirtyRows.length > 0 && (
                  <span className="ml-1.5 font-semibold text-[var(--text-primary)]">
                    · {dirtyRows.length} edited
                  </span>
                )}
              </p>

              {dirtyRows.length > 0 && (
                <button
                  onClick={clearAllDrafts}
                  className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Global message ─────────────────────────────────────────────────── */}
        {globalMsg && (
          <div
            className={`shrink-0 flex items-center gap-2 px-4 py-1.5 text-sm border-b ${
              globalMsg.type === "success"
                ? "bg-[rgba(46,204,113,0.07)] border-[rgba(46,204,113,0.2)] text-[#27ae60]"
                : "bg-[rgba(231,76,60,0.07)] border-[rgba(231,76,60,0.2)] text-[#c0392b]"
            }`}
          >
            {globalMsg.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {globalMsg.text}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
                <th className="w-[50px] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Sl. No.
                </th>
                <th className="w-[280px] px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Scheme
                </th>
                <th className="w-[180px] px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Component
                </th>
                <th className="w-[140px] px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Total Budget (₹ Cr)
                </th>

                {mode === "snapshot" ? (
                  <>
                    <th className="w-[140px] px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Current SO (₹ Cr)
                    </th>
                    <th className="w-[160px] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#3498db]">
                      Add to SO (₹ Cr)
                    </th>
                    <th className="w-[140px] px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Current IFMS (₹ Cr)
                    </th>
                    <th className="w-[160px] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#2ecc71]">
                      Add to IFMS (₹ Cr)
                    </th>
                    <th className="w-[90px] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Utilisation
                    </th>
                  </>
                ) : (
                  <>
                    <th className="w-[140px] px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Current Budget (₹ Cr)
                    </th>
                    <th className="w-[180px] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#f39c12]">
                      New Budget (₹ Cr)
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Reason
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const draft = getDraft(row.key);
                const status = rowStatuses[row.key];
                const dirty = isDirty(row.key);

                const utilPct =
                  row.effectiveBudget > 0 ? (row.currentIfms / row.effectiveBudget) * 100 : 0;
                const utilColor = utilizationColor(utilPct);

                const isRowSubmitting = status?.state === "submitting";
                const isRowSuccess = status?.state === "success";
                const isRowError = status?.state === "error";

                return (
                  <tr
                    key={row.key}
                    className={`border-b border-[var(--border)] transition-colors ${
                      isRowSuccess
                        ? "bg-[rgba(46,204,113,0.04)]"
                        : isRowError
                          ? "bg-[rgba(231,76,60,0.04)]"
                          : dirty
                            ? "bg-[rgba(52,152,219,0.03)]"
                            : "hover:bg-[var(--bg-content-surface)]"
                    }`}
                  >
                    {/* Sl. No. */}
                    <td className="px-3 py-1.5 text-center text-xs text-[var(--text-secondary)] tabular-nums">
                      {index + 1}
                    </td>

                    {/* Scheme name */}
                    <td className="px-5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-medium leading-tight ${
                            row.locked
                              ? "text-[var(--text-muted)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {row.schemeName}
                        </span>
                        {row.locked && (
                          <span className="ml-1 rounded bg-[var(--bg-content-surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] border border-[var(--border)]">
                            Locked
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Component */}
                    <td className="px-4 py-1.5">
                      {row.componentCode ? (
                        <div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            {row.componentCode}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] leading-tight max-w-[160px] truncate">
                            {row.componentName}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">—</span>
                      )}
                    </td>

                    {/* Total Budget */}
                    <td className="px-4 py-1.5 text-right text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                      {fmtCr(row.effectiveBudget)}
                    </td>

                    {mode === "snapshot" ? (
                      <>
                        {/* Current SO */}
                        <td className="px-4 py-1.5 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                          {fmtCr(row.currentSo)}
                        </td>

                        {/* New SO input */}
                        <td className="px-4 py-1.5 text-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="+ Add"
                            value={draft.so}
                            onChange={(e) => setDraftField(row.key, "so", e.target.value)}
                            disabled={row.locked || isRowSubmitting || isRowSuccess}
                            className={`w-full rounded-md border px-2 py-1 text-right text-xs font-semibold tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                              draft.so !== ""
                                ? "border-[#3498db] bg-[rgba(52,152,219,0.06)] text-[#2980b9]"
                                : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            }`}
                          />
                        </td>

                        {/* Current IFMS */}
                        <td className="px-4 py-1.5 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                          {fmtCr(row.currentIfms)}
                        </td>

                        {/* New IFMS input */}
                        <td className="px-4 py-1.5 text-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="+ Add"
                            value={draft.ifms}
                            onChange={(e) => setDraftField(row.key, "ifms", e.target.value)}
                            disabled={row.locked || isRowSubmitting || isRowSuccess}
                            className={`w-full rounded-md border px-2 py-1 text-right text-xs font-semibold tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                              draft.ifms !== ""
                                ? "border-[#2ecc71] bg-[rgba(46,204,113,0.06)] text-[#27ae60]"
                                : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            }`}
                          />
                        </td>

                        {/* Utilisation badge */}
                        <td className="px-4 py-1.5 text-center">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                            style={{
                              color: utilColor,
                              backgroundColor: `${utilColor}18`,
                            }}
                          >
                            {utilPct.toFixed(1)}%
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Current Budget */}
                        <td className="px-4 py-1.5 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                          {fmtCr(row.currentBudget)}
                        </td>

                        {/* New Budget input */}
                        <td className="px-4 py-1.5 text-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={fmtCr(row.currentBudget)}
                            value={draft.budget}
                            onChange={(e) => setDraftField(row.key, "budget", e.target.value)}
                            disabled={row.locked || isRowSubmitting || isRowSuccess}
                            className={`w-full rounded-md border px-2 py-1 text-right text-xs font-semibold tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                              draft.budget !== ""
                                ? "border-[#f39c12] bg-[rgba(243,156,18,0.06)] text-[#e67e22]"
                                : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            }`}
                          />
                        </td>

                        {/* Budget Reason */}
                        <td className="px-4 py-1.5">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={draft.budgetReason}
                            onChange={(e) => setDraftField(row.key, "budgetReason", e.target.value)}
                            disabled={row.locked || isRowSubmitting || isRowSuccess}
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          {isRowError && status?.error && (
                            <p className="mt-0.5 text-[10px] text-[#e74c3c]">{status.error}</p>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={mode === "snapshot" ? 9 : 7}
                    className="px-5 py-16 text-center text-sm text-[var(--text-muted)]"
                  >
                    {query ? "No schemes match your search." : "No financial entries found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 flex items-center justify-between gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.04)]">
          <div className="text-xs text-[var(--text-muted)]">
            {mode === "snapshot" ? (
              <>
                Enter amounts to <span className="font-medium text-[#3498db]">add to SO</span> and/or{" "}
                <span className="font-medium text-[#2ecc71]">add to IFMS</span>. Values will be added to current amounts.
              </>
            ) : (
              <>
                Enter a <span className="font-medium text-[#e67e22]">new budget amount</span> to
                revise. Add a reason if required.
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {dirtyRows.length > 0 && (
              <span className="rounded-full bg-[rgba(52,152,219,0.1)] px-2.5 py-1 text-xs font-semibold text-[#2980b9]">
                {dirtyRows.length} pending
              </span>
            )}
            <button
              onClick={submitAll}
              disabled={isSubmitting || dirtyRows.length === 0 || noMeeting}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-[var(--accent-text)] shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                `Submit ${dirtyRows.length > 0 ? `${dirtyRows.length} ` : ""}${
                  mode === "snapshot" ? "Snapshot" : "Budget"
                }${dirtyRows.length !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
