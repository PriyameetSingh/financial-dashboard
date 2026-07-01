/*
  Warnings:

  - The primary key for the `action_item_performers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `kpi_definition_performers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `id` was added to the `action_item_performers` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `id` was added to the `kpi_definition_performers` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "action_item_performers" DROP CONSTRAINT "action_item_performers_pkey",
ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unassignedAt" TIMESTAMP(3),
ADD CONSTRAINT "action_item_performers_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "kpi_definition_performers" DROP CONSTRAINT "kpi_definition_performers_pkey",
ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unassignedAt" TIMESTAMP(3),
ADD CONSTRAINT "kpi_definition_performers_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "action_item_performers_actionItemId_isActive_idx" ON "action_item_performers"("actionItemId", "isActive");

-- CreateIndex
CREATE INDEX "kpi_definition_performers_kpiDefinitionId_isActive_idx" ON "kpi_definition_performers"("kpiDefinitionId", "isActive");
