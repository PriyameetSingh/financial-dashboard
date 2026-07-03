import { prisma } from "@/lib/prisma";
import { callLocalLLM } from "@/lib/llm";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";
import { aggregateSnapshotTotalsBySchemeBucket } from "@/lib/finance-summary-asof";
import { FINANCE_YEAR_BUDGET_CATEGORY_ORDER } from "@/lib/finance-year-budget-allocation";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

async function getTotalsForSnapshotDate(fyId: string, asOfDate: Date) {
  const heads = await prisma.financeSummaryHead.findMany({
    where: { financialYearId: fyId, asOfDate },
  });

  if (heads.length > 0) {
    const rows = heads.map((h) => ({
      budgetEstimateCr: toNumber(h.budgetEstimateCr),
      soExpenditureCr: toNumber(h.soExpenditureCr),
      ifmsExpenditureCr: toNumber(h.ifmsExpenditureCr),
    }));
    return rows.reduce(
      (acc, r) => ({
        budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
        soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
        ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
      }),
      { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 }
    );
  }

  const allocation = await syncSchemeFyCategoryLines(fyId, null);
  const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));
  const bucketExp = await aggregateSnapshotTotalsBySchemeBucket(fyId, asOfDate);

  const rows = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
    const line = lineByCategory.get(category);
    const base = {
      budgetEstimateCr: line ? toNumber(line.budgetEstimateCr) : 0,
      soExpenditureCr: line ? toNumber(line.soExpenditureCr) : 0,
      ifmsExpenditureCr: line ? toNumber(line.ifmsExpenditureCr) : 0,
    };
    if (category === "STATE_SCHEME" || category === "CENTRALLY_SPONSORED_SCHEME" || category === "CENTRAL_SECTOR_SCHEME") {
      const b = bucketExp[category];
      return {
        ...base,
        soExpenditureCr: b.soExpenditureCr,
        ifmsExpenditureCr: b.ifmsExpenditureCr,
      };
    }
    return base;
  });

  return rows.reduce(
    (acc, r) => ({
      budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
      soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
      ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
    }),
    { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 }
  );
}

export type ProgressCard = {
  id: string;
  title: string;
  status: string;
  description: string;
  tone: "positive" | "negative";
  href?: string;
};

