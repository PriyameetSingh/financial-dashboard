import { prisma, tenantStamped } from "@/lib/prisma";
import { callLocalLLM } from "@/lib/llm";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";
import { aggregateSnapshotTotalsBySchemeBucket } from "@/lib/finance-summary-asof";
import { FINANCE_YEAR_BUDGET_CATEGORY_ORDER } from "@/lib/finance-year-budget-allocation";
import type { DataScope } from "@/lib/data-scope";

/** Agent runs are admin-only (MANAGE_PERMISSIONS) and produce system-wide insights. */
const AGENT_FULL_SCOPE: DataScope = { kind: "full" };

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
  const bucketExp = await aggregateSnapshotTotalsBySchemeBucket(fyId, asOfDate, AGENT_FULL_SCOPE);

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

type Quarter = 1 | 2 | 3 | 4;
const QUARTER_ALLOCATIONS: Record<Quarter, number> = {
  1: 0.25, // 25% in Q1 (Apr-Jun)
  2: 0.15, // 15% in Q2 (Jul-Sep)
  3: 0.20, // 20% in Q3 (Oct-Dec)
  4: 0.40, // 40% in Q4 (Jan-Mar)
};

function getCurrentQuarter(): Quarter {
  const month = new Date().getMonth(); // 0-11
  // FY starts in April (month 3)
  if (month >= 3 && month <= 5) return 1; // Apr-Jun
  if (month >= 6 && month <= 8) return 2; // Jul-Sep
  if (month >= 9 && month <= 11) return 3; // Oct-Dec
  return 4; // Jan-Mar
}

function getCumulativeTargetUpToQuarter(q: Quarter): number {
  let cumulative = 0;
  for (let i = 1; i <= q; i++) {
    cumulative += QUARTER_ALLOCATIONS[i as Quarter];
  }
  return cumulative;
}

async function getSchemeFinancialsForDate(fyId: string, asOfDate: Date) {
  const schemes = await prisma.scheme.findMany({
    where: { archived: false, sponsorshipType: { not: "NON_FINANCIAL" } },
    include: { subschemes: true }
  });

  const budgets = await prisma.financeBudget.findMany({
    where: { financialYearId: fyId }
  });

  const supplements = await prisma.financeBudgetSupplement.findMany({
    where: { financialYearId: fyId }
  });

  const snapshots = await prisma.financeExpenditureSnapshot.findMany({
    where: { financialYearId: fyId, asOfDate }
  });

  const budgetsByScheme = new Map<string, typeof budgets>();
  for (const b of budgets) {
    const list = budgetsByScheme.get(b.schemeId) ?? [];
    list.push(b);
    budgetsByScheme.set(b.schemeId, list);
  }

  const snapshotsByScheme = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const list = snapshotsByScheme.get(s.schemeId) ?? [];
    list.push(s);
    snapshotsByScheme.set(s.schemeId, list);
  }

  const supplementsByScheme = new Map<string, typeof supplements>();
  for (const s of supplements) {
    const list = supplementsByScheme.get(s.schemeId) ?? [];
    list.push(s);
    supplementsByScheme.set(s.schemeId, list);
  }

  return schemes.map((scheme) => {
    const schemeBudgets = budgetsByScheme.get(scheme.id) ?? [];
    const schemeSnapshots = snapshotsByScheme.get(scheme.id) ?? [];
    const schemeSupplements = supplementsByScheme.get(scheme.id) ?? [];
    const subIds = new Set(scheme.subschemes.map((s) => s.id));

    let annualBudget = 0;
    let totalSupplementCr = 0;
    let ifms = 0;
    let so = 0;

    if (subIds.size > 0) {
      const subBudgetSum = schemeBudgets
        .filter((b) => b.subschemeId && subIds.has(b.subschemeId))
        .reduce((sum, b) => sum + toNumber(b.budgetEstimateCr), 0);
      const schemeLevelBudget = schemeBudgets.find((b) => b.subschemeId === null);
      annualBudget = subBudgetSum > 0 ? subBudgetSum : toNumber(schemeLevelBudget?.budgetEstimateCr ?? 0);

      const latestBySub = new Map<string, (typeof snapshots)[number]>();
      for (const snap of schemeSnapshots) {
        if (!snap.subschemeId || !subIds.has(snap.subschemeId)) continue;
        const prev = latestBySub.get(snap.subschemeId);
        if (!prev || snap.asOfDate > prev.asOfDate) {
          latestBySub.set(snap.subschemeId, snap);
        }
      }

      totalSupplementCr = schemeSupplements
        .filter((s) => s.subschemeId && subIds.has(s.subschemeId))
        .reduce((sum, s) => sum + toNumber(s.amountCr), 0);

      if (latestBySub.size > 0) {
        for (const snap of latestBySub.values()) {
          ifms += toNumber(snap.ifmsExpenditureCr);
          so += toNumber(snap.soExpenditureCr);
        }
      }
    } else {
      const schemeLevelBudget = schemeBudgets.find((b) => b.subschemeId === null);
      annualBudget = toNumber(schemeLevelBudget?.budgetEstimateCr ?? 0);
      
      const schemeLevelSup = schemeSupplements.filter((s) => s.subschemeId === null);
      totalSupplementCr = schemeLevelSup.reduce((sum, s) => sum + toNumber(s.amountCr), 0);

      const snap = schemeSnapshots.find((s) => s.subschemeId === null);
      ifms = toNumber(snap?.ifmsExpenditureCr ?? 0);
      so = toNumber(snap?.soExpenditureCr ?? 0);
    }

    const effectiveBudget = annualBudget + totalSupplementCr;
    return {
      id: scheme.id,
      name: scheme.name,
      code: scheme.code,
      effectiveBudget,
      ifms,
      so
    };
  });
}

