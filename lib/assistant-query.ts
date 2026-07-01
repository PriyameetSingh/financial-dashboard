import { prisma } from "@/lib/prisma";
import type { AssistantMeetingContext } from "@/lib/assistant-types";
export type { AssistantMeetingContext } from "@/lib/assistant-types";
import { getCommandCentreDashboard } from "@/lib/command-centre-dashboard";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
} from "@/lib/finance-year-budget-allocation";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function mapKpiWorkflow(workflowStatus?: string | null): string {
  if (!workflowStatus) return "not_submitted";
  if (workflowStatus === "reviewed") return "approved";
  if (workflowStatus === "submitted") return "submitted_pending";
  if (workflowStatus === "draft") return "draft";
  if (workflowStatus === "rejected") return "draft";
  return "submitted_pending";
}

async function resolveFy(label?: string | null) {
  let fy = label
    ? await prisma.financialYear.findUnique({ where: { label } })
    : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
  if (!fy && label) {
    fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
  }
  return fy;
}

function helpText(inMeeting: boolean): string {
  const lines = [
    "**You can ask for:**",
    "- **Financials** — budget, IFMS, SO expenditure, utilisation (FY-level roll-up)",
    "- **Overview** — dashboard-style scheme utilisation, lapse risk, IFMS trend",
    "- **KPIs** — submission status counts for the active financial year",
    "- **Action items** — overdue items across HUDD" + (inMeeting ? ", and items linked to this meeting" : ""),
    inMeeting ? "- **Agenda** — discussion topics for this meeting" : "",
    "",
    "Example: “Summarise financial position for this FY” or “Which schemes are in critical utilisation?”",
  ].filter(Boolean);
  return lines.join("\n\n");
}

