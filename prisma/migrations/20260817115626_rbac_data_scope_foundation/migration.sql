-- CreateEnum
CREATE TYPE "DataScopePolicy" AS ENUM ('ALL', 'ASSIGNED', 'SAME_ULB', 'SAME_ORGANISATION', 'SAME_VERTICAL', 'SAME_SECTION');

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "group" TEXT,
ADD COLUMN     "owningModule" TEXT;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "dataScopePolicy" "DataScopePolicy" NOT NULL DEFAULT 'ASSIGNED',
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentRoleId" UUID;

-- CreateTable
CREATE TABLE "user_ulbs" (
    "userId" UUID NOT NULL,
    "ulbId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "user_ulbs_pkey" PRIMARY KEY ("userId","ulbId")
);

-- CreateIndex
CREATE INDEX "user_ulbs_tenantId_idx" ON "user_ulbs"("tenantId");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_parentRoleId_fkey" FOREIGN KEY ("parentRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ulbs" ADD CONSTRAINT "user_ulbs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ulbs" ADD CONSTRAINT "user_ulbs_ulbId_fkey" FOREIGN KEY ("ulbId") REFERENCES "ulbs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ulbs" ADD CONSTRAINT "user_ulbs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- DATA MIGRATION. The columns above are useless until they carry the facts the
-- product already enforces. Doing this in SQL rather than only in the seeds is
-- deliberate: a deployed database is not re-seeded, and a role left at the
-- DEFAULT 'ASSIGNED' would silently narrow an administrator who holds
-- VIEW_ALL_DATA today.
-- ─────────────────────────────────────────────────────────────────────────────

-- Record each role's EXISTING data scope in the new column, derived from the
-- view permission it already holds. This is the same rule lib/data-scope.ts
-- applies at request time — VIEW_ALL_DATA wins, otherwise assigned-only — so no
-- role's reach changes. Roles holding neither keep the narrow default; their
-- effective scope is empty today and stays empty.
UPDATE "roles" r
SET "dataScopePolicy" = 'ALL'
WHERE EXISTS (
  SELECT 1
  FROM "role_permissions" rp
  JOIN "permissions" p ON p."id" = rp."permissionId"
  WHERE rp."roleId" = r."id" AND p."code" = 'VIEW_ALL_DATA'
);

UPDATE "roles" r
SET "dataScopePolicy" = 'ASSIGNED'
WHERE r."dataScopePolicy" <> 'ALL'
  AND EXISTS (
    SELECT 1
    FROM "role_permissions" rp
    JOIN "permissions" p ON p."id" = rp."permissionId"
    WHERE rp."roleId" = r."id" AND p."code" = 'VIEW_ASSIGNED_DATA'
  );

-- Protect the roles the product ships with. The no-lockout guardrail refuses to
-- delete these or strip their administrative permissions. Matched by code, which
-- is the stable per-tenant key.
UPDATE "roles"
SET "isSystem" = true
WHERE "code" IN ('ACS', 'FA', 'TASU', 'NODAL_OFFICER', 'PROGRAMME_MANAGER', 'VERTICAL_HEAD');

-- Seed the ULB membership SET from the single FK each user carries today, so a
-- user who belongs to one ULB now holds a one-element set. `User.ulbId` stays as
-- the primary/home ULB the directory screens display — this adds reach, it does
-- not move the field.
INSERT INTO "user_ulbs" ("userId", "ulbId", "tenantId")
SELECT u."id", u."ulbId", u."tenantId"
FROM "users" u
WHERE u."ulbId" IS NOT NULL
ON CONFLICT ("userId", "ulbId") DO NOTHING;
