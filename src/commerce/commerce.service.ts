import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";

import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import { mapProduct, productInclude } from "../products/product.mapper";
import { pagination, paginationMeta, type PaginationQuery } from "../common/pagination";

const cartInclude = {
  items: { orderBy: { createdAt: "asc" as const }, include: { variant: { include: { inventory: true, product: { include: { brand: true, images: { orderBy: { sortOrder: "asc" as const }, take: 1 } } } } } } },
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function serializeCart(cart: CartRecord | null) {
  const items = cart?.items.map((item) => {
    const price = item.variant.price ?? item.variant.product.price;
    const availableStock = Math.max(0, (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0));
    return { id: item.id, variantId: item.variantId, quantity: item.quantity, availableStock, canCheckout: item.quantity <= availableStock && item.variant.isActive, unitPrice: Number(price), lineTotal: Number(price) * item.quantity, variant: { sku: item.variant.sku, name: item.variant.name, color: item.variant.color, size: item.variant.size }, product: { id: item.variant.product.id, slug: item.variant.product.slug, name: item.variant.product.name, brand: item.variant.product.brand.name, image: item.variant.product.images[0]?.url ?? null } };
  }) ?? [];
  return { id: cart?.id ?? null, items, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0), canCheckout: items.length > 0 && items.every((item) => item.canCheckout) };
}

@Injectable()
export class CommerceService {
  constructor(private readonly prisma: PrismaService) {}

  async cart(userId: string) {
    return serializeCart(await this.prisma.cart.findUnique({ where: { activeKey: `user:${userId}` }, include: cartInclude }));
  }

  async addCartItem(userId: string, variantId: string, quantity: number) {
    const cart = await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({ where: { id: variantId, isActive: true, product: { status: "ACTIVE", deletedAt: null } }, include: { inventory: true } });
      const available = (variant?.inventory?.quantity ?? 0) - (variant?.inventory?.reserved ?? 0);
      if (!variant || available < quantity) apiException(409, "INSUFFICIENT_STOCK", "Jumlah melebihi stok yang tersedia.");
      const activeKey = `user:${userId}`;
      const activeCart = await tx.cart.upsert({ where: { activeKey }, update: { status: "ACTIVE" }, create: { userId, activeKey, status: "ACTIVE" } });
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: activeCart.id, variantId } } });
      if ((existing?.quantity ?? 0) + quantity > available) apiException(409, "INSUFFICIENT_STOCK", "Jumlah melebihi stok yang tersedia.");
      await tx.cartItem.upsert({ where: { cartId_variantId: { cartId: activeCart.id, variantId } }, update: { quantity: { increment: quantity } }, create: { cartId: activeCart.id, variantId, quantity } });
      return tx.cart.findUniqueOrThrow({ where: { id: activeCart.id }, include: cartInclude });
    }, { isolationLevel: "Serializable" });
    return serializeCart(cart);
  }

  async updateCartItem(userId: string, id: string, quantity: number) {
    const item = await this.prisma.cartItem.findFirst({ where: { id, cart: { activeKey: `user:${userId}` } }, include: { variant: { include: { inventory: true } } } });
    if (!item) apiException(404, "NOT_FOUND", "Item cart tidak ditemukan.");
    const available = (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0);
    if (quantity > available) apiException(409, "INSUFFICIENT_STOCK", "Jumlah melebihi stok yang tersedia.");
    await this.prisma.cartItem.update({ where: { id }, data: { quantity } });
    return this.cart(userId);
  }

  async removeCartItem(userId: string, id: string) {
    const deleted = await this.prisma.cartItem.deleteMany({ where: { id, cart: { activeKey: `user:${userId}` } } });
    if (!deleted.count) apiException(404, "NOT_FOUND", "Item cart tidak ditemukan.");
    return { removed: true };
  }

  async wishlist(userId: string, query: PaginationQuery) {
    const { page, pageSize, skip, take } = pagination(query);
    const wishlist = await this.prisma.wishlist.findUnique({ where: { userId }, select: { id: true } });
    if (!wishlist) return { items: [], meta: paginationMeta(0, page, pageSize) };
    const where = { wishlistId: wishlist.id };
    const [records, total] = await this.prisma.$transaction([this.prisma.wishlistItem.findMany({ where, orderBy: { createdAt: "desc" }, include: { product: { include: productInclude } }, skip, take }), this.prisma.wishlistItem.count({ where })]);
    return { items: records.map((item) => ({ id: item.id, product: mapProduct(item.product), createdAt: item.createdAt })), meta: paginationMeta(total, page, pageSize) };
  }

  async addWishlistItem(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    if (!product) apiException(404, "NOT_FOUND", "Produk tidak ditemukan.");
    const wishlist = await this.prisma.wishlist.upsert({ where: { userId }, update: {}, create: { userId } });
    return this.prisma.wishlistItem.upsert({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId } }, update: {}, create: { wishlistId: wishlist.id, productId } });
  }

  async removeWishlistItem(userId: string, id: string) {
    const deleted = await this.prisma.wishlistItem.deleteMany({ where: { id, wishlist: { userId } } });
    if (!deleted.count) apiException(404, "NOT_FOUND", "Wishlist item tidak ditemukan.");
    return { removed: true };
  }
}
