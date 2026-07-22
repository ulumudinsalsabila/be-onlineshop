import type { Prisma } from "../../generated/prisma/client";

export const productInclude = {
  category: true,
  brand: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: { where: { isActive: true }, include: { inventory: true, _count: { select: { orderItems: true } } } },
} satisfies Prisma.ProductInclude;

export type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function mapProduct(product: ProductRecord) {
  const primary = product.images.find((image) => image.isPrimary) ?? product.images[0];
  const alternate = product.images.find((image) => image.id !== primary?.id) ?? primary;
  const variants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    color: variant.color,
    colorHex: variant.colorHex,
    size: variant.size,
    price: Number(variant.price ?? product.price),
    stock: Math.max(0, (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0)),
  }));
  const stock = variants.reduce((total, variant) => total + variant.stock, 0);
  return {
    id: product.id,
    slug: product.slug,
    brand: product.brand.name,
    brandSlug: product.brand.slug,
    name: product.name,
    category: product.category.name,
    categorySlug: product.category.slug,
    price: Number(product.price),
    compareAt: product.compareAtPrice ? Number(product.compareAtPrice) : undefined,
    image: primary?.url ?? "/images/storefront/product-shoulder-bag.png",
    hoverImage: alternate?.url ?? primary?.url ?? "/images/storefront/product-shoulder-bag.png",
    badge: stock < 1 ? "Sold Out" : product.condition === "PRELOVED" ? "Preloved" : product.compareAtPrice?.greaterThan(product.price) ? "Sale" : product.isNewArrival ? "New" : undefined,
    condition: product.conditionLabel ?? undefined,
    conditionType: product.condition === "PRELOVED" ? "preloved" : "new",
    soldOut: stock < 1,
    colors: [...new Set(variants.map((variant) => variant.color).filter(Boolean))],
    sizes: [...new Set(variants.map((variant) => variant.size).filter(Boolean))],
    stock,
    createdAt: product.createdAt.toISOString(),
    salesCount: product.variants.reduce((total, variant) => total + variant._count.orderItems, 0),
    variants,
  };
}

export function mapProductDetail(product: ProductRecord) {
  return {
    ...mapProduct(product),
    sku: product.baseSku,
    shortDescription: product.shortDescription,
    description: product.description,
    completeness: product.completeness,
    flawNotes: product.flawNotes,
    purchaseYear: product.purchaseYear,
    authenticationStatus: product.authenticationStatus,
    material: product.material,
    origin: product.origin,
    images: product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, width: image.width, height: image.height })),
  };
}
