"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission } from "@/lib/auth";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import { fetchKPISubmissions, submitKPIMeasurement, reviewKpiMeasurement } from "@/src/lib/services/kpiService";
import { KPISubmission, KpiEscalationFlag } from "@/types";
import StatusBadge from "@/src/components/ui/StatusBadge";

function formatKpiPercentage(
  numerator: number | "" | undefined,
  denominator: number | null | undefined,
): string | null {
  const den = denominator == null ? NaN : Number(denominator);
  if (!Number.isFinite(den) || den === 0) return null;
  if (numerator === "" || numerator === undefined) return null;
  const num = Number(numerator);
  if (!Number.isFinite(num)) return null;
  return ((num / den) * 100).toFixed(1);
}

interface RowState {
  saving?: boolean;
  saved?: boolean;
  submitted?: boolean;
  error?: string;
}

export default function KPIEntryPage() {
  useRequireAnyPermission([Permission.ENTER_KPI_DATA], "/dashboard");

  const [submissions, setSubmissions] = useState<KPISubmission[]>([]);
  const [financialYearLabel, setFinancialYearLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSchemes, setExpandedSchemes] = useState<Record<string, boolean>>({});
  const [sidebarQuery, setSidebarQuery] = useState("");

  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [binaryResponses, setBinaryResponses] = useState<Record<string, boolean | null>>({});
  const [numeratorById, setNumeratorById] = useState<Record<string, number | "">>({});
  const [remarksById, setRemarksById] = useState<Record<string, string>>({});
  const [bottleneckById, setBottleneckById] = useState<Record<string, string>>({});
  const [escalationById, setEscalationById] = useState<Record<string, KpiEscalationFlag | "">>({});
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [meetingId, setMeetingId] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const meetingLabel = (m: MeetingListItem) => {
    const t = m.title?.trim();
    return t ? `${m.meetingDate} — ${t}` : m.meetingDate;
  };

  const reload = async () => {
    const data = await fetchKPISubmissions();
    // Show KPIs the current user is assigned to enter or review.
    // Users with edit/create permissions (MANAGE_SCHEMES) see all KPIs.
    setSubmissions(
      data.submissions.filter(
        (s) =>
          s.currentUserCanReassignOwners === true ||
          s.currentUserCanEnter === true ||
          s.currentUserCanReview === true,
      ),
    );
    setFinancialYearLabel(data.financialYearLabel);
    const num: Record<string, number | ""> = {};
    const rem: Record<string, string> = {};
    for (const s of data.submissions) {
      num[s.id] = s.numerator ?? "";
      rem[s.id] = s.remarks ?? "";
    }
    setNumeratorById(num);
    setRemarksById(rem);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [, list] = await Promise.all([reload(), fetchMeetings()]);
        if (!active) return;
        setMeetings(list);
      } catch (e: unknown) {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load KPIs");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  // Default to latest meeting (GET /meetings returns newest `meetingDate` first).
  useEffect(() => {
    if (meetings.length === 0) return;
    setMeetingId((prev) => {
      if (prev && meetings.some((m) => m.id === prev)) return prev;
      return meetings[0].id;
    });
  }, [meetings]);

  const grouped = useMemo(() => {
    const schemeNames = Array.from(new Set(submissions.map((s) => s.scheme)));
    return schemeNames.map((scheme) => ({
      scheme,
      items: submissions.filter((s) => s.scheme === scheme),
    }));
  }, [submissions]);

  const filteredGrouped = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map(({ scheme, items }) => ({
        scheme,
        items: items.filter(
          (item) =>
            item.description.toLowerCase().includes(q) ||
            scheme.toLowerCase().includes(q) ||
            item.vertical.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, sidebarQuery]);

  // Auto-expand schemes and select first KPI when data loads
  useEffect(() => {
    if (grouped.length === 0) return;
    const expanded: Record<string, boolean> = {};
    grouped.forEach(({ scheme }) => {
      expanded[scheme] = true;
    });
    setExpandedSchemes(expanded);
    if (!selectedId && grouped[0]?.items[0]) {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setSelectedId(grouped[0].items[0].id);
      }
    }
  }, [grouped, selectedId]);

  // Keep selection valid when filtering the sidebar
  useEffect(() => {
    if (filteredGrouped.length === 0) return;
    const visibleIds = new Set(filteredGrouped.flatMap((g) => g.items.map((i) => i.id)));
    if (selectedId && !visibleIds.has(selectedId)) {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setSelectedId(filteredGrouped[0].items[0]?.id ?? null);
      } else {
        setSelectedId(null);
      }
    }
  }, [filteredGrouped, selectedId]);

  // When searching, expand all groups that still have matches
  useEffect(() => {
    if (!sidebarQuery.trim()) return;
    setExpandedSchemes((prev) => {
      const next = { ...prev };
      filteredGrouped.forEach(({ scheme }) => {
        next[scheme] = true;
      });
      return next;
    });
  }, [sidebarQuery, filteredGrouped]);

  const selectedItem = useMemo(
    () => submissions.find((s) => s.id === selectedId) ?? null,
    [submissions, selectedId],
  );

  // Reset reject dialog when selection changes
  useEffect(() => {
    setShowRejectDialog(false);
    setRejectNote("");
  }, [selectedId]);

  const completion = useMemo(() => {
    const total = submissions.length;
    const submitted = submissions.filter((s) =>
      ["submitted", "submitted_pending", "approved"].includes(s.status),
    ).length;
    return { total, submitted };
  }, [submissions]);

  const canEditSelected = useMemo(() => {
    if (!selectedItem) return false;
    return selectedItem.currentUserCanEnter !== false;
  }, [selectedItem]);

  const isReviewerOnly = useMemo(() => {
    if (!selectedItem) return false;
    return selectedItem.currentUserCanReview === true && selectedItem.currentUserCanEnter === false;
  }, [selectedItem]);

  const getValidationError = (item: KPISubmission, newNum: number | ""): string | null => {
    // Only enforce numeric validation for OUTPUT KPIs; OUTCOME KPIs are remarks-only.
    if (item.type !== "OUTPUT") return null;
    if (item.status === "approved" && item.numerator != null && newNum !== "") {
      if (Number(newNum) < item.numerator) {
        return `Value cannot go below the approved value of ${item.numerator} ${item.numeratorUnit || item.unit}.`;
      }
    }
    return null;
  };

  const handleRowAction = async (id: string, mode: "draft" | "submit") => {
    const item = submissions.find((row) => row.id === id);
    if (!item || !financialYearLabel) return;
    if (item.currentUserCanEnter === false) return;

    if (!meetingId.trim()) {
      setRowState((prev) => ({
        ...prev,
        [id]: { error: "Select the meeting this KPI progress should be attributed to." },
      }));
      return;
    }

    // Only validate numeric input for OUTPUT KPIs.
    if (item.type === "OUTPUT") {
      const err = getValidationError(item, numeratorById[id] ?? "");
      if (err) {
        setRowState((prev) => ({ ...prev, [id]: { error: err } }));
        return;
      }
    }

    setRowState((prev) => ({ ...prev, [id]: { saving: true } }));
    try {
      const measuredAt = new Date().toISOString().slice(0, 10);
      const shouldSendNumerator = item.type === "OUTPUT";
      const num = shouldSendNumerator
        ? numeratorById[id] === ""
          ? null
          : Number(numeratorById[id])
        : null;
      await submitKPIMeasurement({
        kpiDefinitionId: item.id,
        financialYearLabel,
        measuredAt,
        meetingId: meetingId.trim(),
        // For OUTPUT KPIs, send numeric progress; OUTCOME KPIs are remarks-only.
        numeratorValue: shouldSendNumerator && Number.isFinite(num as number) ? num : null,
        // denominator is always read-only here; do not send it
        yesValue: item.type === "BINARY" ? (binaryResponses[id] ?? null) : null,
        remarks: remarksById[id] ?? "",
        workflowStatus: mode === "draft" ? "draft" : "submitted",
        bottleneckReason: bottleneckById[id]?.trim() || null,
        escalationFlag: (escalationById[id] || null) as KpiEscalationFlag | null,
      });
      await reload();
      setRowState((prev) => ({
        ...prev,
        [id]: { saving: false, saved: mode === "draft", submitted: mode === "submit" },
      }));
      setTimeout(() => {
        setRowState((prev) => ({ ...prev, [id]: {} }));
      }, 2200);
    } catch (e: unknown) {
      setRowState((prev) => ({
        ...prev,
        [id]: { saving: false, error: e instanceof Error ? e.message : "Save failed" },
      }));
    }
  };

  const handleReviewAction = async (id: string, decision: "approve" | "reject", note?: string) => {
    const item = submissions.find((row) => row.id === id);
    if (!item || !item.latestMeasurementId) return;

    setRowState((prev) => ({ ...prev, [id]: { saving: true } }));
    try {
      await reviewKpiMeasurement(item.latestMeasurementId, { decision, note });
      await reload();
      setRowState((prev) => ({
        ...prev,
        [id]: { saving: false, submitted: true },
      }));
      setShowRejectDialog(false);
      setRejectNote("");
      setTimeout(() => {
        setRowState((prev) => ({ ...prev, [id]: {} }));
      }, 2200);
    } catch (e: unknown) {
      setRowState((prev) => ({
        ...prev,
        [id]: { saving: false, error: e instanceof Error ? e.message : "Review failed" },
      }));
    }
  };

  const toggleScheme = (scheme: string) =>
    setExpandedSchemes((prev) => ({ ...prev, [scheme]: !prev[scheme] }));

  const statusDot = (status: KPISubmission["status"]) => {
    if (status === "approved") return "bg-[var(--ax-status-ok)]";
    if (status === "submitted" || status === "submitted_pending") return "ax-fill-warning";
    if (status === "draft") return "bg-[var(--ax-muted)]";
    return "bg-[var(--color-divider)]";
  };

  return (
    <AppShell title="KPI Entry">
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* ── Left sidebar ── */}
        <aside className={`w-full md:w-[20rem] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-divider)] bg-[var(--color-surface)] ${selectedId ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-[var(--color-divider)] px-4 py-3">
            <Link
              href="/kpis"
              className="text-[11px] font-medium text-[var(--color-accent)] hover:underline"
            >
              ← All KPIs
            </Link>
            <p className="mt-3 text-[10px] uppercase tracking-[0.35em] text-[var(--ax-muted)]">
              Data entry
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)] tabular-nums">
              {financialYearLabel ?? "—"}
            </p>
            {!loading && (
              <p className="mt-1 text-[11px] text-[var(--ax-muted)]">
                {completion.submitted} of {completion.total} submitted
              </p>
            )}
            {!loading && grouped.length > 0 && (
              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ax-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  value={sidebarQuery}
                  onChange={(e) => setSidebarQuery(e.target.value)}
                  placeholder="Filter KPIs…"
                  className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] py-2 pl-8 pr-2 text-xs text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          {loading && (
            <div className="px-4 py-6 text-xs text-[var(--ax-muted)]">Loading…</div>
          )}
          {loadError && (
            <div className="px-4 py-4 text-xs text-[var(--ax-status-critical)]">{loadError}</div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="px-4 py-6 text-xs text-[var(--ax-muted)]">No KPIs assigned.</div>
          )}
          {!loading && grouped.length > 0 && filteredGrouped.length === 0 && (
            <div className="px-4 py-6 text-xs text-[var(--ax-muted)]">No KPIs match your filter.</div>
          )}

          <nav className="flex-1 py-2">
            {filteredGrouped.map(({ scheme, items }) => (
              <div key={scheme}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--ax-muted)] hover:text-[var(--color-text)]"
                  onClick={() => toggleScheme(scheme)}
                >
                  {expandedSchemes[scheme] ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{scheme}</span>
                  <span className="shrink-0 tabular-nums text-[10px] opacity-70">{items.length}</span>
                </button>

                {expandedSchemes[scheme] && (
                  <ul className="pb-1">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`flex w-full items-start gap-2 border-l-2 px-4 py-2 pl-[1.35rem] text-left transition ${selectedId === item.id
                            ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                            : "border-transparent hover:border-[var(--color-divider)] hover:bg-[var(--color-surface)]"
                            }`}
                        >
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(item.status)}`}
                          />
                          <span className="min-w-0 text-xs leading-snug text-[var(--color-text)]">
                            {item.description}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main detail panel ── */}
        <main className={`min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-4 py-5 sm:px-8 sm:py-8 ${selectedId ? "block" : "hidden md:block"}`}>
          {!selectedItem && !loading && (
            <div className="flex h-full min-h-[40vh] items-center justify-center px-4 text-center text-sm text-[var(--ax-muted)]">
              Select a KPI from the list to enter or review values.
            </div>
          )}

          {selectedItem && (() => {
            const item = selectedItem;
            const row = rowState[item.id] ?? {};
            const binaryValue = binaryResponses[item.id] ?? item.yes ?? null;
            const numVal = numeratorById[item.id];
            const denVal = item.denominator;
            const computedPct = formatKpiPercentage(numVal, denVal);
            const pctBarWidth =
              computedPct != null ? Math.min(100, Math.max(0, Number(computedPct))) : null;

            const isApproved = item.status === "approved";
            const approvedNum = item.numerator;
            const validationError =
              item.type === "OUTPUT" ? getValidationError(item, numVal ?? "") : null;
            const canFlagEscalation = item.canFlagEscalation === true;
            const isAlreadySubmittedForMeeting = (item.velocityTrail ?? []).some(
              (m) => m.meetingId === meetingId && ["submitted", "reviewed"].includes(m.workflowStatus)
            );
            const isInputDisabled = isReviewerOnly || isAlreadySubmittedForMeeting;

            return (
              <div className="mx-auto max-w-3xl space-y-5">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] hover:underline md:hidden"
                >
                  ← Back to KPI List
                </button>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-divider)] pb-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--ax-muted)]">
                      {item.scheme} · {item.vertical}
                    </p>
                    <h2 className="mt-1.5 text-lg font-semibold leading-snug text-[var(--color-text)] sm:text-xl">
                      {item.description}
                    </h2>
                    {(item.assignedToName || item.reviewerName) && (
                      <p className="mt-2 text-xs text-[var(--ax-muted)]">
                        {item.assignedToName && (
                          <span>
                            Action owner: <span className="text-[var(--color-text)]">{item.assignedToName}</span>
                          </span>
                        )}
                        {item.assignedToName && item.reviewerName ? " · " : ""}
                        {item.reviewerName && (
                          <span>
                            Reviewer: <span className="text-[var(--color-text)]">{item.reviewerName}</span>
                          </span>
                        )}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--ax-muted)]">
                        {item.type}
                      </span>
                      <span className="rounded-md border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--ax-muted)]">
                        {item.category}
                      </span>
                      <span className="rounded-md border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--ax-text-secondary)]">
                        {item.numeratorUnit && item.denominatorUnit && item.numeratorUnit !== item.denominatorUnit ? (
                          <span>Units: {item.numeratorUnit} (Num) / {item.denominatorUnit} (Den)</span>
                        ) : (
                          <span>Unit: {item.unit}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.isSelfApproved && (
                      <span className="inline-flex items-center rounded-full border border-[var(--ax-status-ok)] bg-[color-mix(in_srgb,_var(--ax-status-ok)_8%,_transparent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ax-status-ok)]">
                        Self-Approved
                      </span>
                    )}
                  </div>
                </div>

                {/* Approved-decrease warning
                {isApproved && approvedNum != null && (
                  <div className="rounded-xl ax-chip ax-chip-warning w-full px-4 py-3 text-xs">
                    Last approved value: <strong>{approvedNum} {item.numeratorUnit || item.unit}</strong>. New numerator cannot be set lower than this.
                  </div>
                )} */}

                {!canEditSelected && !isReviewerOnly && (
                  <div className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--ax-muted)]">
                    You can view this KPI, but only the assigned action owner may enter or update progress (unless an administrator overrides).
                  </div>
                )}

                {isReviewerOnly && (
                  <div className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)]">
                    {item.status === "submitted" || item.status === "submitted_pending" ? (
                      <span>Pending your review — approve or reject below.</span>
                    ) : item.status === "approved" ? (
                      <span className="text-[var(--ax-status-ok)]">✓ Approved</span>
                    ) : item.hasEntryForLatestMeeting === false ? (
                      <span className="text-[var(--ax-muted)]">Pending entry from action owner</span>
                    ) : (
                      <span>Review only — inputs are read-only.</span>
                    )}
                  </div>
                )}

                <div
                  className={`rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 ${!canEditSelected && !isReviewerOnly ? "pointer-events-none opacity-50" : ""}`}
                >
                  <div className="mb-5 space-y-2 border-b border-[var(--color-divider)] pb-5">
                    <label className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                      Meeting {!isReviewerOnly && <span className="text-[var(--ax-status-critical)]">*</span>}
                    </label>
                    <select
                      value={meetingId}
                      onChange={(e) => setMeetingId(e.target.value)}
                      disabled={isReviewerOnly}
                      className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">Select meeting…</option>
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>
                          {meetingLabel(m)}
                        </option>
                      ))}
                    </select>
                    {meetings.length === 0 && (
                      <p className="text-[11px] text-[var(--ax-muted)]">
                        No meetings found. Create one under Meetings first.
                      </p>
                    )}
                  </div>

                  {item.type === "BINARY" ? (
                    <div className="space-y-4">
                      <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                        Response
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          disabled={isInputDisabled}
                          className={`rounded-xl border px-6 py-2.5 text-xs uppercase tracking-[0.3em] transition ${binaryValue === true
                            ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]"
                            : "border-[var(--color-divider)] text-[var(--ax-muted)] hover:border-[var(--color-text)]"
                            } ${isInputDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                          onClick={() => !isInputDisabled && setBinaryResponses((prev) => ({ ...prev, [item.id]: true }))}
                        >
                          Yes
                        </button>
                        <button
                          disabled={isInputDisabled}
                          className={`rounded-xl border px-6 py-2.5 text-xs uppercase tracking-[0.3em] transition ${binaryValue === false
                            ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]"
                            : "border-[var(--color-divider)] text-[var(--ax-muted)] hover:border-[var(--color-text)]"
                            } ${isInputDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                          onClick={() => !isInputDisabled && setBinaryResponses((prev) => ({ ...prev, [item.id]: false }))}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : item.type === "OUTPUT" ? (
                    <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                          Numerator{item.numeratorUnit ? ` (${item.numeratorUnit})` : ""}
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={numeratorById[item.id] ?? ""}
                          min={isApproved && approvedNum != null ? approvedNum : undefined}
                          readOnly={isInputDisabled}
                          onChange={(e) => {
                            if (isInputDisabled) return;
                            const val = e.target.value === "" ? "" : Number(e.target.value);
                            setNumeratorById((prev) => ({ ...prev, [item.id]: val }));
                            if (rowState[item.id]?.error) {
                              setRowState((prev) => ({ ...prev, [item.id]: {} }));
                            }
                          }}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm tabular-nums text-[var(--color-text)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 ${validationError
                            ? "border-[var(--ax-status-critical)] focus:ring-[var(--ax-status-critical)]"
                            : "border-[var(--color-divider)] focus:ring-[var(--color-text)]"
                            } ${isInputDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                        />
                        {validationError && (
                          <p className="text-[11px] text-[var(--ax-status-critical)]">{validationError}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                          Denominator{item.denominatorUnit ? ` (${item.denominatorUnit})` : ""}
                        </label>
                        <input
                          type="number"
                          value={denVal ?? ""}
                          readOnly
                          tabIndex={-1}
                          className="w-full cursor-default rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm tabular-nums text-[var(--ax-text-secondary)]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                          Percentage
                        </label>
                        <div
                          className="flex min-h-[42px] w-full items-center rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm tabular-nums text-[var(--color-text)]"
                          role="status"
                          aria-live="polite"
                          aria-label={
                            computedPct != null
                              ? `Calculated percentage ${computedPct} percent`
                              : "Percentage not available"
                          }
                        >
                          {computedPct != null ? `${computedPct}%` : "—"}
                        </div>
                        {pctBarWidth != null && (
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-divider)]/70"
                            aria-hidden
                          >
                            <div
                              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                              style={{ width: `${pctBarWidth}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Remarks */}
                  <div className="mt-5 space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">
                      Remarks{" "}
                      <span className="normal-case tracking-normal text-[var(--ax-muted)] opacity-60">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      rows={2}
                      value={remarksById[item.id] ?? ""}
                      readOnly={isInputDisabled}
                      onChange={(e) => {
                        if (isInputDisabled) return;
                        setRemarksById((prev) => ({ ...prev, [item.id]: e.target.value }));
                      }}
                      placeholder="Add any notes or context…"
                      className={`w-full resize-none rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-text)] ${isInputDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    />
                  </div>

                  {/* Bottleneck & escalation — restricted to FLAG_KPI_ESCALATION */}
                  {/* {canFlagEscalation && (
                    <div className="mt-5 space-y-4 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[var(--ax-muted)]">
                        Meeting signals
                      </p>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">
                          Escalation status
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              { value: "on_track", label: "On track" },
                              { value: "needs_coordination", label: "Needs coordination" },
                              { value: "needs_acs_decision", label: "Needs ACS decision" },
                            ] as const
                          ).map(({ value, label }) => {
                            const active = (escalationById[item.id] || "") === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                disabled={isReviewerOnly}
                                onClick={() => {
                                  if (isReviewerOnly) return;
                                  setEscalationById((prev) => ({
                                    ...prev,
                                    [item.id]: active ? "" : value,
                                  }));
                                }}
                                className={`rounded-lg border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition ${
                                  active
                                    ? value === "needs_acs_decision"
                                      ? "border-[var(--ax-status-critical)] bg-[color-mix(in_srgb,_var(--ax-status-critical)_10%,_transparent)] text-[var(--ax-status-critical)]"
                                      : value === "needs_coordination"
                                        ? "border-[var(--ax-status-warning)] bg-[color-mix(in_srgb,_var(--ax-status-warning)_10%,_transparent)] text-[var(--ax-status-warning)]"
                                        : "border-[var(--ax-status-ok)] bg-[color-mix(in_srgb,_var(--ax-status-ok)_10%,_transparent)] text-[var(--ax-status-ok)]"
                                    : "border-[var(--color-divider)] text-[var(--ax-muted)] hover:border-[var(--color-text)]"
                                } ${isReviewerOnly ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-[var(--ax-muted)]">
                          Bottleneck reason{" "}
                          <span className="normal-case tracking-normal opacity-60">(optional)</span>
                        </label>
                        <textarea
                          rows={2}
                          value={bottleneckById[item.id] ?? ""}
                          readOnly={isReviewerOnly}
                          onChange={(e) => {
                            if (isReviewerOnly) return;
                            setBottleneckById((prev) => ({ ...prev, [item.id]: e.target.value }));
                          }}
                          placeholder="e.g. Awaiting circular from HQ / tender not yet floated…"
                          className={`w-full resize-none rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-text)] ${isReviewerOnly ? "cursor-not-allowed opacity-60" : ""}`}
                        />
                      </div>
                    </div>
                  )} */}

                  {/* Error message */}
                  {row.error && (
                    <div className="mt-4 rounded-xl border border-[var(--ax-status-critical)] bg-[color-mix(in_srgb,_var(--ax-status-critical)_8%,_transparent)] px-4 py-2.5 text-xs text-[var(--ax-status-critical)]">
                      {row.error}
                    </div>
                  )}

                  {/* Actions */}
                  {!isReviewerOnly ? (
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        disabled={row.saving || !!validationError || !meetingId.trim() || isAlreadySubmittedForMeeting}
                        onClick={() => handleRowAction(item.id, "draft")}
                        className="rounded-xl border border-[var(--color-divider)] px-5 py-2 text-xs uppercase tracking-[0.25em] text-[var(--ax-muted)] transition hover:border-[var(--color-text)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {row.saving ? "Saving…" : row.saved ? "Draft Saved ✓" : "Save Draft"}
                      </button>
                      <button
                        disabled={row.saving || !!validationError || !meetingId.trim() || isAlreadySubmittedForMeeting}
                        onClick={() => handleRowAction(item.id, "submit")}
                        className="rounded-xl bg-[var(--color-text)] px-5 py-2 text-xs uppercase tracking-[0.25em] text-[var(--color-bg)] transition disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {row.saving ? "Submitting…" : (row.submitted || isAlreadySubmittedForMeeting) ? "Submitted ✓" : "Submit"}
                      </button>
                    </div>
                  ) : (
                    (item.status === "submitted" || item.status === "submitted_pending") && (
                      <>
                        {!showRejectDialog && (
                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <button
                              disabled={row.saving}
                              onClick={() => handleReviewAction(item.id, "approve")}
                              className="btn btn-success px-5 py-2 text-xs uppercase tracking-[0.25em] disabled:cursor-not-allowed"
                            >
                              {row.saving ? "Processing…" : row.submitted ? "Approved ✓" : "Approve"}
                            </button>
                            <button
                              disabled={row.saving}
                              onClick={() => setShowRejectDialog(true)}
                              className="rounded-xl border border-[var(--ax-status-critical)] bg-transparent px-5 py-2 text-xs uppercase tracking-[0.25em] text-[var(--ax-status-critical)] transition hover:bg-[color-mix(in_srgb,_var(--ax-status-critical)_10%,_transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reject with Comment
                            </button>
                          </div>
                        )}

                        {showRejectDialog && (
                          <div className="mt-6 space-y-3 rounded-xl border border-[var(--ax-status-critical)] bg-[color-mix(in_srgb,_var(--ax-status-critical)_4%,_transparent)] p-4">
                            <label className="block text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--ax-muted)]">
                              Rejection note <span className="text-[var(--ax-status-critical)]">*</span>
                              <textarea
                                value={rejectNote}
                                onChange={(e) => setRejectNote(e.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="Explain why this submission is being rejected..."
                                className="mt-2 w-full resize-none rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ax-status-critical)]"
                              />
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                disabled={row.saving || !rejectNote.trim()}
                                onClick={() => handleReviewAction(item.id, "reject", rejectNote.trim())}
                                className="btn btn-danger px-5 py-2 text-xs uppercase tracking-[0.25em] disabled:cursor-not-allowed"
                              >
                                {row.saving ? "Processing…" : "Confirm Reject"}
                              </button>
                              <button
                                disabled={row.saving}
                                onClick={() => { setShowRejectDialog(false); setRejectNote(""); }}
                                className="rounded-xl border border-[var(--color-divider)] px-5 py-2 text-xs uppercase tracking-[0.25em] text-[var(--ax-muted)] transition hover:border-[var(--color-text)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  )}
                </div>

                {/* Meta footer */}
                <div className="text-[11px] text-[var(--ax-muted)]">
                  Last updated: {item.lastUpdated}
                  {financialYearLabel && <> · FY {financialYearLabel}</>}
                </div>
              </div>
            );
          })()}
        </main>
      </div>
    </AppShell>
  );
}
