/**
 * Clears scheme, budget, KPI, meeting, and action-item data while keeping:
 *   users, verticals, financial_years
 *
 * With `--reset-rbac` (or RESET_RBAC=1), also truncates:
 *   user_roles, user_permission_overrides, role_permissions, roles, permissions
 * so you can re-run `node prisma/seed_roles.js` for a clean RBAC baseline.
 *
 * Run:
 *   npx tsx prisma/clear_mock_data.ts --yes
 *   npx tsx prisma/clear_mock_data.ts --yes --reset-rbac
 *
 * Or set CLEAR_DB_YES=1 to skip the confirmation prompt (e.g. in CI).
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();

/** Physical table names (@@map) — order does not matter when using CASCADE. */
const TABLES_APP_DATA = [
  "audit_log",
  "action_item_proofs",
  "files",
  "action_item_updates",
  "action_items",
  "meeting_materials",
  "meeting_topics",
  "dashboard_meetings",
  "kpi_measurements",
  "kpi_targets",
  "kpi_definitions",
  "finance_budget_revisions",
  "finance_budgets",
  "finance_expenditure_snapshots",
  "finance_summary_heads",
  "finance_budget_supplements",
  "finance_year_budget_category_lines",
  "finance_year_budget_allocations",
  "scheme_workflow_configs",
  "scheme_assignments",
  "subschemes",
  "schemes",
] as const;

const TABLES_RBAC_RESET = [
  "user_roles",
  "user_permission_overrides",
  "role_permissions",
  "roles",
  "permissions",
] as const;

async function main() {
  const resetRbac =
    process.argv.includes("--reset-rbac") || process.env.RESET_RBAC === "1";

  const yes =
    process.argv.includes("--yes") ||
    process.argv.includes("-y") ||
    process.env.CLEAR_DB_YES === "1";

  if (!yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      'This will DELETE all scheme/budget/KPI/meeting/action data (users & reference rows stay). Type "yes" to continue: ',
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const tables = resetRbac
    ? [...TABLES_APP_DATA, ...TABLES_RBAC_RESET]
    : [...TABLES_APP_DATA];
  const quoted = tables.map((t) => `"${t}"`).join(", ");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );
  });

  const rbacNote = resetRbac
    ? " RBAC tables cleared — run `node prisma/seed_roles.js`."
    : " roles/permissions/user_roles preserved.";
  console.log(
    `Done. Truncated ${tables.length} tables (users, verticals, financial_years preserved).${rbacNote}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
