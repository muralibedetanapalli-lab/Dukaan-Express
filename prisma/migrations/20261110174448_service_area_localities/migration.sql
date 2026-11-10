-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "localities" JSONB NOT NULL DEFAULT '[]';
