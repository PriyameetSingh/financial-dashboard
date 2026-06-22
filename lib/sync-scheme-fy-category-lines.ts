import { Prisma, type FinanceYearBudgetAllocation, type FinanceYearBudgetCategoryLine } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
  FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";
import { computeSchemeFyMetrics, sponsorshipToSchemeBudgetCategory } from "@/lib/scheme-fy-bucket-metrics";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FyAllocationWithLines = FinanceYearBudgetAllocation & {
  categoryLines: FinanceYearBudgetCategoryLine[];
};

/**
 * Recomputes scheme-sponsorship FY lines from budgets, supplements, and snapshots; updates category lines and
 * `allocation.totalBudgetCr`. Returns the allocation with fresh `categoryLines` so callers need not call
 * `ensureFyBudgetAllocationWithLines` again.
 */
export async function syncSchemeFyCategoryLines(
  financialYearId: string,
  createdById: string | null,
): Promise<FyAllocationWithLines> {
  const allocation = await ensureFyBudgetAllocationWithLines(financialYearId, createdById);

  const [schemes, budgets, snapshots, supplements] = await Promise.all([
    prisma.scheme.findMany({
      where: { 
        archived: false,
        sponsorshipType: { not: "NON_FINANCIAL" }
      },
      include: { subschemes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      orderBy: { name: "asc" },
    }),
    prisma.financeBudget.findMany({ where: { financialYearId } }),
    prisma.financeExpenditureSnapshot.findMany({ where: { financialYearId } }),
    prisma.financeBudgetSupplement.findMany({ where: { financialYearId } }),
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

  const buckets: Record<
    (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number],
    { budgetEstimateCr: number; soExpenditureCr: number; ifmsExpenditureCr: number }
  > = {
    STATE_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRALLY_SPONSORED_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRAL_SECTOR_SCHEME: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
  };

  for (const scheme of schemes) {
    const cat = sponsorshipToSchemeBudgetCategory(scheme.sponsorshipType);
    if (!cat) continue;
    const m = computeSchemeFyMetrics(
      scheme,
      budgetsByScheme.get(scheme.id) ?? [],
      snapshotsByScheme.get(scheme.id) ?? [],
      supplementsByScheme.get(scheme.id) ?? [],
    );
    buckets[cat].budgetEstimateCr += m.effectiveBudgetCr;
    buckets[cat].soExpenditureCr += m.so;
    buckets[cat].ifmsExpenditureCr += m.ifms;
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES.map((category) => {
        const b = buckets[category];
        return tx.financeYearBudgetCategoryLine.update({
          where: {
            allocationId_category: { allocationId: allocation.id, category },
          },
          data: {
            budgetEstimateCr: new Prisma.Decimal(roundMoney(b.budgetEstimateCr).toFixed(2)),
            soExpenditureCr: new Prisma.Decimal(roundMoney(b.soExpenditureCr).toFixed(2)),
            ifmsExpenditureCr: new Prisma.Decimal(roundMoney(b.ifmsExpenditureCr).toFixed(2)),
          },
        });
      }),
    );

    const lines = await tx.financeYearBudgetCategoryLine.findMany({
      where: { allocationId: allocation.id },
    });
    const totalBudgetCr = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.reduce(
      (sum, cat) => sum + roundMoney(Number(lines.find((l) => l.category === cat)?.budgetEstimateCr ?? 0)),
      0,
    );
    await tx.financeYearBudgetAllocation.update({
      where: { id: allocation.id },
      data: {
        totalBudgetCr: new Prisma.Decimal(totalBudgetCr.toFixed(2)),
        createdById,
      },
    });
  });

  return prisma.financeYearBudgetAllocation.findUniqueOrThrow({
    where: { id: allocation.id },
    include: { categoryLines: true },
  });
}
