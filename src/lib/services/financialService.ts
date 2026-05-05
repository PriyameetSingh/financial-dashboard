import { withNextBasePath } from "@/lib/next-base-path";
import { FinanceSummaryRow, FinancialEntry, FinanceYearBudgetAllocationLineRow } from "@/types";

type FinancialEntriesResponse = {
  entries: FinancialEntry[];
  financialYearLabel: string | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to load financial data");
  }
  return response.json() as Promise<T>;
}

export async function fetchFinancialBudgets(): Promise<FinancialEntriesResponse> {
  const response = await fetch(withNextBasePath("/api/v1/financial/budgets"), { cache: "no-store" });
  return parseResponse<FinancialEntriesResponse>(response);
}

export async function getFinancialEntries(): Promise<FinancialEntry[]> {
  const data = await fetchFinancialBudgets();
  return data.entries;
}

export async function getFinancialEntryById(id: string): Promise<FinancialEntry | undefined> {
  const entries = await getFinancialEntries();
  return entries.find((entry) => entry.id === id);
}

export async function submitFinancialSnapshot(input: {
  schemeCode: string;
  subschemeCode?: string | null;
  asOfDate: string;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  remarks?: string;
  financialYearLabel?: string;
  workflowStatus: "draft" | "submitted";
  meetingId: string;
}): Promise<void> {
  const response = await fetch(withNextBasePath("/api/v1/financial/snapshots"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function fetchFinanceSummary(params?: { asOfDate?: string; financialYearLabel?: string }): Promise<{
  financialYearLabel: string | null;
  asOfDate: string | null;
  rows: FinanceSummaryRow[];
  totals: { budgetEstimateCr: number; soExpenditureCr: number; ifmsExpenditureCr: number };
}> {
  const search = new URLSearchParams();
  if (params?.asOfDate) search.set("asOfDate", params.asOfDate);
  if (params?.financialYearLabel) search.set("financialYearLabel", params.financialYearLabel);
  const q = search.toString();
  const response = await fetch(
    `${withNextBasePath("/api/v1/financial/summary")}${q ? `?${q}` : ""}`,
    { cache: "no-store" },
  );
  return parseResponse(response);
}

export async function fetchIfmsTimeseries(params?: { financialYearLabel?: string }): Promise<{
  financialYearLabel: string | null;
  points: { asOfDate: string; ifmsCr: number }[];
}> {
  const search = new URLSearchParams();
  if (params?.financialYearLabel) search.set("financialYearLabel", params.financialYearLabel);
  const q = search.toString();
  const response = await fetch(
    `${withNextBasePath("/api/v1/financial/ifms-timeseries")}${q ? `?${q}` : ""}`,
    { cache: "no-store" },
  );
  return parseResponse(response);
}

export async function patchFinancialBudget(input: {
  schemeCode: string;
  subschemeCode?: string | null;
  newBudgetCr: number;
  reason: string;
  financialYearLabel?: string;
}): Promise<void> {
  const response = await fetch(withNextBasePath("/api/v1/financial/budgets"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function saveFinanceSummary(input: {
  asOfDate: string;
  financialYearLabel?: string;
  rows: Array<{
    headCode: string;
    budgetEstimateCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
  }>;
}): Promise<void> {
  const response = await fetch(withNextBasePath("/api/v1/financial/summary"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function fetchFyBudgetAllocation(params?: { financialYearLabel?: string }): Promise<{
  financialYearLabel: string | null;
  allocationId: string | null;
  totalBudgetCr: number;
  lines: FinanceYearBudgetAllocationLineRow[];
  totals: { budgetEstimateCr: number; soExpenditureCr: number; ifmsExpenditureCr: number };
}> {
  const search = new URLSearchParams();
  if (params?.financialYearLabel) search.set("financialYearLabel", params.financialYearLabel);
  const q = search.toString();
  const response = await fetch(
    `${withNextBasePath("/api/v1/financial/fy-budget-allocation")}${q ? `?${q}` : ""}`,
    { cache: "no-store" },
  );
  return parseResponse(response);
}

export async function saveFyBudgetAllocation(input: {
  financialYearLabel?: string;
  /** Manual FY lines only; scheme buckets are recomputed on the server from scheme budgets and expenditure. */
  lines: Array<{
    category: FinanceYearBudgetAllocationLineRow["category"];
    budgetEstimateCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
  }>;
}): Promise<void> {
  const response = await fetch(withNextBasePath("/api/v1/financial/fy-budget-allocation"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

/** Response body from POST /api/v1/financial/supplements */
export type FinanceBudgetSupplementCreated = {
  id: string;
  schemeId: string;
  subschemeId: string | null;
  financialYearId: string;
  /** API may return a decimal string */
  amountCr: string | number;
  reason: string;
  referenceNo: string;
  createdById: string;
  createdAt: string;
};

export async function createFinanceBudgetSupplement(input: {
  schemeCode: string;
  subschemeCode?: string | null;
  financialYearLabel: string;
  amountCr: number;
  reason: string;
  referenceNo?: string;
}): Promise<FinanceBudgetSupplementCreated> {
  const response = await fetch(withNextBasePath("/api/v1/financial/supplements"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<FinanceBudgetSupplementCreated>(response);
}