export async function runAgentWorkflow(modeOverride?: string): Promise<{ success: boolean; insightId?: string; error?: string }> {
  try {
    // 1. Fetch agent configuration
    const config = await prisma.agentConfig.findFirst();
    const enabled = config ? config.enabled : true;
    const mode = modeOverride || (config ? config.mode : "BOTH");

    if (!enabled && !modeOverride) {
      return { success: false, error: "Agent is disabled" };
    }

    // 2. Fetch the latest financial year
    const fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
    if (!fy) {
      throw new Error("No financial year configured in the system.");
    }

    // 3. Resolve snapshot dates
    const snapshots = await prisma.financeExpenditureSnapshot.findMany({
      where: { financialYearId: fy.id },
      select: { asOfDate: true },
      distinct: ['asOfDate'],
      orderBy: { asOfDate: 'desc' }
    });

    if (snapshots.length === 0) {
      throw new Error("No expenditure snapshots found.");
    }

    const dates = snapshots.map(s => s.asOfDate.toISOString().slice(0, 10));
    const currentDateStr = dates[0];
    const currentDate = new Date(`${currentDateStr}T00:00:00.000Z`);

    // 4. Resolve baseline date (latest review meeting before current snapshot date)
    const lastMeeting = await prisma.dashboardMeeting.findFirst({
      where: {
        meetingDate: { lt: currentDate }
      },
      orderBy: { meetingDate: 'desc' }
    });

    let baselineDateStr = dates[1] || dates[0];
    if (lastMeeting) {
      const meetingDateStr = lastMeeting.meetingDate.toISOString().slice(0, 10);
      const matchedBaseline = dates.find(d => d <= meetingDateStr);
      if (matchedBaseline) {
        baselineDateStr = matchedBaseline;
      }
    }

    const baselineDate = new Date(`${baselineDateStr}T00:00:00.000Z`);

    // 5. Query Financial Totals for both dates
    const totalsCur = await getTotalsForSnapshotDate(fy.id, currentDate);
    const totalsBase = await getTotalsForSnapshotDate(fy.id, baselineDate);

    const deltaIfms = Math.max(0, totalsCur.ifmsExpenditureCr - totalsBase.ifmsExpenditureCr);
    const deltaSo = Math.max(0, totalsCur.soExpenditureCr - totalsBase.soExpenditureCr);
    const utilPctCur = totalsCur.budgetEstimateCr > 0 ? (totalsCur.ifmsExpenditureCr / totalsCur.budgetEstimateCr) * 100 : 0;
    const utilPctBase = totalsBase.budgetEstimateCr > 0 ? (totalsBase.ifmsExpenditureCr / totalsBase.budgetEstimateCr) * 100 : 0;

    // 6. Query Actions delta
    const completedActionsCount = await prisma.actionItem.count({
      where: {
        status: "COMPLETED",
        updatedAt: { gte: baselineDate },
        archived: false
      }
    });

    const overdueActionsCount = await prisma.actionItem.count({
      where: {
        status: "OVERDUE",
        dueDate: { gte: baselineDate, lte: currentDate },
        archived: false
      }
    });

    const currentOverdueCount = await prisma.actionItem.count({
      where: {
        status: "OVERDUE",
        archived: false
      }
    });

    // 7. Query KPI delta
    const kpiApprovedCount = await prisma.kpiMeasurement.count({
      where: {
        workflowStatus: "reviewed",
        reviewedAt: { gte: baselineDate }
      }
    });

    const kpiSubmittedCount = await prisma.kpiMeasurement.count({
      where: {
        workflowStatus: "submitted",
        createdAt: { gte: baselineDate }
      }
    });

    // 8. Construct Grid Cards
    const cards: ProgressCard[] = [];

    // Card 1: Overdue Actions (Mandatory)
    cards.push({
      id: "overdue_actions",
      title: "Overdue Actions",
      status: `${overdueActionsCount} new / ${currentOverdueCount} total`,
      description: `${overdueActionsCount} action items became overdue this week. Click to review.`,
      tone: overdueActionsCount > 0 ? "negative" : "positive",
      href: "/action-items?due=overdue"
    });

    // Cards 2 & 3: AI Insights / Alerts
    let aiInsights: Array<{ title: string; status: string; description: string; tone: "positive" | "negative" }> = [];

    if (mode === "LLM_BASED" || mode === "BOTH") {
      try {
        const prompt = `
          Analyze this HUDD progress data since the last review meeting held on ${baselineDateStr} (baseline snapshot date: ${baselineDateStr}, current snapshot date: ${currentDateStr}):

          Financial Progress:
          - Total Budget: ₹${totalsCur.budgetEstimateCr.toFixed(2)} Cr
          - IFMS Expenditure: ₹${totalsCur.ifmsExpenditureCr.toFixed(2)} Cr (Change since last meeting: +₹${deltaIfms.toFixed(2)} Cr)
          - Budget Utilisation: ${utilPctCur.toFixed(1)}% (Change since last meeting: +${(utilPctCur - utilPctBase).toFixed(1)}%)

          Operations & Action Items:
          - Resolved Actions: ${completedActionsCount} completed since last meeting.
          - New Overdue Actions: ${overdueActionsCount} became overdue since last meeting.
          - Current Overdue Backlog: ${currentOverdueCount} total overdue actions.

          KPI Metrics:
          - Approved Submissions: ${kpiApprovedCount} reviewed and approved since last meeting.
          - New Pending Submissions: ${kpiSubmittedCount} submitted and awaiting review since last meeting.

          Generate exactly 2 high-level administrative insights/alerts for the HUDD leadership.
          For each insight, return:
          - a short title (2-3 words, e.g., "Utilisation pace" or "Cabinet note approvals")
          - a status string (1-3 words, e.g., "Lagging pro-rata" or "Approved" or "Trailing budget")
          - a brief description (under 18 words, focusing on risk, pacing, or milestones)
          - a tone ("positive" if it represents a good milestone/progress, "negative" if it represents a delay, critical lag, or bottleneck)

          Return your response strictly as a JSON array of objects in this format:
          [
            {"title": "Pacing Lag", "status": "Trailing target", "description": "IFMS spend lags by 12% in urban transport.", "tone": "negative"},
            {"title": "Cabinet Approvals", "status": "Completed", "description": "Cabinet notes for metro water cleared.", "tone": "positive"}
          ]
        `;

        const rawLLM = await callLocalLLM(prompt);
        const jsonStart = rawLLM.indexOf("[");
        const jsonEnd = rawLLM.lastIndexOf("]") + 1;
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(rawLLM.substring(jsonStart, jsonEnd));
          if (Array.isArray(parsed) && parsed.length > 0) {
            aiInsights = parsed.slice(0, 2);
          }
        }
      } catch (err) {
        console.error("Local LLM failed, using rules fallback for AI slots:", err);
      }
    }

    // If LLM failed or rules mode was selected, generate deterministic alerts for slots 2 & 3
    if (aiInsights.length < 2) {
      aiInsights = [
        {
          title: "IFMS Pacing",
          status: deltaIfms > 0 ? `+₹${deltaIfms.toFixed(2)} Cr` : "No Change",
          description: deltaIfms > 0
            ? `IFMS spent increased by ₹${deltaIfms.toFixed(2)} Cr since the last review meeting.`
            : "IFMS expenditure booking has held steady since the last meeting.",
          tone: deltaIfms > 0 ? "positive" : "negative"
        },
        {
          title: "SO Expenditure",
          status: deltaSo > 0 ? `+₹${deltaSo.toFixed(2)} Cr` : "No Change",
          description: deltaSo > 0
            ? `SO spent increased by ₹${deltaSo.toFixed(2)} Cr since the last review meeting.`
            : "SO expenditure booking has held steady since the last meeting.",
          tone: deltaSo > 0 ? "positive" : "negative"
        }
      ];
    }

    // Add Slots 2 & 3 to Cards list
    aiInsights.forEach((item, idx) => {
      cards.push({
        id: `ai_insight_${idx + 1}`,
        title: item.title,
        status: item.status,
        description: item.description,
        tone: item.tone
      });
    });

    // Slots 4, 5 & 6: Action item completions & KPI progress
    const completedActions = await prisma.actionItem.findMany({
      where: {
        status: "COMPLETED",
        updatedAt: { gte: baselineDate },
        archived: false
      },
      select: {
        id: true,
        title: true,
        vertical: { select: { name: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 3
    });

    completedActions.forEach((act) => {
      cards.push({
        id: `completed_act_${act.id}`,
        title: act.vertical?.name ? `${act.vertical.name} Action` : "Action Item",
        status: "Action Complied",
        description: act.title.length > 48 ? `"${act.title.slice(0, 45)}..." was completed.` : `"${act.title}" was completed.`,
        tone: "positive"
      });
    });

    const kpisReviewed = await prisma.kpiMeasurement.findMany({
      where: {
        workflowStatus: "reviewed",
        reviewedAt: { gte: baselineDate }
      },
      include: {
        kpiTarget: {
          include: {
            kpiDefinition: {
              include: {
                scheme: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: { reviewedAt: "desc" },
      take: 3
    });

    kpisReviewed.forEach((kpi) => {
      const schemeName = kpi.kpiTarget.kpiDefinition.scheme.name;
      cards.push({
        id: `kpi_rev_${kpi.id}`,
        title: schemeName.length > 18 ? `${schemeName.slice(0, 15)}...` : schemeName,
        status: "KPI Approved",
        description: `KPI target reviewed and approved for ${schemeName}.`,
        tone: "positive"
      });
    });

    // Pad remaining cards if less than 6
    if (cards.length < 6 && deltaIfms > 0) {
      cards.push({
        id: "fill_finance_ifms",
        title: "IFMS Pacing",
        status: `+₹${deltaIfms.toFixed(2)} Cr`,
        description: `IFMS expenditure grew by ₹${deltaIfms.toFixed(2)} Cr since the last meeting.`,
        tone: "positive"
      });
    }

    while (cards.length < 6) {
      const idx = cards.length;
      cards.push({
        id: `fill_default_${idx}`,
        title: "Scheme progress",
        status: "On Track",
        description: "No other major action items or KPI review modifications were recorded this week.",
        tone: "positive"
      });
    }

    const finalCards = cards.slice(0, 6);

    // 9. Save Insight to Database
    const insightRow = await prisma.agentInsight.create({
      data: {
        modeUsed: mode,
        status: "SUCCESS",
        insights: finalCards as any,
        runDate: new Date(),
      }
    });

    return { success: true, insightId: insightRow.id };

  } catch (error: any) {
    console.error("Agent workflow execution failed:", error);
    // Log failure in AgentInsight
    const failedInsight = await prisma.agentInsight.create({
      data: {
        modeUsed: modeOverride || "UNKNOWN",
        status: "FAILED",
        insights: [] as any,
        errorLog: error instanceof Error ? error.stack || error.message : String(error),
        runDate: new Date(),
      }
    });
    return { success: false, insightId: failedInsight.id, error: error.message };
  }
}
