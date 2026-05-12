import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapSchemeView } from "@/lib/scheme-api";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

async function getReferenceData() {
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, email: true } }),
  ]);
  return { roles, users };
}

function rollupExpenditure(
  scheme: { subschemes: Array<{ id: string }> },
  schemeBudgets: Array<{ subschemeId: string | null; budgetEstimateCr: Prisma.Decimal }>,
  schemeSnapshots: Array<{
    subschemeId: string | null;
    asOfDate: Date;
    soExpenditureCr: Prisma.Decimal;
    ifmsExpenditureCr: Prisma.Decimal;
  }>,
  fyLabel: string | null,
): {
  financialYearLabel: string | null;
  annualBudgetCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  asOfDate: string | null;
} | null {
  if (!fyLabel && schemeBudgets.length === 0 && schemeSnapshots.length === 0) {
    return null;
  }

  const subIds = new Set(scheme.subschemes.map((s) => s.id));
  let annualBudget = 0;
  let so = 0;
  let ifms = 0;
  let maxAsOf: Date | null = null;

  if (subIds.size > 0) {
    const subBudgetSum = schemeBudgets
      .filter((b) => b.subschemeId && subIds.has(b.subschemeId))
      .reduce((sum, b) => sum + toNumber(b.budgetEstimateCr), 0);
    const schemeLevelBudget = schemeBudgets.find((b) => b.subschemeId === null);
    annualBudget = subBudgetSum > 0 ? subBudgetSum : toNumber(schemeLevelBudget?.budgetEstimateCr ?? 0);

    const latestBySub = new Map<string, (typeof schemeSnapshots)[number]>();
    for (const snap of schemeSnapshots) {
      if (!snap.subschemeId || !subIds.has(snap.subschemeId)) continue;
      const prev = latestBySub.get(snap.subschemeId);
      if (!prev || snap.asOfDate > prev.asOfDate) {
        latestBySub.set(snap.subschemeId, snap);
      }
    }
    for (const snap of latestBySub.values()) {
      so += toNumber(snap.soExpenditureCr);
      ifms += toNumber(snap.ifmsExpenditureCr);
      if (!maxAsOf || snap.asOfDate > maxAsOf) maxAsOf = snap.asOfDate;
    }
  } else {
    const row = schemeBudgets.find((b) => b.subschemeId === null);
    annualBudget = row ? toNumber(row.budgetEstimateCr) : 0;
    const schemeOnly = schemeSnapshots.filter((s) => s.subschemeId === null).sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime());
    const latest = schemeOnly[0] ?? null;
    if (latest) {
      so = toNumber(latest.soExpenditureCr);
      ifms = toNumber(latest.ifmsExpenditureCr);
      maxAsOf = latest.asOfDate;
    }
  }

  if (annualBudget === 0 && so === 0 && ifms === 0 && !maxAsOf) {
    return fyLabel
      ? {
          financialYearLabel: fyLabel,
          annualBudgetCr: 0,
          soExpenditureCr: 0,
          ifmsExpenditureCr: 0,
          asOfDate: null,
        }
      : null;
  }

  return {
    financialYearLabel: fyLabel,
    annualBudgetCr: annualBudget,
    soExpenditureCr: so,
    ifmsExpenditureCr: ifms,
    asOfDate: maxAsOf ? maxAsOf.toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }

  const fy = await prisma.financialYear.findFirst({
    orderBy: { endDate: "desc" },
  });

  const [schemesRaw, reference, budgets, snapshots] = await Promise.all([
    prisma.scheme.findMany({
      include: {
        subschemes: { orderBy: { name: "asc" } },
        assignments: {
          orderBy: [{ assignmentKind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            user: { select: { id: true, name: true } },
            role: { select: { id: true, code: true } },
          },
        },
        kpiDefinitions: {
          orderBy: { description: "asc" },
          select: {
            id: true,
            description: true,
            kpiType: true,
            category: true,
            monitoringLevel: true,
            subscheme: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    getReferenceData(),
    fy
      ? prisma.financeBudget.findMany({
          where: { financialYearId: fy.id },
          select: { schemeId: true, subschemeId: true, budgetEstimateCr: true },
        })
      : Promise.resolve([]),
    fy
      ? prisma.financeExpenditureSnapshot.findMany({
          where: { financialYearId: fy.id },
          orderBy: { asOfDate: "desc" },
          select: {
            schemeId: true,
            subschemeId: true,
            asOfDate: true,
            soExpenditureCr: true,
            ifmsExpenditureCr: true,
          },
        })
      : Promise.resolve([]),
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

  const fyLabel = fy?.label ?? null;

  const schemes = schemesRaw.map((scheme) => {
    const base = mapSchemeView(scheme);
    const schemeBudgets = budgetsByScheme.get(scheme.id) ?? [];
    const schemeSnapshots = snapshotsByScheme.get(scheme.id) ?? [];
    const expenditure = rollupExpenditure(scheme, schemeBudgets, schemeSnapshots, fyLabel);
    return {
      ...base,
      kpis: scheme.kpiDefinitions.map((k) => ({
        id: k.id,
        description: k.description,
        kpiType: k.kpiType,
        category: k.category,
        monitoringLevel: k.monitoringLevel ?? null,
        subschemeCode: k.subscheme?.code ?? null,
        subschemeName: k.subscheme?.name ?? null,
      })),
      expenditure,
    };
  });

  return NextResponse.json({
    financialYearLabel: fyLabel,
    schemes,
    reference,
  });
}
