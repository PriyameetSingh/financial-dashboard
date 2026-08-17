/**
 * Cross-request cached financial metadata.
 *
 * TENANCY (Phase 2 Gate D): `unstable_cache` is a CROSS-REQUEST cache — it
 * outlives the request-scoped tenant holder, so it is one of the enumerated
 * paths the Prisma chokepoint cannot cover. Two consequences, both handled
 * here explicitly:
 *
 *   1. Every cache key and every revalidation tag is tenant-qualified, so one
 *      tenant can never be served another tenant's cached rows, and a
 *      mutation in one tenant never invalidates another tenant's cache.
 *   2. The cached callbacks run outside the request scope, so they use
 *      `prismaUnscoped` with an EXPLICIT `tenantId` filter captured before the
 *      cache boundary — rather than relying on ambient scope that may not
 *      exist inside the cache execution context.
 */
import { revalidateTag, unstable_cache } from "next/cache";
import { prismaUnscoped, requireTenantScope } from "@/lib/prisma";

/** `unstable_cache` JSON round-trips Prisma `Date` fields as ISO strings — normalize for API output. */
export function asOfDateToYmd(asOfDate: Date | string): string {
  return typeof asOfDate === "string" ? asOfDate.slice(0, 10) : asOfDate.toISOString().slice(0, 10);
}

/** Tag stems for `revalidateTag` from financial mutation routes (tenant-qualified at use). */
export const FINANCIAL_CACHE_TAGS = {
  financialYear: "cache-financial-year",
  ifmsTimeseries: "cache-ifms-timeseries",
  snapshotDates: "cache-snapshot-dates",
} as const;

const ALL_FINANCIAL_TAGS = Object.values(FINANCIAL_CACHE_TAGS);

/** `<stem>:<tenantId>` — cache entries and invalidations never cross tenants. */
function tenantTag(stem: string, tenantId: string): string {
  return `${stem}:${tenantId}`;
}

/** Invalidate all cached financial reads (FY label, IFMS aggregates, snapshot date lists) for the current tenant. */
export function revalidateFinancialCaches(): void {
  const tenantId = requireTenantScope("revalidateFinancialCaches");
  for (const tag of ALL_FINANCIAL_TAGS) {
    revalidateTag(tenantTag(tag, tenantId), "max");
  }
}

/** Latest financial year by end date — short-lived cache. */
export async function getActiveFinancialYearCached() {
  const tenantId = requireTenantScope("getActiveFinancialYearCached");
  return unstable_cache(
    async () =>
      prismaUnscoped.financialYear.findFirst({
        where: { tenantId },
        orderBy: { endDate: "desc" },
        select: { id: true, label: true },
      }),
    ["cached-active-financial-year", tenantId],
    { revalidate: 120, tags: [tenantTag(FINANCIAL_CACHE_TAGS.financialYear, tenantId)] },
  )();
}

/** IFMS sum per snapshot date for one FY — cache keyed by tenant + `financialYearId`. */
export async function getCachedIfmsTimeseriesGroupBy(financialYearId: string) {
  const tenantId = requireTenantScope("getCachedIfmsTimeseriesGroupBy");
  return unstable_cache(
    async () =>
      prismaUnscoped.financeExpenditureSnapshot.groupBy({
        by: ["asOfDate"],
        where: { tenantId, financialYearId },
        _sum: { ifmsExpenditureCr: true },
        orderBy: { asOfDate: "asc" },
      }),
    ["cached-ifms-timeseries", tenantId, financialYearId],
    {
      revalidate: 120,
      tags: [
        tenantTag(FINANCIAL_CACHE_TAGS.ifmsTimeseries, tenantId),
        tenantTag(FINANCIAL_CACHE_TAGS.financialYear, tenantId),
      ],
    },
  )();
}

/** Distinct finance summary head as-of dates for one FY (desc). */
export async function getCachedFinanceSummaryHeadDatesGroupBy(financialYearId: string) {
  const tenantId = requireTenantScope("getCachedFinanceSummaryHeadDatesGroupBy");
  return unstable_cache(
    async () =>
      prismaUnscoped.financeSummaryHead.groupBy({
        by: ["asOfDate"],
        where: { tenantId, financialYearId },
        orderBy: { asOfDate: "desc" },
      }),
    ["cached-snapshot-dates", tenantId, financialYearId],
    {
      revalidate: 120,
      tags: [
        tenantTag(FINANCIAL_CACHE_TAGS.snapshotDates, tenantId),
        tenantTag(FINANCIAL_CACHE_TAGS.financialYear, tenantId),
      ],
    },
  )();
}
