import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Scoped Prisma models — every read of these must go through lib/data-access/scope-where.ts
// (or an audited lib helper that composes a scope fragment). Raw prisma.<model>.findMany(...)
// outside the allowlist below is a structural bypass of the data-scoping layer.
const SCOPED_MODELS = [
  "scheme",
  "subscheme",
  "financeBudget",
  "financeBudgetSupplement",
  "financeExpenditureSnapshot",
  "kpiDefinition",
  "kpiTarget",
  "kpiMeasurement",
  "actionItem",
  "user",
];

// Read methods that return rows. Write methods (create/update/delete/upsert) are intentionally
// NOT restricted — the guard targets unscoped READs, the shape of the export bypass.
const READ_METHODS = ["findMany", "findFirst", "findUnique", "groupBy", "count", "aggregate"];

const scopedModelSelector = `CallExpression[callee.object.type="MemberExpression"][callee.object.object.type="Identifier"][callee.object.object.name=/^(prisma|tx)$/][callee.object.property.name=/^(${SCOPED_MODELS.join("|")})$/][callee.property.name=/^(${READ_METHODS.join("|")})$/]`;

// Files that are allowed to query scoped Prisma models directly.
// - lib/data-access/** : the approved scope-fragment module
// - lib/data-scope.ts : scope resolver
// - audited lib helpers that compose scope fragments into their queries
// - admin/auth/sync utilities that legitimately read scoped models outside the user-data path
//   (agent-runner is admin-only; server-rbac reads user by session; sync-scheme-fy-category-lines
//    and cached-financial-metadata are write/cache paths)
const SCOPED_READ_ALLOWLIST = [
  "lib/data-access/**",
  "lib/data-scope.ts",
  "lib/financial-budget-entries.ts",
  "lib/meeting-report.ts",
  "lib/pendance-report.ts",
  "lib/command-centre-dashboard.ts",
  "lib/assistant-query.ts",
  "lib/finance-summary-asof.ts",
  "lib/agent-runner.ts",
  "lib/server-rbac.ts",
  "lib/server-auth.ts",
  "lib/sync-scheme-fy-category-lines.ts",
  "lib/cached-financial-metadata.ts",
  "lib/scheme-dashboard-priority.ts",
  "lib/kpi-access.ts",
  // Edited routes that resolve scope and pass it through (audited in this fix)
  "app/api/v1/reports/**",
  "app/api/v1/assistant/query/route.ts",
  "app/api/v1/financial/summary/route.ts",
  "app/api/v1/financial/budgets/route.ts",
  "app/api/v1/schemes/route.ts",
  "app/api/v1/schemes/overview/route.ts",
  "app/api/v1/kpis/definitions/route.ts",
  "app/api/v1/action-items/route.ts",
  "app/api/v1/dashboard/command-centre/route.ts",
  // Seed / scripts / migrations are not request paths
  "prisma/**",
  "scripts/**",
  "tests/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Guard: scoped Prisma models must not be read directly outside the allowlist.
    // This is a tripwire, not a proof. See the summary for what it catches and misses.
    //
    // Coverage is deliberately limited to the high-risk read paths (lib helpers, the
    // assistant ancestor, and report/export routes) — the blast radius of the bug this
    // fix addresses. Detail / write / admin routes (e.g. /schemes/[id], /kpis/[id],
    // /action-items/[id], /financial/snapshots, /rbac/users, /admin/users) are NOT
    // covered: they look up a single resource by id after their own permission check
    // and are out of scope for this fix. Escalating coverage to those routes is a
    // follow-up task (recorded in the summary).
    files: ["lib/**/*.ts", "app/api/v1/assistant/**/*.ts", "app/api/v1/reports/**/*.ts"],
    ignores: SCOPED_READ_ALLOWLIST,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: scopedModelSelector,
          message:
            "Scoped Prisma model read detected outside the data-scoping layer. Resolve the caller's DataScope via resolveDataScope() and use a where-fragment from lib/data-access/scope-where.ts. See lib/data-scope.ts.",
        },
      ],
    },
  },
]);

export default eslintConfig;
