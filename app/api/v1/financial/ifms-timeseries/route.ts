import { NextRequest, NextResponse } from "next/server";
import { asOfDateToYmd, getCachedIfmsTimeseriesGroupBy } from "@/lib/cached-financial-metadata";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/financial-budget-entries";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

/** Aggregated IFMS (₹ Cr) per snapshot date for the FY — same basis as Command Centre trend. Optional `financialYearLabel` scopes to that FY. */
export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { searchParams } = new URL(request.url);
    const fyLabel = searchParams.get("financialYearLabel");

    let fy = fyLabel
      ? await prisma.financialYear.findFirst({ where: { label: fyLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
    if (!fy && fyLabel) {
      fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
    }
    if (!fy) {
      return NextResponse.json({ financialYearLabel: null, points: [] });
    }

    const rows = await getCachedIfmsTimeseriesGroupBy(fy.id);

    const points = rows.map((r) => ({
      asOfDate: asOfDateToYmd(r.asOfDate),
      ifmsCr: toNumber(r._sum.ifmsExpenditureCr),
    }));

    return NextResponse.json({ financialYearLabel: fy.label, points });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
