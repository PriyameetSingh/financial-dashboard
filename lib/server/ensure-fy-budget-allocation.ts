import { prisma, tenantStamped } from "@/lib/prisma";
import { FINANCE_YEAR_BUDGET_CATEGORY_ORDER } from "@/lib/finance-year-budget-allocation";

/** Ensures FY-level budget allocation and one line per category exist (read/entry paths). */
export async function ensureFyBudgetAllocationWithLines(financialYearId: string, createdById: string | null) {
  let allocation = await prisma.financeYearBudgetAllocation.findUnique({
    where: { financialYearId },
  });
  if (!allocation) {
    allocation = await prisma.financeYearBudgetAllocation.create({
      data: tenantStamped({
        financialYearId,
        totalBudgetCr: 0,
        createdById,
      }),
    });
  }
  await Promise.all(
    FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) =>
      prisma.financeYearBudgetCategoryLine.upsert({
        where: {
          allocationId_category: { allocationId: allocation.id, category },
        },
        update: {},
        create: tenantStamped({
          allocationId: allocation.id,
          category,
          budgetEstimateCr: 0,
          soExpenditureCr: 0,
          ifmsExpenditureCr: 0,
        }),
      }),
    ),
  );
  return prisma.financeYearBudgetAllocation.findUniqueOrThrow({
    where: { id: allocation.id },
    include: { categoryLines: true },
  });
}
