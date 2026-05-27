-- CreateTable
CREATE TABLE "user_organisations" (
    "userId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,

    CONSTRAINT "user_organisations_pkey" PRIMARY KEY ("userId","organisationId")
);

-- AddForeignKey
ALTER TABLE "user_organisations" ADD CONSTRAINT "user_organisations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organisations" ADD CONSTRAINT "user_organisations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
