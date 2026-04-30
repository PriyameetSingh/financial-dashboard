import type { SessionUser } from "@/types";

type DirectoryUsersResponse = {
  users: SessionUser[];
};

export async function fetchDirectoryUsers(): Promise<SessionUser[]> {
  const res = await fetch("/api/v1/directory/users", { credentials: "include", cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as DirectoryUsersResponse;
  return Array.isArray(data.users) ? data.users : [];
}
