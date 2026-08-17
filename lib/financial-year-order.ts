import type { Prisma } from "@prisma/client";

/**
 * The order that decides which financial year is "the current one".
 *
 * Every caller that resolves the current FY does it the same way: take the
 * financial year whose `endDate` is furthest in the future. That is correct
 * until two rows share an `endDate` — and they legitimately can, because a
 * label is only unique per tenant (`financial_years_tenantId_label_key`),
 * nothing constrains the dates. When the sort key ties, Postgres is free to
 * return either row, and it returns whichever the scan reaches first: physical
 * row order, i.e. insertion order, i.e. luck.
 *
 * That is a real hazard, not a test artifact. A tenant that carries both a
 * "2025-26" and a corrected re-entry of the same year gets a dashboard whose
 * totals change depending on which row a given query happened to reach — and
 * nothing in the product would explain why.
 *
 * `createdAt` breaks the tie in favour of the most recently entered row, which
 * is the one an officer just created and expects to see. `id` is the backstop:
 * it is unique, so the order is total and the same row wins every time, on
 * every replica, forever.
 *
 * Use this for BOTH single-row selection (`findFirst`) and list ordering
 * (`findMany`) so a list and the "current" row agree on which year leads.
 */
export const CURRENT_FINANCIAL_YEAR_ORDER: Prisma.FinancialYearOrderByWithRelationInput[] = [
  { endDate: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];
