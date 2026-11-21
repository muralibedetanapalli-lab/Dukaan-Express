-- Shop-to-shop bulk (B2B) orders.
CREATE TYPE "BulkOrderStatus" AS ENUM ('PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'DISPATCHED', 'READY_FOR_PICKUP', 'DELIVERED', 'REJECTED', 'CANCELLED');
CREATE TYPE "BulkFulfilment" AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE "BulkPayment" AS ENUM ('ONLINE', 'ON_DELIVERY');

ALTER TABLE "Shop" ADD COLUMN "sellsBulk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bulkMinOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bulkDelivers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "bulkDeliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bulkPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "bulkPayOnDelivery" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ShopInventory" ADD COLUMN "bulkPrice" INTEGER,
ADD COLUMN "bulkMinQty" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Commission" ALTER COLUMN "orderId" DROP NOT NULL,
ADD COLUMN "bulkOrderId" TEXT;
CREATE UNIQUE INDEX "Commission_bulkOrderId_key" ON "Commission"("bulkOrderId");

CREATE TABLE "BulkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "buyerShopId" TEXT NOT NULL,
    "sellerShopId" TEXT NOT NULL,
    "status" "BulkOrderStatus" NOT NULL,
    "fulfilment" "BulkFulfilment" NOT NULL,
    "paymentMethod" "BulkPayment" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "itemCount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "note" TEXT,
    "buyerAddress" JSONB NOT NULL,
    "placedById" TEXT NOT NULL,
    "rejectReason" TEXT,
    "cancelledBy" TEXT,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundId" TEXT,
    "refundStatus" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BulkOrderItem" (
    "id" TEXT NOT NULL,
    "bulkOrderId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "unitLabel" TEXT,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    CONSTRAINT "BulkOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BulkOrder_number_key" ON "BulkOrder"("number");
CREATE UNIQUE INDEX "BulkOrder_gatewayOrderId_key" ON "BulkOrder"("gatewayOrderId");
CREATE UNIQUE INDEX "BulkOrder_refundId_key" ON "BulkOrder"("refundId");
CREATE INDEX "BulkOrder_buyerShopId_createdAt_idx" ON "BulkOrder"("buyerShopId", "createdAt");
CREATE INDEX "BulkOrder_sellerShopId_status_idx" ON "BulkOrder"("sellerShopId", "status");
CREATE INDEX "BulkOrder_status_createdAt_idx" ON "BulkOrder"("status", "createdAt");
CREATE INDEX "BulkOrderItem_bulkOrderId_idx" ON "BulkOrderItem"("bulkOrderId");

ALTER TABLE "BulkOrder" ADD CONSTRAINT "BulkOrder_buyerShopId_fkey" FOREIGN KEY ("buyerShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkOrder" ADD CONSTRAINT "BulkOrder_sellerShopId_fkey" FOREIGN KEY ("sellerShopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkOrderItem" ADD CONSTRAINT "BulkOrderItem_bulkOrderId_fkey" FOREIGN KEY ("bulkOrderId") REFERENCES "BulkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkOrderItem" ADD CONSTRAINT "BulkOrderItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "ShopInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_bulkOrderId_fkey" FOREIGN KEY ("bulkOrderId") REFERENCES "BulkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
