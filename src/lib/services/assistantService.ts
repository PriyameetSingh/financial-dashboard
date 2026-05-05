import type { AssistantMeetingContext } from "@/lib/assistant-types";
import { withNextBasePath } from "@/lib/next-base-path";

export async function postAssistantQuery(input: {
  query: string;
  meetingContext?: AssistantMeetingContext;
}): Promise<{ answer: string }> {
  const response = await fetch(withNextBasePath("/api/v1/assistant/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as { detail?: string; answer?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.detail ?? "Assistant request failed");
  }
  if (!payload?.answer) {
    throw new Error("Empty assistant response");
  }
  return { answer: payload.answer };
}
