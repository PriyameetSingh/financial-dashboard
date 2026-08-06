import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";

export const runtime = "nodejs";

type PatchBody = {
  soExpenditureCr?: number;
  ifmsExpenditureCr?: number;
  remarks?: string | null;
};

function snapshotSummary(snap: {
  id: string;
  soExpenditureCr: { toString: () => string };
  ifmsExpenditureCr: { toString: () => string };
  remarks: string | null;
  workflowStatus: string;
}) {
  return {
    id: snap.id,
    soExpenditureCr: snap.soExpenditureCr.toString(),
    ifmsExpenditureCr: snap.ifmsExpenditureCr.toString(),
    remarks: snap.remarks,
    workflowStatus: snap.workflowStatus,
  };
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAnyPermissionAndDbUser("EDIT_FINANCIAL_ENTRIES");
    const { id } = await ctx.params;

    const existing = await prisma.financeExpenditureSnapshot.findUnique({
      where: { id },
      select: {
        id: true,
        schemeId: true,
        subschemeId: true,
        financialYearId: true,
        asOfDate: true,
        soExpenditureCr: true,
        ifmsExpenditureCr: true,
        remarks: true,
        workflowStatus: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ detail: "Snapshot not found" }, { status: 404 });
    }

    const auditContext = getAuditRequestContext(request);
    const before = snapshotSummary(existing);

    await prisma.$transaction(async (tx) => {
      await tx.financeExpenditureSnapshot.delete({ where: { id: existing.id } });

      await logAudit(
        tx,
        actor?.id,
        "financial.snapshot.delete",
        "finance_expenditure_snapshot",
        existing.id,
        before,
        null,
        {
          ...auditContext,
          schemeId: existing.schemeId,
          subschemeId: existing.subschemeId,
          financialYearId: existing.financialYearId,
          asOfDate: existing.asOfDate.toISOString().slice(0, 10),
        },
      );
    });

    await syncSchemeFyCategoryLines(existing.financialYearId, actor?.id ?? null);
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

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAnyPermissionAndDbUser("EDIT_FINANCIAL_ENTRIES");
    const { id } = await ctx.params;

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) {
      return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
    }

    const hasSo = body.soExpenditureCr !== undefined;
    const hasIfms = body.ifmsExpenditureCr !== undefined;
    if (!hasSo && !hasIfms && body.remarks === undefined) {
      return NextResponse.json(
        { detail: "Provide at least one field to correct (SO, IFMS, or remarks)." },
        { status: 400 },
      );
    }

    if (hasSo && (Number.isNaN(Number(body.soExpenditureCr)) || Number(body.soExpenditureCr) < 0)) {
      return NextResponse.json({ detail: "SO expenditure must be a non-negative number." }, { status: 400 });
    }
    if (hasIfms && (Number.isNaN(Number(body.ifmsExpenditureCr)) || Number(body.ifmsExpenditureCr) < 0)) {
      return NextResponse.json({ detail: "IFMS expenditure must be a non-negative number." }, { status: 400 });
    }

    const existing = await prisma.financeExpenditureSnapshot.findUnique({
      where: { id },
      select: {
        id: true,
        schemeId: true,
        subschemeId: true,
        financialYearId: true,
        asOfDate: true,
        soExpenditureCr: true,
        ifmsExpenditureCr: true,
        remarks: true,
        workflowStatus: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ detail: "Snapshot not found" }, { status: 404 });
    }

    const auditContext = getAuditRequestContext(request);
    const before = snapshotSummary(existing);

    const data: {
      soExpenditureCr?: number;
      ifmsExpenditureCr?: number;
      remarks?: string | null;
    } = {};
    if (hasSo) data.soExpenditureCr = Number(body.soExpenditureCr);
    if (hasIfms) data.ifmsExpenditureCr = Number(body.ifmsExpenditureCr);
    if (body.remarks !== undefined) data.remarks = body.remarks?.trim() ? body.remarks.trim() : null;

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.financeExpenditureSnapshot.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          soExpenditureCr: true,
          ifmsExpenditureCr: true,
          remarks: true,
          workflowStatus: true,
        },
      });

      await logAudit(
        tx,
        actor?.id,
        "financial.snapshot.correct",
        "finance_expenditure_snapshot",
        existing.id,
        before,
        snapshotSummary(updated),
        {
          ...auditContext,
          schemeId: existing.schemeId,
          subschemeId: existing.subschemeId,
          financialYearId: existing.financialYearId,
          asOfDate: existing.asOfDate.toISOString().slice(0, 10),
        },
      );

      return updated;
    });

    await syncSchemeFyCategoryLines(existing.financialYearId, actor?.id ?? null);
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
