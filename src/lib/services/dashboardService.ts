import type { CommandCentreDashboard } from "@/lib/command-centre-dashboard";
import { withNextBasePath } from "@/lib/next-base-path";

export async function fetchCommandCentreDashboard(meetingId?: string | null): Promise<CommandCentreDashboard> {
  const qs =
    meetingId && meetingId.length > 0
      ? `?meetingId=${encodeURIComponent(meetingId)}`
      : "";
  const res = await fetch(`${withNextBasePath("/api/v1/dashboard/command-centre")}${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `Dashboard failed (${res.status})`);
  }
  return res.json() as Promise<CommandCentreDashboard>;
}
