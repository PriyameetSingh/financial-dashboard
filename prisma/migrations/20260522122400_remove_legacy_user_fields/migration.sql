-- Migration: remove legacy user string fields (designation, organisation, section)
BEGIN;
ALTER TABLE public."users" DROP COLUMN IF EXISTS "designation";
ALTER TABLE public."users" DROP COLUMN IF EXISTS "organisation";
ALTER TABLE public."users" DROP COLUMN IF EXISTS "section";
COMMIT;

