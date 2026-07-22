CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "ConsignmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'WAITING_FOR_ITEM', 'INSPECTION', 'READY_TO_LIST', 'LISTED', 'SOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SellerPriceDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'NEEDS_REVISION');
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

CREATE TABLE "SellerProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
  "displayName" TEXT NOT NULL, "phone" TEXT NOT NULL, "identityNumber" TEXT, "bio" TEXT,
  "applicationNote" TEXT, "rejectionReason" TEXT, "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 20,
  "bankName" TEXT, "bankAccountName" TEXT, "bankAccountNumber" TEXT, "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3), "approvedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsignmentSubmission" (
  "id" TEXT NOT NULL, "submissionNumber" TEXT NOT NULL, "sellerId" TEXT NOT NULL, "categoryId" TEXT,
  "brandId" TEXT, "productId" TEXT, "status" "ConsignmentStatus" NOT NULL DEFAULT 'DRAFT', "title" TEXT NOT NULL,
  "proposedBrand" TEXT, "conditionLabel" TEXT NOT NULL, "completeness" TEXT NOT NULL, "flawNotes" TEXT,
  "description" TEXT NOT NULL, "expectedPrice" DECIMAL(18,2) NOT NULL, "estimatedPrice" DECIMAL(18,2),
  "agreedPrice" DECIMAL(18,2), "priceDecision" "SellerPriceDecision" NOT NULL DEFAULT 'PENDING',
  "revisionReason" TEXT, "rejectionReason" TEXT, "adminNotes" TEXT, "itemReceivedAt" TIMESTAMP(3),
  "listedAt" TIMESTAMP(3), "soldAt" TIMESTAMP(3), "returnWindowEndsAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsignmentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsignmentImage" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "url" TEXT NOT NULL, "storageKey" TEXT,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
  "alt" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ConsignmentImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductInspection" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "inspectorId" TEXT NOT NULL,
  "result" "InspectionResult" NOT NULL DEFAULT 'PENDING', "checklist" JSONB NOT NULL, "notes" TEXT,
  "authenticityNote" TEXT, "recommendedPrice" DECIMAL(18,2), "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProductInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Commission" (
  "id" TEXT NOT NULL, "submissionId" TEXT NOT NULL, "orderItemId" TEXT, "rate" DECIMAL(5,2) NOT NULL,
  "fixedFee" DECIMAL(18,2) NOT NULL DEFAULT 0, "grossAmount" DECIMAL(18,2), "commissionAmount" DECIMAL(18,2),
  "sellerNetAmount" DECIMAL(18,2), "calculatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payout" (
  "id" TEXT NOT NULL, "payoutNumber" TEXT NOT NULL, "sellerId" TEXT NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED', "amount" DECIMAL(18,2) NOT NULL, "bankSnapshot" JSONB NOT NULL,
  "providerRef" TEXT, "failureReason" TEXT, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayoutItem" (
  "id" TEXT NOT NULL, "payoutId" TEXT NOT NULL, "commissionId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerActivityLog" (
  "id" TEXT NOT NULL, "sellerId" TEXT NOT NULL, "actorUserId" TEXT, "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT, "moneyBefore" DECIMAL(18,2), "moneyAfter" DECIMAL(18,2),
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");
CREATE INDEX "SellerProfile_status_createdAt_idx" ON "SellerProfile"("status", "createdAt");
CREATE INDEX "SellerProfile_reviewedById_idx" ON "SellerProfile"("reviewedById");
CREATE UNIQUE INDEX "ConsignmentSubmission_submissionNumber_key" ON "ConsignmentSubmission"("submissionNumber");
CREATE UNIQUE INDEX "ConsignmentSubmission_productId_key" ON "ConsignmentSubmission"("productId");
CREATE INDEX "ConsignmentSubmission_sellerId_status_updatedAt_idx" ON "ConsignmentSubmission"("sellerId", "status", "updatedAt");
CREATE INDEX "ConsignmentSubmission_status_createdAt_idx" ON "ConsignmentSubmission"("status", "createdAt");
CREATE INDEX "ConsignmentSubmission_brandId_categoryId_idx" ON "ConsignmentSubmission"("brandId", "categoryId");
CREATE INDEX "ConsignmentSubmission_returnWindowEndsAt_status_idx" ON "ConsignmentSubmission"("returnWindowEndsAt", "status");
CREATE INDEX "ConsignmentImage_submissionId_sortOrder_idx" ON "ConsignmentImage"("submissionId", "sortOrder");
CREATE INDEX "ProductInspection_submissionId_inspectedAt_idx" ON "ProductInspection"("submissionId", "inspectedAt");
CREATE INDEX "ProductInspection_inspectorId_inspectedAt_idx" ON "ProductInspection"("inspectorId", "inspectedAt");
CREATE UNIQUE INDEX "Commission_submissionId_key" ON "Commission"("submissionId");
CREATE UNIQUE INDEX "Commission_orderItemId_key" ON "Commission"("orderItemId");
CREATE INDEX "Commission_calculatedAt_idx" ON "Commission"("calculatedAt");
CREATE UNIQUE INDEX "Payout_payoutNumber_key" ON "Payout"("payoutNumber");
CREATE UNIQUE INDEX "Payout_providerRef_key" ON "Payout"("providerRef");
CREATE INDEX "Payout_sellerId_status_requestedAt_idx" ON "Payout"("sellerId", "status", "requestedAt");
CREATE INDEX "Payout_status_requestedAt_idx" ON "Payout"("status", "requestedAt");
CREATE UNIQUE INDEX "PayoutItem_commissionId_key" ON "PayoutItem"("commissionId");
CREATE INDEX "PayoutItem_payoutId_idx" ON "PayoutItem"("payoutId");
CREATE INDEX "SellerActivityLog_sellerId_createdAt_idx" ON "SellerActivityLog"("sellerId", "createdAt");
CREATE INDEX "SellerActivityLog_actorUserId_createdAt_idx" ON "SellerActivityLog"("actorUserId", "createdAt");
CREATE INDEX "SellerActivityLog_entityType_entityId_idx" ON "SellerActivityLog"("entityType", "entityId");

ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsignmentSubmission" ADD CONSTRAINT "ConsignmentSubmission_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsignmentSubmission" ADD CONSTRAINT "ConsignmentSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentSubmission" ADD CONSTRAINT "ConsignmentSubmission_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentSubmission" ADD CONSTRAINT "ConsignmentSubmission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentImage" ADD CONSTRAINT "ConsignmentImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConsignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductInspection" ADD CONSTRAINT "ProductInspection_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConsignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConsignmentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerActivityLog" ADD CONSTRAINT "SellerActivityLog_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerActivityLog" ADD CONSTRAINT "SellerActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
