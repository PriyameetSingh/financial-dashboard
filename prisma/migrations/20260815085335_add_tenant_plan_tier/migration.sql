-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "planTier" "ModuleTier";

-- Backfill. Every existing tenant keeps at least what it already has: the
-- ceiling is set to the highest tier among the modules it is currently entitled
-- to, so no administrator loses access to something they are already using.
--
-- The ordering is the same ladder `tiersReachedBy()` uses in application code:
-- core < standard < premium < addon. A tenant with no enabled entitlements gets
-- `core`, which is the fail-closed direction and also the honest answer.
UPDATE "tenants" t
SET "planTier" = COALESCE(
  (
    SELECT m."tier"
    FROM "tenant_entitlements" te
    JOIN "modules" m ON m."id" = te."moduleId"
    WHERE te."tenantId" = t."id"
      AND te."enabled" = true
      AND m."tier" IS NOT NULL
    ORDER BY CASE m."tier"
      WHEN 'addon' THEN 4
      WHEN 'premium' THEN 3
      WHEN 'standard' THEN 2
      ELSE 1
    END DESC
    LIMIT 1
  ),
  'core'
)
WHERE t."planTier" IS NULL;
