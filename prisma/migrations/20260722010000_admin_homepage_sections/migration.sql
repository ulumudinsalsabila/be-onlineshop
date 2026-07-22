CREATE TABLE "HomepageSection" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HomepageSection_key_key" ON "HomepageSection"("key");
CREATE INDEX "HomepageSection_isVisible_sortOrder_idx" ON "HomepageSection"("isVisible", "sortOrder");

INSERT INTO "HomepageSection" ("id", "key", "title", "isVisible", "sortOrder", "updatedAt") VALUES
  ('admin-section-hero', 'hero', 'Hero', true, 0, CURRENT_TIMESTAMP),
  ('admin-section-categories', 'categories', 'Shop by Category', true, 1, CURRENT_TIMESTAMP),
  ('admin-section-new-arrivals', 'new-arrivals', 'New Arrivals', true, 2, CURRENT_TIMESTAMP),
  ('admin-section-featured', 'featured', 'Featured Collection', true, 3, CURRENT_TIMESTAMP),
  ('admin-section-preloved', 'preloved', 'Preloved Collection', true, 4, CURRENT_TIMESTAMP),
  ('admin-section-brands', 'brands', 'Shop by Brand', true, 5, CURRENT_TIMESTAMP),
  ('admin-section-promotion', 'promotion', 'Promotional Banner', true, 6, CURRENT_TIMESTAMP),
  ('admin-section-authenticity', 'authenticity', 'Authenticity Guarantee', true, 7, CURRENT_TIMESTAMP),
  ('admin-section-how-to-shop', 'how-to-shop', 'How to Shop', true, 8, CURRENT_TIMESTAMP),
  ('admin-section-testimonials', 'testimonials', 'Testimonials', true, 9, CURRENT_TIMESTAMP),
  ('admin-section-newsletter', 'newsletter', 'Newsletter', true, 10, CURRENT_TIMESTAMP);
