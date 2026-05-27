import { Prisma, type SponsorshipType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
  FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { deriveFinancialEntryStatus } from "@/lib/financial-status";
import { getDashboardPrioritySchemeIds } from "@/lib/scheme-dashboard-priority";
import { sponsorshipToSchemeBudgetCategory } from "@/lib/scheme-fy-bucket-metrics";
import type { DbUserWithRbac } from "@/lib/server-rbac";
import { getDbUserBySession } from "@/lib/server-rbac";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";
import type { FinancialEntry, FinanceSummaryRow } from "@/types";

export function toNumber(value: unknown): number {
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

export type FinanceSummaryBreakdown = {
  financialYearLabel: string;
  asOfDate: string | null;
  rows: FinanceSummaryRow[];
  totals: { budgetEstimateCr: number; soExpenditureCr: number; ifmsExpenditureCr: number };
};

/**
 * Builds the FY head-wise summary for the overview without running {@link syncSchemeFyCategoryLines}.
 * Scheme buckets match overview cards (by sponsorship); manual heads come from persisted allocation lines.
 */
export async function getFinanceSummaryBreakdownForOverview(
  entries: FinancialEntry[],
  financialYearId: string,
  financialYearLabel: string,
): Promise<FinanceSummaryBreakdown> {
  const allocation = await ensureFyBudgetAllocationWithLines(financialYearId, null);
  const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));

  const schemeBuckets: Record<
    (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number],
    { budgetEstimateCr: number; soExpenditureCr: number; ifmsExpenditureCr: number }
  > = {
    STATE_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRALLY_SPONSORED_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRAL_SECTOR_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
  };

  for (const e of entries) {
    const st = (e.metadata as { sponsorshipType?: SponsorshipType } | undefined)?.sponsorshipType;
    if (!st) continue;
    const cat = sponsorshipToSchemeBudgetCategory(st);
    const eff = e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0);
    schemeBuckets[cat].budgetEstimateCr += eff;
    schemeBuckets[cat].soExpenditureCr += e.so;
    schemeBuckets[cat].ifmsExpenditureCr += e.ifms;
  }

  const rows: FinanceSummaryRow[] = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
    if ((FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES as readonly string[]).includes(category)) {
      const b = schemeBuckets[category as (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number]];
      return {
        headCode: category,
        label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
        budgetEstimateCr: b.budgetEstimateCr,
        soExpenditureCr: b.soExpenditureCr,
        ifmsExpenditureCr: b.ifmsExpenditureCr,
      };
    }
    const line = lineByCategory.get(category);
    return {
      headCode: category,
      label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
      budgetEstimateCr: line ? toNumber(line.budgetEstimateCr) : 0,
      soExpenditureCr: line ? toNumber(line.soExpenditureCr) : 0,
      ifmsExpenditureCr: line ? toNumber(line.ifmsExpenditureCr) : 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
      soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
      ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
    }),
    { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
  );

  return {
    financialYearLabel,
    asOfDate: null,
    rows,
    totals,
  };
}

