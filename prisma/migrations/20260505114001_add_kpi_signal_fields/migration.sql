-- CreateEnum
CREATE TYPE "KpiEscalationFlag" AS ENUM ('on_track', 'needs_coordination', 'needs_acs_decision');

-- AlterTable
ALTER TABLE "kpi_measurements" ADD COLUMN     "bottleneckReason" TEXT,
ADD COLUMN     "escalationFlag" "KpiEscalationFlag";
