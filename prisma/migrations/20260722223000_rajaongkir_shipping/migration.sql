ALTER TABLE "ProductVariant"
ADD COLUMN "weightInGrams" INTEGER;

UPDATE "ProductVariant" AS variant
SET "weightInGrams" = COALESCE(product."weightGrams", 1000)
FROM "Product" AS product
WHERE variant."productId" = product."id";

ALTER TABLE "ProductVariant"
ALTER COLUMN "weightInGrams" SET NOT NULL,
ALTER COLUMN "weightInGrams" SET DEFAULT 1000;

ALTER TABLE "Order"
ADD COLUMN "shippingCourierCode" TEXT,
ADD COLUMN "shippingCourierName" TEXT,
ADD COLUMN "shippingServiceCode" TEXT,
ADD COLUMN "shippingServiceName" TEXT,
ADD COLUMN "shippingDescription" TEXT,
ADD COLUMN "shippingCost" DECIMAL(18,2),
ADD COLUMN "shippingEtd" TEXT,
ADD COLUMN "shippingWeightGrams" INTEGER,
ADD COLUMN "shippingOriginId" INTEGER,
ADD COLUMN "shippingDestinationId" INTEGER,
ADD COLUMN "shippingAddressJson" JSONB,
ADD COLUMN "trackingNumber" TEXT,
ADD COLUMN "shippedAt" TIMESTAMP(3);

CREATE INDEX "Order_shippingDestinationId_idx" ON "Order"("shippingDestinationId");
