import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
  FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { searchParams } = new URL(request.url);
    const fyLabel = searchParams.get("financialYearLabel");

    const fy = fyLabel
      ? await prisma.financialYear.findUnique({ where: { label: fyLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });

    if (!fy) {
      return NextResponse.json({
        financialYearLabel: null,
        allocationId: null,
        totalBudgetCr: 0,
        lines: [],
        totals: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
      });
    }
    const allocation = await syncSchemeFyCategoryLines(fy.id, actor?.id ?? null);

    const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));
    const lines = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
      const row = lineByCategory.get(category);
      return {
        category,
        label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
        budgetEstimateCr: row ? toNumber(row.budgetEstimateCr) : 0,
        soExpenditureCr: row ? toNumber(row.soExpenditureCr) : 0,
        ifmsExpenditureCr: row ? toNumber(row.ifmsExpenditureCr) : 0,
      };
    });

    const totals = lines.reduce(
      (acc, r) => ({
        budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
        soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
        ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
      }),
      { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    );

    return NextResponse.json({
      financialYearLabel: fy.label,
      allocationId: allocation.id,
      totalBudgetCr: toNumber(allocation.totalBudgetCr),
      lines,
      totals,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

type PutBody = {
  financialYearLabel?: string;
  /** Manual categories only (State / Union Finance Commission, other transfer, admin). Scheme buckets are synced from scheme data. */
  lines: Array<{
    category: (typeof FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES)[number];
    budgetEstimateCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
  }>;
};

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("ENTER_FINANCIAL_DATA");

    const body = (await request.json()) as PutBody;

    const fy = body.financialYearLabel
      ? await prisma.financialYear.findUnique({ where: { label: body.financialYearLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });

    if (!fy) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    const linesIn = body.lines ?? [];
    const categories = new Set(linesIn.map((l) => l.category));
    if (categories.size !== FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES.length) {
      return NextResponse.json({ detail: "Exactly one row per manual budget category is required." }, { status: 400 });
    }
    for (const c of FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES) {
      if (!categories.has(c)) {
        return NextResponse.json({ detail: `Missing manual category line: ${c}` }, { status: 400 });
      }
    }

    const auditContext = getAuditRequestContext(request);

    const beforeAlloc = await ensureFyBudgetAllocationWithLines(fy.id, actor?.id ?? null);

    await prisma.$transaction(async (tx) => {
      for (const row of linesIn) {
        await tx.financeYearBudgetCategoryLine.update({
          where: {
            allocationId_category: {
              allocationId: beforeAlloc.id,
              category: row.category,
            },
          },
          data: {
            budgetEstimateCr: new Prisma.Decimal(roundMoney(Number(row.budgetEstimateCr)).toFixed(2)),
            soExpenditureCr: new Prisma.Decimal(roundMoney(Number(row.soExpenditureCr)).toFixed(2)),
            ifmsExpenditureCr: new Prisma.Decimal(roundMoney(Number(row.ifmsExpenditureCr)).toFixed(2)),
          },
        });
      }
    });

    await syncSchemeFyCategoryLines(fy.id, actor?.id ?? null);

    const afterAlloc = await prisma.financeYearBudgetAllocation.findUniqueOrThrow({
      where: { id: beforeAlloc.id },
      include: { categoryLines: true },
    });

    await prisma.$transaction(async (tx) => {
      await logAudit(
        tx,
        actor?.id,
        "financial.fy_budget_allocation.update",
        "finance_year_budget_allocations",
        afterAlloc.id,
        {
          totalBudgetCr: beforeAlloc.totalBudgetCr.toString(),
          lines: beforeAlloc.categoryLines.map((l) => ({
            category: l.category,
            budgetEstimateCr: l.budgetEstimateCr.toString(),
            soExpenditureCr: l.soExpenditureCr.toString(),
            ifmsExpenditureCr: l.ifmsExpenditureCr.toString(),
          })),
        },
        {
          totalBudgetCr: afterAlloc.totalBudgetCr.toString(),
          lines: afterAlloc.categoryLines.map((l) => ({
            category: l.category,
            budgetEstimateCr: l.budgetEstimateCr.toString(),
            soExpenditureCr: l.soExpenditureCr.toString(),
            ifmsExpenditureCr: l.ifmsExpenditureCr.toString(),
          })),
        },
        { ...auditContext, financialYearId: fy.id },
      );
    });

    revalidateFinancialCaches();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
