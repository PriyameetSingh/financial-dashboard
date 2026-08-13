-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');

-- AlterTable
ALTER TABLE "action_item_performers" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "action_item_proofs" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "action_item_reviewers" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "action_item_updates" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "action_items" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "agent_configs" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "agent_insights" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "dashboard_meetings" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_budget_revisions" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_budget_supplements" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_budgets" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_expenditure_snapshots" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_summary_heads" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_year_budget_allocations" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "finance_year_budget_category_lines" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "financial_years" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "kpi_definition_performers" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "kpi_definition_reviewers" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "kpi_definitions" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "kpi_measurements" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "kpi_targets" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "meeting_materials" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "meeting_topics" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "notification_dispatches" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "role_permissions" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "scheme_assignments" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "scheme_workflow_configs" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "schemes" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "subschemes" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "system_notification_configs" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "ulbs" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_notification_preferences" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_organisations" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_permission_overrides" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_sections" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "user_seen_releases" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" UUID;

-- AlterTable
ALTER TABLE "verticals" ADD COLUMN     "tenantId" UUID;

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_config_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_config_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_config_entries_tenantId_key_key" ON "tenant_config_entries"("tenantId", "key");

-- CreateIndex
CREATE INDEX "action_item_performers_tenantId_idx" ON "action_item_performers"("tenantId");

-- CreateIndex
CREATE INDEX "action_item_proofs_tenantId_idx" ON "action_item_proofs"("tenantId");

-- CreateIndex
CREATE INDEX "action_item_reviewers_tenantId_idx" ON "action_item_reviewers"("tenantId");

-- CreateIndex
CREATE INDEX "action_item_updates_tenantId_idx" ON "action_item_updates"("tenantId");

-- CreateIndex
CREATE INDEX "action_items_tenantId_idx" ON "action_items"("tenantId");

-- CreateIndex
CREATE INDEX "agent_configs_tenantId_idx" ON "agent_configs"("tenantId");

-- CreateIndex
CREATE INDEX "agent_insights_tenantId_idx" ON "agent_insights"("tenantId");

-- CreateIndex
CREATE INDEX "audit_log_tenantId_idx" ON "audit_log"("tenantId");

-- CreateIndex
CREATE INDEX "dashboard_meetings_tenantId_idx" ON "dashboard_meetings"("tenantId");

-- CreateIndex
CREATE INDEX "designations_tenantId_idx" ON "designations"("tenantId");

-- CreateIndex
CREATE INDEX "files_tenantId_idx" ON "files"("tenantId");

-- CreateIndex
CREATE INDEX "finance_budget_revisions_tenantId_idx" ON "finance_budget_revisions"("tenantId");

-- CreateIndex
CREATE INDEX "finance_budget_supplements_tenantId_idx" ON "finance_budget_supplements"("tenantId");

-- CreateIndex
CREATE INDEX "finance_budgets_tenantId_idx" ON "finance_budgets"("tenantId");

-- CreateIndex
CREATE INDEX "finance_expenditure_snapshots_tenantId_idx" ON "finance_expenditure_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "finance_summary_heads_tenantId_idx" ON "finance_summary_heads"("tenantId");

-- CreateIndex
CREATE INDEX "finance_year_budget_allocations_tenantId_idx" ON "finance_year_budget_allocations"("tenantId");

-- CreateIndex
CREATE INDEX "finance_year_budget_category_lines_tenantId_idx" ON "finance_year_budget_category_lines"("tenantId");

-- CreateIndex
CREATE INDEX "financial_years_tenantId_idx" ON "financial_years"("tenantId");

-- CreateIndex
CREATE INDEX "kpi_definition_performers_tenantId_idx" ON "kpi_definition_performers"("tenantId");

-- CreateIndex
CREATE INDEX "kpi_definition_reviewers_tenantId_idx" ON "kpi_definition_reviewers"("tenantId");

-- CreateIndex
CREATE INDEX "kpi_definitions_tenantId_idx" ON "kpi_definitions"("tenantId");

