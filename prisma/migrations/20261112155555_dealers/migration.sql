-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE 'DEALER_REVIEW';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DEALER';

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "dealerAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dealerId" TEXT,
ADD COLUMN     "dealerPayoutId" TEXT;

-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "dealerId" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "dealerId" TEXT;

-- AlterTable
ALTER TABLE "ShopSettlement" ADD COLUMN     "dealerId" TEXT,
ADD COLUMN     "dealerNote" TEXT,
ADD COLUMN     "dealerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "dealerReviewedById" TEXT;

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commissionShareBps" INTEGER NOT NULL DEFAULT 2000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerPayout" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "bankSnapshot" JSONB,
    "reference" TEXT,
    "payoutMethod" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerBankAccount" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "upiId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_userId_key" ON "Dealer"("userId");

-- CreateIndex
CREATE INDEX "DealerPayout_dealerId_status_idx" ON "DealerPayout"("dealerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DealerBankAccount_dealerId_key" ON "DealerBankAccount"("dealerId");

-- CreateIndex
CREATE INDEX "Commission_dealerId_dealerPayoutId_idx" ON "Commission"("dealerId", "dealerPayoutId");

-- CreateIndex
CREATE INDEX "ServiceArea_dealerId_idx" ON "ServiceArea"("dealerId");

-- CreateIndex
CREATE INDEX "Shop_dealerId_idx" ON "Shop"("dealerId");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_dealerPayoutId_fkey" FOREIGN KEY ("dealerPayoutId") REFERENCES "DealerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPayout" ADD CONSTRAINT "DealerPayout_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerBankAccount" ADD CONSTRAINT "DealerBankAccount_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
