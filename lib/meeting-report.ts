import {
  ActionItemType,
  FinancialWorkflowStatus,
  KPIWorkflowStatus,
  SponsorshipType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSchemeFyMetrics, sponsorshipToSchemeBudgetCategory } from "@/lib/scheme-fy-bucket-metrics";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES,
  FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatMeetingReportDate(iso: string): string {
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export type MeetingReportFinanceRow = {
  planType: string;
  budgetEstimateCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  pctIfms: number | null;
  rowVariant: "normal" | "section_total" | "grand_total";
};

export type MeetingReportSchemeRow = {
  planType: string;
  budgetEstimateCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  pctIfms: number | null;
  rowVariant: "heading" | "scheme" | "subscheme" | "type_total";
};

export type MeetingReportPayload = {
  /** 1-based sequence of this meeting within its financial year (by date, then id). */
  meetingOrdinalInFy: number;
  meeting: {
    id: string;
    meetingDate: string;
    title: string | null;
    notes: string | null;
    financialYearLabel: string | null;
  };
  /** Latest expenditure snapshot date included after meeting cutoff (DD.MM.YYYY). */
  financeAsOfLabel: string | null;
  presentationsByVertical: Array<{
    verticalLabel: string;
    files: Array<{ id: string; fileName: string }>;
  }>;
  topics: Array<{ id: string; topic: string }>;
  financeProgress: MeetingReportFinanceRow[];
  schemesFinancialProgress: Array<{
    sponsorshipKey: SponsorshipType;
    sponsorshipHeading: string;
    rows: MeetingReportSchemeRow[];
  }>;
  keyDecisions: Array<{
    id: string;
    title: string;
    description: string;
    sourceMeetingDate: string | null;
    actionBy: string;
    timeline: string;
    statusLabel: string;
    latestNote: string;
    /** True when the visible status/note was last recorded against an earlier meeting than this report. */
    statusCarriedForward: boolean;
  }>;
  kpiRows: Array<{
    index: number;
    description: string;
    schemeLabel: string;
    vertical: string;
    actionBy: string;
    statusLabel: string;
    numerator: string;
    numeratorUnit: string;
    denominator: string;
    denominatorUnit: string;
    remarks: string;
    warnLowPct: boolean;
  }>;
};

function pct(ifms: number, budget: number): number | null {
  if (!(budget > 0)) return null;
  return Math.round((ifms / budget) * 10_000) / 100;
}

function sponsorshipHeading(st: SponsorshipType): string {
  if (st === "STATE") return FINANCE_YEAR_BUDGET_CATEGORY_LABELS.STATE_SCHEME;
  if (st === "CENTRAL") return FINANCE_YEAR_BUDGET_CATEGORY_LABELS.CENTRALLY_SPONSORED_SCHEME;
  if (st === "CENTRAL_SECTOR") return FINANCE_YEAR_BUDGET_CATEGORY_LABELS.CENTRAL_SECTOR_SCHEME;
  return "Non-Financial Scheme";
}

async function resolveFinancialYear(meeting: {
  financialYearId: string | null;
  meetingDate: Date;
}) {
  if (meeting.financialYearId) {
    const fy = await prisma.financialYear.findUnique({ where: { id: meeting.financialYearId } });
    if (fy) return fy;
  }
  const md = meeting.meetingDate;
  const ranged =
    (await prisma.financialYear.findFirst({
      where: { startDate: { lte: md }, endDate: { gte: md } },
    })) ?? (await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } }));
  return ranged;
}

