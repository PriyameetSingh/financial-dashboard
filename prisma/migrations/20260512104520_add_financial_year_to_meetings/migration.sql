-- AlterTable
ALTER TABLE "dashboard_meetings" ADD COLUMN     "financialYearId" UUID;

-- AddForeignKey
ALTER TABLE "dashboard_meetings" ADD CONSTRAINT "dashboard_meetings_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