export async function getFinancialBudgetEntriesOverview(actor?: DbUserWithRbac | null): Promise<{
  entries: FinancialEntry[];
  financialYearLabel: string | null;
  financialYearId: string | null;
}> {
  const resolved = actor !== undefined ? actor : await getDbUserBySession();
  const roleIds = resolved?.userRoles?.map((ur: { roleId: string }) => ur.roleId) ?? [];

  const [priority, fy] = await Promise.all([
    getDashboardPrioritySchemeIds(resolved?.id, roleIds),
    prisma.financialYear.findFirst({
      orderBy: { endDate: "desc" },
    }),
  ]);

  if (!fy) {
    return { entries: [], financialYearLabel: null, financialYearId: null };
  }

  const [schemes, budgets, snapshots, supplements] = await Promise.all([
    prisma.scheme.findMany({
      where: { archived: false },
      include: {
        subschemes: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.financeBudget.findMany({
      where: { financialYearId: fy.id },
      include: {
        scheme: { select: { id: true, code: true, name: true, verticalName: true, sponsorshipType: true, subschemes: { orderBy: { name: "asc" } } } },
        createdBy: { select: { name: true } },
        financialYear: { select: { label: true } },
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { createdBy: { select: { name: true } } },
        },
      },
    }),
    prisma.financeExpenditureSnapshot.findMany({
      where: { financialYearId: fy.id },
      orderBy: { asOfDate: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.financeBudgetSupplement.findMany({
      where: { financialYearId: fy.id },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

  const entries = schemes.map((scheme) => {
    const schemeBudgets = budgetsByScheme.get(scheme.id) ?? [];
    const schemeSnapshots = snapshotsByScheme.get(scheme.id) ?? [];
    const schemeSupplements = supplementsByScheme.get(scheme.id) ?? [];
    const subIds = new Set(scheme.subschemes.map((s) => s.id));

    let annualBudget = 0;
    let totalSupplementCr = 0;
    let latest: (typeof snapshots)[number] | null = null;
    let so = 0;
    let ifms = 0;
    let aggregateWorkflow: "draft" | "submitted" = "draft";

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
      const subschemeDetails = scheme.subschemes.map((sub) => {
        const snap = latestBySub.get(sub.id);
        const budget = schemeBudgets.find((b) => b.subschemeId === sub.id);
        
        const subSups = schemeSupplements.filter((s) => s.subschemeId === sub.id);
        const subTotalSupplementCr = subSups.reduce((acc, s) => acc + toNumber(s.amountCr), 0);
        const annBudget = toNumber(budget?.budgetEstimateCr ?? 0);
        const subEffectiveBudgetCr = annBudget + subTotalSupplementCr;

        return {
          id: sub.id,
          code: sub.code,
          name: sub.name,
          so: toNumber(snap?.soExpenditureCr ?? 0),
          ifms: toNumber(snap?.ifmsExpenditureCr ?? 0),
          annualBudget: annBudget,
          totalSupplementCr: subTotalSupplementCr,
          effectiveBudgetCr: subEffectiveBudgetCr,
          supplements: subSups.map(s => ({
            id: s.id,
            amountCr: toNumber(s.amountCr),
            reason: s.reason,
            referenceNo: s.referenceNo ?? undefined,
            createdAt: s.createdAt.toISOString(),
            createdByName: s.createdBy?.name ?? "Finance Desk"
          })),
          history: schemeSnapshots
            .filter((s) => s.subschemeId === sub.id)
            .sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
            .map((s) => ({
              asOfDate: s.asOfDate.toISOString().slice(0, 10),
              ifms: toNumber(s.ifmsExpenditureCr),
              so: toNumber(s.soExpenditureCr),
            }))
        };
      });

      totalSupplementCr = subschemeDetails.reduce((sum, s) => sum + (s.totalSupplementCr ?? 0), 0);

      if (latestBySub.size > 0) {
        so = 0;
        ifms = 0;
        let maxDate = new Date(0);
        let anyDraft = false;
        for (const snap of latestBySub.values()) {
          so += toNumber(snap.soExpenditureCr);
          ifms += toNumber(snap.ifmsExpenditureCr);
          if (snap.asOfDate > maxDate) maxDate = snap.asOfDate;
          if (snap.workflowStatus === "draft") anyDraft = true;
          latest = snap;
        }
        aggregateWorkflow = anyDraft ? "draft" : "submitted";
        const refDate = maxDate.getTime() > 0 ? maxDate : latest?.asOfDate ?? new Date();
        const status = deriveFinancialEntryStatus({
          workflowStatus: aggregateWorkflow,
          asOfDate: refDate,
        });
        return buildEntry({
          scheme,
          schemeBudgets,
          schemeSupplements,
          schemeSnapshots,
          latest,
          annualBudget,
          totalSupplementCr,
          so,
          ifms,
          status,
          priority,
          subschemeDetails,
        });
      }

      latest = null;
      so = 0;
      ifms = 0;
      aggregateWorkflow = "draft";
      return buildEntry({
        scheme,
        schemeBudgets,
        schemeSupplements,
        schemeSnapshots,
        latest,
        annualBudget,
        totalSupplementCr,
        so: 0,
        ifms: 0,
        status: "not_started",
        priority,
        subschemeDetails,
      });
    } else {
      const row = schemeBudgets.find((b) => b.subschemeId === null);
      annualBudget = row ? toNumber(row.budgetEstimateCr) : 0;
      
      const schemeOnlySups = schemeSupplements.filter((s) => s.subschemeId === null);
      totalSupplementCr = schemeOnlySups.reduce((acc, s) => acc + toNumber(s.amountCr), 0);

      const schemeOnly = schemeSnapshots
        .filter((s) => s.subschemeId === null)
        .sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime());
      latest = schemeOnly[0] ?? null;
      if (latest) {
        so = toNumber(latest.soExpenditureCr);
        ifms = toNumber(latest.ifmsExpenditureCr);
        aggregateWorkflow = latest.workflowStatus === "submitted" ? "submitted" : "draft";
      }
    }

    const status = latest
      ? deriveFinancialEntryStatus({
          workflowStatus: aggregateWorkflow,
          asOfDate: latest.asOfDate,
        })
      : ("not_started" as const);

    return buildEntry({
      scheme,
      schemeBudgets,
      schemeSupplements,
      schemeSnapshots,
      latest,
      annualBudget,
      totalSupplementCr,
      so,
      ifms,
      status,
      priority,
    });
  });

  entries.sort((a, b) => {
    const pa = priority.get(a.schemeId!);
    const pb = priority.get(b.schemeId!);
    if (pa !== undefined && pb === undefined) return -1;
    if (pa === undefined && pb !== undefined) return 1;
    if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
    return a.scheme.localeCompare(b.scheme);
  });

  return { entries, financialYearLabel: fy.label, financialYearId: fy.id };
}

function buildEntry(params: {
  scheme: {
    id: string;
    code: string;
    name: string;
    verticalName: string;
    sponsorshipType: SponsorshipType;
    subschemes: Array<{ id: string; code: string; name: string }>;
  };
  schemeBudgets: Array<{
    id: string;
    subschemeId: string | null;
    locked: boolean;
    updatedAt: Date;
    createdBy: { name: string } | null;
    revisions: Array<{
      createdAt: Date;
      createdBy: { name: string } | null;
      reason: string;
    }>;
  }>;
  schemeSupplements: Array<{
    id: string;
    subschemeId: string | null;
    amountCr: Prisma.Decimal;
    reason: string;
    referenceNo: string | null;
    createdAt: Date;
    createdBy: { name: string } | null;
  }>;
  schemeSnapshots: Array<{
    subschemeId: string | null;
    asOfDate: Date;
    soExpenditureCr: Prisma.Decimal;
    ifmsExpenditureCr: Prisma.Decimal;
  }>;
  latest: {
    asOfDate: Date;
    soExpenditureCr: Prisma.Decimal;
    ifmsExpenditureCr: Prisma.Decimal;
    remarks: string | null;
    workflowStatus: "draft" | "submitted";
    createdBy: { name: string } | null;
  } | null;
  annualBudget: number;
  totalSupplementCr: number;
  so: number;
  ifms: number;
  status: ReturnType<typeof deriveFinancialEntryStatus> | "not_started";
  priority: Map<string, number>;
  subschemeDetails?: Array<{ id: string; code: string; name: string; so: number; ifms: number; annualBudget: number; totalSupplementCr?: number; effectiveBudgetCr?: number; supplements?: Array<{id: string; amountCr: number; reason: string; referenceNo?: string; createdAt: string; createdByName: string;}>; history?: Array<{ asOfDate: string; ifms: number; so: number; }> }>;
}): FinancialEntry {
  const { scheme, schemeBudgets, schemeSupplements, latest, annualBudget, totalSupplementCr, so, ifms, status } = params;
  const budgetRow = schemeBudgets.find((b) => b.subschemeId === null) ?? schemeBudgets[0];
  const locked = schemeBudgets.some((b) => b.locked);

  const revisionItems = schemeBudgets.flatMap((b) =>
    (b.revisions ?? []).map((revision) => ({
      revision,
      scope: b.subschemeId
        ? scheme.subschemes.find((s) => s.id === b.subschemeId)?.code ?? "SUB"
        : "Scheme",
    })),
  );
  revisionItems.sort((a, b) => b.revision.createdAt.getTime() - a.revision.createdAt.getTime());

  const updates = revisionItems.slice(0, 12).map(({ revision, scope }) => ({
    timestamp: revision.createdAt.toISOString().slice(0, 10),
    actor: revision.createdBy?.name ?? "",
    status,
    note: `[${scope}] ${revision.reason}`,
  }));

  const mappedSupplements = schemeSupplements
    .filter((s) => s.subschemeId === null)
    .map(s => ({
      id: s.id,
      amountCr: toNumber(s.amountCr),
      reason: s.reason,
      referenceNo: s.referenceNo ?? undefined,
      createdAt: s.createdAt.toISOString(),
      createdByName: s.createdBy?.name ?? "Finance Desk"
    }));

  return {
    id: scheme.code,
    schemeId: scheme.id,
    scheme: scheme.name,
    vertical: scheme.verticalName,
    status,
    annualBudget,
    totalSupplementCr,
    effectiveBudgetCr: annualBudget + totalSupplementCr,
    supplements: mappedSupplements,
    history: params.schemeSnapshots
      .filter((s) => s.subschemeId === null)
      .sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
      .map((s) => ({
        asOfDate: s.asOfDate.toISOString().slice(0, 10),
        ifms: toNumber(s.ifmsExpenditureCr),
        so: toNumber(s.soExpenditureCr),
      })),
    so,
    ifms,
    lastUpdated: (latest?.asOfDate ?? budgetRow?.updatedAt ?? new Date()).toISOString().slice(0, 10),
    locked,
    submitter: latest?.createdBy?.name ?? budgetRow?.createdBy?.name ?? "",
    updates,
    dashboardPriority: params.priority.has(scheme.id),
    subschemes: params.subschemeDetails ?? scheme.subschemes.map((s) => ({ id: s.id, code: s.code, name: s.name })),
    metadata: {
      sponsorshipType: scheme.sponsorshipType,
    },
  };
}
