"use client";

import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantLocale } from "@/lib/tenant-config/format";
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
import { fetchPendingApprovalSummaries } from "@/src/lib/services/approvalService";
import { fetchCommandCentreDashboard } from "@/src/lib/services/dashboardService";
import { getMeetingMaterialSignedUrl } from "@/src/lib/services/meetingService";
import type {
  CommandCentreDashboard,
  CommandCentreLastMeeting,
  CommandCentreSchemesMonitored,
} from "@/lib/command-centre-dashboard";
import { Card, InlineAlert, StatTile } from "@/components/nocturne";
import ApprovalCard from "@/src/components/ui/ApprovalCard";
import { PendingApprovalSummary } from "@/types";
import SchemeModal from "@/components/schemes/SchemeModal";
import type { ProgressCard } from "@/lib/agent-runner";

/*
 * Reskin Gate B. Every colour on this screen now resolves through a Nocturne
 * token; the `FP` object that used to hold eight literals (#1e5631, #e53e3e,
 * #718096, a track colour in rgba…) is gone, and with it the reason this screen
 * stayed the platform's colours on a tenant that had bought its own.
 *
 * Two palettes are in play and they are not interchangeable:
 *
 *   `--ax-status-*`, via `.ax-tone-*`, for FIGURES and words. Measured for text
 *   at 4.5:1 on both grounds.
 *
 *   `--dv-*`, for BARS and glyphs. Measured as graphical objects at 3:1, and —
 *   as of this gate — measured against each other under simulated protanopia and
 *   deuteranopia, which is what actually decides whether a reader can tell the
 *   top league table from the bottom one.
 *
 * Nothing here reads differently than it did: same queries, same fields, same
 * rows, same order, same empty states.
 */

function formatCr(value: number) {
  if (value >= 100) return `₹${value.toFixed(0)} Cr`;
  return `₹${value.toFixed(2)} Cr`;
}

function formatMeetingDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat(tenantLocale(), { day: "numeric", month: "short", year: "numeric" }).format(d);
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

/**
 * One row of a scheme league table.
 *
 * The bar is a real `role="progressbar"`: it is the only place the proportion is
 * drawn, and as a pair of nested divs it was invisible to a screen reader. The
 * percentage beside it is not decoration either — it is what carries the value
 * for a reader who cannot separate the two tables by colour, which is why the
 * variant changes the tone of the figure and the fill of the bar together.
 */
