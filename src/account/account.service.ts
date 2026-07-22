import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import { pagination, paginationMeta, type PaginationQuery } from "../common/pagination";

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
    return { message: "Password berhasil diperbarui." };
  }

  async addresses(userId: string, query: PaginationQuery) { const { page, pageSize, skip, take } = pagination(query); const where = { userId }; const [items, total] = await this.prisma.$transaction([this.prisma.address.findMany({ where, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], skip, take }), this.prisma.address.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }

  async createAddress(userId: string, input: AddressInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      const count = await tx.address.count({ where: { userId } });
      return tx.address.create({ data: { ...input, line2: input.line2 || null, isDefault: input.isDefault || count === 0, userId } });
    });
  }

  async updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) apiException(404, "NOT_FOUND", "Alamat tidak ditemukan.");
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { ...input, ...(input.line2 !== undefined ? { line2: input.line2 || null } : {}) } });
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
  async returns(userId: string, query: PaginationQuery) { const { page, pageSize, skip, take } = pagination(query); const where = { userId }; const [items, total] = await this.prisma.$transaction([this.prisma.returnRequest.findMany({ where, include: { order: { select: { orderNumber: true } }, orderItem: { select: { productName: true } } }, orderBy: { requestedAt: "desc" }, skip, take }), this.prisma.returnRequest.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }
}

export type AddressInput = { label: string; recipient: string; phone: string; line1: string; line2?: string; district: string; city: string; province: string; postalCode: string; country?: string; isDefault?: boolean };
