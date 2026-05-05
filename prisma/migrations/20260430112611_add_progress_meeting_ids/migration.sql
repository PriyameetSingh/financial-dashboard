-- AlterTable
ALTER TABLE "action_item_updates" ADD COLUMN     "meetingId" UUID;

-- AlterTable
ALTER TABLE "finance_expenditure_snapshots" ADD COLUMN     "meetingId" UUID;

-- AlterTable
ALTER TABLE "kpi_measurements" ADD COLUMN     "meetingId" UUID;

-- CreateIndex
CREATE INDEX "action_item_updates_meetingId_idx" ON "action_item_updates"("meetingId");

-- CreateIndex
CREATE INDEX "finance_expenditure_snapshots_meetingId_idx" ON "finance_expenditure_snapshots"("meetingId");

-- CreateIndex
CREATE INDEX "kpi_measurements_meetingId_idx" ON "kpi_measurements"("meetingId");

-- AddForeignKey
ALTER TABLE "finance_expenditure_snapshots" ADD CONSTRAINT "finance_expenditure_snapshots_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "dashboard_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "dashboard_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_updates" ADD CONSTRAINT "action_item_updates_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "dashboard_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
