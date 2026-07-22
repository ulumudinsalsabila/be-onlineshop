import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { z } from "zod";
import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);
const money = z.coerce.number().nonnegative().max(999_999_999_999);
const entitySchemas = {
  categories: z.object({ name: text(100), slug: text(100), description: optionalText(1000), parentId: optionalText(100), imageUrl: optionalText(500), isActive: z.boolean(), sortOrder: z.coerce.number().int().nonnegative() }),
  brands: z.object({ name: text(100), slug: text(100), description: optionalText(2000), logoUrl: optionalText(500), isFeatured: z.boolean(), isActive: z.boolean() }),
  vouchers: z.object({ code: text(40).transform((v) => v.toUpperCase()), name: text(100), description: optionalText(500), type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]), value: money, minSpend: money.optional().nullable(), maxDiscount: money.optional().nullable(), usageLimit: z.coerce.number().int().positive().optional().nullable(), usagePerUser: z.coerce.number().int().positive(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), isActive: z.boolean() }).refine((v) => v.endsAt > v.startsAt),
  banners: z.object({ name: text(100), placement: text(60), eyebrow: optionalText(100), title: text(200), body: optionalText(1000), imageUrl: text(500), imageAlt: text(180), href: optionalText(300), ctaLabel: optionalText(80), isActive: z.boolean(), sortOrder: z.coerce.number().int().nonnegative() }),
  testimonials: z.object({ name: text(100), location: optionalText(100), quote: text(2000), rating: z.coerce.number().int().min(1).max(5), isActive: z.boolean(), sortOrder: z.coerce.number().int().nonnegative() }),
} as const;
type Entity = keyof typeof entitySchemas;

const productSchema = z.object({
  name: text(160), slug: text(100), baseSku: text(80), categoryId: text(100), brandId: text(100), description: text(10_000), shortDescription: optionalText(300), condition: z.enum(["NEW", "PRELOVED"]), conditionLabel: optionalText(80), completeness: optionalText(300), flawNotes: optionalText(2000), authenticationStatus: optionalText(100), price: money, compareAtPrice: money.optional().nullable(), costPrice: money.optional().nullable(), status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]), isFeatured: z.boolean(), isNewArrival: z.boolean(), weightGrams: z.coerce.number().int().positive().optional().nullable(),
  images: z.array(z.object({ id: z.string().optional(), url: text(500), alt: text(180), width: z.coerce.number().int().positive(), height: z.coerce.number().int().positive(), isPrimary: z.boolean() })).min(1).max(12),
  variants: z.array(z.object({ id: z.string().optional(), sku: text(80), name: text(100), color: optionalText(60), colorHex: optionalText(20), size: optionalText(30), price: money.optional().nullable(), compareAtPrice: money.optional().nullable(), stock: z.coerce.number().int().nonnegative(), lowStockAt: z.coerce.number().int().nonnegative(), isActive: z.boolean() })).min(1).max(100),
});

@Injectable()
export class AdminWriteService {
  constructor(private readonly prisma: PrismaService) {}

  private audit(actorId: string, action: string, entityType: string, entityId?: string) {
    return this.prisma.auditLog.create({ data: { userId: actorId, action, entityType, entityId } });
  }

