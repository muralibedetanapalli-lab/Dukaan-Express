-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "riderComment" TEXT,
ADD COLUMN     "riderId" TEXT,
ADD COLUMN     "riderRating" INTEGER;

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Review_riderId_createdAt_idx" ON "Review"("riderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

