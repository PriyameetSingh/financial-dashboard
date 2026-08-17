-- AlterTable
ALTER TABLE "schemes" ADD COLUMN     "verticalId" UUID;

-- CreateTable
CREATE TABLE "user_verticals" (
    "userId" UUID NOT NULL,
    "verticalId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "user_verticals_pkey" PRIMARY KEY ("userId","verticalId")
);

-- CreateIndex
CREATE INDEX "user_verticals_tenantId_idx" ON "user_verticals"("tenantId");

-- AddForeignKey
ALTER TABLE "user_verticals" ADD CONSTRAINT "user_verticals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verticals" ADD CONSTRAINT "user_verticals_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "verticals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verticals" ADD CONSTRAINT "user_verticals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_verticalId_fkey" FOREIGN KEY ("verticalId") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: schemes.verticalName (free text) → schemes.verticalId (relation).
--
-- Matched per TENANT, on exact name. Verticals are tenant-scoped, so a global
-- name match could point a scheme at another tenant's vertical row — the one
-- mistake this migration must never make.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "schemes" s
SET "verticalId" = v."id"
FROM "verticals" v
WHERE v."tenantId" = s."tenantId"
  AND v."name" = s."verticalName"
  AND s."verticalId" IS NULL;

-- FAIL LOUD. A scheme whose vertical text matches no vertical row is a fact
-- about the data that a migration must not paper over: silently leaving NULL
-- would make that scheme invisible to every SAME_VERTICAL role, which reads as
-- a permissions bug months later and is nearly impossible to trace back here.
--
-- So abort, and name the offenders. The operator fixes the data — creates the
-- missing vertical, or corrects the scheme's spelling — and re-runs. This
-- deliberately blocks deployment: an unmatched vertical is a data problem to
-- resolve, not a warning to scroll past.
DO $$
DECLARE
  offenders TEXT;
  offender_count INT;
BEGIN
  SELECT COUNT(*), STRING_AGG(DISTINCT FORMAT('%s (tenant %s)', s."verticalName", s."tenantId"), '; ')
    INTO offender_count, offenders
  FROM "schemes" s
  WHERE s."verticalId" IS NULL;

  IF offender_count > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill schemes.verticalId: % scheme(s) name a vertical with no matching row. Unmatched: %. Create the missing vertical(s) or correct the scheme name, then re-run this migration.',
      offender_count, offenders;
  END IF;
END $$;
