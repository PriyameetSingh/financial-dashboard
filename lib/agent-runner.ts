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

export type AgentAlert = {
  title: string;
  body: string;
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

    // 8. Generate insights based on mode
    let insights: AgentAlert[] = [];

    if (mode === "RULE_BASED" || mode === "BOTH") {
      insights = getRuleBasedInsights({
        baselineDateStr,
        currentDateStr,
        deltaIfms,
        deltaSo,
        completedActionsCount,
        overdueActionsCount,
        kpiApprovedCount,
        kpiSubmittedCount
      });
    }

    if (mode === "LLM_BASED" || (mode === "BOTH" && insights.length === 0)) {
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

          Generate exactly 2 high-level administrative alerts.
          Keep titles to 2-3 words. Keep body descriptions strictly under 18 words.
          Focus on changes since the last meeting (e.g., expenditure growth, action completion rates, KPI clearances).

          Return your response strictly as a JSON array of objects:
          [
            {"title": "Alert Title", "body": "Alert body description text."}
          ]
        `;

        const rawLLM = await callLocalLLM(prompt);
        const jsonStart = rawLLM.indexOf("[");
        const jsonEnd = rawLLM.lastIndexOf("]") + 1;
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(rawLLM.substring(jsonStart, jsonEnd)) as AgentAlert[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (mode === "BOTH") {
              // Combine or prioritize LLM insights
              insights = parsed.slice(0, 2);
            } else {
              insights = parsed;
            }
          }
        }
      } catch (err) {
        console.error("Local LLM failed, falling back to rule-based:", err);
        if (mode === "LLM_BASED") {
          insights = getRuleBasedInsights({
            baselineDateStr,
            currentDateStr,
            deltaIfms,
            deltaSo,
            completedActionsCount,
            overdueActionsCount,
            kpiApprovedCount,
            kpiSubmittedCount
          });
        }
      }
    }

    // 9. Save Insight to Database
    const insightRow = await prisma.agentInsight.create({
      data: {
        modeUsed: mode,
        status: "SUCCESS",
        insights: insights as any,
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

function getRuleBasedInsights(data: {
  baselineDateStr: string;
  currentDateStr: string;
  deltaIfms: number;
  deltaSo: number;
  completedActionsCount: number;
  overdueActionsCount: number;
  kpiApprovedCount: number;
  kpiSubmittedCount: number;
}): AgentAlert[] {
  const list: AgentAlert[] = [];

  // Insight 1: Financial delta
  if (data.deltaIfms > 0) {
    list.push({
      title: "Expenditure growth",
      body: `IFMS expenditure increased by ₹${data.deltaIfms.toFixed(2)} Cr since the last review meeting (${data.baselineDateStr}).`
    });
  } else {
    list.push({
      title: "Expenditure pacing",
      body: `No new IFMS expenditure was registered since the last review meeting (${data.baselineDateStr}).`
    });
  }

  // Insight 2: Action progress
  if (data.completedActionsCount > 0 || data.overdueActionsCount > 0) {
    list.push({
      title: "Actions resolved",
      body: `${data.completedActionsCount} tasks completed; ${data.overdueActionsCount} became overdue since the last review meeting.`
    });
  } else {
    list.push({
      title: "Action items status",
      body: `No new tasks were resolved or became overdue since the last review meeting.`
    });
  }

  return list.slice(0, 2);
}