function SchemeFinancialProgressRow({
  name,
  pct,
  variant,
}: {
  name: string;
  pct: number;
  variant: "top" | "bottom";
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const label = name.length > 52 ? `${name.slice(0, 52)}…` : name;
  return (
    <div>
      <div className="ax-databar-head">
        <span className="ax-databar-name">{label}</span>
        <span className={`ax-databar-value ${variant === "top" ? "ax-tone-ok" : "ax-tone-critical"}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        className="ax-meter"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name} — financial progress`}
        style={{ marginTop: 0 }}
      >
        <span
          style={{
            ["--ax-meter-fill" as string]: `${clamped}%`,
            ["--ax-meter-color" as string]:
              variant === "top" ? "var(--dv-div-pos)" : "var(--dv-div-neg)",
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(withNextBasePath("/api/v1/dashboard/ai-alerts"), { cache: "no-store" });
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

  /*
   * THE PENDING-APPROVALS PANEL IS COMMENTED OUT, and was before this reskin.
   *
   * Everything that feeds it is live — the summaries are fetched on mount, the
   * counts are computed per role, `ApprovalCard` exists — but the block that
   * renders it (below, beside the stat tiles) is commented out in the source. A
   * reskin is not the place to decide whether a panel ships, so all of it is
   * preserved exactly as found, down to the fetch. Raised for a product answer:
   * turn it back on, or delete the whole path.
   */
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
  void approvalCards;
  void isViewer;
  void ApprovalCard;

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
    <div className="flex flex-col gap-5 p-6">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {dashLoading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="ax-stat animate-pulse" style={{ minHeight: 88 }} aria-hidden />
            ))
          : [
              {
                key: "budget",
                label: dashboard?.financialYearLabel
                  ? `TOTAL BUDGET (FY ${dashboard.financialYearLabel})`
                  : "TOTAL BUDGET",
                value: totals ? formatCr(totals.totalBudgetCr) : "—",
                sub: "Including all plan types & transfers",
                /*
                 * Utilisation was painted a fixed red whatever the figure said —
                 * 4% and 96% came out the same alarming colour. The reskin holds
                 * the encoding it found rather than inventing thresholds nobody
                 * has agreed, so the tone stays constant here; it is reported as
                 * a question for the product owner, not fixed in a reskin.
                 */
                tone: null as string | null,
              },
              {
                key: "ifms",
                label: "TOTAL EXPENDITURE (IFMS)",
                value: totals ? formatCr(totals.totalIfmsCr) : "—",
                sub: formatAsOnIndianDate(dashboard?.lastSnapshotDate),
                tone: null as string | null,
              },
              {
                key: "util",
                label: "BUDGET UTILISATION %",
                value: totals ? formatUtilisationPct(totals.utilisationPct) : "—",
                sub: "Of total budget utilised to date",
                tone: "ax-tone-critical" as string | null,
              },
              {
                key: "schemes",
                label: "SCHEMES MONITORED",
                value: dashboard ? String(dashboard.schemesMonitored.total) : "—",
                sub: schemesMonitoredFootnote(dashboard?.schemesMonitored),
                tone: null as string | null,
              },
            ].map(({ key, label, value, sub, tone }) => (
              <StatTile
                key={key}
                kicker={label}
                value={tone ? <span className={tone}>{value}</span> : value}
                footnote={sub}
              />
            ))}
      </div>

      {dashError && <InlineAlert>{dashError}</InlineAlert>}

      <div>
        {dashLoading ? (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="card animate-pulse" style={{ minHeight: 140 }} aria-hidden />
            ))}
          </div>
        ) : (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    {/* The old markup coloured this heading with the critical
                        token, which said "these are urgent" in colour alone.
                        The chip says it with a shape and a tint together. */}
                    <span className="ax-chip ax-chip-critical">Important topics for Discussion</span>
                    {lastMeeting ? (
                      <span className="ax-stat-foot mt-0.5 block truncate" style={{ marginTop: 6 }}>
                        Selected meeting · {formatMeetingDate(lastMeeting.meetingDate)}
                        {lastMeeting.title ? ` · ${lastMeeting.title}` : ""}
                      </span>
                    ) : (
                      <span className="ax-stat-foot mt-0.5 block" style={{ marginTop: 6 }}>
                        No meeting on record
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => router.push("/meetings")} className="btn btn-ghost shrink-0">
                  Meetings →
                </button>
              </div>
              {!lastMeeting || lastMeeting.topics.length === 0 ? (
                <p className="text-xs">
                  {lastMeeting
                    ? "No discussion topics were recorded for this meeting."
                    : "Schedule a meeting to capture agenda topics."}
                </p>
              ) : (
                <ol className="list-decimal space-y-2 pl-4">
                  {lastMeeting.topics.map((t) => (
                    <li key={t.id} className="pl-0.5 text-xs leading-snug">
                      {t.topic}
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card>
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Presentation className="h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <span className="ax-section-title" style={{ margin: 0 }}>
                      Proposed Presentations by vertical
                    </span>
                    {lastMeeting ? (
                      <span className="ax-stat-foot mt-0.5 block truncate" style={{ marginTop: 4 }}>
                        From selected meeting · {formatMeetingDate(lastMeeting.meetingDate)}
                      </span>
                    ) : (
                      <span className="ax-stat-foot mt-0.5 block" style={{ marginTop: 4 }}>
                        No meeting on record
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => router.push("/meetings")} className="btn btn-ghost shrink-0">
                  Meetings →
                </button>
              </div>
              <p className="ax-stat-foot mb-2" style={{ marginTop: 0 }}>
                Vertical is inferred when the file name contains a vertical name; otherwise files appear under Other.
              </p>
              {!lastMeeting || lastMeeting.presentationMaterials.length === 0 ? (
                <p className="text-xs">
                  {lastMeeting
                    ? "No presentation files were attached to this meeting."
                    : "Upload decks on the Meetings page to show them here."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {presentationsByVertical.map(([vertical, files]) => (
                    <li key={vertical}>
                      <p className="ax-stat-kicker">{vertical}</p>
                      <ul className="mt-1 space-y-1">
                        {files.map((f) => (
                          <li key={f.id} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => lastMeeting && void openUploadedMaterial(lastMeeting.id, f.id)}
                              disabled={!lastMeeting || openingMaterialId === f.id}
                              className="flex w-full min-w-0 items-start gap-1.5 rounded text-left text-xs underline-offset-2 hover:underline disabled:cursor-wait disabled:no-underline"
                              title={`Open ${f.fileName}`}
                            >
                              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                              <span className="min-w-0 break-words">{f.fileName}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Agent-written material, marked as such. The AI accent is the one
                colour on the page that deliberately does not follow the tenant
                brand — see tokens.css — and it is paired with the word "agent
                report" so the marking is never colour alone. */}
            <div className="sm:col-span-2 card elev-sm ax-ai-section">
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  className="btn btn-ghost flex h-9 w-9 shrink-0 items-center justify-center"
                  style={{ borderRadius: 999 }}
                  aria-label="Expand what changed section"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="ax-ai-kicker" style={{ margin: 0 }}>
                    Agent report
                  </p>
                  <h3 className="ax-section-title" style={{ marginTop: 4 }}>
                    What changed since last meeting
                  </h3>
                  <p className="ax-stat-foot" style={{ marginTop: 4 }}>
                    {agentInsightLoading
                      ? "Loading progress reports..."
                      : agentInsight
                        ? `Key changes since last review meeting · Last report generated: ${formatRelativeTime(agentInsight.runDate)}`
                        : "No progress reports generated yet. Configure the monitor agent in Admin Settings."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agentInsightLoading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="card animate-pulse" style={{ minHeight: 100 }} aria-hidden />
                  ))
                ) : !agentInsight || !agentInsight.insights || agentInsight.insights.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3 card text-center text-xs" style={{ padding: 32 }}>
                    No active agent monitoring report is available. Contact administrative officers to trigger a progress report run.
                  </div>
                ) : (
                  (agentInsight.insights as ProgressCard[]).map((item) => {
                    const positive = item.tone === "positive";
                    const TrendIcon = positive ? TrendingUp : TrendingDown;
                    // The arrow already encodes the direction by shape; the tone
                    // reinforces it, and the status line spells it out in words.
                    const toneClass = positive ? "ax-tone-ok" : "ax-tone-critical";
                    const cardContent = (
                      <>
                        <div className="mb-2 flex items-start gap-2">
                          <TrendIcon className={`mt-0.5 h-4 w-4 shrink-0 ${toneClass}`} aria-hidden />
                          <span className="text-xs font-semibold leading-snug">{item.title}</span>
                        </div>
                        <p className={`text-xs font-semibold leading-snug ${toneClass}`}>{item.status}</p>
                        <p className="ax-stat-foot" style={{ marginTop: 6 }}>
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
                          className="card w-full block text-left"
                        >
                          {cardContent}
                        </button>
                      );
                    }

                    return (
                      <div key={item.id} className="card">
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
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <span className="ax-section-title" style={{ margin: 0 }}>
                Overdue actions
              </span>
              <button
                type="button"
                onClick={() => setActive("actions")}
                className="btn btn-ghost flex items-center gap-1"
              >
                All {dashboard?.overdueActionsCount ?? 0} <ArrowUpRight size={10} />
              </button>
            </div>
            {(dashboard?.overdueActionsPreview ?? []).map((a) => (
              <div
                key={a.id}
                className="mb-2 pb-2"
                style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
              >
                {/* Overdue is the highest priority state this list can hold, so
                    it takes the high-priority mark: a star, readable in
                    greyscale and on a printout, beside the days count that says
                    the same thing in words. */}
                <div className="ax-priority ax-priority-high ax-tone-critical mb-1 flex items-start gap-2">
                  <span className="ax-priority-mark mt-0.5" aria-hidden />
                  <span className="text-[11px] leading-snug" style={{ color: "var(--color-text)" }}>
                    {a.title.length > 50 ? `${a.title.slice(0, 50)}…` : a.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="ax-stat-foot" style={{ marginTop: 0 }}>
                    {a.officer}
                  </span>
                  <span className="ax-tone-critical text-[10px] font-semibold">{a.daysOverdue}d overdue</span>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {!dashLoading && dashboard && (
          <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Card elevation="sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="ax-section-title" style={{ margin: 0 }}>
                  Top Performing Schemes (Financial Progress)
                </span>
                <span className="ax-chip ax-chip-ok shrink-0">≥ 75%</span>
              </div>
              <div className="flex flex-col gap-4">
                {dashboard.topSchemes.length === 0 ? (
                  <span className="text-xs">No scheme data for this period.</span>
                ) : (
                  dashboard.topSchemes
                    .slice(0, 5)
                    .map((s) => <SchemeFinancialProgressRow key={s.id} name={s.scheme} pct={s.pct} variant="top" />)
                )}
              </div>
            </Card>

            <Card elevation="sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="ax-section-title" style={{ margin: 0 }}>
                  Underperforming Schemes (Financial Progress)
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="ax-chip ax-chip-critical">&lt; 40%</span>
                  <button
                    type="button"
                    onClick={() => router.push("/financial/schemes-board")}
                    className="btn btn-ghost flex items-center gap-1"
                  >
                    Board <ArrowUpRight size={10} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {(dashboard.bottomSchemes ?? []).length === 0 ? (
                  <span className="text-xs">No scheme data for this period.</span>
                ) : (
                  (dashboard.bottomSchemes ?? [])
                    .slice(0, 5)
                    .map((s) => (
                      <SchemeFinancialProgressRow key={s.id} name={s.scheme} pct={s.pct} variant="bottom" />
                    ))
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      <SchemeModal open={schemeModal !== null} onClose={() => setSchemeModal(null)} scheme={schemeModal} />
    </div>
  );
}

function CommandCentreLoadingFallback() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ax-stat animate-pulse" style={{ minHeight: 88 }} aria-hidden />
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
