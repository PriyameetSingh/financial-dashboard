-- CreateTable
CREATE TABLE "onboarding_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tier" "ModuleTier" NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tokens_tokenHash_key" ON "onboarding_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "onboarding_tokens_expiresAt_idx" ON "onboarding_tokens"("expiresAt");
