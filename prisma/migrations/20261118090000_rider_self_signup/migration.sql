-- CreateEnum
CREATE TYPE "RiderKycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "aadhaarBackRef" TEXT,
ADD COLUMN     "aadhaarFrontRef" TEXT,
ADD COLUMN     "aadhaarLast4" TEXT,
ADD COLUMN     "aadhaarNumberEnc" TEXT,
ADD COLUMN     "kycNote" TEXT,
ADD COLUMN     "kycReviewedAt" TIMESTAMP(3),
ADD COLUMN     "kycReviewedById" TEXT,
ADD COLUMN     "kycStatus" "RiderKycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "licenseRef" TEXT,
ADD COLUMN     "rcRef" TEXT,
ADD COLUMN     "serviceAreaId" TEXT;

-- CreateIndex
CREATE INDEX "Rider_kycStatus_idx" ON "Rider"("kycStatus");

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_serviceAreaId_fkey" FOREIGN KEY ("serviceAreaId") REFERENCES "ServiceArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Riders added by a dealer or admin before self-signup existed are already trusted.
UPDATE "Rider" SET "kycStatus" = 'APPROVED', "kycReviewedAt" = now();
