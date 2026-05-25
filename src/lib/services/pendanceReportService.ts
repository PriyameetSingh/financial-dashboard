import type { PendanceReportPayload } from "@/lib/pendance-report";
import { withNextBasePath } from "@/lib/next-base-path";

export async function fetchPendanceReport(meetingId: string): Promise<PendanceReportPayload> {
  const url = withNextBasePath(`/api/v1/reports/pendance/${encodeURIComponent(meetingId)}`);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? `Failed to fetch report: ${res.status}`;
    throw new Error(detail);
  }
  return res.json();
}
