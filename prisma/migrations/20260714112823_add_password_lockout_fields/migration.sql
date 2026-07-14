-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangeFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordChangeLockedUntil" TIMESTAMP(3);
