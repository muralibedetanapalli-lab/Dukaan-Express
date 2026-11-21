-- Seller agreements signed by email OTP before a shop goes live.
CREATE TYPE "AgreementStatus" AS ENUM ('PENDING', 'ACCEPTED', 'VOID');

ALTER TABLE "Shop" ADD COLUMN "agreementAcceptedAt" TIMESTAMP(3);

-- Shops onboarded before agreements existed keep working: treat them as already signed.
UPDATE "Shop" SET "agreementAcceptedAt" = "createdAt";

CREATE TABLE "ShopAgreement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terms" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedName" TEXT,
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopAgreement_number_key" ON "ShopAgreement"("number");
CREATE UNIQUE INDEX "ShopAgreement_tokenHash_key" ON "ShopAgreement"("tokenHash");
CREATE INDEX "ShopAgreement_shopId_status_idx" ON "ShopAgreement"("shopId", "status");

ALTER TABLE "ShopAgreement" ADD CONSTRAINT "ShopAgreement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
