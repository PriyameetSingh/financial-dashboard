-- Phase 3 — `reportFilenamePrefix` config key. ADDITIVE, behaviour-preserving.
--
-- Report filenames were hardcoded `HUDD-…` (backlog D1-D3), so every tenant's
-- downloads carried Odisha's brand. The routes now read this key, which means
-- Odisha needs the row its own brand implies. The value is exactly the literal
-- the code used before, so Odisha's filenames are byte-identical.
--
-- Seeded for the Odisha tenant specifically, mirroring
-- 20260813084800_phase2_odisha_backfill: "HUDD" is Odisha's brand, not a
-- universal default. Other tenants set their own through the config admin API
-- (and the demo tenant's seed sets "RIVERTOWN").
INSERT INTO "tenant_config_entries" ("id", "tenantId", "key", "value", "updatedAt")
VALUES (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  'reportFilenamePrefix',
  '"HUDD"'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("tenantId", "key") DO NOTHING;
