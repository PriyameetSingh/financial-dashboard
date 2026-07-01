import { withNextBasePath } from "@/lib/next-base-path";
import { ActionItem } from "@/types";

type ActionItemsResponse = {
  items: ActionItem[];
  /** Server-side cap when `?limit=` omitted (default 1000, max 2000). */
  limit?: number;
};

type ActionItemResponse = {
  item: ActionItem;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to load action items");
  }
  return response.json() as Promise<T>;
}

export async function fetchActionItems(archived?: boolean): Promise<ActionItem[]> {
  const url = withNextBasePath(`/api/v1/action-items${archived ? "?archived=true" : ""}`);
  const response = await fetch(url, { cache: "no-store" });
  const data = await parseResponse<ActionItemsResponse>(response);
  return data.items;
}

export async function getActionItemById(id: string): Promise<ActionItem | undefined> {
  const response = await fetch(withNextBasePath(`/api/v1/action-items/${id}`), { cache: "no-store" });
  if (response.status === 404) return undefined;
  const data = await parseResponse<ActionItemResponse>(response);
  return data.item;
}

export async function updateActionItem(
  id: string,
  input: {
    status?: ActionItem["status"];
    note?: string;
    /** Required when `note` is set — dashboard meeting this progress is attributed to. */
    meetingId?: string;
    reviewerDecision?: "approve" | "reject";
    rejectionReason?: string;
    performerUserCodes?: string[];
    reviewerUserCodes?: string[];
    assignedToUserCode?: string;
    reviewerUserCode?: string;
    /** ISO date string (YYYY-MM-DD) to update the due date. */
    dueDate?: string;
    /** ID of an existing update entry whose note text should be edited. */
    updateId?: string;
    /** Replacement note text for the update identified by `updateId`. */
    updateNote?: string;
    title?: string;
    description?: string;
    priority?: string;
    archived?: boolean;
    isSelfApproved?: boolean;
  },
): Promise<ActionItem> {
  const response = await fetch(withNextBasePath(`/api/v1/action-items/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseResponse<{ item: ActionItem }>(response);
  return data.item;
}

export async function createActionItem(input: {
  meetingId?: string | null;
  schemeCode?: string | null;
  subschemeCode?: string | null;
  title: string;
  description: string;
  priority: ActionItem["priority"];
  dueDate: string;
  performerUserCodes: string[];
  reviewerUserCodes: string[];
  isSelfApproved?: boolean;
}): Promise<{ id: string }> {
  const response = await fetch(withNextBasePath("/api/v1/action-items"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<{ id: string }>(response);
}

export async function addActionItemProof(id: string, input: {
  name: string;
  url: string;
}): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/action-items/${id}/proofs`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function deleteActionItem(id: string): Promise<void> {
  const response = await fetch(withNextBasePath(`/api/v1/action-items/${id}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to delete action item");
  }
}
