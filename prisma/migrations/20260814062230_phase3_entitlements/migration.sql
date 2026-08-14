-- Phase 3 — entitlements. ADDITIVE ONLY.
--
-- Two new tables and three new enums. Nothing existing is altered, dropped, or
-- made NOT NULL. Enforcement ships in the same commit, but this migration
-- backfills every existing tenant to all-on FIRST, so the observable behaviour
-- of a deployed system does not change: nobody loses a module on deploy.
--
-- NOTE: `prisma migrate dev` also wanted to emit 46 `ALTER TABLE … ALTER COLUMN
-- "tenantId" SET DEFAULT (current_setting('app.tenant_id', true))::uuid`
-- statements. Those were REMOVED deliberately. They are pre-existing drift
-- between schema.prisma (which declares the default) and every database (which
-- has never had it — no Phase 2 migration created it), they are unrelated to
-- entitlements, and per docs/PHASE2-TENANCY-PLAN.md §2 the standing hazard runs
-- in that direction: without the default, a write that bypasses the chokepoint
-- fails loudly on NOT NULL; with it, the same write becomes a silent-stamp path
-- the moment anything binds `app.tenant_id` (e.g. RLS). Reconciling that drift
-- is its own decision, not a side effect of this migration.

-- CreateEnum
CREATE TYPE "ModuleEnforcement" AS ENUM ('core', 'gated', 'roadmap');

-- CreateEnum
CREATE TYPE "ModuleTier" AS ENUM ('core', 'standard', 'premium', 'addon');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('active', 'deprecated', 'planned');

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enforcement" "ModuleEnforcement" NOT NULL DEFAULT 'gated',
    "tier" "ModuleTier",
    "status" "ModuleStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_entitlements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tier" "ModuleTier",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "tenant_entitlements_tenantId_idx" ON "tenant_entitlements"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_entitlements_moduleId_idx" ON "tenant_entitlements"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_entitlements_tenantId_moduleId_key" ON "tenant_entitlements"("tenantId", "moduleId");

-- AddForeignKey
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog seed — mirrors lib/entitlements/catalog.ts. Idempotent: re-running
-- refreshes the descriptive columns without disturbing ids or entitlement FKs.
-- tests/entitlements.test.ts asserts this table and that file never drift.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "modules" ("id", "code", "name", "enforcement", "tier", "status", "createdAt", "updatedAt")
VALUES
  -- Core — never gated.
  (gen_random_uuid(), 'MOD-AUTH',  'Auth/SSO',            'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-SHELL', 'Shell / UX',          'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-PROF',  'Profile',             'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-RBAC',  'RBAC',                'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-ADMIN', 'Administration',      'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-CC',    'Command Centre',      'core',    'core',     'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Gated — the enforced SKUs.
  (gen_random_uuid(), 'MOD-FIN',   'Financial Progress',  'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-SR',    'Scheme Registry',     'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-KPI',   'KPIs',                'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-MTG',   'Meeting Organizer',   'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-RPT',   'Reports',             'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-ACT',   'Decision Tracker',    'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-AI',    'AI Insights',         'gated',   'premium',  'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-NOTIF', 'Notification Engine', 'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-CHLOG', 'Changelog',           'gated',   'standard', 'active',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Roadmap — catalog vocabulary only. No routes map to these.
  (gen_random_uuid(), 'MOD-ANOM',  'Anomaly Detection',   'roadmap', NULL,       'planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-APR',   'Approval Workflows',  'roadmap', NULL,       'planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-LAPSE', 'Lapse Risk Alerts',   'roadmap', NULL,       'planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-SEC',   'Security',            'roadmap', NULL,       'planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOD-OPS',   'Operations',          'roadmap', NULL,       'planned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name"        = EXCLUDED."name",
    "enforcement" = EXCLUDED."enforcement",
    "tier"        = EXCLUDED."tier",
    "status"      = EXCLUDED."status",
    "updatedAt"   = CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill — BEHAVIOUR PRESERVING.
--
-- Every tenant that exists at migration time gets an enabled row for every
-- provisionable (non-roadmap) module. Written as a cross join rather than
-- hardcoding Odisha's UUID so it is correct for whatever set of tenants a given
-- database holds; on production that set is exactly Odisha (tenant #1).
--
-- Tenants created AFTER this migration get nothing here, and absence of a row
-- means not entitled — onboarding is responsible for writing them. That is the
-- correct failure direction: a new tenant sees core and nothing else, rather
-- than silently receiving the whole product.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "tenant_entitlements" ("id", "tenantId", "moduleId", "enabled", "tier", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", m."id", TRUE, m."tier", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN "modules" m
WHERE m."enforcement" <> 'roadmap'
ON CONFLICT ("tenantId", "moduleId") DO NOTHING;
