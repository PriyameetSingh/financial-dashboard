import type { Prisma, SponsorshipType } from "@prisma/client";
import type { FinanceYearBudgetCategory } from "@/lib/finance-year-budget-allocation";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

type BudgetRow = { subschemeId: string | null; budgetEstimateCr: Prisma.Decimal };
type SnapRow = {
  subschemeId: string | null;
  asOfDate: Date;
  soExpenditureCr: Prisma.Decimal;
  ifmsExpenditureCr: Prisma.Decimal;
};
type SupRow = { subschemeId: string | null; amountCr: Prisma.Decimal };

/**
 * Per-scheme FY totals consistent with the financial overview card:
 * effective budget = annual budget + supplements; SO/IFMS from latest snapshot per subscheme or scheme.
 */
export function computeSchemeFyMetrics(
  scheme: { subschemes: { id: string }[] },
  schemeBudgets: BudgetRow[],
  schemeSnapshots: SnapRow[],
  schemeSupplements: SupRow[],
): { effectiveBudgetCr: number; so: number; ifms: number } {
  const subIds = new Set(scheme.subschemes.map((s) => s.id));

  if (subIds.size > 0) {
    const subBudgetSum = schemeBudgets
      .filter((b) => b.subschemeId && subIds.has(b.subschemeId))
      .reduce((sum, b) => sum + toNumber(b.budgetEstimateCr), 0);
    const schemeLevelBudget = schemeBudgets.find((b) => b.subschemeId === null);
    const annualBudget =
      subBudgetSum > 0 ? subBudgetSum : toNumber(schemeLevelBudget?.budgetEstimateCr ?? 0);

    const latestBySub = new Map<string, SnapRow>();
    for (const snap of schemeSnapshots) {
      if (!snap.subschemeId || !subIds.has(snap.subschemeId)) continue;
      const prev = latestBySub.get(snap.subschemeId);
      if (!prev || snap.asOfDate > prev.asOfDate) {
        latestBySub.set(snap.subschemeId, snap);
      }
    }

    let totalSupplementCr = 0;
    for (const sub of scheme.subschemes) {
      const subSups = schemeSupplements.filter((s) => s.subschemeId === sub.id);
      totalSupplementCr += subSups.reduce((acc, s) => acc + toNumber(s.amountCr), 0);
    }

    let so = 0;
    let ifms = 0;
    for (const snap of latestBySub.values()) {
      so += toNumber(snap.soExpenditureCr);
      ifms += toNumber(snap.ifmsExpenditureCr);
    }

    return {
      effectiveBudgetCr: annualBudget + totalSupplementCr,
      so,
      ifms,
    };
  }

  const row = schemeBudgets.find((b) => b.subschemeId === null);
  const annualBudget = row ? toNumber(row.budgetEstimateCr) : 0;
  const schemeOnlySups = schemeSupplements.filter((s) => s.subschemeId === null);
  const totalSupplementCr = schemeOnlySups.reduce((acc, s) => acc + toNumber(s.amountCr), 0);

  const schemeOnly = schemeSnapshots
    .filter((s) => s.subschemeId === null)
    .sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime());
  const latest = schemeOnly[0] ?? null;

  return {
    effectiveBudgetCr: annualBudget + totalSupplementCr,
    so: latest ? toNumber(latest.soExpenditureCr) : 0,
    ifms: latest ? toNumber(latest.ifmsExpenditureCr) : 0,
  };
}

export function sponsorshipToSchemeBudgetCategory(
  st: SponsorshipType,
): Extract<
  FinanceYearBudgetCategory,
  "STATE_SCHEME" | "CENTRALLY_SPONSORED_SCHEME" | "CENTRAL_SECTOR_SCHEME"
> | null {
  if (st === "STATE") return "STATE_SCHEME";
  if (st === "CENTRAL") return "CENTRALLY_SPONSORED_SCHEME";
  if (st === "CENTRAL_SECTOR") return "CENTRAL_SECTOR_SCHEME";
  if (st === "NON_FINANCIAL") return null;
  return "CENTRAL_SECTOR_SCHEME";
}
