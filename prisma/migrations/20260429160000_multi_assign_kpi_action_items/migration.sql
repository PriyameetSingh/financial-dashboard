-- Many-to-many performers and reviewers for KPI definitions and action items.

CREATE TABLE "kpi_definition_performers" (
    "kpiDefinitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "kpi_definition_performers_pkey" PRIMARY KEY ("kpiDefinitionId","userId")
);

CREATE TABLE "kpi_definition_reviewers" (
    "kpiDefinitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "kpi_definition_reviewers_pkey" PRIMARY KEY ("kpiDefinitionId","userId")
);

CREATE TABLE "action_item_performers" (
    "actionItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "action_item_performers_pkey" PRIMARY KEY ("actionItemId","userId")
);

CREATE TABLE "action_item_reviewers" (
    "actionItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "action_item_reviewers_pkey" PRIMARY KEY ("actionItemId","userId")
);

ALTER TABLE "kpi_definition_performers" ADD CONSTRAINT "kpi_definition_performers_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_definition_performers" ADD CONSTRAINT "kpi_definition_performers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kpi_definition_reviewers" ADD CONSTRAINT "kpi_definition_reviewers_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_definition_reviewers" ADD CONSTRAINT "kpi_definition_reviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_item_performers" ADD CONSTRAINT "action_item_performers_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_item_performers" ADD CONSTRAINT "action_item_performers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_item_reviewers" ADD CONSTRAINT "action_item_reviewers_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_item_reviewers" ADD CONSTRAINT "action_item_reviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "kpi_definition_performers" ("kpiDefinitionId", "userId", "sortOrder")
SELECT "id", "assignedToId", 0 FROM "kpi_definitions" WHERE "assignedToId" IS NOT NULL;

INSERT INTO "kpi_definition_reviewers" ("kpiDefinitionId", "userId", "sortOrder")
SELECT "id", "reviewerId", 0 FROM "kpi_definitions" WHERE "reviewerId" IS NOT NULL;

INSERT INTO "action_item_performers" ("actionItemId", "userId", "sortOrder")
SELECT "id", "assignedToId", 0 FROM "action_items" WHERE "assignedToId" IS NOT NULL;

INSERT INTO "action_item_reviewers" ("actionItemId", "userId", "sortOrder")
SELECT "id", "reviewerId", 0 FROM "action_items" WHERE "reviewerId" IS NOT NULL;

ALTER TABLE "kpi_definitions" DROP CONSTRAINT IF EXISTS "kpi_definitions_assignedToId_fkey";
ALTER TABLE "kpi_definitions" DROP CONSTRAINT IF EXISTS "kpi_definitions_reviewerId_fkey";

ALTER TABLE "action_items" DROP CONSTRAINT IF EXISTS "action_items_assignedToId_fkey";
ALTER TABLE "action_items" DROP CONSTRAINT IF EXISTS "action_items_reviewerId_fkey";

ALTER TABLE "kpi_definitions" DROP COLUMN IF EXISTS "assignedToId";
ALTER TABLE "kpi_definitions" DROP COLUMN IF EXISTS "reviewerId";

ALTER TABLE "action_items" DROP COLUMN IF EXISTS "assignedToId";
ALTER TABLE "action_items" DROP COLUMN IF EXISTS "reviewerId";
