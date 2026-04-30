import { KPISubmission } from "@/types";

export type KpiMeasurementHistory = {
  id: string;
  financialYear: string;
  measuredAt: string;
  numeratorValue: number | null;
  yesValue: boolean | null;
  denominatorValue: number | null;
  workflowStatus: "draft" | "submitted_pending" | "approved" | "rejected";
  remarks: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type KpiHistoryResponse = {
  kpi: {
    id: string;
    description: string;
    type: string;
    category: string;
    unit: string;
    scheme: string;
    vertical: string;
  };
  measurements: KpiMeasurementHistory[];
};

type KPIResponse = {
  financialYearLabel: string | null;
  submissions: KPISubmission[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to load KPI data");
  }
  return response.json() as Promise<T>;
}

export async function fetchKPISubmissions(): Promise<{ submissions: KPISubmission[]; financialYearLabel: string | null }> {
  const response = await fetch("/api/v1/kpis/definitions", { cache: "no-store" });
  return parseResponse<KPIResponse>(response);
}

export async function fetchKPISubmissionsList(): Promise<KPISubmission[]> {
  const data = await fetchKPISubmissions();
  return data.submissions;
}

export async function getKPISubmissionById(id: string): Promise<KPISubmission | undefined> {
  const { submissions } = await fetchKPISubmissions();
  return submissions.find((submission) => submission.id === id);
}

export async function submitKPIMeasurement(input: {
  kpiDefinitionId: string;
  financialYearLabel: string;
  measuredAt: string;
  numeratorValue?: number | null;
  yesValue?: boolean | null;
  denominatorValue?: number | null;
  remarks?: string;
  workflowStatus?: "draft" | "submitted";
}): Promise<void> {
  const response = await fetch("/api/v1/kpis/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function reviewKpiMeasurement(
  measurementId: string,
  input: { decision: "approve" | "reject"; note?: string },
): Promise<void> {
  const response = await fetch(`/api/v1/kpis/measurements/${measurementId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function setKpiTargetDenominator(targetId: string, denominatorValue: number): Promise<void> {
  const response = await fetch(`/api/v1/kpis/targets/${targetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ denominatorValue }),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function fetchKpiHistory(kpiDefinitionId: string): Promise<KpiHistoryResponse> {
  const response = await fetch(`/api/v1/kpis/definitions/${kpiDefinitionId}/history`, { cache: "no-store" });
  return parseResponse<KpiHistoryResponse>(response);
}

export async function updateKpiDefinitionAssignments(
  kpiDefinitionId: string,
  input: { performerUserIds: string[]; reviewerUserIds: string[] },
): Promise<void> {
  const response = await fetch(`/api/v1/kpis/definitions/${kpiDefinitionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function createKpiDefinition(input: {
  schemeId: string;
  subschemeId?: string | null;
  category: "STATE" | "CENTRAL";
  description: string;
  kpiType: "OUTPUT" | "OUTCOME" | "BINARY";
  numeratorUnit?: string | null;
  denominatorUnit?: string | null;
  denominatorValue?: number | null;
  performerUserIds: string[];
  reviewerUserIds: string[];
}): Promise<void> {
  const response = await fetch("/api/v1/kpis/definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ definition?: unknown }>(response);
}
