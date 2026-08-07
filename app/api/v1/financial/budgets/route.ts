import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { getFinancialBudgetEntriesOverview } from "@/lib/financial-budget-entries";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveFinanceDataScope } from "@/lib/data-scope";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";

export const runtime = "nodejs";

type PatchBody = {
  schemeCode: string;
  subschemeCode?: string | null;
  newBudgetCr: number;
  reason: string;
  financialYearLabel?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("ENTER_FINANCIAL_DATA");

    const body = (await request.json()) as PatchBody;

    const scheme = await prisma.scheme.findUnique({
      where: { code: body.schemeCode },
      include: { subschemes: true },
    });
    if (!scheme) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    const fy = body.financialYearLabel
      ? await prisma.financialYear.findUnique({ where: { label: body.financialYearLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });

    if (!fy) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    let subschemeId: string | null = null;
    if (body.subschemeCode?.trim()) {
      const sub = scheme.subschemes.find(
        (s) => s.code.toUpperCase() === body.subschemeCode!.trim().toUpperCase(),
      );
      if (!sub) {
        return NextResponse.json({ detail: "Subscheme not found for this scheme" }, { status: 404 });
      }
      subschemeId = sub.id;
    }

    const auditContext = getAuditRequestContext(request);

    const existing = await prisma.financeBudget.findFirst({
      where: { schemeId: scheme.id, subschemeId, financialYearId: fy.id },
    });

    if (existing?.locked) {
      return NextResponse.json({ detail: "Budget is locked for this financial year." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.financeBudgetRevision.create({
          data: {
            financeBudgetId: existing.id,
            oldBudgetEstimateCr: existing.budgetEstimateCr,
            newBudgetEstimateCr: body.newBudgetCr,
            reason: body.reason,
            createdById: actor?.id ?? null,
          },
        });
        await tx.financeBudget.update({
          where: { id: existing.id },
          data: { budgetEstimateCr: body.newBudgetCr, createdById: actor?.id ?? null },
        });
        await logAudit(
          tx,
          actor?.id,
          "financial.budget.revise",
          "finance_budgets",
          existing.id,
          { budgetEstimateCr: existing.budgetEstimateCr.toString() },
          { budgetEstimateCr: String(body.newBudgetCr), reason: body.reason },
          { ...auditContext, schemeId: scheme.id, subschemeId, financialYearId: fy.id },
        );
      } else {
        const created = await tx.financeBudget.create({
          data: {
            schemeId: scheme.id,
            subschemeId,
            financialYearId: fy.id,
            budgetEstimateCr: body.newBudgetCr,
            createdById: actor?.id ?? null,
          },
        });
        await logAudit(
          tx,
          actor?.id,
          "financial.budget.create",
          "finance_budgets",
          created.id,
          null,
          { budgetEstimateCr: String(body.newBudgetCr) },
          { ...auditContext, schemeId: scheme.id, subschemeId, financialYearId: fy.id },
        );
      }
    });

    await syncSchemeFyCategoryLines(fy.id, actor?.id ?? null);
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

export async function GET() {
  try {
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveFinanceDataScope(user);

    const result = await getFinancialBudgetEntriesOverview(user, scope);
    return NextResponse.json(result);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      return NextResponse.json(
        {
          detail:
            "Database schema is out of date. Run migrations: npx prisma migrate deploy",
        },
        { status: 500 },
      );
    }
    const detail =
      error instanceof Error ? error.message : "Failed to load financial budgets";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
