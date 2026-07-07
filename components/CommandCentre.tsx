"use client";

import { UserRole } from "@/lib/auth";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useEffect, useState, useCallback, Suspense } from "react";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ListChecks,
  Presentation,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fetchPendingApprovalSummaries } from "@/src/lib/services/approvalService";
import { fetchCommandCentreDashboard } from "@/src/lib/services/dashboardService";
import { getMeetingMaterialSignedUrl } from "@/src/lib/services/meetingService";
import type {
  CommandCentreDashboard,
  CommandCentreLastMeeting,
  CommandCentreSchemesMonitored,
} from "@/lib/command-centre-dashboard";
import ApprovalCard from "@/src/components/ui/ApprovalCard";
import { PendingApprovalSummary } from "@/types";
import AiAlertsCard from "@/components/command-centre/AiAlertsCard";
import CommandCentreSparkLine from "@/components/command-centre/CommandCentreSparkLine";
import SchemeModal from "@/components/schemes/SchemeModal";
import type { ProgressCard } from "@/lib/agent-runner";

/** Mock rows for “What changed since last meeting” (AI-style summary cards). */
const MOCK_WHAT_CHANGED_SINCE_LAST_MEETING = [
  {
    id: "be",
    title: "Budget Estimates",
    status: "Unchanged at ₹10,726.87 Cr",
    description: "BE/RE figures held steady from 1st meeting",
    tone: "positive" as const,
  },
  {
    id: "metro",
    title: "Metro Project Note",
    status: "Pending → Approved",
    description: "Cabinet approval received for Metro Project Note",
    tone: "positive" as const,
  },
  {
    id: "waterfront",
    title: "Waterfront EFC",
    status: "Pending → Approved",
    description: "EFC clearance secured for Waterfront project",
    tone: "positive" as const,
  },
  {
    id: "pothole",
    title: "Pothole-Free Cities",
    status: "Certificates: 93 of 115 ULBs",
    description: "Compliance drive progressing across ULBs",
    tone: "positive" as const,
  },
  {
    id: "ebus",
    title: "PM e-Bus Sewa",
    status: "Action Complied",
    description: "Compliance closed on PM e-Bus Sewa decision",
    tone: "positive" as const,
  },
  {
    id: "expenditure",
    title: "Expenditure Booking",
    status: "Still 0% (early FY)",
    description: "First fortnight of FY — IFMS expenditure yet to begin",
    tone: "negative" as const,
  },
];

function statusColor(s: string) {
  if (s === "critical") return "var(--alert-critical)";
  if (s === "warning") return "var(--alert-warning)";
  return "var(--alert-success)";
}

function statusLabel(s: string) {
  if (s === "critical") return "CRITICAL";
  if (s === "warning") return "AT RISK";
  return "ON TRACK";
}

function formatCr(value: number) {
  if (value >= 100) return `₹${value.toFixed(0)} Cr`;
  return `₹${value.toFixed(2)} Cr`;
}

function pctTrendFromValue(pct: number): number[] {
  const p = Math.min(100, Math.max(0, pct));
  return [p * 0.45, p * 0.58, p * 0.68, p * 0.78, p * 0.88, p].map((x) => Math.round(x * 10) / 10);
}

function formatMeetingDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

function formatRelativeTime(isoString: string) {
  try {
    const runDate = new Date(isoString);
    const diffMs = Date.now() - runDate.getTime();
    const diffMin = Math.floor(diffMs / (60 * 1000));
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return "";
  }
}

/** IFMS “as on” line: `As on 26.12.2025` from `YYYY-MM-DD`. */
function formatAsOnIndianDate(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `As on ${d}.${m}.${y}`;
}

