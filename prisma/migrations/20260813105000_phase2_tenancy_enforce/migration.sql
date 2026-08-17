-- Phase 2, Gate D (M3): enforce tenancy invariants after the Gate B backfill
-- was verified complete (zero NULL tenantId on every tenant-scoped table) and
-- the query chokepoint + cross-tenant isolation tests were green.
--
--   1. tenantId -> NOT NULL on all 46 tenant-scoped tables. A write that
--      bypasses the chokepoint (e.g. a nested create) now fails loudly at the
--      database instead of silently landing tenant-less.
--   2. The 11 single-column uniques that were really "unique per tenant"
--      become composite [tenantId, ...], so a second tenant can onboard with
--      its own scheme codes / emails / FY labels without colliding, and
--      uniqueness can no longer silently span tenants.
--
-- Forward-only and non-destructive: no table or column is dropped; the dropped
-- objects are the superseded single-column unique INDEXES, each immediately
-- replaced by its composite form below.

-- DropIndex
DROP INDEX "designations_name_key";

-- DropIndex
DROP INDEX "financial_years_label_key";

-- DropIndex
DROP INDEX "organisations_name_key";

-- DropIndex
DROP INDEX "roles_code_key";

-- DropIndex
DROP INDEX "schemes_code_key";

-- DropIndex
DROP INDEX "sections_name_key";

-- DropIndex
DROP INDEX "system_notification_configs_key_key";

-- DropIndex
DROP INDEX "ulbs_name_key";

-- DropIndex
DROP INDEX "users_code_key";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "verticals_code_key";

-- AlterTable
ALTER TABLE "action_item_performers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "action_item_proofs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "action_item_reviewers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "action_item_updates" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "action_items" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agent_configs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "agent_insights" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "dashboard_meetings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "designations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "files" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_budget_revisions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_budget_supplements" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_budgets" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_expenditure_snapshots" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_summary_heads" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_year_budget_allocations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "finance_year_budget_category_lines" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "financial_years" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "kpi_definition_performers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "kpi_definition_reviewers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "kpi_definitions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "kpi_measurements" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "kpi_targets" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "meeting_materials" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "meeting_topics" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notification_dispatches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "organisations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "role_permissions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "scheme_assignments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "scheme_workflow_configs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "schemes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "sections" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "subschemes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "system_notification_configs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ulbs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_notification_preferences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_organisations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_permission_overrides" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_roles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_sections" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_seen_releases" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "verticals" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenantId_name_key" ON "designations"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "financial_years_tenantId_label_key" ON "financial_years"("tenantId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_tenantId_name_key" ON "organisations"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_code_key" ON "roles"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "schemes_tenantId_code_key" ON "schemes"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sections_tenantId_name_key" ON "sections"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "system_notification_configs_tenantId_key_key" ON "system_notification_configs"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ulbs_tenantId_name_key" ON "ulbs"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_code_key" ON "users"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "verticals_tenantId_code_key" ON "verticals"("tenantId", "code");

