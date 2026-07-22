CREATE TABLE "RegionProvince" (
  "code" VARCHAR(2) NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegionProvince_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "RegionRegency" (
  "code" VARCHAR(5) NOT NULL,
  "provinceCode" VARCHAR(2) NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegionRegency_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "RegionDistrict" (
  "code" VARCHAR(8) NOT NULL,
  "regencyCode" VARCHAR(5) NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegionDistrict_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "RegionVillage" (
  "code" VARCHAR(13) NOT NULL,
  "districtCode" VARCHAR(8) NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegionVillage_pkey" PRIMARY KEY ("code")
);

ALTER TABLE "Address"
  ADD COLUMN "village" TEXT,
  ADD COLUMN "provinceCode" VARCHAR(2),
  ADD COLUMN "regencyCode" VARCHAR(5),
  ADD COLUMN "districtCode" VARCHAR(8),
  ADD COLUMN "villageCode" VARCHAR(13);

CREATE INDEX "RegionProvince_name_idx" ON "RegionProvince"("name");
CREATE INDEX "RegionRegency_provinceCode_name_idx" ON "RegionRegency"("provinceCode", "name");
CREATE INDEX "RegionDistrict_regencyCode_name_idx" ON "RegionDistrict"("regencyCode", "name");
CREATE INDEX "RegionVillage_districtCode_name_idx" ON "RegionVillage"("districtCode", "name");
CREATE INDEX "Address_provinceCode_idx" ON "Address"("provinceCode");
CREATE INDEX "Address_regencyCode_idx" ON "Address"("regencyCode");
CREATE INDEX "Address_districtCode_idx" ON "Address"("districtCode");
CREATE INDEX "Address_villageCode_idx" ON "Address"("villageCode");

ALTER TABLE "RegionRegency" ADD CONSTRAINT "RegionRegency_provinceCode_fkey" FOREIGN KEY ("provinceCode") REFERENCES "RegionProvince"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegionDistrict" ADD CONSTRAINT "RegionDistrict_regencyCode_fkey" FOREIGN KEY ("regencyCode") REFERENCES "RegionRegency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegionVillage" ADD CONSTRAINT "RegionVillage_districtCode_fkey" FOREIGN KEY ("districtCode") REFERENCES "RegionDistrict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_provinceCode_fkey" FOREIGN KEY ("provinceCode") REFERENCES "RegionProvince"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_regencyCode_fkey" FOREIGN KEY ("regencyCode") REFERENCES "RegionRegency"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_districtCode_fkey" FOREIGN KEY ("districtCode") REFERENCES "RegionDistrict"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_villageCode_fkey" FOREIGN KEY ("villageCode") REFERENCES "RegionVillage"("code") ON DELETE SET NULL ON UPDATE CASCADE;
