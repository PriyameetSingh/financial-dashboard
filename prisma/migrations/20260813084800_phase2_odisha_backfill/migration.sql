-- Phase 2, Gate B (M2): create the Odisha tenant and backfill tenantId on all
-- existing rows. Data-only, additive, idempotent (safe to re-run):
--   * tenant insert:  ON CONFLICT (slug) DO NOTHING
--   * backfills:      WHERE "tenantId" IS NULL
--   * config inserts: ON CONFLICT ("tenantId","key") DO NOTHING
-- 100% of pre-Phase-2 rows belong to the Odisha deployment, so the backfill is
-- a constant assignment; no join derivation is needed.
-- The fixed UUID below is the well-known Odisha tenant id (also exported from
-- lib/tenant-config at Gate C). NOT NULL enforcement is deliberately deferred
-- to a separate Gate D migration.

INSERT INTO "tenants" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'odisha',
  'Odisha',
  'active'::"TenantStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- ── Backfill: tenant-owned roots (16) ───────────────────────────────────────
UPDATE "users"                        SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "roles"                        SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "verticals"                    SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "sections"                     SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "organisations"                SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "designations"                 SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "ulbs"                         SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "financial_years"              SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "schemes"                      SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "dashboard_meetings"           SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "action_items"                 SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "files"                        SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "audit_log"                    SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "agent_configs"                SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "agent_insights"               SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "system_notification_configs"  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;

-- ── Backfill: children with denormalized tenantId (30) ──────────────────────
UPDATE "role_permissions"                    SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_roles"                          SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_permission_overrides"           SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_sections"                       SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_organisations"                  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "subschemes"                          SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "scheme_assignments"                  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "scheme_workflow_configs"             SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_budgets"                     SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_budget_revisions"            SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_expenditure_snapshots"       SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_summary_heads"               SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_budget_supplements"          SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_year_budget_allocations"     SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "finance_year_budget_category_lines"  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "kpi_definitions"                     SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "kpi_definition_performers"           SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "kpi_definition_reviewers"            SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "kpi_targets"                         SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "kpi_measurements"                    SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "meeting_topics"                      SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "meeting_materials"                   SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "action_item_performers"              SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "action_item_reviewers"               SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "action_item_updates"                 SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "action_item_proofs"                  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "notifications"                       SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "notification_dispatches"             SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_notification_preferences"       SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "user_seen_releases"                  SET "tenantId" = '00000000-0000-4000-8000-000000000001' WHERE "tenantId" IS NULL;

-- ── Odisha tenant config: DB rows mirror ODISHA_DEFAULTS (presentation keys).
-- basePath is build-bound and keycloak*/seedAdminEmail stay env-backed, so
-- they are deliberately NOT stored (see docs/PHASE2-TENANCY-PLAN.md §7b).
INSERT INTO "tenant_config_entries" ("id", "tenantId", "key", "value", "updatedAt")
VALUES
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'logoPublicPath', '"/Frame 1.svg"'::jsonb,          CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'timezone',       '"Asia/Kolkata"'::jsonb,          CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'locale',         '"en-IN"'::jsonb,                 CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'currencySymbol', '"₹"'::jsonb,                CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'currencyUnit',   '"Cr"'::jsonb,                    CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'pdfHeaderLine',  '"Government of Odisha"'::jsonb,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'productName',    '"HUDD Dashboard"'::jsonb,        CURRENT_TIMESTAMP),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'labels',         '{"soExpenditure":"SO","ifmsExpenditure":"IFMS"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("tenantId", "key") DO NOTHING;
