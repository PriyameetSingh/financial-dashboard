import { prisma } from "@/lib/prisma";
import {
  FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES,
} from "@/lib/finance-year-budget-allocation";
import { sponsorshipToSchemeBudgetCategory } from "@/lib/scheme-fy-bucket-metrics";

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

/** SO/IFMS totals by scheme sponsorship for snapshots on a single as-of date. */
export async function aggregateSnapshotTotalsBySchemeBucket(
  financialYearId: string,
  asOfDate: Date,
): Promise<
  Record<
    (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number],
    { soExpenditureCr: number; ifmsExpenditureCr: number }
  >
> {
  const snaps = await prisma.financeExpenditureSnapshot.findMany({
    where: { financialYearId, asOfDate },
    select: {
      schemeId: true,
      soExpenditureCr: true,
      ifmsExpenditureCr: true,
      scheme: { select: { sponsorshipType: true } },
    },
  });

  const byScheme = new Map<string, { so: number; ifms: number }>();
  for (const s of snaps) {
    const cur = byScheme.get(s.schemeId) ?? { so: 0, ifms: 0 };
    cur.so += toNumber(s.soExpenditureCr);
    cur.ifms += toNumber(s.ifmsExpenditureCr);
    byScheme.set(s.schemeId, cur);
  }

  const buckets: Record<
    (typeof FINANCE_YEAR_SCHEME_BUDGET_CATEGORIES)[number],
    { soExpenditureCr: number; ifmsExpenditureCr: number }
  > = {
    STATE_SCHEME: { soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRALLY_SPONSORED_SCHEME: { soExpenditureCr: 0, ifmsExpenditureCr: 0 },
    CENTRAL_SECTOR_SCHEME: { soExpenditureCr: 0, ifmsExpenditureCr: 0 },
  };

  for (const [schemeId, t] of byScheme) {
    const scheme = snaps.find((x) => x.schemeId === schemeId)?.scheme;
    if (!scheme) continue;
    const cat = sponsorshipToSchemeBudgetCategory(scheme.sponsorshipType);
    if (!cat) continue;
    buckets[cat].soExpenditureCr += t.so;
    buckets[cat].ifmsExpenditureCr += t.ifms;
  }

  return buckets;
}
