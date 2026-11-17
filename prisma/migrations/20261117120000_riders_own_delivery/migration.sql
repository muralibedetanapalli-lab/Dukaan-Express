-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('OWN', 'RIDER');

-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('DELIVERY_EARNING', 'COD_COLLECTED', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'RIDER';

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_deliveryPartnerId_fkey";

-- DropIndex
DROP INDEX "Shipment_awbCode_key";

-- DropIndex
DROP INDEX "Shipment_channelOrderId_key";

-- DropIndex
DROP INDEX "Shipment_status_idx";

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "awbCode",
DROP COLUMN "channelOrderId",
DROP COLUMN "courierCompanyId",
DROP COLUMN "courierName",
DROP COLUMN "deliveryPartnerId",
DROP COLUMN "etd",
DROP COLUMN "freightCharge",
DROP COLUMN "labelUrl",
DROP COLUMN "manifestUrl",
DROP COLUMN "pickupScheduledAt",
DROP COLUMN "pickupToken",
DROP COLUMN "provider",
DROP COLUMN "riderName",
DROP COLUMN "riderPhone",
DROP COLUMN "shiprocketOrderId",
DROP COLUMN "shiprocketShipmentId",
DROP COLUMN "trackingUrl",
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "codAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "mode" "DeliveryMode" NOT NULL DEFAULT 'RIDER',
ADD COLUMN     "noRiderAlertedAt" TIMESTAMP(3),
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "riderFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "riderId" TEXT,
ADD COLUMN     "searchStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "pickupLocationName",
ADD COLUMN     "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'RIDER';

-- DropTable
DROP TABLE "DeliveryPartner";

-- CreateTable
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealerId" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderWalletEntry" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "withdrawalId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderWalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderWithdrawal" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DEALER_REVIEW',
    "bankSnapshot" JSONB,
    "dealerId" TEXT,
    "dealerReviewedAt" TIMESTAMP(3),
    "dealerReviewedById" TEXT,
    "dealerNote" TEXT,
    "reference" TEXT,
    "payoutMethod" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderBankAccount" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "upiId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rider_userId_key" ON "Rider"("userId");

-- CreateIndex
CREATE INDEX "Rider_isOnline_idx" ON "Rider"("isOnline");

-- CreateIndex
CREATE INDEX "Rider_dealerId_idx" ON "Rider"("dealerId");

-- CreateIndex
CREATE INDEX "RiderWalletEntry_riderId_createdAt_idx" ON "RiderWalletEntry"("riderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderWalletEntry_orderId_type_key" ON "RiderWalletEntry"("orderId", "type");

-- CreateIndex
CREATE INDEX "RiderWithdrawal_riderId_status_idx" ON "RiderWithdrawal"("riderId", "status");

-- CreateIndex
CREATE INDEX "RiderWithdrawal_dealerId_status_idx" ON "RiderWithdrawal"("dealerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RiderBankAccount_riderId_key" ON "RiderBankAccount"("riderId");

-- CreateIndex
CREATE INDEX "Shipment_status_riderId_idx" ON "Shipment"("status", "riderId");

-- CreateIndex
CREATE INDEX "Shipment_riderId_status_idx" ON "Shipment"("riderId", "status");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderWalletEntry" ADD CONSTRAINT "RiderWalletEntry_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderWithdrawal" ADD CONSTRAINT "RiderWithdrawal_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderBankAccount" ADD CONSTRAINT "RiderBankAccount_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: every delivery needs a 4-digit handover code; deliveries waiting for a courier now wait for a rider.
UPDATE "Shipment" SET "deliveryCode" = lpad(floor(random() * 10000)::int::text, 4, '0') WHERE "deliveryCode" = '';
UPDATE "Shipment" s SET "status" = 'CREATED', "searchStartedAt" = now()
  FROM "Order" o WHERE o.id = s."orderId" AND o.status = 'SHIPMENT_CREATED';
-- Riders earn the distance-based delivery fee (default ₹25 for the first 2 km + ₹5 per extra km).
UPDATE "Shipment" s SET "riderFee" = 2500 + 500 * GREATEST(0, CEIL(o."distanceKm")::int - 2)
  FROM "Order" o WHERE o.id = s."orderId" AND s."status" = 'CREATED' AND s."riderFee" = 0;
