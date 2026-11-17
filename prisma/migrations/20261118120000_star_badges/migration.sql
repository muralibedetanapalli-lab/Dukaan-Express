-- CreateEnum
CREATE TYPE "BadgeKind" AS ENUM ('SHOP', 'RIDER');

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "kind" "BadgeKind" NOT NULL,
    "period" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "shopId" TEXT,
    "riderId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Badge_shopId_idx" ON "Badge"("shopId");

-- CreateIndex
CREATE INDEX "Badge_riderId_idx" ON "Badge"("riderId");

-- CreateIndex
CREATE INDEX "Badge_period_idx" ON "Badge"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_kind_period_categoryKey_key" ON "Badge"("kind", "period", "categoryKey");

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Riders added by a dealer before areas existed: put them in their dealer region (first, alphabetically).
UPDATE "Rider" r SET "serviceAreaId" = (
  SELECT sa.id FROM "ServiceArea" sa WHERE sa."dealerId" = r."dealerId" ORDER BY sa.city LIMIT 1
) WHERE r."serviceAreaId" IS NULL AND r."dealerId" IS NOT NULL;
