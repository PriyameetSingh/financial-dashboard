-- Migration: create reference tables for sections, organisations, designations, ulbs and join table user_sections
BEGIN;

-- CreateTable sections
CREATE TABLE "sections" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sections_name_key" ON "sections"("name");

-- CreateTable organisations
CREATE TABLE "organisations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisations_name_key" ON "organisations"("name");

-- CreateTable designations
CREATE TABLE "designations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "designations_name_key" ON "designations"("name");

-- CreateTable ulbs
CREATE TABLE "ulbs" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ulbs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ulbs_name_key" ON "ulbs"("name");

-- Create join table user_sections
CREATE TABLE "user_sections" (
  "userId" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  CONSTRAINT "user_sections_pkey" PRIMARY KEY ("userId","sectionId")
);

-- Foreign keys
ALTER TABLE "user_sections" ADD CONSTRAINT "user_sections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_sections" ADD CONSTRAINT "user_sections_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

