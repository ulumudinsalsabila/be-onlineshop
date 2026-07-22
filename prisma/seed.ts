import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!email) throw new Error("SEED_ADMIN_EMAIL is required.");
if (!password) throw new Error("SEED_ADMIN_PASSWORD is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const passwordHash = await hash(password!, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });

  const user = await prisma.user.upsert({
    where: { email: email! },
    update: {
      name: "Administrator",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
      emailVerified: new Date(),
    },
    create: {
      name: "Administrator",
      email: email!,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      emailVerified: new Date(),
      wishlist: { create: {} },
    },
    select: { id: true, email: true, role: true, isActive: true, emailVerified: true },
  });

  console.info(`Admin account ready: ${user.email} (${user.role})`);

  const catalogUser = await prisma.user.upsert({
    where: { email: "catalog-seed@ivory.local" },
    update: { name: "IVORY Catalog Customer", role: "CUSTOMER", isActive: true, deletedAt: null, emailVerified: new Date() },
    create: { name: "IVORY Catalog Customer", email: "catalog-seed@ivory.local", role: "CUSTOMER", isActive: true, emailVerified: new Date() },
    select: { id: true },
  });
  const wishlist = await prisma.wishlist.upsert({ where: { userId: catalogUser.id }, update: {}, create: { userId: catalogUser.id } });

  const catalog = [
    { category: ["Handbags", "handbags", "Structured bags and everyday leather icons."], brand: ["Atelier Ivory", "atelier-ivory"], product: { name: "Heritage Leather Tote", slug: "heritage-leather-tote", sku: "IV-TOTE-001", description: "A structured full-grain leather tote with a spacious suede-lined interior.", shortDescription: "Structured full-grain leather tote.", price: 12_900_000, compareAtPrice: 14_500_000, condition: "NEW" as const, image: "/images/home/tote-main.png", color: "Camel", colorHex: "#A87652", size: "Medium", stock: 8 } },
    { category: ["Watches", "watches", "Timeless mechanical and quartz watches."], brand: ["Maison Horlogerie", "maison-horlogerie"], product: { name: "Époque Gold Watch", slug: "epoque-gold-watch", sku: "IV-WATCH-002", description: "A refined gold-tone watch with a minimal ivory dial and polished bracelet.", shortDescription: "Gold-tone watch with an ivory dial.", price: 18_750_000, compareAtPrice: 20_000_000, condition: "NEW" as const, image: "/images/home/watch-main.png", color: "Gold", colorHex: "#B79A5D", size: "28 mm", stock: 5 } },
    { category: ["Scarves", "scarves", "Silk scarves and lightweight seasonal accessories."], brand: ["Lumière", "lumiere"], product: { name: "Jardin Silk Scarf", slug: "jardin-silk-scarf", sku: "IV-SCARF-003", description: "A hand-finished silk twill scarf featuring a delicate botanical composition.", shortDescription: "Hand-finished botanical silk twill.", price: 3_250_000, compareAtPrice: 3_800_000, condition: "NEW" as const, image: "/images/home/scarf-alt.png", color: "Ivory", colorHex: "#E9E0CF", size: "90 × 90 cm", stock: 14 } },
    { category: ["Shoes", "shoes", "Refined footwear crafted for lasting comfort."], brand: ["Élan", "elan"], product: { name: "Noelle Slingback Heels", slug: "noelle-slingback-heels", sku: "IV-SHOE-004", description: "Elegant pointed slingback heels crafted in smooth leather with a balanced heel.", shortDescription: "Smooth leather pointed slingbacks.", price: 7_900_000, compareAtPrice: 8_750_000, condition: "NEW" as const, image: "/images/home/slingback-alt.png", color: "Black", colorHex: "#24211D", size: "38", stock: 6 } },
    { category: ["Preloved", "preloved", "Authenticated pre-owned pieces in excellent condition."], brand: ["Archive House", "archive-house"], product: { name: "Burgundy Archive Shoulder Bag", slug: "burgundy-archive-shoulder-bag", sku: "IV-PRE-005", description: "An authenticated vintage shoulder bag in supple burgundy leather with gentle signs of wear.", shortDescription: "Authenticated vintage burgundy shoulder bag.", price: 9_500_000, compareAtPrice: 11_000_000, condition: "PRELOVED" as const, image: "/images/home/preloved-burgundy-main.png", color: "Burgundy", colorHex: "#713C43", size: "One Size", stock: 1 } },
  ] as const;

  const seededProductIds: string[] = [];
  const seededVariantIds: string[] = [];
  for (const [index, item] of catalog.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: item.category[1] },
      update: { name: item.category[0], description: item.category[2], isActive: true, deletedAt: null, sortOrder: index + 1 },
      create: { name: item.category[0], slug: item.category[1], description: item.category[2], isActive: true, sortOrder: index + 1 },
    });
    const brand = await prisma.brand.upsert({
      where: { slug: item.brand[1] },
      update: { name: item.brand[0], isActive: true, isFeatured: true, deletedAt: null },
      create: { name: item.brand[0], slug: item.brand[1], isActive: true, isFeatured: true },
    });
    const product = await prisma.product.upsert({
      where: { slug: item.product.slug },
      update: { categoryId: category.id, brandId: brand.id, baseSku: item.product.sku, name: item.product.name, shortDescription: item.product.shortDescription, description: item.product.description, condition: item.product.condition, conditionLabel: item.product.condition === "PRELOVED" ? "Excellent" : "Brand New", authenticationStatus: "AUTHENTICATED", price: item.product.price, compareAtPrice: item.product.compareAtPrice, status: "ACTIVE", isFeatured: index < 3, isNewArrival: index < 4, weightGrams: index === 1 ? 450 : 900, publishedAt: new Date(), deletedAt: null },
      create: { categoryId: category.id, brandId: brand.id, slug: item.product.slug, baseSku: item.product.sku, name: item.product.name, shortDescription: item.product.shortDescription, description: item.product.description, condition: item.product.condition, conditionLabel: item.product.condition === "PRELOVED" ? "Excellent" : "Brand New", authenticationStatus: "AUTHENTICATED", price: item.product.price, compareAtPrice: item.product.compareAtPrice, status: "ACTIVE", isFeatured: index < 3, isNewArrival: index < 4, weightGrams: index === 1 ? 450 : 900, publishedAt: new Date() },
    });
    await prisma.productImage.upsert({
      where: { id: `seed-product-image-${index + 1}` },
      update: { productId: product.id, url: item.product.image, alt: item.product.name, width: 1200, height: 1500, sortOrder: 0, isPrimary: true },
      create: { id: `seed-product-image-${index + 1}`, productId: product.id, url: item.product.image, alt: item.product.name, width: 1200, height: 1500, sortOrder: 0, isPrimary: true },
    });
    const variant = await prisma.productVariant.upsert({
      where: { sku: `${item.product.sku}-DEFAULT` },
      update: { productId: product.id, name: "Default", color: item.product.color, colorHex: item.product.colorHex, size: item.product.size, weightInGrams: index === 1 ? 450 : 900, isActive: true },
      create: { productId: product.id, sku: `${item.product.sku}-DEFAULT`, name: "Default", color: item.product.color, colorHex: item.product.colorHex, size: item.product.size, weightInGrams: index === 1 ? 450 : 900, isActive: true },
    });
    seededProductIds.push(product.id);
    seededVariantIds.push(variant.id);
    await prisma.inventory.upsert({ where: { variantId: variant.id }, update: { quantity: item.product.stock, reserved: 0, lowStockAt: 2, version: { increment: 1 } }, create: { variantId: variant.id, quantity: item.product.stock, reserved: 0, lowStockAt: 2 } });
    await prisma.review.upsert({
      where: { userId_productId: { userId: catalogUser.id, productId: product.id } },
      update: { rating: 5 - index % 2, title: "Beautiful IVORY selection", content: `The ${item.product.name} arrived exactly as described and was packaged beautifully.`, status: "PUBLISHED", isVerified: true, publishedAt: new Date() },
      create: { userId: catalogUser.id, productId: product.id, rating: 5 - index % 2, title: "Beautiful IVORY selection", content: `The ${item.product.name} arrived exactly as described and was packaged beautifully.`, status: "PUBLISHED", isVerified: true, publishedAt: new Date() },
    });
    await prisma.wishlistItem.upsert({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId: product.id } }, update: {}, create: { wishlistId: wishlist.id, productId: product.id } });
  }

  const catalogCounts = {
    categories: await prisma.category.count({ where: { slug: { in: catalog.map((item) => item.category[1]) } } }),
    brands: await prisma.brand.count({ where: { slug: { in: catalog.map((item) => item.brand[1]) } } }),
    products: await prisma.product.count({ where: { id: { in: seededProductIds } } }),
    images: await prisma.productImage.count({ where: { id: { in: catalog.map((_, index) => `seed-product-image-${index + 1}`) } } }),
    variants: await prisma.productVariant.count({ where: { id: { in: seededVariantIds } } }),
    inventories: await prisma.inventory.count({ where: { variantId: { in: seededVariantIds } } }),
    reviews: await prisma.review.count({ where: { userId: catalogUser.id, productId: { in: seededProductIds } } }),
    wishlistItems: await prisma.wishlistItem.count({ where: { wishlistId: wishlist.id, productId: { in: seededProductIds } } }),
  };
  if (Object.values(catalogCounts).some((count) => count !== 5)) throw new Error(`Catalog seed verification failed: ${JSON.stringify(catalogCounts)}`);
  console.info(`Catalog seed verified: ${JSON.stringify(catalogCounts)}`);
}

main()
  .finally(async () => prisma.$disconnect());
