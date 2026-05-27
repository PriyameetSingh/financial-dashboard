import { withNextBasePath } from "@/lib/next-base-path";
import { SchemeOverview, SchemeReferenceData, SchemeView, SponsorshipType } from "@/types";

type SchemeListResponse = {
  schemes: SchemeView[];
  reference: SchemeReferenceData;
};

type SchemeOverviewResponse = {
  financialYearLabel: string | null;
  schemes: SchemeOverview[];
  reference: SchemeReferenceData;
};

type SchemeResponse = {
  scheme: SchemeView;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to process scheme request");
  }
  return response.json() as Promise<T>;
}

export async function fetchSchemesAdmin(): Promise<SchemeListResponse> {
  const response = await fetch(withNextBasePath("/api/v1/schemes"), { cache: "no-store" });
  return parseResponse<SchemeListResponse>(response);
}

export async function fetchSchemesOverview(): Promise<SchemeOverviewResponse> {
  const response = await fetch(withNextBasePath("/api/v1/schemes/overview"), { cache: "no-store" });
  return parseResponse<SchemeOverviewResponse>(response);
}

export async function createScheme(input: {
  code: string;
  name: string;
  verticalName: string;
  sponsorshipType: SponsorshipType;
  subschemes?: Array<{ code: string; name: string }>;
  assignments?: Array<{
    assignmentKind: "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";
    sortOrder?: number;
    subschemeId?: string | null;
    userId?: string | null;
    roleId?: string | null;
  }>;
}): Promise<SchemeView> {
  const response = await fetch(withNextBasePath("/api/v1/schemes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseResponse<SchemeResponse>(response);
  return data.scheme;
}

export async function updateScheme(id: string, input: {
  code?: string;
  name?: string;
  verticalName?: string;
  sponsorshipType?: SponsorshipType;
  assignments?: Array<{
    assignmentKind: "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";
    sortOrder?: number;
    subschemeId?: string | null;
    userId?: string | null;
    roleId?: string | null;
  }>;
}): Promise<SchemeView> {
  const response = await fetch(withNextBasePath(`/api/v1/schemes/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseResponse<SchemeResponse>(response);
  return data.scheme;
}

export async function archiveScheme(id: string): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/schemes/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function deleteScheme(id: string): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/schemes/${id}`), { method: "DELETE" });
  await parseResponse<{ ok: boolean }>(response);
}

export async function addSubscheme(schemeId: string, input: { code: string; name: string }): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/schemes/${schemeId}/subschemes`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ subscheme?: unknown }>(response);
}

export type SchemeModalPayload = {
  scheme: { id: string; code: string; name: string; verticalName: string };
  financialYearLabel: string | null;
  expenditure: {
    financialYearLabel: string | null;
    annualBudgetCr: number;
    soExpenditureCr: number;
    ifmsExpenditureCr: number;
    asOfDate: string | null;
  } | null;
  ifmsTimeseries: Array<{ asOfDate: string; ifmsCr: number; utilisationPct: number | null }>;
  subschemeFinancial: Array<{
    id: string;
    code: string;
    name: string;
    budgetCr: number;
    ifmsCr: number;
    utilisationPct: number | null;
    asOfDate: string | null;
  }>;
  kpi: {
    rows: Array<{
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
    }>;
    progressCounts: { on_track: number; delayed: number; overdue: number };
    weeklyConsolidated: Array<{ weekStart: string; avgAchievementPct: number | null }>;
    weeklyBySubscheme: Array<{
      subschemeId: string | null;
      subschemeCode: string | null;
      subschemeName: string;
      series: Array<{ weekStart: string; avgAchievementPct: number | null }>;
    }>;
  };
  updates: Array<{ at: string; kind: "kpi" | "financial"; title: string; detail: string | null }>;
};

export async function fetchSchemeModalData(schemeId: string): Promise<SchemeModalPayload> {
  const response = await fetch(withNextBasePath(`/api/v1/schemes/${schemeId}/scheme-modal`), {
    cache: "no-store",
  });
  return parseResponse<SchemeModalPayload>(response);
}
