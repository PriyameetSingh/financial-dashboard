-- DropIndex
DROP INDEX IF EXISTS "schemes_verticalId_idx";

-- AlterTable: add free-text vertical name, backfill from verticals, drop FK
ALTER TABLE "schemes" ADD COLUMN "verticalName" TEXT;

UPDATE "schemes" s
SET "verticalName" = v.name
FROM "verticals" v
WHERE s."verticalId" = v.id;

UPDATE "schemes"
SET "verticalName" = '—'
WHERE "verticalName" IS NULL OR TRIM("verticalName") = '';

ALTER TABLE "schemes" ALTER COLUMN "verticalName" SET NOT NULL;

ALTER TABLE "schemes" DROP CONSTRAINT "schemes_verticalId_fkey";

ALTER TABLE "schemes" DROP COLUMN "verticalId";
