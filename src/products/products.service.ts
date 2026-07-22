import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";

import { PrismaService } from "../common/prisma.service";
import { mapProduct, mapProductDetail, productInclude } from "./product.mapper";
import { pagination, paginationMeta } from "../common/pagination";

type ProductQuery = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean))];
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQuery) {
    const q = first(query.q)?.trim().slice(0, 80);
    const categories = list(query.category);
    const brands = list(query.brand);
    const conditions = list(query.condition).map((item) => item.toUpperCase()).filter((item): item is "NEW" | "PRELOVED" => item === "NEW" || item === "PRELOVED");
    const { page, pageSize, skip, take } = pagination(query, 12, 48);
    const minPrice = Math.max(0, Number(first(query.minPrice)) || 0);
    const maxPrice = Math.max(minPrice, Number(first(query.maxPrice)) || 1_000_000_000);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: "ACTIVE",
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      category: { isActive: true, deletedAt: null, ...(categories.length ? { slug: { in: categories } } : {}) },
      brand: { isActive: true, deletedAt: null, ...(brands.length ? { slug: { in: brands } } : {}) },
      ...(conditions.length ? { condition: { in: conditions } } : {}),
      price: { gte: minPrice, lte: maxPrice },
      ...(first(query.onlyNew) === "1" ? { isNewArrival: true } : {}),
      ...(first(query.onSale) === "1" ? { compareAtPrice: { not: null } } : {}),
      ...(first(query.availability) === "in-stock" ? { variants: { some: { isActive: true, inventory: { quantity: { gt: 0 } } } } } : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput = first(query.sort) === "price-asc" ? { price: "asc" } : first(query.sort) === "price-desc" ? { price: "desc" } : { createdAt: "desc" };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, include: productInclude, orderBy, skip, take }),
    ]);
    return { items: records.map(mapProduct), ...paginationMeta(total, page, pageSize) };
  }

  async bySlug(slug: string) {
    const product = await this.prisma.product.findFirst({ where: { slug, status: "ACTIVE", deletedAt: null }, include: productInclude });
    return product ? mapProductDetail(product) : null;
  }

  async category(slug: string) {
    return this.prisma.category.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { name: true, slug: true, description: true } });
  }

  async brand(slug: string) {
    return this.prisma.brand.findFirst({ where: { slug, isActive: true, deletedAt: null }, select: { name: true, slug: true, description: true } });
  }

  async featured(limit: number) {
    const products = await this.prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null, isFeatured: true }, include: productInclude, orderBy: { publishedAt: "desc" }, take: Math.max(1, Math.min(limit, 24)) });
    return products.map(mapProduct);
  }

  async related(slug: string, limit: number) {
    const source = await this.prisma.product.findFirst({ where: { slug, status: "ACTIVE", deletedAt: null }, select: { id: true, categoryId: true } });
    if (!source) return [];
    const products = await this.prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null, id: { not: source.id }, categoryId: source.categoryId }, include: productInclude, orderBy: { publishedAt: "desc" }, take: Math.max(1, Math.min(limit, 12)) });
    return products.map(mapProduct);
  }

  async relatedByCategory(categorySlug: string, excludeId: string, limit: number) {
    const products = await this.prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null, id: { not: excludeId }, category: { slug: categorySlug } }, include: productInclude, orderBy: { publishedAt: "desc" }, take: Math.max(1, Math.min(limit, 12)) });
    return products.map(mapProduct);
  }

  async home() {
    const now = new Date();
    const [newRecords, prelovedRecords, brands, banner, testimonials, sections] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null, isNewArrival: true }, include: productInclude, orderBy: { publishedAt: "desc" }, take: 8 }),
      this.prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null, condition: "PRELOVED" }, include: productInclude, orderBy: { publishedAt: "desc" }, take: 8 }),
      this.prisma.brand.findMany({ where: { isActive: true, deletedAt: null }, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: 12, select: { name: true, slug: true } }),
      this.prisma.banner.findFirst({ where: { placement: "HOME_HERO", isActive: true, deletedAt: null, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { sortOrder: "asc" } }),
      this.prisma.testimonial.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: "asc" }, take: 8 }),
      this.prisma.homepageSection.findMany({ select: { key: true, isVisible: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    return { newArrivals: newRecords.map(mapProduct), prelovedProducts: prelovedRecords.map(mapProduct), brands, banner, testimonials, sections };
  }
}
