-- CreateTable
CREATE TABLE "platform_operators" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_operators_userId_key" ON "platform_operators"("userId");