-- CreateIndex
CREATE INDEX "kpi_measurements_tenantId_idx" ON "kpi_measurements"("tenantId");

-- CreateIndex
CREATE INDEX "kpi_targets_tenantId_idx" ON "kpi_targets"("tenantId");

-- CreateIndex
CREATE INDEX "meeting_materials_tenantId_idx" ON "meeting_materials"("tenantId");

-- CreateIndex
CREATE INDEX "meeting_topics_tenantId_idx" ON "meeting_topics"("tenantId");

-- CreateIndex
CREATE INDEX "notification_dispatches_tenantId_idx" ON "notification_dispatches"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "organisations_tenantId_idx" ON "organisations"("tenantId");

-- CreateIndex
CREATE INDEX "role_permissions_tenantId_idx" ON "role_permissions"("tenantId");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE INDEX "scheme_assignments_tenantId_idx" ON "scheme_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "scheme_workflow_configs_tenantId_idx" ON "scheme_workflow_configs"("tenantId");

-- CreateIndex
CREATE INDEX "schemes_tenantId_idx" ON "schemes"("tenantId");

-- CreateIndex
CREATE INDEX "sections_tenantId_idx" ON "sections"("tenantId");

-- CreateIndex
CREATE INDEX "subschemes_tenantId_idx" ON "subschemes"("tenantId");

-- CreateIndex
CREATE INDEX "system_notification_configs_tenantId_idx" ON "system_notification_configs"("tenantId");

-- CreateIndex
CREATE INDEX "ulbs_tenantId_idx" ON "ulbs"("tenantId");

-- CreateIndex
CREATE INDEX "user_notification_preferences_tenantId_idx" ON "user_notification_preferences"("tenantId");

-- CreateIndex
CREATE INDEX "user_organisations_tenantId_idx" ON "user_organisations"("tenantId");

-- CreateIndex
CREATE INDEX "user_permission_overrides_tenantId_idx" ON "user_permission_overrides"("tenantId");

-- CreateIndex
CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");

-- CreateIndex
CREATE INDEX "user_sections_tenantId_idx" ON "user_sections"("tenantId");

-- CreateIndex
CREATE INDEX "user_seen_releases_tenantId_idx" ON "user_seen_releases"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "verticals_tenantId_idx" ON "verticals"("tenantId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verticals" ADD CONSTRAINT "verticals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ulbs" ADD CONSTRAINT "ulbs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sections" ADD CONSTRAINT "user_sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organisations" ADD CONSTRAINT "user_organisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subschemes" ADD CONSTRAINT "subschemes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_assignments" ADD CONSTRAINT "scheme_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_workflow_configs" ADD CONSTRAINT "scheme_workflow_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_revisions" ADD CONSTRAINT "finance_budget_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_expenditure_snapshots" ADD CONSTRAINT "finance_expenditure_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_summary_heads" ADD CONSTRAINT "finance_summary_heads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definition_performers" ADD CONSTRAINT "kpi_definition_performers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definition_reviewers" ADD CONSTRAINT "kpi_definition_reviewers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_meetings" ADD CONSTRAINT "dashboard_meetings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_topics" ADD CONSTRAINT "meeting_topics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_materials" ADD CONSTRAINT "meeting_materials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_performers" ADD CONSTRAINT "action_item_performers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_reviewers" ADD CONSTRAINT "action_item_reviewers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_updates" ADD CONSTRAINT "action_item_updates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_proofs" ADD CONSTRAINT "action_item_proofs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_supplements" ADD CONSTRAINT "finance_budget_supplements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_year_budget_allocations" ADD CONSTRAINT "finance_year_budget_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_year_budget_category_lines" ADD CONSTRAINT "finance_year_budget_category_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_seen_releases" ADD CONSTRAINT "user_seen_releases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_notification_configs" ADD CONSTRAINT "system_notification_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_config_entries" ADD CONSTRAINT "tenant_config_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
