import { redirect } from "next/navigation";
import DatabaseUnavailableShell from "@/components/DatabaseUnavailableShell";
import { asDatabaseUnavailableError } from "@/lib/db-errors";
import { AuthError, requireAnyPermission } from "@/lib/server-rbac";
import SchemesBoardClient from "./SchemesBoardClient";

export default async function SchemesBoardPage() {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    return <SchemesBoardClient />;
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/login");
    }
    if (asDatabaseUnavailableError(e)) {
      return (
        <DatabaseUnavailableShell title="Scheme utilisation board" heading="Financial data isn’t available" />
      );
    }
    throw e;
  }
}
