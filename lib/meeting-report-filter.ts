import type { MeetingReportPayload } from "./meeting-report";

export function filterMeetingReportPayload(
  payload: MeetingReportPayload,
  filters: {
    monitoringLevel?: string;
    priority?: string;
    status?: string;
  }
): MeetingReportPayload {
  let filteredKpiRows = payload.kpiRows;
  if (filters.monitoringLevel && filters.monitoringLevel !== "ALL") {
    filteredKpiRows = filteredKpiRows.filter(
      (k) => k.monitoringLevel === filters.monitoringLevel
    );
  }

  let filteredKeyDecisions = payload.keyDecisions;
  if (filters.priority && filters.priority !== "ALL") {
    filteredKeyDecisions = filteredKeyDecisions.filter(
      (d) => d.priority === filters.priority
    );
  }

  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "completed") {
      filteredKeyDecisions = filteredKeyDecisions.filter(
        (d) => d.statusLabel === "COMPLETED"
      );
    } else if (filters.status === "in-progress") {
      filteredKeyDecisions = filteredKeyDecisions.filter(
        (d) => d.statusLabel !== "COMPLETED"
      );
    }
  }

  // Re-index the filtered KPI rows
  const reindexedKpiRows = filteredKpiRows.map((k, index) => ({
    ...k,
    index: index + 1,
  }));

  return {
    ...payload,
    kpiRows: reindexedKpiRows,
    keyDecisions: filteredKeyDecisions,
  };
}
