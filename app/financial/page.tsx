import { redirect } from "next/navigation";
import DatabaseUnavailableShell from "@/components/DatabaseUnavailableShell";
import { asDatabaseUnavailableError } from "@/lib/db-errors";
import {
  getFinancialBudgetEntriesOverview,
  getFinanceSummaryBreakdownForOverview,
} from "@/lib/financial-budget-entries";
import { AuthError, requireAnyPermissionAndDbUser } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";
import FinancialOverviewClient from "./FinancialOverviewClient";

export default async function FinancialOverviewPage() {
  try {
    const rbacUser = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(rbacUser);

    const budgetData = await getFinancialBudgetEntriesOverview(rbacUser, scope);

    const summary =
      budgetData.financialYearId && budgetData.financialYearLabel
        ? await getFinanceSummaryBreakdownForOverview(
            budgetData.entries,
            budgetData.financialYearId,
            budgetData.financialYearLabel,
          )
        : null;

    return (
      <FinancialOverviewClient
        entries={budgetData.entries}
        financialYearLabel={budgetData.financialYearLabel}
        summary={summary}
      />
    );
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/login");
    }
    if (asDatabaseUnavailableError(e)) {
      return (
        <DatabaseUnavailableShell
          title="Financial Overview"
          heading="Financial data isn’t available"
        />
      );
    }
    throw e;
  }
}
