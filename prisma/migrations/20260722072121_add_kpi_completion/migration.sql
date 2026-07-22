-- CreateEnum
CREATE TYPE "KpiCompletionStatus" AS ENUM ('pending_review', 'completed', 'rejected');

-- AlterTable
ALTER TABLE "kpi_definitions" ADD COLUMN     "completionNote" TEXT,
ADD COLUMN     "completionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "completionRequestedById" UUID,
ADD COLUMN     "completionReviewNote" TEXT,
ADD COLUMN     "completionReviewedAt" TIMESTAMP(3),
ADD COLUMN     "completionReviewedById" UUID,
ADD COLUMN     "completionStatus" "KpiCompletionStatus";

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_completionRequestedById_fkey" FOREIGN KEY ("completionRequestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_completionReviewedById_fkey" FOREIGN KEY ("completionReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
