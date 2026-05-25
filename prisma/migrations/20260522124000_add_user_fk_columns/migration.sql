-- Migration: add designationId, organisationId, ulbId to users and foreign keys
BEGIN;

ALTER TABLE "users" ADD COLUMN "designationId" UUID;
ALTER TABLE "users" ADD COLUMN "organisationId" UUID;
ALTER TABLE "users" ADD COLUMN "ulbId" UUID;

ALTER TABLE "users" ADD CONSTRAINT "users_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_ulbId_fkey" FOREIGN KEY ("ulbId") REFERENCES "ulbs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

