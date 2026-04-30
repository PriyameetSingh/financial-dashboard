import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/financial-budget-entries";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

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

function startOfIsoWeek(isoDay: string): string {
  const [y, mo, d] = isoDay.split("-").map(Number);
  const t = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const day = new Date(t).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const d2 = new Date(t - mondayOffset * 864e5);
  return d2.toISOString().slice(0, 10);
}

function achievementPct(
  kpiType: string,
  numerator: number | null,
  denominator: number | null,
  yesValue: boolean | null,
): number | null {
  if (kpiType === "BINARY") {
    if (yesValue === true) return 100;
    if (yesValue === false) return 0;
    return null;
  }
  if (denominator && denominator > 0 && numerator !== null) {
    return Math.min(100, (numerator / denominator) * 100);
  }
  return null;
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    throw error;
  }

  const { id: schemeId } = await ctx.params;

  const scheme = await prisma.scheme.findUnique({
    where: { id: schemeId },
    include: {
      subschemes: { orderBy: { name: "asc" } },
    },
  });

  if (!scheme) {
    return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
  }

  const fy = await prisma.financialYear.findFirst({
    orderBy: { endDate: "desc" },
  });

  const fyLabel = fy?.label ?? null;

  const [budgets, snapshots, definitions] = await Promise.all([
    fy
      ? prisma.financeBudget.findMany({
          where: { financialYearId: fy.id, schemeId },
          select: { subschemeId: true, budgetEstimateCr: true },
        })
      : Promise.resolve([]),
    fy
      ? prisma.financeExpenditureSnapshot.findMany({
          where: { financialYearId: fy.id, schemeId },
          orderBy: { asOfDate: "desc" },
          select: {
            subschemeId: true,
            asOfDate: true,
            soExpenditureCr: true,
            ifmsExpenditureCr: true,
            remarks: true,
            createdAt: true,
            workflowStatus: true,
            createdBy: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    prisma.kpiDefinition.findMany({
      where: { schemeId },
      include: {
        subscheme: { select: { id: true, code: true, name: true } },
        targets: fy
          ? {
              where: { financialYearId: fy.id },
              include: {
                measurements: {
                  orderBy: { measuredAt: "asc" },
                  include: {
                    createdBy: { select: { name: true } },
                    reviewedBy: { select: { name: true } },
                  },
                },
              },
            }
          : {
              include: {
                measurements: {
                  orderBy: { measuredAt: "asc" },
                  include: {
                    createdBy: { select: { name: true } },
                    reviewedBy: { select: { name: true } },
                  },
                },
              },
            },
      },
      orderBy: { description: "asc" },
    }),
  ]);

  const expenditure = rollupExpenditure(scheme, budgets, snapshots, fyLabel);

  const ifmsByDate = await (fy
    ? prisma.financeExpenditureSnapshot.groupBy({
        by: ["asOfDate"],
        where: { schemeId, financialYearId: fy.id },
        _sum: { ifmsExpenditureCr: true },
        orderBy: { asOfDate: "asc" },
      })
    : Promise.resolve([]));

  const annual = expenditure?.annualBudgetCr ?? 0;
  const ifmsTimeseries = ifmsByDate.map((row) => {
    const ifmsCr = toNumber(row._sum.ifmsExpenditureCr);
    return {
      asOfDate: row.asOfDate.toISOString().slice(0, 10),
      ifmsCr,
      utilisationPct: annual > 0 ? (ifmsCr / annual) * 100 : null,
    };
  });

  const subIds = new Set(scheme.subschemes.map((s) => s.id));
  const subschemeFinancial = scheme.subschemes.map((sub) => {
    const subB = budgets.find((b) => b.subschemeId === sub.id);
    const budgetCr = subB ? toNumber(subB.budgetEstimateCr) : 0;
    const subSnaps = snapshots.filter((s) => s.subschemeId === sub.id);
    const latest = subSnaps.reduce<(typeof subSnaps)[number] | null>((best, cur) => {
      if (!best || cur.asOfDate > best.asOfDate) return cur;
      return best;
    }, null);
    const ifmsCr = latest ? toNumber(latest.ifmsExpenditureCr) : 0;
    return {
      id: sub.id,
      code: sub.code,
      name: sub.name,
      budgetCr,
      ifmsCr,
      utilisationPct: budgetCr > 0 ? (ifmsCr / budgetCr) * 100 : null,
      asOfDate: latest ? latest.asOfDate.toISOString().slice(0, 10) : null,
    };
  });

  if (subIds.size === 0) {
    const schemeB = budgets.find((b) => b.subschemeId === null);
    const budgetCr = schemeB ? toNumber(schemeB.budgetEstimateCr) : annual;
    const schemeOnly = snapshots.filter((s) => s.subschemeId === null);
    const latest = schemeOnly[0] ?? null;
    const ifmsCr = latest ? toNumber(latest.ifmsExpenditureCr) : 0;
    subschemeFinancial.push({
      id: scheme.id,
      code: scheme.code,
      name: "Scheme total",
      budgetCr,
      ifmsCr,
      utilisationPct: budgetCr > 0 ? (ifmsCr / budgetCr) * 100 : null,
      asOfDate: latest ? latest.asOfDate.toISOString().slice(0, 10) : null,
    });
  }

  type WeekBucket = { week: string; sum: number; n: number };
  const weekConsolidated = new Map<string, WeekBucket>();
  const weekBySubscheme = new Map<string, Map<string, WeekBucket>>();

  const kpiRows: Array<{
    id: string;
    description: string;
    kpiType: string;
    category: string;
    subschemeId: string | null;
    subschemeCode: string | null;
    subschemeName: string | null;
    denominator: number | null;
    latest: {
      measuredAt: string;
      progressStatus: string;
      achievementPct: number | null;
      workflowStatus: string;
      remarks: string | null;
    } | null;
    measurementSeries: Array<{
      measuredAt: string;
      achievementPct: number | null;
      progressStatus: string;
    }>;
  }> = [];

  const progressCounts = { on_track: 0, delayed: 0, overdue: 0 };

  for (const def of definitions) {
    const target = def.targets[0] ?? null;
    const denominator = target ? toNumber(target.denominatorValue) : null;
    const measurementSeries: Array<{
      measuredAt: string;
      achievementPct: number | null;
      progressStatus: string;
    }> = [];

    let latest: (typeof kpiRows)[number]["latest"] = null;

    if (target) {
      for (const m of target.measurements) {
        const day = m.measuredAt.toISOString().slice(0, 10);
        const num = toNumber(m.numeratorValue);
        const pct = achievementPct(def.kpiType, num, denominator, m.yesValue);
        measurementSeries.push({
          measuredAt: day,
          achievementPct: pct,
          progressStatus: m.progressStatus,
        });

        const wk = startOfIsoWeek(day);
        if (pct !== null) {
          const c = weekConsolidated.get(wk) ?? { week: wk, sum: 0, n: 0 };
          c.sum += pct;
          c.n += 1;
          weekConsolidated.set(wk, c);

          const subKey = def.subschemeId ?? "_scheme";
          let subMap = weekBySubscheme.get(subKey);
          if (!subMap) {
            subMap = new Map();
            weekBySubscheme.set(subKey, subMap);
          }
          const sb = subMap.get(wk) ?? { week: wk, sum: 0, n: 0 };
          sb.sum += pct;
          sb.n += 1;
          subMap.set(wk, sb);
        }
      }

      const lastM = target.measurements[target.measurements.length - 1];
      if (lastM) {
        const num = toNumber(lastM.numeratorValue);
        const pct = achievementPct(def.kpiType, num, denominator, lastM.yesValue);
        latest = {
          measuredAt: lastM.measuredAt.toISOString().slice(0, 10),
          progressStatus: lastM.progressStatus,
          achievementPct: pct,
          workflowStatus: lastM.workflowStatus,
          remarks: lastM.remarks ?? null,
        };
        const ps = lastM.progressStatus;
        if (ps === "on_track") progressCounts.on_track += 1;
        else if (ps === "delayed") progressCounts.delayed += 1;
        else if (ps === "overdue") progressCounts.overdue += 1;
      }
    }

    kpiRows.push({
      id: def.id,
      description: def.description,
      kpiType: def.kpiType,
      category: def.category,
      subschemeId: def.subschemeId,
      subschemeCode: def.subscheme?.code ?? null,
      subschemeName: def.subscheme?.name ?? null,
      denominator,
      latest,
      measurementSeries,
    });
  }

  const kpiWeeklyConsolidated = [...weekConsolidated.values()]
    .map((b) => ({
      weekStart: b.week,
      avgAchievementPct: b.n > 0 ? b.sum / b.n : null,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const kpiWeeklyBySubscheme = [...weekBySubscheme.entries()].map(([subKey, m]) => {
    const meta =
      subKey === "_scheme"
        ? { id: null as string | null, code: null as string | null, name: "Scheme-level KPIs" }
        : (() => {
            const sub = scheme.subschemes.find((s) => s.id === subKey);
            return sub
              ? { id: sub.id, code: sub.code, name: sub.name }
              : { id: subKey, code: "?", name: "Subscheme" };
          })();
    const series = [...m.values()]
      .map((b) => ({
        weekStart: b.week,
        avgAchievementPct: b.n > 0 ? b.sum / b.n : null,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return { subschemeId: meta.id, subschemeCode: meta.code, subschemeName: meta.name, series };
  });

  type UpdateRow = {
    at: string;
    kind: "kpi" | "financial";
    title: string;
    detail: string | null;
  };
  const updates: UpdateRow[] = [];

  for (const def of definitions) {
    const target = def.targets[0];
    if (!target) continue;
    for (const m of target.measurements) {
      updates.push({
        at: m.measuredAt.toISOString(),
        kind: "kpi",
        title: def.description,
        detail: m.remarks ?? null,
      });
    }
  }

  for (const s of snapshots) {
    updates.push({
      at: s.createdAt.toISOString(),
      kind: "financial",
      title: `Financial data · ${s.asOfDate.toISOString().slice(0, 10)}`,
      detail: s.remarks ?? null,
    });
  }

  updates.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const updatesLimited = updates.slice(0, 40);

  return NextResponse.json({
    scheme: {
      id: scheme.id,
      code: scheme.code,
      name: scheme.name,
      verticalName: scheme.verticalName,
    },
    financialYearLabel: fyLabel,
    expenditure,
    ifmsTimeseries,
    subschemeFinancial,
    kpi: {
      rows: kpiRows,
      progressCounts,
      weeklyConsolidated: kpiWeeklyConsolidated,
      weeklyBySubscheme: kpiWeeklyBySubscheme,
    },
    updates: updatesLimited,
  });
}
