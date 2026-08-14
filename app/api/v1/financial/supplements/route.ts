import { NextRequest, NextResponse } from "next/server";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";

export const runtime = "nodejs";

type PostBody = {
  schemeCode: string;
  subschemeCode?: string | null;
  financialYearLabel: string;
  amountCr: number;
  reason: string;
  referenceNo?: string;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("ENTER_FINANCIAL_DATA");

    const body = (await request.json()) as PostBody;

    if (!body.schemeCode) {
      return NextResponse.json({ detail: "Missing schemeCode" }, { status: 400 });
    }
    if (!body.financialYearLabel) {
      return NextResponse.json({ detail: "Missing financialYearLabel" }, { status: 400 });
    }
    if (body.amountCr === undefined || body.amountCr === null || Number.isNaN(body.amountCr)) {
      return NextResponse.json({ detail: "Invalid amountCr" }, { status: 400 });
    }
    if (body.amountCr === 0) {
      return NextResponse.json({ detail: "Amount must be non-zero" }, { status: 400 });
    }
    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json({ detail: "Reason is required" }, { status: 400 });
    }

    const scheme = await prisma.scheme.findFirst({
      where: { code: body.schemeCode },
      include: { subschemes: true },
    });
    if (!scheme) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    const fy = await prisma.financialYear.findFirst({ 
      where: { label: body.financialYearLabel } 
    });

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

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.financeBudgetSupplement.create({
        data: tenantStamped({
          schemeId: scheme.id,
          subschemeId,
          financialYearId: fy.id,
          amountCr: body.amountCr,
          reason: body.reason,
          referenceNo: body.referenceNo,
          createdById: actor?.id ?? null,
        }),
      });

      await logAudit(
        tx,
        actor?.id,
        "financial.budget.supplement",
        "finance_budget_supplements",
        created.id,
        null,
        { amountCr: String(body.amountCr), reason: body.reason, referenceNo: body.referenceNo ?? null },
        { ...auditContext, schemeId: scheme.id, subschemeId, financialYearId: fy.id },
      );

      return created;
    });

    await syncSchemeFyCategoryLines(fy.id, actor?.id ?? null);
    revalidateFinancialCaches();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    const detail =
      error instanceof Error ? error.message : "Failed to create budget supplement";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
