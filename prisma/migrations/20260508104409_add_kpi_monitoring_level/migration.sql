-- CreateEnum
CREATE TYPE "KpiMonitoringLevel" AS ENUM ('CS', 'ACS', 'CM');

-- AlterTable
ALTER TABLE "kpi_definitions" ADD COLUMN     "monitoringLevel" "KpiMonitoringLevel";
