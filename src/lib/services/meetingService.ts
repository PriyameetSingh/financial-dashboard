import { withNextBasePath } from "@/lib/next-base-path";

const UPLOAD_REJECTED_413 =
  "Upload was rejected (HTTP 413). The app allows files up to 50 MB each; if your file is smaller than that, a reverse proxy (for example nginx) is likely blocking the request body—set client_max_body_size to at least 50M on the proxy that fronts this app.";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    
    // 413 is often nginx/client_max_body_size, not our 50 MB validation—message must not imply the file exceeds the app limit.
    if (response.status === 413) {
      throw new Error(UPLOAD_REJECTED_413);
    }
    
    throw new Error(payload?.detail ?? "Meeting request failed");
  }
  return response.json() as Promise<T>;
}

export type MeetingMaterialMeta = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type MeetingListItem = {
  id: string;
  meetingDate: string;
  title: string | null;
  notes: string | null;
  createdByName: string | null;
  topics: Array<{ id: string; topic: string }>;
  actionItems: Array<{ id: string; title: string; status: string }>;
  materials: MeetingMaterialMeta[];
};

export async function fetchMeetings(): Promise<MeetingListItem[]> {
  const response = await fetch(withNextBasePath("/api/v1/meetings"), { cache: "no-store" });
  const data = await parseResponse<{ meetings: MeetingListItem[] }>(response);
  return data.meetings;
}

export async function createMeeting(input: {
  meetingDate: string;
  title?: string | null;
  notes?: string | null;
  topics?: Array<{ topic: string }>;
  actionItemIds?: string[];
  financialYearId?: string | null;
}): Promise<{ id: string }> {
  const response = await fetch(withNextBasePath("/api/v1/meetings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<{ id: string }>(response);
}

export async function uploadMeetingMaterial(
  meetingId: string,
  file: File,
): Promise<{ material: MeetingMaterialMeta }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(withNextBasePath(`/api/v1/meetings/${meetingId}/materials`), {
    method: "POST",
    body: formData,
  });
  return parseResponse<{ material: MeetingMaterialMeta }>(response);
}

export async function getMeetingMaterialSignedUrl(
  meetingId: string,
  materialId: string,
): Promise<{
  url: string;
  expiresIn: number;
  fileName: string;
  mimeType: string | null;
}> {
  const response = await fetch(
    withNextBasePath(`/api/v1/meetings/${meetingId}/materials/${materialId}/signed-url`),
    { cache: "no-store" },
  );
  return parseResponse(response);
}

export async function updateMeeting(
  id: string,
  input: {
    meetingDate?: string;
    title?: string | null;
    notes?: string | null;
    topics?: string[];
  },
): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/meetings/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function addMeetingTopic(
  meetingId: string,
  topic: string,
): Promise<{ id: string; topic: string }> {
  const response = await fetch(withNextBasePath(`/api/v1/meetings/${meetingId}/topics`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  const data = await parseResponse<{ topic: { id: string; topic: string } }>(response);
  return data.topic;
}

export async function deleteMeetingMaterial(
  meetingId: string,
  materialId: string,
): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/meetings/${meetingId}/materials/${materialId}`), {
    method: "DELETE",
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/meetings/${meetingId}`), {
    method: "DELETE",
  });
  await parseResponse<{ ok: boolean }>(response);
}