/** Latest snapshot per scheme/subscheme among meetings on or before the cutoff date. */
async function snapshotsUpToMeetingDate(financialYearId: string, cutoffMeetingDate: Date) {
  const rows = await prisma.financeExpenditureSnapshot.findMany({
    where: {
      financialYearId,
      workflowStatus: FinancialWorkflowStatus.submitted,
      meetingId: { not: null },
      meeting: { meetingDate: { lte: cutoffMeetingDate } },
    },
    select: {
      schemeId: true,
      subschemeId: true,
      asOfDate: true,
      soExpenditureCr: true,
      ifmsExpenditureCr: true,
      createdAt: true,
      meeting: { select: { meetingDate: true } },
    },
  });

  rows.sort((a, b) => {
    const md = b.meeting!.meetingDate.getTime() - a.meeting!.meetingDate.getTime();
    if (md !== 0) return md;
    const ad = b.asOfDate.getTime() - a.asOfDate.getTime();
    if (ad !== 0) return ad;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const picked = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    const key = `${r.schemeId}:${r.subschemeId ?? ""}`;
    if (!picked.has(key)) picked.set(key, r);
  }
  return picked;
}

export async function buildMeetingReport(meetingId: string): Promise<MeetingReportPayload | null> {
  const meetingRow = await prisma.dashboardMeeting.findUnique({
    where: { id: meetingId },
    include: {
      topics: { orderBy: { createdAt: "asc" } },
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          uploadedBy: { select: { department: true, name: true } },
        },
      },
    },
  });

  if (!meetingRow) return null;

  let meetingOrdinalInFy = 1;
  if (meetingRow.financialYearId) {
    const ordered = await prisma.dashboardMeeting.findMany({
      where: { financialYearId: meetingRow.financialYearId },
      orderBy: [{ meetingDate: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const idx = ordered.findIndex((m) => m.id === meetingRow.id);
    meetingOrdinalInFy = idx >= 0 ? idx + 1 : ordered.length;
  } else {
    const ordered = await prisma.dashboardMeeting.findMany({
      orderBy: [{ meetingDate: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const idx = ordered.findIndex((m) => m.id === meetingRow.id);
    meetingOrdinalInFy = idx >= 0 ? idx + 1 : 1;
  }

  const fy = await resolveFinancialYear(meetingRow);
  const fyLabel = fy?.label ?? null;
  const cutoff = meetingRow.meetingDate;

  const verticalBuckets = new Map<string, Array<{ id: string; fileName: string }>>();
  for (const m of meetingRow.materials) {
    const dept = m.uploadedBy?.department?.trim();
    const label =
      dept && dept.length > 0 ? dept : m.uploadedBy?.name?.trim() ? `Uploader: ${m.uploadedBy!.name}` : "General";
    const list = verticalBuckets.get(label) ?? [];
    list.push({ id: m.id, fileName: m.fileName });
    verticalBuckets.set(label, list);
  }
  const presentationsByVertical = [...verticalBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([verticalLabel, files]) => ({ verticalLabel, files }));

  let financeAsOfLabel: string | null = null;

  let schemesFinancialProgress: MeetingReportPayload["schemesFinancialProgress"] = [];
  let financeProgress: MeetingReportFinanceRow[] = [];

  if (fy) {
    const pickedSnaps = await snapshotsUpToMeetingDate(fy.id, cutoff);
    const pickedList = [...pickedSnaps.values()];
    if (pickedList.length > 0) {
      const maxAsOf = pickedList.reduce((acc, r) => (r.asOfDate > acc ? r.asOfDate : acc), pickedList[0]!.asOfDate);
      financeAsOfLabel = formatMeetingReportDate(isoDate(maxAsOf));
    }

    const allocation = await ensureFyBudgetAllocationWithLines(fy.id, null);
    const manualLineByCat = new Map(allocation.categoryLines.map((l) => [l.category, l]));

    const [schemes, budgets, supplements] = await Promise.all([
      prisma.scheme.findMany({
        where: { 
          archived: false,
          sponsorshipType: { not: "NON_FINANCIAL" }
        },
        include: { subschemes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
        orderBy: [{ verticalName: "asc" }, { name: "asc" }],
      }),
      prisma.financeBudget.findMany({ where: { financialYearId: fy.id } }),
      prisma.financeBudgetSupplement.findMany({ where: { financialYearId: fy.id } }),
    ]);

    const budgetsByScheme = new Map<string, typeof budgets>();
    for (const b of budgets) {
      const list = budgetsByScheme.get(b.schemeId) ?? [];
      list.push(b);
      budgetsByScheme.set(b.schemeId, list);
    }
    const supplementsByScheme = new Map<string, typeof supplements>();
    for (const s of supplements) {
      const list = supplementsByScheme.get(s.schemeId) ?? [];
      list.push(s);
      supplementsByScheme.set(s.schemeId, list);
    }

    const snapsByScheme = new Map<string, typeof pickedList>();
    for (const s of pickedList) {
      const list = snapsByScheme.get(s.schemeId) ?? [];
      list.push(s);
      snapsByScheme.set(s.schemeId, list);
    }

    const bucketTotals: Record<
      (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number],
      { budget: number; so: number; ifms: number }
    > = {
      STATE_SCHEME: { budget: 0, so: 0, ifms: 0 },
      CENTRALLY_SPONSORED_SCHEME: { budget: 0, so: 0, ifms: 0 },
      CENTRAL_SECTOR_SCHEME: { budget: 0, so: 0, ifms: 0 },
    };

    const sponsorshipOrder: SponsorshipType[] = ["STATE", "CENTRAL", "CENTRAL_SECTOR"];

    schemesFinancialProgress = sponsorshipOrder.map((sp) => {
      const heading = sponsorshipHeading(sp);
      const rows: MeetingReportSchemeRow[] = [
        {
          planType: heading,
          budgetEstimateCr: 0,
          soExpenditureCr: 0,
          ifmsExpenditureCr: 0,
          pctIfms: null,
          rowVariant: "heading",
        },
      ];

      const schemesHere = schemes.filter((s) => s.sponsorshipType === sp);
      let typeBudget = 0;
      let typeSo = 0;
      let typeIfms = 0;

      for (const scheme of schemesHere) {
        const schemeBudgets = budgetsByScheme.get(scheme.id) ?? [];
        const schemeSnaps = snapsByScheme.get(scheme.id) ?? [];
        const schemeSups = supplementsByScheme.get(scheme.id) ?? [];
        const m = computeSchemeFyMetrics(scheme, schemeBudgets, schemeSnaps, schemeSups);
        const cat = sponsorshipToSchemeBudgetCategory(scheme.sponsorshipType);
        if (cat) {
          bucketTotals[cat].budget += m.effectiveBudgetCr;
          bucketTotals[cat].so += m.so;
          bucketTotals[cat].ifms += m.ifms;
        }

        rows.push({
          planType: scheme.name,
          budgetEstimateCr: m.effectiveBudgetCr,
          soExpenditureCr: m.so,
          ifmsExpenditureCr: m.ifms,
          pctIfms: pct(m.ifms, m.effectiveBudgetCr),
          rowVariant: "scheme",
        });
        typeBudget += m.effectiveBudgetCr;
        typeSo += m.so;
        typeIfms += m.ifms;

        const subIds = new Set(scheme.subschemes.map((x) => x.id));
        if (subIds.size > 0) {
          for (const sub of scheme.subschemes) {
            const subBudgetSum = schemeBudgets
              .filter((b) => b.subschemeId === sub.id)
              .reduce((sum, b) => sum + toNumber(b.budgetEstimateCr), 0);
            const subSnaps = schemeSnaps.filter((sn) => sn.subschemeId === sub.id);
            const latestSub =
              subSnaps.sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime())[0] ?? null;
            const subSups = schemeSups.filter((su) => su.subschemeId === sub.id);
            const subSupSum = subSups.reduce((sum, su) => sum + toNumber(su.amountCr), 0);
            const subBudget = subBudgetSum + subSupSum;
            const subSo = latestSub ? toNumber(latestSub.soExpenditureCr) : 0;
            const subIfms = latestSub ? toNumber(latestSub.ifmsExpenditureCr) : 0;
            rows.push({
              planType: `  ${sub.name}`,
              budgetEstimateCr: subBudget,
              soExpenditureCr: subSo,
              ifmsExpenditureCr: subIfms,
              pctIfms: pct(subIfms, subBudget),
              rowVariant: "subscheme",
            });
          }
        }
      }

      rows.push({
        planType: `Total — ${heading}`,
        budgetEstimateCr: typeBudget,
        soExpenditureCr: typeSo,
        ifmsExpenditureCr: typeIfms,
        pctIfms: pct(typeIfms, typeBudget),
        rowVariant: "type_total",
      });

      return { sponsorshipKey: sp, sponsorshipHeading: heading, rows };
    });

    const schemeRowsOnly: MeetingReportFinanceRow[] = FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES.map((cat) => ({
      planType: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[cat],
      budgetEstimateCr: bucketTotals[cat].budget,
      soExpenditureCr: bucketTotals[cat].so,
      ifmsExpenditureCr: bucketTotals[cat].ifms,
      pctIfms: pct(bucketTotals[cat].ifms, bucketTotals[cat].budget),
      rowVariant: "normal",
    }));

    const schemesBudgetSum = FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES.reduce((s, c) => s + bucketTotals[c].budget, 0);
    const schemesSoSum = FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES.reduce((s, c) => s + bucketTotals[c].so, 0);
    const schemesIfmsSum = FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES.reduce((s, c) => s + bucketTotals[c].ifms, 0);

    schemeRowsOnly.push({
      planType: "Total",
      budgetEstimateCr: schemesBudgetSum,
      soExpenditureCr: schemesSoSum,
      ifmsExpenditureCr: schemesIfmsSum,
      pctIfms: pct(schemesIfmsSum, schemesBudgetSum),
      rowVariant: "section_total",
    });

    let transferBudget = 0;
    let transferSo = 0;
    let transferIfms = 0;

    const transferRows: MeetingReportFinanceRow[] = [];
    for (const cat of FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES) {
      if (cat === "ADMIN_EXPENDITURE") continue;
      const line = manualLineByCat.get(cat);
      const budget = line ? toNumber(line.budgetEstimateCr) : 0;
      const so = line ? toNumber(line.soExpenditureCr) : 0;
      const ifms = line ? toNumber(line.ifmsExpenditureCr) : 0;
      transferBudget += budget;
      transferSo += so;
      transferIfms += ifms;
      transferRows.push({
        planType: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[cat],
        budgetEstimateCr: budget,
        soExpenditureCr: so,
        ifmsExpenditureCr: ifms,
        pctIfms: pct(ifms, budget),
        rowVariant: "normal",
      });
    }

    transferRows.push({
      planType: "Total Transfer from State",
      budgetEstimateCr: transferBudget,
      soExpenditureCr: transferSo,
      ifmsExpenditureCr: transferIfms,
      pctIfms: pct(transferIfms, transferBudget),
      rowVariant: "section_total",
    });

    const adminLine = manualLineByCat.get("ADMIN_EXPENDITURE");
    const adminBudget = adminLine ? toNumber(adminLine.budgetEstimateCr) : 0;
    const adminSo = adminLine ? toNumber(adminLine.soExpenditureCr) : 0;
    const adminIfms = adminLine ? toNumber(adminLine.ifmsExpenditureCr) : 0;

    const adminRow: MeetingReportFinanceRow = {
      planType: FINANCE_YEAR_BUDGET_CATEGORY_LABELS.ADMIN_EXPENDITURE,
      budgetEstimateCr: adminBudget,
      soExpenditureCr: adminSo,
      ifmsExpenditureCr: adminIfms,
      pctIfms: pct(adminIfms, adminBudget),
      rowVariant: "normal",
    };

    const grandBudget = schemesBudgetSum + transferBudget + adminBudget;
    const grandSo = schemesSoSum + transferSo + adminSo;
    const grandIfms = schemesIfmsSum + transferIfms + adminIfms;

    financeProgress = [
      ...schemeRowsOnly,
      ...transferRows,
      adminRow,
      {
        planType: "Total Budget",
        budgetEstimateCr: grandBudget,
        soExpenditureCr: grandSo,
        ifmsExpenditureCr: grandIfms,
        pctIfms: pct(grandIfms, grandBudget),
        rowVariant: "grand_total",
      },
    ];
  }

  /** All action items regardless of type or creation date. */
  const decisions = await prisma.actionItem.findMany({
    where: { archived: false },
    include: {
      meeting: { select: { meetingDate: true } },
      performers: {
        orderBy: { sortOrder: "asc" },
        include: { user: { select: { name: true } } },
      },
      updates: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
    orderBy: [{ createdAt: "desc" }, { dueDate: "asc" }],
    take: 200,
  });

  const keyDecisions = decisions.map((d) => {
    const performers = d.performers.map((p) => p.user.name).join(", ") || "—";
    const latest = d.updates[0] ?? null;
    const statusLabel = latest?.status ?? d.status;
    const latestNote = latest?.note ?? "";
    let statusCarriedForward = false;
    if (latest) {
      statusCarriedForward = latest.meetingId !== meetingRow.id;
    } else {
      statusCarriedForward = d.meetingId !== meetingRow.id;
    }
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      sourceMeetingDate: d.meeting ? isoDate(d.meeting.meetingDate) : null,
      actionBy: performers,
      timeline: isoDate(d.dueDate),
      statusLabel,
      latestNote,
      statusCarriedForward,
    };
  });

  let kpiRows: MeetingReportPayload["kpiRows"] = [];

  if (fy) {
    const definitions = await prisma.kpiDefinition.findMany({
      where: { archived: false, scheme: { archived: false } },
      include: {
        scheme: { select: { name: true, verticalName: true } },
        performers: {
          orderBy: { sortOrder: "asc" },
          include: { user: { select: { name: true } } },
        },
        targets: {
          where: { financialYearId: fy.id },
          take: 1,
          include: {
            measurements: {
              where: {
                workflowStatus: { not: KPIWorkflowStatus.draft },
                meeting: { meetingDate: { lte: cutoff } },
              },
              include: {
                meeting: { select: { meetingDate: true } },
              },
              orderBy: [{ meeting: { meetingDate: "desc" } }, { measuredAt: "desc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ scheme: { verticalName: "asc" } }, { scheme: { name: "asc" } }, { description: "asc" }],
    });

    let idx = 1;
    for (const def of definitions) {
      const target = def.targets[0] ?? null;
      const measurement = target?.measurements[0] ?? null;
      const performers = def.performers.map((p) => p.user.name).join(", ") || "—";

      let numerator = "—";
      if (def.kpiType === "BINARY") {
        numerator =
          measurement?.yesValue === true ? "Yes" : measurement?.yesValue === false ? "No" : "—";
      } else if (measurement?.numeratorValue != null) {
        numerator = String(toNumber(measurement.numeratorValue));
      }

      const denomVal = target?.denominatorValue != null ? toNumber(target.denominatorValue) : null;
      const numVal =
        measurement?.numeratorValue != null ? toNumber(measurement.numeratorValue) : null;
      let warnLowPct = false;
      if (denomVal !== null && denomVal > 0 && numVal !== null) {
        const p = (numVal / denomVal) * 100;
        warnLowPct = p < 15;
      }

      const denomDisplay =
        target?.denominatorValue != null ? String(toNumber(target.denominatorValue)) : "—";

      kpiRows.push({
        index: idx++,
        description: def.description,
        schemeLabel: def.scheme.name,
        vertical: def.scheme.verticalName,
        actionBy: performers,
        statusLabel: measurement?.progressStatus?.replace(/_/g, " ") ?? "—",
        numerator,
        numeratorUnit: def.numeratorUnit ?? "",
        denominator: denomDisplay,
        denominatorUnit: def.denominatorUnit ?? "",
        remarks: measurement?.remarks ?? "",
        warnLowPct,
      });
    }
  }

  return {
    meetingOrdinalInFy,
    meeting: {
      id: meetingRow.id,
      meetingDate: isoDate(meetingRow.meetingDate),
      title: meetingRow.title,
      notes: meetingRow.notes,
      financialYearLabel: fyLabel,
    },
    financeAsOfLabel,
    presentationsByVertical,
    topics: meetingRow.topics.map((t) => ({ id: t.id, topic: t.topic })),
    financeProgress,
    schemesFinancialProgress,
    keyDecisions,
    kpiRows,
  };
}
