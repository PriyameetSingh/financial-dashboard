-- Optional job title / post (distinct from app role).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "designation" TEXT;
