ALTER TYPE "OrderStatus" RENAME VALUE 'PENDING' TO 'PENDING_PAYMENT';
ALTER TYPE "OrderStatus" RENAME VALUE 'CONFIRMED' TO 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "Order"
  ADD COLUMN "voucherCode" TEXT,
  ADD COLUMN "shippingMethod" TEXT,
  ADD COLUMN "shippingEstimate" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "redirectUrl" TEXT,
  ADD COLUMN "snapToken" TEXT,
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

UPDATE "Payment" SET "idempotencyKey" = "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

ALTER TABLE "Shipment"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerRef" TEXT,
  ADD COLUMN "estimateMinDays" INTEGER,
  ADD COLUMN "estimateMaxDays" INTEGER,
  ADD COLUMN "lastTrackedAt" TIMESTAMP(3);

UPDATE "Shipment" SET "provider" = 'legacy' WHERE "provider" IS NULL;
ALTER TABLE "Shipment" ALTER COLUMN "provider" SET NOT NULL;
CREATE UNIQUE INDEX "Shipment_providerRef_key" ON "Shipment"("providerRef");

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventKey_key" ON "PaymentWebhookEvent"("eventKey");
CREATE INDEX "PaymentWebhookEvent_paymentId_processedAt_idx" ON "PaymentWebhookEvent"("paymentId", "processedAt");
CREATE INDEX "PaymentWebhookEvent_provider_processedAt_idx" ON "PaymentWebhookEvent"("provider", "processedAt");
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
