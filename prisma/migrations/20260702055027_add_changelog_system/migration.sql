-- CreateEnum
CREATE TYPE "ChangelogEntryType" AS ENUM ('NEW_FEATURE', 'FIX', 'IMPROVEMENT', 'BREAKING_CHANGE');

-- AlterTable
ALTER TABLE "action_item_performers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kpi_definition_performers" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changelog_entries" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "type" "ChangelogEntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changelog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_seen_releases" (
    "userId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_seen_releases_pkey" PRIMARY KEY ("userId","releaseId")
);

-- CreateIndex
CREATE UNIQUE INDEX "releases_version_key" ON "releases"("version");

-- AddForeignKey
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_seen_releases" ADD CONSTRAINT "user_seen_releases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_seen_releases" ADD CONSTRAINT "user_seen_releases_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