async function getOverdueActionsBacklogCandidate(baselineDate: Date, currentDate: Date): Promise<ProgressCard> {
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

  return {
    id: "overdue_actions",
    title: "Overdue Actions",
    status: `${overdueActionsCount} new / ${currentOverdueCount} total`,
    description: `${overdueActionsCount} action items became overdue since the last review meeting.`,
    tone: overdueActionsCount > 0 ? "negative" : "positive",
    href: "/action-items?due=overdue"
  };
}

async function getActionItemsCompletedCandidates(baselineDate: Date, currentDate: Date): Promise<ProgressCard[]> {
  const completedActions = await prisma.actionItem.findMany({
    where: {
      status: "COMPLETED",
      updatedAt: { gte: baselineDate },
      archived: false
    },
    include: {
      vertical: { select: { name: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  return completedActions.map((act) => {
    const completedOnTime = new Date(act.updatedAt.toISOString().slice(0, 10)) <= new Date(act.dueDate.toISOString().slice(0, 10));
    return {
      id: `completed_act_${act.id}`,
      title: act.vertical?.name ? `${act.vertical.name} Action` : "Action Item",
      status: completedOnTime ? "Completed On Time" : "Completed Overdue",
      description: `"${act.title}" was completed ${completedOnTime ? "on time" : "after its due date"}.`,
      tone: "positive",
      href: `/action-items/${act.id}`
    };
  });
}

async function getQuarterlyTargetMetCandidates(fyId: string, baselineDate: Date, currentDate: Date): Promise<ProgressCard[]> {
  const currentSchemes = await getSchemeFinancialsForDate(fyId, currentDate);
  const baselineSchemes = await getSchemeFinancialsForDate(fyId, baselineDate);

  const baselineMap = new Map(baselineSchemes.map(s => [s.id, s]));

  const quarter = getCurrentQuarter();
  const cumulativeTargetPct = getCumulativeTargetUpToQuarter(quarter) * 100;

  const candidates: ProgressCard[] = [];

  for (const cur of currentSchemes) {
    if (cur.effectiveBudget <= 0) continue;
    const curPct = (cur.ifms / cur.effectiveBudget) * 100;
    const base = baselineMap.get(cur.id);
    const basePct = base && base.effectiveBudget > 0 ? (base.ifms / base.effectiveBudget) * 100 : 0;

    const metNow = curPct >= cumulativeTargetPct;
    const metBefore = basePct >= cumulativeTargetPct;

    if (metNow) {
      const crossed = !metBefore;
      candidates.push({
        id: `scheme_target_met_${cur.id}`,
        title: cur.name.length > 18 ? `${cur.name.slice(0, 15)}...` : cur.name,
        status: crossed ? "Target Met This Week" : "Quarter Target Met",
        description: crossed
          ? `Utilization reached ${curPct.toFixed(1)}%, exceeding Q${quarter} target of ${cumulativeTargetPct.toFixed(0)}% this week.`
          : `Utilization is at ${curPct.toFixed(1)}% (Target: ${cumulativeTargetPct.toFixed(0)}% for Q${quarter}).`,
        tone: "positive",
        href: `/financial/schemes-board`
      });
    }
  }

  return candidates;
}

async function getKpiCompletedCandidates(baselineDate: Date): Promise<ProgressCard[]> {
  // Only KPIs whose completion was approved (status === "completed").
  // `completionReviewedAt` is set both on auto-approval and on reviewer approval,
  // so it is the reliable timestamp for "approved this period".
  const completedKpis = await prisma.kpiDefinition.findMany({
    where: {
      completionStatus: "completed",
      completionReviewedAt: { gte: baselineDate },
      archived: false,
    },
    include: {
      scheme: { select: { name: true } },
    },
    orderBy: { completionReviewedAt: "desc" },
    take: 5,
  });

  return completedKpis.map((kpi) => {
    const schemeName = kpi.scheme.name;
    const shortSchemeName = schemeName.length > 18 ? `${schemeName.slice(0, 15)}...` : schemeName;
    const desc = kpi.description;
    const shortDesc = desc.length > 40 ? `"${desc.slice(0, 37)}..."` : `"${desc}"`;
    const reviewNote = kpi.completionReviewNote?.trim();

    return {
      id: `kpi_completed_${kpi.id}`,
      title: shortSchemeName,
      status: "KPI Completed",
      description: reviewNote
        ? `${shortDesc} marked complete. ${reviewNote.length > 60 ? `${reviewNote.slice(0, 57)}...` : reviewNote}`
        : `${shortDesc} marked complete and approved this week.`,
      tone: "positive" as const,
      href: "/kpis",
    };
  });
}

async function getKpiSubstantialProgressCandidates(baselineDate: Date, currentDate: Date): Promise<ProgressCard[]> {
  const measurements = await prisma.kpiMeasurement.findMany({
    where: {
      workflowStatus: "reviewed",
      reviewedAt: { gte: baselineDate }
    },
    include: {
      kpiTarget: {
        include: {
          kpiDefinition: {
            include: {
              scheme: true
            }
          }
        }
      }
    },
    orderBy: { reviewedAt: "desc" },
    take: 5
  });

  const candidates: ProgressCard[] = [];

  for (const m of measurements) {
    const prev = await prisma.kpiMeasurement.findFirst({
      where: {
        kpiTargetId: m.kpiTargetId,
        workflowStatus: "reviewed",
        reviewedAt: { lt: baselineDate }
      },
      orderBy: { reviewedAt: "desc" }
    });

    const schemeName = m.kpiTarget.kpiDefinition.scheme.name;
    const shortSchemeName = schemeName.length > 18 ? `${schemeName.slice(0, 15)}...` : schemeName;
    const desc = m.kpiTarget.kpiDefinition.description;
    const shortDesc = desc.length > 40 ? `"${desc.slice(0, 37)}..."` : `"${desc}"`;

    const denom = toNumber(m.kpiTarget.denominatorValue);
    const curNum = toNumber(m.numeratorValue);
    const prevNum = prev ? toNumber(prev.numeratorValue) : 0;

    let isSubstantial = false;
    let cardStatus = "";
    let cardDescription = "";
    let cardTone: "positive" | "negative" = "positive";

    if (denom > 0) {
      const curPct = (curNum / denom) * 100;
      const prevPct = (prevNum / denom) * 100;
      const deltaPct = curPct - prevPct;

      if (deltaPct >= 5) {
        isSubstantial = true;
        cardStatus = "KPI Progress";
        cardDescription = `${shortDesc} improved by +${deltaPct.toFixed(1)}% (now ${curPct.toFixed(1)}%).`;
      } else if (!prev && curPct >= 85) {
        isSubstantial = true;
        cardStatus = "KPI Milestone";
        cardDescription = `${shortDesc} reached ${curPct.toFixed(1)}% completion.`;
      }
    } else if (m.yesValue !== null) {
      const curYes = m.yesValue;
      const prevYes = prev ? prev.yesValue : null;

      if (curYes && prevYes === false) {
        isSubstantial = true;
        cardStatus = "KPI Target Achieved";
        cardDescription = `${shortDesc} status changed to Achieved.`;
      }
    }

    if (!isSubstantial && prev) {
      const curStatus = m.progressStatus;
      const prevStatus = prev.progressStatus;

      if (curStatus === "on_track" && (prevStatus === "delayed" || prevStatus === "overdue")) {
        isSubstantial = true;
        cardStatus = "KPI On Track";
        cardDescription = `${shortDesc} is now on track (previously delayed).`;
      }
    }

    if (isSubstantial) {
      candidates.push({
        id: `kpi_progress_${m.id}`,
        title: shortSchemeName,
        status: cardStatus,
        description: cardDescription,
        tone: cardTone,
        href: "/kpis"
      });
    }
  }

  return candidates;
}

function getCandidatePriority(type?: string): number {
  switch (type) {
    case "overdue_actions": return 1;
    case "quarterly_target_met": return 2;
    case "kpi_substantial_progress": return 3;
    case "kpi_completed": return 3;
    case "action_item_completed": return 4;
    case "financial_delta": return 5;
    default: return 6;
  }
}

export async function runAgentWorkflow(modeOverride?: string): Promise<{ success: boolean; insightId?: string; error?: string }> {
  const executionSteps: Array<{ name: string; details?: string; prompt?: string; response?: string; success?: boolean }> = [];
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

    executionSteps.push({
      name: "Resolve snapshot dates",
      details: `Current date: ${currentDateStr}, Baseline date: ${baselineDateStr}`
    });

    // 5. Query Financial Totals for both dates (needed for pacing deltas)
    const totalsCur = await getTotalsForSnapshotDate(fy.id, currentDate);
    const totalsBase = await getTotalsForSnapshotDate(fy.id, baselineDate);

    const deltaIfms = Math.max(0, totalsCur.ifmsExpenditureCr - totalsBase.ifmsExpenditureCr);
    const deltaSo = Math.max(0, totalsCur.soExpenditureCr - totalsBase.soExpenditureCr);

    executionSteps.push({
      name: "Query financial pacing",
      details: `IFMS Delta: +₹${deltaIfms.toFixed(2)} Cr, SO Delta: +₹${deltaSo.toFixed(2)} Cr`
    });

    // 6. Assemble candidate cards from different rule-based queries (tools)
    const allCandidates: Array<ProgressCard & { type?: string }> = [];

    // Card Type 1: Overdue Actions Backlog
    const overdueCard = await getOverdueActionsBacklogCandidate(baselineDate, currentDate);
    allCandidates.push({ ...overdueCard, type: "overdue_actions" });

    executionSteps.push({
      name: "Query overdue actions backlog",
      details: `New overdue actions: ${overdueCard.status}, Description: ${overdueCard.description}`
    });

    // Card Type 2: Quarterly target met schemes
    const targetMetCards = await getQuarterlyTargetMetCandidates(fy.id, baselineDate, currentDate);
    for (const card of targetMetCards) {
      allCandidates.push({ ...card, type: "quarterly_target_met" });
    }

    executionSteps.push({
      name: "Query quarterly target met schemes",
      details: `Found ${targetMetCards.length} schemes meeting quarterly target: ${targetMetCards.map(c => `${c.title} (${c.status})`).join(", ")}`
    });

    // Card Type 3: KPI Substantial Progress
    const kpiProgressCards = await getKpiSubstantialProgressCandidates(baselineDate, currentDate);
    for (const card of kpiProgressCards) {
      allCandidates.push({ ...card, type: "kpi_substantial_progress" });
    }

    executionSteps.push({
      name: "Query KPI substantial progress",
      details: `Found ${kpiProgressCards.length} KPIs: ${kpiProgressCards.map(c => `${c.title} (${c.status})`).join(", ")}`
    });

    // Card Type 3b: KPIs marked complete (approved only) since the last review meeting
    const kpiCompletedCards = await getKpiCompletedCandidates(baselineDate);
    for (const card of kpiCompletedCards) {
      allCandidates.push({ ...card, type: "kpi_completed" });
    }

    executionSteps.push({
      name: "Query KPIs marked complete",
      details: `Found ${kpiCompletedCards.length} approved KPI completions: ${kpiCompletedCards.map(c => `${c.title} (${c.status})`).join(", ")}`
    });

    // Card Type 4: Completed Action Items (On time / Overdue)
    const completedActionCards = await getActionItemsCompletedCandidates(baselineDate, currentDate);
    for (const card of completedActionCards) {
      allCandidates.push({ ...card, type: "action_item_completed" });
    }

    executionSteps.push({
      name: "Query completed action items",
      details: `Found ${completedActionCards.length} actions: ${completedActionCards.map(c => `${c.title} (${c.status})`).join(", ")}`
    });

    // Card Type 5: Financial pacing deltas
    const financialDeltaCards: ProgressCard[] = [
      {
        id: "financial_ifms_delta",
        title: "IFMS Pacing",
        status: deltaIfms > 0 ? `+₹${deltaIfms.toFixed(2)} Cr` : "No Change",
        description: deltaIfms > 0
          ? `IFMS spent increased by ₹${deltaIfms.toFixed(2)} Cr since the last review meeting.`
          : "IFMS expenditure booking has held steady since the last meeting.",
        tone: deltaIfms > 0 ? "positive" : "negative",
        href: "/financial"
      },
      {
        id: "financial_so_delta",
        title: "SO Expenditure",
        status: deltaSo > 0 ? `+₹${deltaSo.toFixed(2)} Cr` : "No Change",
        description: deltaSo > 0
          ? `SO spent increased by ₹${deltaSo.toFixed(2)} Cr since the last review meeting.`
          : "SO expenditure booking has held steady since the last meeting.",
        tone: deltaSo > 0 ? "positive" : "negative",
        href: "/financial"
      }
    ];
    for (const card of financialDeltaCards) {
      allCandidates.push({ ...card, type: "financial_delta" });
    }

    // Pad with default cards if total candidates is less than 6
    const defaultPaddingCards: ProgressCard[] = [
      {
        id: "fill_default_1",
        title: "Scheme Progress",
        status: "On Track",
        description: "No other major action items or KPI review modifications were recorded this week.",
        tone: "positive",
        href: "/financial/schemes-board"
      },
      {
        id: "fill_default_2",
        title: "Operations",
        status: "Normal",
        description: "Department operations are proceeding according to the quarterly timelines.",
        tone: "positive",
        href: "/dashboard"
      },
      {
        id: "fill_default_3",
        title: "Actions Review",
        status: "On Track",
        description: "Action item milestones and administrative guidelines are being followed.",
        tone: "positive",
        href: "/action-items"
      },
      {
        id: "fill_default_4",
        title: "Financial Review",
        status: "Stable",
        description: "Financial allocations and expenditures are stable and under monitoring.",
        tone: "positive",
        href: "/financial"
      },
      {
        id: "fill_default_5",
        title: "KPI Monitoring",
        status: "On Track",
        description: "Key performance indicators are aligned with departmental objectives.",
        tone: "positive",
        href: "/kpis"
      }
    ];

    let padIdx = 0;
    while (allCandidates.length < 6) {
      allCandidates.push({ ...defaultPaddingCards[padIdx % defaultPaddingCards.length], type: "default_padding" });
      padIdx++;
    }

    executionSteps.push({
      name: "Assemble candidates",
      details: `Total candidates in pool: ${allCandidates.length} (padded to at least 6)`
    });

    // 7. Select & refine exactly 6 cards (LLM-based filter or deterministic fallback)
    let selectedCards: ProgressCard[] = [];

    if (mode === "LLM_BASED" || mode === "BOTH") {
      try {
        const prompt = `
          You are a senior administrative advisor for HUDD.
          Your task is to select and refine exactly 6 cards from the list of candidate updates below.
          These cards will be shown on the leadership dashboard under "WHAT CHANGED SINCE LAST MEETING".

          Baseline Snapshot Date: ${baselineDateStr}
          Current Snapshot Date: ${currentDateStr}

          Candidates List:
          ${JSON.stringify(allCandidates, null, 2)}

          Selection Criteria:
          1. Select exactly 6 cards.
          2. Prioritize cards by impact and importance:
             - Active issues like "Overdue Actions" (critical backlog) must always be included.
             - Significant changes in KPIs (e.g. Substantial Progress, target achieved).
             - KPIs marked complete and approved this week (these are important milestones — a KPI reaching completion is rare and noteworthy).
             - Schemes meeting or crossing their quarterly targets (these are rare and important milestones!).
             - Completed action items (especially those completed on time or overdue).
             - Financial changes (IFMS or SO deltas) if they show significant progress.
          3. For the 6 selected cards:
             - You can refine their "title", "status", and "description" to make them look extremely professional, clear, concise, and administrative.
             - Keep descriptions under 18 words.
             - Ensure action item cards clearly specify if they were completed "On Time" or "Overdue" (after due date) and link to the correct URL.
             - Retain the exact "id" and "href".
             - The "tone" should be "positive" or "negative" based on whether it represents a good milestone/progress or a delay/lag.

          Return your response strictly as a JSON array of exactly 6 objects in this format:
          [
            {"id": "...", "title": "...", "status": "...", "description": "...", "tone": "positive", "href": "..."},
            ...
          ]
        `;

        const rawLLM = await callLocalLLM(prompt);
        executionSteps.push({
          name: "LLM Selection & Refinement",
          prompt,
          response: rawLLM,
          success: true
        });

        const jsonStart = rawLLM.indexOf("[");
        const jsonEnd = rawLLM.lastIndexOf("]") + 1;
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(rawLLM.substring(jsonStart, jsonEnd));
          if (Array.isArray(parsed) && parsed.length === 6) {
            const candidatesMap = new Map(allCandidates.map(c => [c.id, c]));
            selectedCards = parsed.map((item: any) => {
              const orig = candidatesMap.get(item.id);
              return {
                id: item.id,
                title: item.title || orig?.title || "Update",
                status: item.status || orig?.status || "Updated",
                description: item.description || orig?.description || "",
                tone: (item.tone === "positive" || item.tone === "negative") ? item.tone : (orig?.tone || "positive"),
                href: orig?.href || item.href || "/dashboard"
              };
            });
          }
        }
      } catch (err: any) {
        console.error("Local LLM selection failed, using rules fallback for all 6 slots:", err);
        executionSteps.push({
          name: "LLM Selection & Refinement",
          details: `Error: ${err.message || String(err)}`,
          success: false
        });
      }
    }

    // Deterministic fallback (if mode is RULE_BASED, LLM fails, or LLM returned incorrect length)
    if (selectedCards.length !== 6) {
      executionSteps.push({
        name: "Fallback Selection",
        details: "Selected 6 cards using deterministic rule-based priority fallback."
      });
      const sortedCandidates = [...allCandidates].sort((a, b) => {
        const pA = getCandidatePriority(a.type);
        const pB = getCandidatePriority(b.type);
        return pA - pB;
      });
      selectedCards = sortedCandidates.slice(0, 6).map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        description: c.description,
        tone: c.tone,
        href: c.href
      }));
    }

    // 8. Save Insight to Database
    const insightRow = await prisma.agentInsight.create({
      data: tenantStamped({
        modeUsed: mode,
        status: "SUCCESS",
        insights: selectedCards as any,
        executionLogs: JSON.stringify(executionSteps, null, 2),
        runDate: new Date(),
      })
    });

    return { success: true, insightId: insightRow.id };

  } catch (error: any) {
    console.error("Agent workflow execution failed:", error);
    // Log failure in AgentInsight
    const failedInsight = await prisma.agentInsight.create({
      data: tenantStamped({
        modeUsed: modeOverride || "UNKNOWN",
        status: "FAILED",
        insights: [] as any,
        errorLog: error instanceof Error ? error.stack || error.message : String(error),
        executionLogs: JSON.stringify(executionSteps, null, 2),
        runDate: new Date(),
      })
    });
    return { success: false, insightId: failedInsight.id, error: error.message };
  }
}