function formatUtilisationPct(pct: number) {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function schemesMonitoredFootnote(m: CommandCentreSchemesMonitored | null | undefined) {
  if (!m) return "—";
  const parts = [`State Sector: ${m.stateSector}`, `Centrally Sponsored: ${m.centrallySponsored}`];
  if (m.centralSector > 0) parts.push(`Central Sector: ${m.centralSector}`);
  const classified = m.stateSector + m.centrallySponsored + m.centralSector;
  if (m.total > classified) parts.push(`Other: ${m.total - classified}`);
  return parts.join(" - ");
}

function groupPresentationsByVertical(m: CommandCentreLastMeeting["presentationMaterials"]) {
  const map = new Map<string, typeof m>();
  for (const item of m) {
    const list = map.get(item.verticalLabel);
    if (list) list.push(item);
    else map.set(item.verticalLabel, [item]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Financial progress leader cards (dashboard reference styling) */
const FP = {
  header: "#718096",
  green: "#1e5631",
  greenBadge: "#2f855a",
  red: "#e53e3e",
  redPillBg: "rgba(229, 62, 62, 0.14)",
  title: "#333333",
  track: "rgba(0, 0, 0, 0.08)",
};



function SchemeFinancialProgressRow({
  name,
  pct,
  variant,
}: {
  name: string;
  pct: number;
  variant: "top" | "bottom";
}) {
  const fill = variant === "top" ? FP.green : FP.red;
  const pctColor = variant === "top" ? FP.green : FP.red;
  const label = name.length > 52 ? `${name.slice(0, 52)}…` : name;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: FP.title,
            lineHeight: 1.35,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: pctColor,
            flexShrink: 0,
          }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 3, background: FP.track, borderRadius: 9999, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: fill,
            borderRadius: 9999,
            minWidth: pct > 0 ? 3 : 0,
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  setActive: (id: string) => void;
}

function CommandCentreContent({ setActive }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = searchParams.get("meeting");
  const user = useHydratedCurrentUser();
  const [pendingSummaries, setPendingSummaries] = useState<PendingApprovalSummary[]>([]);
  const [dashboard, setDashboard] = useState<CommandCentreDashboard | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [schemeModal, setSchemeModal] = useState<{
    id: string;
    code: string;
    name: string;
    verticalName: string;
  } | null>(null);
  const [openingMaterialId, setOpeningMaterialId] = useState<string | null>(null);
  const [agentInsight, setAgentInsight] = useState<any>(null);
  const [agentInsightLoading, setAgentInsightLoading] = useState<boolean>(true);
  const [mockApiResult, setMockApiResult] = useState<any>(null);
  const [mockApiLoading, setMockApiLoading] = useState(false);
  const [mockApiError, setMockApiError] = useState<string | null>(null);

  const handleTestApiCall = useCallback(async () => {
    setMockApiLoading(true);
    setMockApiError(null);
    setMockApiResult(null);
    try {
      const res = await fetch("/hudd-dashboard/api/v1/test");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMockApiResult(data);
    } catch (e) {
      setMockApiError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setMockApiLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/hudd-dashboard/api/v1/dashboard/ai-alerts", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load agent insights");
        const data = await res.json();
        if (active) {
          setAgentInsight(data.latestInsight);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) {
          setAgentInsightLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const summaries = await fetchPendingApprovalSummaries();
        if (active) setPendingSummaries(summaries);
      } catch {
        if (active) setPendingSummaries([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setDashLoading(true);
    void (async () => {
      try {
        const data = await fetchCommandCentreDashboard(meetingId ?? undefined);
        if (!active) return;
        setDashboard(data);
        setDashError(null);
      } catch (e: unknown) {
        if (!active) return;
        setDashError(e instanceof Error ? e.message : "Failed to load dashboard");
        setDashboard(null);
      } finally {
        if (active) setDashLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [meetingId]);

  const pendingSummary = useMemo(() => {
    if (!user) return null;
    return pendingSummaries.find((entry) => entry.role === user.role) ?? null;
  }, [user, pendingSummaries]);

  const isViewer = user ? isReadOnlyWatermarkUser(user) : false;

  const approvalCards = [
    {
      id: "kpi",
      title: "KPI submissions",
      description: "Outcome/output reports pending review",
      count: pendingSummary?.kpi ?? 0,
      href: "/kpis",
    },
    {
      id: "actions",
      title: "Action items",
      description: "Proofs and escalations awaiting review",
      count: pendingSummary?.actionItems ?? 0,
      href: "/action-items",
    },
  ];

  const totals = dashboard?.totals;

  const lastMeeting = dashboard?.lastMeeting ?? null;
  const presentationsByVertical = useMemo(
    () => (lastMeeting ? groupPresentationsByVertical(lastMeeting.presentationMaterials) : []),
    [lastMeeting],
  );

  const openUploadedMaterial = useCallback(
    async (meetingId: string, materialId: string) => {
      setOpeningMaterialId(materialId);
      try {
        const { url } = await getMeetingMaterialSignedUrl(meetingId, materialId);
        window.open(url, "_blank", "noopener,noreferrer");
      } finally {
        setOpeningMaterialId(null);
      }
    },
    [],
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Test API Button */}
      {/* <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
            }}
          >
            API Test
          </span>
          <button
            type="button"
            onClick={() => void handleTestApiCall()}
            disabled={mockApiLoading}
            style={{
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: mockApiLoading ? "var(--bg-surface)" : "var(--bg-card)",
              color: mockApiLoading ? "var(--text-muted)" : "var(--text-primary)",
              cursor: mockApiLoading ? "not-allowed" : "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {mockApiLoading ? "Calling API…" : "Call Mock API"}
          </button>
        </div>
        {mockApiError && (
          <div
            style={{
              fontSize: 12,
              color: "var(--alert-critical)",
              background: "rgba(229, 62, 62, 0.08)",
              border: "1px solid var(--alert-critical)",
              borderRadius: 6,
              padding: "8px 12px",
            }}
          >
            Error: {mockApiError}
          </div>
        )}
        {mockApiResult && (
          <pre
            style={{
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "10px 14px",
              overflowX: "auto",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(mockApiResult, null, 2)}
          </pre>
        )}
      </div> */}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "stretch" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            flex: 1,
          }}
        >
          {dashLoading && (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "16px",
                    minHeight: 88,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              ))}
            </>
          )}
          {!dashLoading &&
            [
              {
                key: "budget",
                label: dashboard?.financialYearLabel
                  ? `TOTAL BUDGET (FY ${dashboard.financialYearLabel})`
                  : "TOTAL BUDGET",
                value: totals ? formatCr(totals.totalBudgetCr) : "—",
                sub: "Including all plan types & transfers",
                valueColor: "var(--text-primary)",
              },
              {
                key: "ifms",
                label: "TOTAL EXPENDITURE (IFMS)",
                value: totals ? formatCr(totals.totalIfmsCr) : "—",
                sub: formatAsOnIndianDate(dashboard?.lastSnapshotDate),
                valueColor: "var(--text-primary)",
              },
              {
                key: "util",
                label: "BUDGET UTILISATION %",
                value: totals ? formatUtilisationPct(totals.utilisationPct) : "—",
                sub: "Of total budget utilised to date",
                valueColor: FP.red,
              },
              {
                key: "schemes",
                label: "SCHEMES MONITORED",
                value: dashboard ? String(dashboard.schemesMonitored.total) : "—",
                sub: schemesMonitoredFootnote(dashboard?.schemesMonitored),
                valueColor: "var(--text-primary)",
              },
            ].map(({ key, label, value, sub, valueColor }) => (
              <div
                key={key}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "16px",
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      lineHeight: 1.35,
                    }}
                  >
                    {label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: valueColor,
                    letterSpacing: -0.5,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
        </div>

        {/* <div className="w-96 flex flex-col gap-2 ">
          <div
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2"
          >
            Pending my approval
          </div>
          {approvalCards.map((card) => (
            <ApprovalCard
              key={card.id}
              title={card.title}
              description={card.description}
              count={card.count}
              href={isViewer ? undefined : card.href}
            />
          ))}
        </div> */}
      </div>

      {dashError && (
        <div
          style={{
            borderRadius: 8,
            border: "1px solid var(--alert-warning)",
            padding: "12px 14px",
            fontSize: 13,
            color: "var(--text-primary)",
            background: "var(--bg-surface)",
          }}
        >
          {dashError}
        </div>
      )}

      <div>
        {dashLoading ? (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="min-h-[140px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
              />
            ))}
          </div>
        ) : (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
              style={{ borderStyle: "solid" }}
            >
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ListChecks className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--alert-critical)]">
                      Important topics for Discussion
                    </span>
                    {lastMeeting ? (
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">
                        Selected meeting · {formatMeetingDate(lastMeeting.meetingDate)}
                        {lastMeeting.title ? ` · ${lastMeeting.title}` : ""}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">No meeting on record</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/meetings")}
                  className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Meetings →
                </button>
              </div>
              {!lastMeeting || lastMeeting.topics.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {lastMeeting
                    ? "No discussion topics were recorded for this meeting."
                    : "Schedule a meeting to capture agenda topics."}
                </p>
              ) : (
                <ol className="list-decimal space-y-2 pl-4 marker:text-[11px] marker:text-[var(--text-muted)]">
                  {lastMeeting.topics.map((t) => (
                    <li key={t.id} className="pl-0.5 text-xs leading-snug text-[var(--text-primary)]">
                      {t.topic}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
              style={{ borderStyle: "solid" }}
            >
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Presentation className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  <div className="min-w-0">
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Proposed Presentations by vertical
                    </span>
                    {lastMeeting ? (
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">
                        From selected meeting · {formatMeetingDate(lastMeeting.meetingDate)}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">No meeting on record</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/meetings")}
                  className="shrink-0 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Meetings →
                </button>
              </div>
              <p className="mb-2 text-[10px] leading-snug text-[var(--text-muted)]">
                Vertical is inferred when the file name contains a vertical name; otherwise files appear under Other.
              </p>
              {!lastMeeting || lastMeeting.presentationMaterials.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {lastMeeting
                    ? "No presentation files were attached to this meeting."
                    : "Upload decks on the Meetings page to show them here."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {presentationsByVertical.map(([vertical, files]) => (
                    <li key={vertical}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {vertical}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {files.map((f) => (
                          <li key={f.id} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => lastMeeting && void openUploadedMaterial(lastMeeting.id, f.id)}
                              disabled={!lastMeeting || openingMaterialId === f.id}
                              className="flex w-full min-w-0 items-start gap-1.5 rounded text-left text-xs text-[var(--text-primary)] underline-offset-2 hover:underline disabled:cursor-wait disabled:no-underline disabled:opacity-60"
                              title={`Open ${f.fileName}`}
                            >
                              <ExternalLink
                                className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-muted)]"
                                aria-hidden
                              />
                              <span className="min-w-0 break-words">{f.fileName}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg-content-surface)] p-4 shadow-sm"
              style={{ borderStyle: "solid" }}
            >
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  aria-label="Expand what changed section"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
                    What changed since last meeting
                  </h3>
                  <p className="mt-1 text-[10px] leading-snug text-[var(--text-muted)]">
                    {agentInsightLoading ? (
                      "Loading progress reports..."
                    ) : agentInsight ? (
                      `Key changes since last review meeting · Last report generated: ${formatRelativeTime(agentInsight.runDate)}`
                    ) : (
                      "No progress reports generated yet. Configure the monitor agent in Admin Settings."
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agentInsightLoading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="min-h-[100px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
                    />
                  ))
                ) : !agentInsight || !agentInsight.insights || agentInsight.insights.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--text-muted)]">
                    No active agent monitoring report is available. Contact administrative officers to trigger a progress report run.
                  </div>
                ) : (
                  (agentInsight.insights as ProgressCard[]).map((item) => {
                    const positive = item.tone === "positive";
                    const TrendIcon = positive ? TrendingUp : TrendingDown;
                    const statusColor = positive ? FP.green : FP.red;
                    const cardContent = (
                      <>
                        <div className="mb-2 flex items-start gap-2">
                          <TrendIcon
                            className="mt-0.5 h-4 w-4 shrink-0"
                            style={{ color: statusColor }}
                            aria-hidden
                          />
                          <span className="text-xs font-semibold leading-snug text-[var(--text-primary)]">
                            {item.title}
                          </span>
                        </div>
                        <p
                          className="text-xs font-semibold leading-snug"
                          style={{ color: statusColor }}
                        >
                          {item.status}
                        </p>
                        <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-muted)]">
                          {item.description}
                        </p>
                      </>
                    );

                    if (item.href) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => router.push(item.href!)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5 text-left transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--border-strong)] w-full block"
                        >
                          {cardContent}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5"
                      >
                        {cardContent}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "var(--text-muted)",
                }}
              >
                Overdue actions
              </span>
              <button
                type="button"
                onClick={() => setActive("actions")}
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                All {dashboard?.overdueActionsCount ?? 0} <ArrowUpRight size={10} />
              </button>
            </div>
            {(dashboard?.overdueActionsPreview ?? []).map((a) => (
              <div key={a.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 3 }}>
                  {a.title.length > 50 ? `${a.title.slice(0, 50)}…` : a.title}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{a.officer}</span>
                  <span style={{ fontSize: 10, color: "var(--alert-critical)", fontWeight: 600 }}>
                    {a.daysOverdue}d overdue
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!dashLoading && dashboard && (
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "20px 22px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: FP.header,
                    lineHeight: 1.35,
                  }}
                >
                  Top Performing Schemes (Financial Progress)
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: FP.greenBadge, flexShrink: 0 }}>≥ 75%</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {dashboard.topSchemes.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No scheme data for this period.</span>
                ) : (
                  dashboard.topSchemes.slice(0, 5).map((s) => (
                    <SchemeFinancialProgressRow key={s.id} name={s.scheme} pct={s.pct} variant="top" />
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "20px 22px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: FP.header,
                    lineHeight: 1.35,
                  }}
                >
                  Underperforming Schemes (Financial Progress)
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: FP.red,
                      background: FP.redPillBg,
                      padding: "3px 10px",
                      borderRadius: 9999,
                    }}
                  >
                    &lt; 40%
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push("/financial/schemes-board")}
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    Board <ArrowUpRight size={10} />
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(dashboard.bottomSchemes ?? []).length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No scheme data for this period.</span>
                ) : (
                  (dashboard.bottomSchemes ?? []).slice(0, 5).map((s) => (
                    <SchemeFinancialProgressRow key={s.id} name={s.scheme} pct={s.pct} variant="bottom" />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <SchemeModal
        open={schemeModal !== null}
        onClose={() => setSchemeModal(null)}
        scheme={schemeModal}
      />
    </div>
  );
}

function CommandCentreLoadingFallback() {
  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "16px",
              minHeight: 88,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CommandCentre(props: Props) {
  return (
    <Suspense fallback={<CommandCentreLoadingFallback />}>
      <CommandCentreContent {...props} />
    </Suspense>
  );
}
