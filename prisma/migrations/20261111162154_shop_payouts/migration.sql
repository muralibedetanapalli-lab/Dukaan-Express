-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SettlementStatus" ADD VALUE 'REJECTED';
ALTER TYPE "SettlementStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "ShopSettlement" ADD COLUMN     "bankSnapshot" JSONB,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "proofUrl" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "requestedById" TEXT;

-- CreateTable
CREATE TABLE "ShopBankAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "upiId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopBankAccount_shopId_key" ON "ShopBankAccount"("shopId");

-- CreateIndex
CREATE INDEX "ShopSettlement_shopId_status_idx" ON "ShopSettlement"("shopId", "status");

-- AddForeignKey
ALTER TABLE "ShopBankAccount" ADD CONSTRAINT "ShopBankAccount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