async function answerFinancial(fyLabel?: string | null): Promise<string> {
  const fy = await resolveFy(fyLabel ?? undefined);
  if (!fy) return "No financial year is configured in the system.";
  const allocation = await ensureFyBudgetAllocationWithLines(fy.id, null);
  const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));
  const rows = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
    const row = lineByCategory.get(category);
    return {
      label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
      budget: row ? toNumber(row.budgetEstimateCr) : 0,
      so: row ? toNumber(row.soExpenditureCr) : 0,
      ifms: row ? toNumber(row.ifmsExpenditureCr) : 0,
    };
  });
  const totals = rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      so: acc.so + r.so,
      ifms: acc.ifms + r.ifms,
    }),
    { budget: 0, so: 0, ifms: 0 },
  );
  const util = totals.budget > 0 ? ((totals.ifms / totals.budget) * 100).toFixed(1) : "0.0";
  const table = rows
    .filter((r) => r.budget + r.so + r.ifms > 0)
    .slice(0, 12)
    .map((r) => `| ${r.label} | ₹${r.ifms.toFixed(1)} Cr (IFMS) | ₹${r.so.toFixed(1)} Cr (SO) |`)
    .join("\n");
  return [
    `**FY ${fy.label}** — FY budget allocation roll-up`,
    "",
    `- **Total budget (est.):** ₹${totals.budget.toFixed(1)} Cr`,
    `- **SO expenditure:** ₹${totals.so.toFixed(1)} Cr`,
    `- **IFMS expenditure:** ₹${totals.ifms.toFixed(1)} Cr`,
    `- **IFMS vs budget:** ${util}%`,
    "",
    table ? "**By category (IFMS / SO)**\n\n" + table : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function answerKpi(): Promise<string> {
  const fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
  if (!fy) return "No financial year configured — KPI targets are unavailable.";
  const definitions = await prisma.kpiDefinition.findMany({
    where: {
      archived: false,
      scheme: { archived: false },
    },
    include: {
      scheme: { select: { name: true, verticalName: true } },
      targets: {
        where: { financialYearId: fy.id },
        take: 1,
        include: {
          measurements: { orderBy: { measuredAt: "desc" }, take: 1 },
        },
      },
    },
  });
  const byStatus: Record<string, number> = {};
  for (const d of definitions) {
    const m = d.targets[0]?.measurements[0];
    const s = mapKpiWorkflow(m?.workflowStatus);
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const parts = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k.replace(/_/g, " ")}:** ${v}`);
  return [
    `**KPI submissions (FY ${fy.label})** — ${definitions.length} definition(s).`,
    "",
    ...parts,
  ].join("\n");
}

async function answerAgenda(ctx: AssistantMeetingContext): Promise<string> {
  const topics = await prisma.meetingTopic.findMany({
    where: { meetingId: ctx.meetingId },
    orderBy: { createdAt: "asc" },
  });
  if (topics.length === 0) return "This meeting has no discussion topics recorded.";
  const lines = topics.map((t, i) => `${i + 1}. ${t.topic}`);
  return ["**Agenda**", "", ...lines].join("\n");
}

async function answerMeetingActions(ctx: AssistantMeetingContext): Promise<string> {
  const items = await prisma.actionItem.findMany({
    where: { meetingId: ctx.meetingId, archived: false },
    orderBy: { dueDate: "asc" },
    take: 25,
    include: {
      performers: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (items.length === 0) return "No action items are linked to this meeting yet.";
  const lines = items.map(
    (a) =>
      `- **${a.title}** — ${a.status} · due ${a.dueDate.toISOString().slice(0, 10)} · ${a.performers.map((p) => p.user.name).join(", ") || "Unassigned"}`,
  );
  return ["**Action items for this meeting**", "", ...lines].join("\n");
}

async function answerOverdue(): Promise<string> {
  const items = await prisma.actionItem.findMany({
    where: { status: "OVERDUE", archived: false },
    orderBy: { dueDate: "asc" },
    take: 12,
    include: {
      performers: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (items.length === 0) return "There are **no overdue** action items right now.";
  const lines = items.map((a) => {
    const days = Math.max(0, Math.floor((Date.now() - a.dueDate.getTime()) / (24 * 60 * 60 * 1000)));
    return `- **${a.title}** — ${days}d overdue · ${a.performers.map((p) => p.user.name).join(", ") || "—"}`;
  });
  return ["**Overdue action items** (sample up to 12)", "", ...lines].join("\n");
}

async function answerOverview(): Promise<string> {
  const d = await getCommandCentreDashboard();
  const top = d.topSchemes.slice(0, 5);
  const bottom = d.bottomSchemes.slice(0, 5);
  const trendLast = d.ifmsTrend.length ? d.ifmsTrend[d.ifmsTrend.length - 1] : null;
  return [
    `**Command centre snapshot** · FY ${d.financialYearLabel ?? "—"}`,
    d.lastSnapshotDate ? `Latest scheme snapshot date (aggregated): **${d.lastSnapshotDate}**` : "",
    "",
    "**Totals (scheme roll-up)**",
    `- Budget: ₹${d.totals.totalBudgetCr.toFixed(1)} Cr`,
    `- IFMS: ₹${d.totals.totalIfmsCr.toFixed(1)} Cr`,
    `- Utilisation: ${d.totals.utilisationPct.toFixed(1)}%`,
    `- Lapse risk: ₹${d.totals.lapseRiskCr.toFixed(1)} Cr`,
    `- Overdue actions: **${d.overdueActionsCount}**`,
    `- Schemes in critical band: **${d.criticalSchemeCount}**`,
    trendLast ? `- Latest IFMS trend point: ₹${trendLast.ifmsCr.toFixed(1)} Cr @ ${trendLast.asOfDate}` : "",
    "",
    "**Highest utilisation (top 5)**",
    ...top.map((s) => `- ${s.scheme} (${s.vertical}) — ${s.pct.toFixed(0)}% · IFMS ₹${s.ifmsCr.toFixed(1)} Cr`),
    "",
    "**Lowest utilisation (bottom 5)**",
    ...bottom.map((s) => `- ${s.scheme} (${s.vertical}) — ${s.pct.toFixed(0)}% · IFMS ₹${s.ifmsCr.toFixed(1)} Cr`),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Data-backed assistant for HUDD NEXUS (meeting mode and global).
 */
export async function answerAssistantQuery(query: string, meetingContext: AssistantMeetingContext | null): Promise<string> {
  const q = query.trim().toLowerCase();
  const inMeeting = meetingContext != null;

  if (!q) return helpText(inMeeting);

  if (q.includes("help") || q.includes("what can you") || q === "?") {
    return helpText(inMeeting);
  }

  if (inMeeting && (q.includes("agenda") || q.includes("topic") || q.includes("discussion"))) {
    return answerAgenda(meetingContext);
  }

  if (q.includes("overdue")) {
    return answerOverdue();
  }

  if (inMeeting && q.includes("action")) {
    return answerMeetingActions(meetingContext);
  }

  if (q.includes("financial") || q.includes("budget") || q.includes("ifms") || q.includes("expenditure") || q.includes("so expenditure")) {
    return answerFinancial(meetingContext?.financialYearLabel);
  }

  if (q.includes("kpi")) {
    return answerKpi();
  }

  if (
    q.includes("overview") ||
    q.includes("dashboard") ||
    q.includes("command centre") ||
    q.includes("command center") ||
    q.includes("scheme") ||
    q.includes("utilisation") ||
    q.includes("utilization") ||
    q.includes("lapse") ||
    q.includes("critical")
  ) {
    return answerOverview();
  }

  if (!inMeeting && q.includes("action")) {
    return answerOverdue();
  }

  return [
    "I did not match that to a data query yet. Try **financial**, **KPI**, **overview**, **overdue actions**, or **agenda**" +
      (inMeeting ? ", or **action items for this meeting**." : "."),
    "",
    helpText(inMeeting),
  ].join("\n\n");
}
