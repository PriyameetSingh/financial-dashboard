import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  FINANCE_YEAR_BUDGET_CATEGORY_LABELS,
  FINANCE_YEAR_BUDGET_CATEGORY_ORDER,
  FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { aggregateSnapshotTotalsBySchemeBucket } from "@/lib/finance-summary-asof";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";
import { syncSchemeFyCategoryLines } from "@/lib/sync-scheme-fy-category-lines";

export const runtime = "nodejs";

/** Legacy `finance_summary_heads` codes before FY category alignment. */
const LEGACY_HEAD_LABELS: Record<string, string> = {
  PLAN_TYPE: "Plan Type",
  TRANSFER: "Transfer",
  ADMIN_EXPENDITURE: "Admin Expenditure",
};

function labelForHeadCode(headCode: string): string {
  if (headCode in FINANCE_YEAR_BUDGET_CATEGORY_LABELS) {
    return FINANCE_YEAR_BUDGET_CATEGORY_LABELS[headCode as keyof typeof FINANCE_YEAR_BUDGET_CATEGORY_LABELS];
  }
  return LEGACY_HEAD_LABELS[headCode] ?? headCode;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(user);

    const { searchParams } = new URL(request.url);
    const asOfDateParam = searchParams.get("asOfDate");
    const fyLabel = searchParams.get("financialYearLabel");

    let fy = fyLabel
      ? await prisma.financialYear.findUnique({ where: { label: fyLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
    if (!fy && fyLabel) {
      fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });
    }

    if (!fy) {
      return NextResponse.json({
        financialYearLabel: null,
        asOfDate: null,
        rows: [],
        totals: { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
      });
    }

    const asOfDate = asOfDateParam ? new Date(`${asOfDateParam}T00:00:00.000Z`) : undefined;
    const responseAsOf: string | null = asOfDate?.toISOString().slice(0, 10) ?? null;

    if (!asOfDate) {
      const allocation = await syncSchemeFyCategoryLines(fy.id, null);
      const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));
      const rows = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
        const row = lineByCategory.get(category);
        return {
          headCode: category,
          label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
          budgetEstimateCr: row ? toNumber(row.budgetEstimateCr) : 0,
          soExpenditureCr: row ? toNumber(row.soExpenditureCr) : 0,
          ifmsExpenditureCr: row ? toNumber(row.ifmsExpenditureCr) : 0,
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
      return NextResponse.json({
        financialYearLabel: fy.label,
        asOfDate: null,
        rows,
        totals,
      });
    }

    const heads = await prisma.financeSummaryHead.findMany({
      where: {
        financialYearId: fy.id,
        asOfDate,
      },
      orderBy: { headCode: "asc" },
    });

    if (heads.length > 0) {
      const rows = heads.map((h) => ({
        headCode: h.headCode,
        label: labelForHeadCode(h.headCode),
        budgetEstimateCr: toNumber(h.budgetEstimateCr),
        soExpenditureCr: toNumber(h.soExpenditureCr),
        ifmsExpenditureCr: toNumber(h.ifmsExpenditureCr),
      }));
      const totals = rows.reduce(
        (acc, r) => ({
          budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
          soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
          ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
        }),
        { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
      );
      return NextResponse.json({
        financialYearLabel: fy.label,
        asOfDate: responseAsOf,
        rows,
        totals,
      });
    }

    const allocation = await syncSchemeFyCategoryLines(fy.id, null);
    const lineByCategory = new Map(allocation.categoryLines.map((l) => [l.category, l]));
    const bucketExp = await aggregateSnapshotTotalsBySchemeBucket(fy.id, asOfDate, scope);

    const rows = FINANCE_YEAR_BUDGET_CATEGORY_ORDER.map((category) => {
      const line = lineByCategory.get(category);
      const base = {
        headCode: category,
        label: FINANCE_YEAR_BUDGET_CATEGORY_LABELS[category],
        budgetEstimateCr: line ? toNumber(line.budgetEstimateCr) : 0,
        soExpenditureCr: line ? toNumber(line.soExpenditureCr) : 0,
        ifmsExpenditureCr: line ? toNumber(line.ifmsExpenditureCr) : 0,
      };
      if (category === "STATE_SCHEME" || category === "CENTRALLY_SPONSORED_SCHEME" || category === "CENTRAL_SECTOR_SCHEME") {
        const b = bucketExp[category];
        return {
          ...base,
          soExpenditureCr: b.soExpenditureCr,
          ifmsExpenditureCr: b.ifmsExpenditureCr,
        };
      }
      return base;
    });

    const totals = rows.reduce(
      (acc, r) => ({
        budgetEstimateCr: acc.budgetEstimateCr + r.budgetEstimateCr,
        soExpenditureCr: acc.soExpenditureCr + r.soExpenditureCr,
        ifmsExpenditureCr: acc.ifmsExpenditureCr + r.ifmsExpenditureCr,
      }),
      { budgetEstimateCr: 0, soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    );

    return NextResponse.json({
      financialYearLabel: fy.label,
      asOfDate: responseAsOf,
      rows,
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

type Body = {
  financialYearLabel?: string;
  asOfDate: string;
  rows: Array<{
    headCode: string;
    budgetEstimateCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("ENTER_FINANCIAL_DATA");

    const body = (await request.json()) as Body;
    const fy = body.financialYearLabel
      ? await prisma.financialYear.findUnique({ where: { label: body.financialYearLabel } })
      : await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });

    if (!fy) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    const manual = new Set(FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES);
    for (const row of body.rows ?? []) {
      if (!manual.has(row.headCode as (typeof FINANCE_YEAR_MANUAL_BUDGET_CATEGORIES)[number])) {
        return NextResponse.json(
          { detail: `Head "${row.headCode}" is derived from scheme data and cannot be set via this API.` },
          { status: 400 },
        );
      }
    }

    const asOfDate = new Date(`${body.asOfDate}T00:00:00.000Z`);
    const auditContext = getAuditRequestContext(request);

    const headCodes = (body.rows ?? []).map((r) => r.headCode);
    const beforeRows =
      headCodes.length === 0
        ? []
        : await prisma.financeSummaryHead.findMany({
            where: {
              financialYearId: fy.id,
              asOfDate,
              headCode: { in: headCodes },
            },
          });
    const beforeByHeadCode = new Map(beforeRows.map((h) => [h.headCode, h]));

    await prisma.$transaction(async (tx) => {
      for (const row of body.rows ?? []) {
        const before = beforeByHeadCode.get(row.headCode) ?? null;

        const saved = await tx.financeSummaryHead.upsert({
          where: {
            financialYearId_headCode_asOfDate: {
              financialYearId: fy.id,
              headCode: row.headCode,
              asOfDate,
            },
          },
          create: {
            financialYearId: fy.id,
            headCode: row.headCode,
            asOfDate,
            budgetEstimateCr: row.budgetEstimateCr,
            soExpenditureCr: row.soExpenditureCr,
            ifmsExpenditureCr: row.ifmsExpenditureCr,
            createdById: actor?.id ?? null,
          },
          update: {
            budgetEstimateCr: row.budgetEstimateCr,
            soExpenditureCr: row.soExpenditureCr,
            ifmsExpenditureCr: row.ifmsExpenditureCr,
            createdById: actor?.id ?? null,
          },
        });

        await logAudit(
          tx,
          actor?.id,
          before ? "financial.summary.update" : "financial.summary.create",
          "finance_summary_head",
          saved.id,
          before
            ? {
                budgetEstimateCr: before.budgetEstimateCr.toString(),
                soExpenditureCr: before.soExpenditureCr.toString(),
                ifmsExpenditureCr: before.ifmsExpenditureCr.toString(),
              }
            : null,
          {
            headCode: saved.headCode,
            budgetEstimateCr: saved.budgetEstimateCr.toString(),
            soExpenditureCr: saved.soExpenditureCr.toString(),
            ifmsExpenditureCr: saved.ifmsExpenditureCr.toString(),
          },
          { ...auditContext, financialYearId: fy.id, asOfDate: asOfDate.toISOString().slice(0, 10) },
        );
      }
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
