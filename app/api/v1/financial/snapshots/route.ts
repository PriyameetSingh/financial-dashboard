import { NextRequest, NextResponse } from "next/server";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";
import { CURRENT_FINANCIAL_YEAR_ORDER } from "@/lib/financial-year-order";

export const runtime = "nodejs";

type Body = {
  schemeCode: string;
  subschemeCode?: string | null;
  asOfDate: string;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  remarks?: string;
  financialYearLabel?: string;
  workflowStatus?: "draft" | "submitted";
  /** Required — ties this expenditure snapshot to a dashboard meeting. */
  meetingId: string;
};

export async function POST(request: NextRequest) {
  try {
    const createdBy = await requireAnyPermissionAndDbUser("ENTER_FINANCIAL_DATA");

    const body = (await request.json()) as Body;

    if (!body.meetingId?.trim()) {
      return NextResponse.json({ detail: "Meeting is required" }, { status: 400 });
    }
    const meeting = await prisma.dashboardMeeting.findUnique({
      where: { id: body.meetingId.trim() },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const scheme = await prisma.scheme.findFirst({
      where: { code: body.schemeCode },
      include: { subschemes: true },
    });
    if (!scheme) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    const fy = body.financialYearLabel
      ? await prisma.financialYear.findFirst({ where: { label: body.financialYearLabel } })
      : await prisma.financialYear.findFirst({ orderBy: CURRENT_FINANCIAL_YEAR_ORDER });

    if (!fy) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    const subIds = scheme.subschemes.map((s) => s.id);
    let subschemeId: string | null = null;
    if (body.subschemeCode?.trim()) {
      const code = body.subschemeCode.trim();
      const sub = scheme.subschemes.find((s) => s.code.toUpperCase() === code.toUpperCase());
      if (!sub) {
        return NextResponse.json({ detail: "Subscheme not found for this scheme" }, { status: 404 });
      }
      subschemeId = sub.id;
    } else if (subIds.length > 0) {
      return NextResponse.json(
        { detail: "This scheme has subschemes: enter expenditure at subscheme level (subschemeCode)." },
        { status: 400 },
      );
    }

    const asOfDate = new Date(`${body.asOfDate}T00:00:00.000Z`);
    // FA submissions go directly to submitted (approved) — no separate review gate
    const workflowStatus: "draft" | "submitted" = body.workflowStatus === "draft" ? "draft" : "submitted";

    const existing = await prisma.financeExpenditureSnapshot.findFirst({
      where: {
        schemeId: scheme.id,
        subschemeId,
        financialYearId: fy.id,
        asOfDate,
      },
    });

    const auditContext = getAuditRequestContext(request);
    const before = existing
      ? {
          id: existing.id,
          soExpenditureCr: existing.soExpenditureCr.toString(),
          ifmsExpenditureCr: existing.ifmsExpenditureCr.toString(),
          workflowStatus: existing.workflowStatus,
        }
      : null;

    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.financeExpenditureSnapshot.update({
          where: { id: existing.id },
          data: {
            meetingId: meeting.id,
            soExpenditureCr: body.soExpenditureCr,
            ifmsExpenditureCr: body.ifmsExpenditureCr,
            remarks: body.remarks,
            workflowStatus,
            createdById: createdBy?.id ?? null,
          },
        });
      } else {
        await tx.financeExpenditureSnapshot.create({
          data: tenantStamped({
            schemeId: scheme.id,
            subschemeId,
            financialYearId: fy.id,
            meetingId: meeting.id,
            asOfDate,
            soExpenditureCr: body.soExpenditureCr,
            ifmsExpenditureCr: body.ifmsExpenditureCr,
            remarks: body.remarks,
            workflowStatus,
            createdById: createdBy?.id ?? null,
          }),
        });
      }

      const afterRow = await tx.financeExpenditureSnapshot.findFirst({
        where: {
          schemeId: scheme.id,
          subschemeId,
          financialYearId: fy.id,
          asOfDate,
        },
      });

      await logAudit(
        tx,
        createdBy?.id,
        existing ? "financial.snapshot.update" : "financial.snapshot.create",
        "finance_expenditure_snapshot",
        afterRow?.id,
        before,
        afterRow
          ? {
              id: afterRow.id,
              soExpenditureCr: afterRow.soExpenditureCr.toString(),
              ifmsExpenditureCr: afterRow.ifmsExpenditureCr.toString(),
              workflowStatus: afterRow.workflowStatus,
            }
          : null,
        {
          ...auditContext,
          meetingId: meeting.id,
          schemeId: scheme.id,
          subschemeId,
          financialYearId: fy.id,
          workflowTransition: workflowStatus,
        },
      );
    });

    await syncSchemeFyCategoryLines(fy.id, createdBy?.id ?? null);
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