  async uploadProductImage(actorId: string, file: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[file.mimetype];
    if (!extension) apiException(415, "UNSUPPORTED_IMAGE", "Format gambar harus JPEG, PNG, atau WebP.");
    if (!file.buffer?.length || file.size < 1) apiException(400, "EMPTY_IMAGE", "File gambar kosong.");
    if (file.size > 4 * 1024 * 1024) apiException(413, "IMAGE_TOO_LARGE", "Ukuran gambar maksimal 4 MB.");

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    let result: { url: string; width: number; height: number; storageKey: string };

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
      const uploaded = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "ivory/products", resource_type: "image", unique_filename: true },
          (error, response) => error || !response ? reject(error instanceof Error ? error : new Error("Cloudinary tidak mengembalikan hasil upload.")) : resolve(response),
        );
        stream.end(file.buffer);
      }).catch(() => apiException(502, "IMAGE_UPLOAD_FAILED", "Gambar gagal diunggah ke penyimpanan."));
      result = { url: uploaded.secure_url, width: uploaded.width, height: uploaded.height, storageKey: uploaded.public_id };
    } else {
      if (process.env.NODE_ENV === "production") apiException(503, "IMAGE_STORAGE_NOT_CONFIGURED", "Konfigurasi Cloudinary belum tersedia di server.");
      const filename = `${randomUUID()}.${extension}`;
      const directory = join(process.cwd(), "public", "uploads", "products");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, filename), file.buffer);
      const backendUrl = (process.env.BACKEND_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");
      result = { url: `${backendUrl}/uploads/products/${filename}`, width: 1200, height: 1500, storageKey: `products/${filename}` };
    }

    await this.audit(actorId, "UPLOAD", "product-images", result.storageKey);
    return result;
  }

  async entity(actorId: string, entity: string, body: unknown, id?: string) {
    if (!(entity in entitySchemas)) apiException(404, "NOT_FOUND", "Resource admin tidak ditemukan.");
    const name = entity as Entity;
    const parsed = entitySchemas[name].safeParse(body);
    if (!parsed.success) apiException(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Data tidak valid.");
    const data = parsed.data as never;
    let result: { id: string };
    if (name === "categories") result = id ? await this.prisma.category.update({ where: { id }, data }) : await this.prisma.category.create({ data });
    else if (name === "brands") result = id ? await this.prisma.brand.update({ where: { id }, data }) : await this.prisma.brand.create({ data });
    else if (name === "vouchers") result = id ? await this.prisma.voucher.update({ where: { id }, data }) : await this.prisma.voucher.create({ data });
    else if (name === "banners") result = id ? await this.prisma.banner.update({ where: { id }, data }) : await this.prisma.banner.create({ data });
    else result = id ? await this.prisma.testimonial.update({ where: { id }, data }) : await this.prisma.testimonial.create({ data });
    await this.audit(actorId, id ? "UPDATE" : "CREATE", name, result.id);
    return result;
  }

  async removeEntities(actorId: string, entity: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) apiException(400, "VALIDATION_ERROR", "Daftar id tidak valid.");
    const now = new Date(); let count = 0;
    if (entity === "categories") count = (await this.prisma.category.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, isActive: false } })).count;
    else if (entity === "brands") count = (await this.prisma.brand.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, isActive: false } })).count;
    else if (entity === "banners") count = (await this.prisma.banner.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, isActive: false } })).count;
    else if (entity === "testimonials") count = (await this.prisma.testimonial.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, isActive: false } })).count;
    else if (entity === "vouchers") count = (await this.prisma.voucher.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })).count;
    else apiException(404, "NOT_FOUND", "Resource admin tidak ditemukan.");
    await this.audit(actorId, "BULK_DELETE", entity);
    return { count };
  }

  async product(actorId: string, body: unknown, id?: string) {
    const parsed = productSchema.safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Data produk tidak valid.");
    const { images, variants, ...data } = parsed.data;
    const product = await this.prisma.$transaction(async (tx) => {
      if (!id) return tx.product.create({ data: { ...data, publishedAt: data.status === "ACTIVE" ? new Date() : null, images: { create: images }, variants: { create: variants.map(({ stock, lowStockAt, ...variant }) => ({ ...variant, inventory: { create: { quantity: stock, lowStockAt } } })) } } });
      const existing = await tx.product.findUnique({ where: { id }, select: { id: true } }); if (!existing) apiException(404, "NOT_FOUND", "Produk tidak ditemukan.");
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: variants.flatMap((v) => v.id ? [v.id] : []) } } });
      await tx.product.update({ where: { id }, data: { ...data, publishedAt: data.status === "ACTIVE" ? new Date() : null, images: { create: images.map((image) => ({ url: image.url, alt: image.alt, width: image.width, height: image.height, isPrimary: image.isPrimary })) } } });
      for (const variant of variants) { const { id: variantId, stock, lowStockAt, ...variantData } = variant; if (variantId) await tx.productVariant.update({ where: { id: variantId }, data: { ...variantData, inventory: { upsert: { create: { quantity: stock, lowStockAt }, update: { quantity: stock, lowStockAt, version: { increment: 1 } } } } } }); else await tx.productVariant.create({ data: { ...variantData, productId: id, inventory: { create: { quantity: stock, lowStockAt } } } }); }
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
    await this.audit(actorId, id ? "UPDATE" : "CREATE", "products", product.id); return product;
  }

  async customer(actorId: string, id: string, body: unknown) {
    const parsed = z.object({ isActive: z.boolean(), role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]), emailVerified: z.boolean().optional() }).safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Data akun tidak valid.");
    if (actorId === id && (!parsed.data.isActive || parsed.data.role !== "ADMIN")) apiException(409, "SELF_LOCKOUT", "Admin tidak dapat menonaktifkan atau menurunkan role akunnya sendiri.");
    const { emailVerified, ...data } = parsed.data; const user = await this.prisma.user.update({ where: { id }, data: { ...data, ...(emailVerified === undefined ? {} : { emailVerified: emailVerified ? new Date() : null }) }, select: { id: true, email: true, role: true, isActive: true, emailVerified: true } });
    await this.audit(actorId, "UPDATE_ACCESS", "users", id); return user;
  }

  async order(actorId: string, id: string, body: unknown) { const parsed = z.object({ status: z.enum(["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]), paymentStatus: z.enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional() }).safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Status order tidak valid."); const result = await this.prisma.order.update({ where: { id }, data: { ...parsed.data, cancelledAt: parsed.data.status === "CANCELLED" ? new Date() : undefined } }); await this.audit(actorId, "UPDATE_STATUS", "orders", id); return result; }
  async inventory(actorId: string, id: string, body: unknown) {
    const parsed = z.object({ quantity: z.coerce.number().int().nonnegative(), lowStockAt: z.coerce.number().int().nonnegative() }).safeParse(body);
    if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Stok tidak valid.");
    const current = await this.prisma.inventory.findUnique({ where: { id }, select: { reserved: true } });
    if (!current) apiException(404, "NOT_FOUND", "Inventory tidak ditemukan.");
    if (parsed.data.quantity < current.reserved) apiException(409, "STOCK_BELOW_RESERVED", `Quantity tidak boleh lebih kecil dari reserved stock (${current.reserved}).`);
    const result = await this.prisma.inventory.update({ where: { id }, data: { ...parsed.data, version: { increment: 1 } } });
    await this.audit(actorId, "UPDATE_STOCK", "inventory", id);
    return result;
  }
  async shipment(actorId: string, id: string, body: unknown) { const parsed = z.object({ courier: text(80), provider: text(80), service: optionalText(80), providerRef: optionalText(160), trackingNumber: optionalText(160), status: z.enum(["PENDING", "READY", "IN_TRANSIT", "DELIVERED", "RETURNED", "FAILED"]) }).safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Data shipment tidak valid."); const result = await this.prisma.shipment.update({ where: { id }, data: { ...parsed.data, shippedAt: parsed.data.status === "IN_TRANSIT" ? new Date() : undefined, deliveredAt: parsed.data.status === "DELIVERED" ? new Date() : undefined } }); await this.audit(actorId, "UPDATE", "shipments", id); return result; }
  async seller(actorId: string, id: string, body: unknown) { const parsed = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]), reason: z.string().trim().max(2000).optional(), commissionRate: z.coerce.number().min(0).max(100) }).safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Data seller tidak valid."); const before = await this.prisma.sellerProfile.findUnique({ where: { id }, select: { status: true } }); if (!before) apiException(404, "NOT_FOUND", "Seller tidak ditemukan."); const result = await this.prisma.sellerProfile.update({ where: { id }, data: { status: parsed.data.status, commissionRate: parsed.data.commissionRate, rejectionReason: ["REJECTED", "SUSPENDED"].includes(parsed.data.status) ? parsed.data.reason ?? null : null, reviewedById: actorId, reviewedAt: new Date(), approvedAt: parsed.data.status === "APPROVED" ? new Date() : undefined } }); await this.prisma.sellerActivityLog.create({ data: { sellerId: id, actorUserId: actorId, action: `STATUS_${parsed.data.status}`, entityType: "SELLER", entityId: id, metadata: { previousStatus: before.status, reason: parsed.data.reason ?? null } } }); await this.audit(actorId, "UPDATE_STATUS", "sellers", id); return result; }
  async sections(actorId: string, body: unknown) { const parsed = z.object({ sections: z.array(z.object({ id: z.string(), isVisible: z.boolean(), sortOrder: z.coerce.number().int().nonnegative() })).max(100) }).safeParse(body); if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Data section tidak valid."); await this.prisma.$transaction(parsed.data.sections.map((section) => this.prisma.homepageSection.update({ where: { id: section.id }, data: { isVisible: section.isVisible, sortOrder: section.sortOrder } }))); await this.audit(actorId, "UPDATE", "homepage-sections"); return { count: parsed.data.sections.length }; }
}
