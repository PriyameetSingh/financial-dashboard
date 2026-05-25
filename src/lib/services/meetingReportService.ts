import type { MeetingReportPayload } from "@/lib/meeting-report";
import { withNextBasePath } from "@/lib/next-base-path";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Meeting report request failed");
  }
  return response.json() as Promise<T>;
}

export async function fetchMeetingReport(meetingId: string): Promise<MeetingReportPayload> {
  const response = await fetch(withNextBasePath(`/api/v1/reports/meeting/${encodeURIComponent(meetingId)}`), {
    cache: "no-store",
  });
  return parseResponse<MeetingReportPayload>(response);
}
