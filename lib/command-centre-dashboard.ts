import type { SponsorshipType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/financial-budget-entries";
import { getFinancialBudgetEntriesOverview, getFinanceSummaryBreakdownForOverview } from "@/lib/financial-budget-entries";
import { sponsorshipToSchemeBudgetCategory } from "@/lib/scheme-fy-bucket-metrics";
import type { DbUserWithRbac } from "@/lib/server-rbac";
import type { DataScope } from "@/lib/data-scope";
import { actionItemWhere, financeSnapshotWhere } from "@/lib/data-access/scope-where";
import type { FinancialEntry } from "@/types";

export type CommandCentreSchemeSummary = {
  id: string;
  /** Prisma scheme UUID (for APIs such as scheme modal); entry `id` is scheme code */
  schemeId: string;
  scheme: string;
  vertical: string;
  budgetCr: number;
  ifmsCr: number;
  soCr: number;
  pct: number;
  status: "critical" | "warning" | "on-track";
};

export type CommandCentreSchemeLeader = {
  id: string;
  scheme: string;
  vertical: string;
  budgetCr: number;
  ifmsCr: number;
  pct: number;
};

export type CommandCentreIfmsTrendPoint = {
  asOfDate: string;
  ifmsCr: number;
};

export type CommandCentreOverduePreview = {
  id: string;
  title: string;
  officer: string;
  daysOverdue: number;
};

/** Latest dashboard meeting (by date), for command-centre summary cards. */
export type CommandCentreLastMeeting = {
  id: string;
  meetingDate: string;
  title: string | null;
  topics: Array<{ id: string; topic: string }>;
  presentationMaterials: Array<{
    id: string;
    fileName: string;
    /** Inferred by matching vertical names against the file name; "Other" if none match. */
    verticalLabel: string;
  }>;
};

/** Counts for command-centre “Schemes monitored” summary (by scheme sponsorship). */
export type CommandCentreSchemesMonitored = {
  total: number;
  stateSector: number;
  centrallySponsored: number;
  centralSector: number;
};

export type CommandCentreDashboard = {
  financialYearLabel: string | null;
  lastSnapshotDate: string | null;
  schemesMonitored: CommandCentreSchemesMonitored;
  totals: {
    totalBudgetCr: number;
    totalSoCr: number;
    totalIfmsCr: number;
    utilisationPct: number;
    lapseRiskCr: number;
  };
  schemes: CommandCentreSchemeSummary[];
  topSchemes: CommandCentreSchemeLeader[];
  bottomSchemes: CommandCentreSchemeLeader[];
  ifmsTrend: CommandCentreIfmsTrendPoint[];
  overdueActionsCount: number;
  overdueActionsPreview: CommandCentreOverduePreview[];
  criticalSchemeCount: number;
  lastMeeting: CommandCentreLastMeeting | null;
};

function schemePct(entry: FinancialEntry): number {
  const b = entry.effectiveBudgetCr ?? entry.annualBudget + (entry.totalSupplementCr ?? 0);
  if (!b || b <= 0) return 0;
  return (entry.ifms / b) * 100;
}

function schemeStatusFromPct(pct: number): CommandCentreSchemeSummary["status"] {
  if (pct < 40) return "critical";
  if (pct < 75) return "warning";
  return "on-track";
}

function verticalLabelFromFileName(fileName: string, verticalNames: string[]): string {
  const lower = fileName.toLowerCase();
  let best: string | null = null;
  let bestLen = 0;
  for (const name of verticalNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (lower.includes(trimmed.toLowerCase()) && trimmed.length > bestLen) {
      best = trimmed;
      bestLen = trimmed.length;
    }
  }
  return best ?? "Other";
}

async function loadDashboardMeetingRowForCommandCentre(requestedId: string | null | undefined) {
  const include = {
    topics: { orderBy: { createdAt: "asc" as const } },
    materials: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  };
  if (requestedId) {
    const row = await prisma.dashboardMeeting.findUnique({
      where: { id: requestedId },
      include,
    });
    if (row) return row;
  }
  return prisma.dashboardMeeting.findFirst({
    orderBy: { meetingDate: "desc" },
    include,
  });
}

export type CommandCentreDashboardOptions = {
  /** When set, meeting-scoped cards (topics, presentations) use this meeting; invalid id falls back to latest by date. */
  meetingId?: string | null;
};

export async function getCommandCentreDashboard(
  actor: DbUserWithRbac | null,
  scope: DataScope,
  options?: CommandCentreDashboardOptions,
): Promise<CommandCentreDashboard> {
  const [fyRow, verticalRows] = await Promise.all([
    prisma.financialYear.findFirst({ orderBy: { endDate: "desc" }, select: { id: true } }),
    prisma.vertical.findMany({ select: { name: true } }),
  ]);

  const verticalNames = verticalRows.map((v) => v.name);

  const [{ entries, financialYearLabel, financialYearId }, overdueItems, trendRows, lastMeetingRow, latestSnapshot, overdueCount] =
    await Promise.all([
      getFinancialBudgetEntriesOverview(actor, scope),
      prisma.actionItem.findMany({
        where: { ...actionItemWhere(scope), status: "OVERDUE", archived: false },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: {
          performers: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: { user: { select: { name: true } } },
          },
        },
      }),
      fyRow
        ? prisma.financeExpenditureSnapshot.groupBy({
            by: ["asOfDate"],
            where: financeSnapshotWhere(scope, fyRow.id),
            _sum: { ifmsExpenditureCr: true },
            orderBy: { asOfDate: "asc" },
          })
        : Promise.resolve([]),
      loadDashboardMeetingRowForCommandCentre(options?.meetingId),
      fyRow
        ? prisma.financeExpenditureSnapshot.findFirst({
            where: financeSnapshotWhere(scope, fyRow.id),
            orderBy: { asOfDate: "desc" },
            select: { asOfDate: true },
          })
        : Promise.resolve(null),
      prisma.actionItem.count({ where: { ...actionItemWhere(scope), status: "OVERDUE", archived: false } }),
    ]);

  const fy = fyRow;

  const lastSnapshotDate: string | null =
    latestSnapshot?.asOfDate.toISOString().slice(0, 10) ?? null;

  const summary =
    financialYearId && financialYearLabel
      ? await getFinanceSummaryBreakdownForOverview(entries, financialYearId, financialYearLabel)
      : null;

  const totalBudgetCr =
    summary?.totals.budgetEstimateCr ??
    entries.reduce((s, e) => s + (e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0)), 0);
  const totalSoCr =
    summary?.totals.soExpenditureCr ??
    entries.reduce((s, e) => s + e.so, 0);
  const totalIfmsCr =
    summary?.totals.ifmsExpenditureCr ??
    entries.reduce((s, e) => s + e.ifms, 0);
  const utilisationPct = totalBudgetCr > 0 ? (totalIfmsCr / totalBudgetCr) * 100 : 0;
  const lapseRiskCr = Math.max(0, totalBudgetCr - totalIfmsCr);

  let stateSector = 0;
  let centrallySponsored = 0;
  let centralSector = 0;
  for (const e of entries) {
    const st = (e.metadata as { sponsorshipType?: SponsorshipType } | undefined)?.sponsorshipType;
    if (!st) continue;
    const cat = sponsorshipToSchemeBudgetCategory(st);
    if (!cat) continue;
    if (cat === "STATE_SCHEME") stateSector += 1;
    else if (cat === "CENTRALLY_SPONSORED_SCHEME") centrallySponsored += 1;
    else centralSector += 1;
  }
  const schemesMonitored: CommandCentreSchemesMonitored = {
    total: entries.length,
    stateSector,
    centrallySponsored,
    centralSector,
  };

  const schemes: CommandCentreSchemeSummary[] = entries.map((e) => {
    const budgetCr = e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0);
    const pct = schemePct(e);
    return {
      id: e.id,
      schemeId: e.schemeId ?? e.id,
      scheme: e.scheme,
      vertical: e.vertical || "—",
      budgetCr,
      ifmsCr: e.ifms,
      soCr: e.so,
      pct,
      status: schemeStatusFromPct(pct),
    };
  });
  schemes.sort((a, b) => b.budgetCr - a.budgetCr);

  const withPct = entries.map((e) => ({
    entry: e,
    pct: schemePct(e),
  }));
  const sorted = [...withPct].sort((a, b) => b.pct - a.pct);
  const topSchemes: CommandCentreSchemeLeader[] = sorted.slice(0, 6).map(({ entry: e, pct }) => ({
    id: e.id,
    scheme: e.scheme,
    vertical: e.vertical,
    budgetCr: e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0),
    ifmsCr: e.ifms,
    pct,
  }));
  const bottomSchemes: CommandCentreSchemeLeader[] = [...withPct]
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6)
    .map(({ entry: e, pct }) => ({
      id: e.id,
      scheme: e.scheme,
      vertical: e.vertical,
      budgetCr: e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0),
      ifmsCr: e.ifms,
      pct,
    }));

  const ifmsTrend: CommandCentreIfmsTrendPoint[] = (trendRows as { asOfDate: Date; _sum: { ifmsExpenditureCr: unknown } }[]).map(
    (row) => ({
      asOfDate: row.asOfDate.toISOString().slice(0, 10),
      ifmsCr: toNumber(row._sum.ifmsExpenditureCr),
    }),
  );

  const overdueActionsPreview: CommandCentreOverduePreview[] = overdueItems.map((item) => ({
    id: item.id,
    title: item.title,
    officer: item.performers.map((p) => p.user.name).join(", ") || "—",
    daysOverdue: Math.max(
      0,
      Math.floor((Date.now() - item.dueDate.getTime()) / (24 * 60 * 60 * 1000)),
    ),
  }));

  const criticalSchemeCount = schemes.filter((s) => s.status === "critical").length;

  const lastMeeting: CommandCentreLastMeeting | null = lastMeetingRow
    ? {
        id: lastMeetingRow.id,
        meetingDate: lastMeetingRow.meetingDate.toISOString().slice(0, 10),
        title: lastMeetingRow.title,
        topics: lastMeetingRow.topics.map((t) => ({ id: t.id, topic: t.topic })),
        presentationMaterials: lastMeetingRow.materials.map((m) => ({
          id: m.id,
          fileName: m.fileName,
          verticalLabel: verticalLabelFromFileName(m.fileName, verticalNames),
        })),
      }
    : null;

  return {
    financialYearLabel,
    lastSnapshotDate,
    schemesMonitored,
    totals: {
      totalBudgetCr,
      totalSoCr,
      totalIfmsCr,
      utilisationPct,
      lapseRiskCr,
    },
    schemes,
    topSchemes,
    bottomSchemes,
    ifmsTrend,
    overdueActionsCount: overdueCount,
    overdueActionsPreview,
    criticalSchemeCount,
    lastMeeting,
  };
}
