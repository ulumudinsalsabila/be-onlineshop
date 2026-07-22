import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import { pagination, paginationMeta, type PaginationQuery } from "../common/pagination";
import { buildTrackingEvents } from "./tracking";

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, role: true, emailVerified: true, createdAt: true } });
  }

  updateProfile(userId: string, input: { name: string; phone?: string }) {
    return this.prisma.user.update({ where: { id: userId }, data: { name: input.name.replace(/[<>]/g, "").trim(), phone: input.phone || null }, select: { id: true, name: true, email: true, phone: true } });
  }

  async updatePassword(userId: string, input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    if (input.newPassword !== input.confirmPassword) apiException(400, "VALIDATION_ERROR", "Konfirmasi password tidak sama.");
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !(await verify(user.passwordHash, input.currentPassword))) apiException(400, "INVALID_PASSWORD", "Password saat ini tidak sesuai.");
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(input.newPassword, { algorithm: 2, memoryCost: 19_456, timeCost: 3, parallelism: 1, outputLen: 32 }) } });
    return { message: "Your password has been updated." };
  }

  async addresses(userId: string, query: PaginationQuery) { const { page, pageSize, skip, take } = pagination(query); const where = { userId }; const [items, total] = await this.prisma.$transaction([this.prisma.address.findMany({ where, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], skip, take }), this.prisma.address.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }

  async createAddress(userId: string, input: AddressInput) {
    const region = await this.resolveRegion(input);
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      const count = await tx.address.count({ where: { userId } });
      return tx.address.create({ data: { ...input, ...region, line2: input.line2 || null, isDefault: input.isDefault || count === 0, userId } });
    });
  }

  async updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) apiException(404, "NOT_FOUND", "Alamat tidak ditemukan.");
    const region = await this.resolveRegion({ ...existing, ...input });
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { ...input, ...region, ...(input.line2 !== undefined ? { line2: input.line2 || null } : {}) } });
    });
  }

  async deleteAddress(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) apiException(404, "NOT_FOUND", "Alamat tidak ditemukan.");
    await this.prisma.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await this.prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { removed: true };
  }

  async overview(userId: string) {
    const [user, orders, addresses, wishlist] = await Promise.all([this.profile(userId), this.prisma.order.count({ where: { userId } }), this.prisma.address.count({ where: { userId } }), this.prisma.wishlistItem.count({ where: { wishlist: { userId } } })]);
    return { user, orders, addresses, wishlist };
  }

  async orders(userId: string, query: PaginationQuery) { const { page, pageSize, skip, take } = pagination(query); const where = { userId }; const [items, total] = await this.prisma.$transaction([this.prisma.order.findMany({ where, orderBy: { placedAt: "desc" }, include: { _count: { select: { items: true } } }, skip, take }), this.prisma.order.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }
  orderByNumber(userId: string, orderNumber: string) { return this.prisma.order.findFirst({ where: { orderNumber, userId }, include: { items: true, payments: { orderBy: { createdAt: "desc" } }, shipments: { orderBy: { createdAt: "desc" } } } }); }
  order(userId: string, id: string) { return this.prisma.order.findFirst({ where: { id, userId }, include: { items: true, payments: { orderBy: { createdAt: "desc" } }, shipments: { orderBy: { createdAt: "desc" } } } }); }
  async tracking(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId }, select: { createdAt: true, status: true, trackingNumber: true, shippedAt: true, shippingCourierCode: true, shippingCourierName: true, shippingServiceCode: true, shippingServiceName: true, payments: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true } }, shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, courier: true, service: true, trackingNumber: true, shippedAt: true, deliveredAt: true } } } });
    if (!order) apiException(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    const shipment = order.shipments[0];
    return {
      status: shipment?.status ?? (order.status === "SHIPPED" ? "IN_TRANSIT" : order.status === "DELIVERED" ? "DELIVERED" : "PENDING"),
      trackingNumber: order.trackingNumber ?? shipment?.trackingNumber ?? null,
      courierCode: order.shippingCourierCode ?? shipment?.courier ?? null,
      courierName: order.shippingCourierName ?? shipment?.courier ?? null,
      serviceCode: order.shippingServiceCode ?? shipment?.service ?? null,
      serviceName: order.shippingServiceName ?? shipment?.service ?? null,
      events: buildTrackingEvents({ orderCreatedAt: order.createdAt, paidAt: order.payments[0]?.paidAt, shippedAt: order.shippedAt ?? shipment?.shippedAt, deliveredAt: shipment?.deliveredAt }),
    };
  }
  async returns(userId: string, query: PaginationQuery) { const { page, pageSize, skip, take } = pagination(query); const where = { userId }; const [items, total] = await this.prisma.$transaction([this.prisma.returnRequest.findMany({ where, include: { order: { select: { orderNumber: true } }, orderItem: { select: { productName: true } } }, orderBy: { requestedAt: "desc" }, skip, take }), this.prisma.returnRequest.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }

  private async resolveRegion(input: Partial<AddressInput>) {
    const codes = [input.provinceCode, input.regencyCode, input.districtCode, input.villageCode];
    if (codes.some(Boolean)) {
      if (!codes.every(Boolean)) apiException(400, "REGION_INCOMPLETE", "Pilih provinsi, kabupaten/kota, kecamatan, dan desa/kelurahan secara lengkap.");
      const village = await this.prisma.regionVillage.findUnique({ where: { code: input.villageCode! }, include: { district: { include: { regency: { include: { province: true } } } } } });
      if (!village || village.districtCode !== input.districtCode || village.district.regencyCode !== input.regencyCode || village.district.regency.provinceCode !== input.provinceCode) apiException(400, "REGION_INVALID", "Hierarki wilayah alamat tidak valid.");
      return { provinceCode: village.district.regency.provinceCode, regencyCode: village.district.regencyCode, districtCode: village.districtCode, villageCode: village.code, province: village.district.regency.province.name, city: village.district.regency.name, district: village.district.name, village: village.name };
    }
    if (!input.province || !input.city || !input.district) apiException(400, "REGION_INCOMPLETE", "Wilayah alamat belum lengkap.");
    return { province: input.province, city: input.city, district: input.district, village: input.village || null, provinceCode: null, regencyCode: null, districtCode: null, villageCode: null };
  }
}

export type AddressInput = { label: string; recipient: string; phone: string; line1: string; line2?: string | null; district?: string; village?: string | null; city?: string; province?: string; provinceCode?: string | null; regencyCode?: string | null; districtCode?: string | null; villageCode?: string | null; postalCode: string; country?: string; isDefault?: boolean };
