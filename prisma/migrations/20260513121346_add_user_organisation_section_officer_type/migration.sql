-- CreateEnum
CREATE TYPE "OfficerType" AS ENUM ('GOVERNMENT', 'PMU');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "officerType" "OfficerType",
ADD COLUMN     "organisation" TEXT,
ADD COLUMN     "section" TEXT;
