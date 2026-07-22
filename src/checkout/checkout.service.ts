import { HttpException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import { MidtransService } from "./midtrans.service";
import { ShippingService } from "../shipping/shipping.service";
import { assertOrderLines, assertOrderShippingWeight, calculateShippingWeight, selectShippingRate } from "../shipping/shipping.utils";

type Address = { recipient: string; phone: string; line1: string; line2?: string | null; district: string; city: string; province: string; postalCode: string; country: string };
type CheckoutInput = { addressId?: string; address?: Address; shipping: { destinationId: number; courierCode: string; serviceCode: string }; voucherCode?: string; paymentMethod: "BANK_TRANSFER" | "CREDIT_CARD" | "E_WALLET" | "VIRTUAL_ACCOUNT"; notes?: string };
type Line = { variantId: string; productName: string; productSlug: string; sku: string; variantName: string; color: string | null; size: string | null; imageUrl: string | null; unitPrice: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null; quantity: number; stock: number; weightInGrams: number };

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService, private readonly midtrans: MidtransService, private readonly shippingService: ShippingService) {}

  private async lines(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { activeKey: `user:${userId}` }, include: { items: { include: { variant: { include: { inventory: true, product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } } } } });
    if (!cart?.items.length) apiException(409, "EMPTY_CART", "Keranjang Anda kosong.");
    return { cart, lines: cart.items.map((item): Line => ({ variantId: item.variant.id, productName: item.variant.product.name, productSlug: item.variant.product.slug, sku: item.variant.sku, variantName: item.variant.name, color: item.variant.color, size: item.variant.size, imageUrl: item.variant.product.images[0]?.url ?? null, unitPrice: item.variant.price ?? item.variant.product.price, compareAtPrice: item.variant.compareAtPrice ?? item.variant.product.compareAtPrice, quantity: item.quantity, stock: Math.max(0, (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0)), weightInGrams: item.variant.weightInGrams })) };
  }

  async context(userId: string) {
    const [{ cart, lines }, customer, addresses] = await Promise.all([this.lines(userId), this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } }), this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] })]);
    return { cartId: cart.id, customer, addresses, items: lines.map((line) => ({ ...line, unitPrice: line.unitPrice.toNumber(), compareAtPrice: line.compareAtPrice?.toNumber() ?? null })) };
  }

  private async address(userId: string, input: CheckoutInput): Promise<Address> {
    if (input.addressId) { const found = await this.prisma.address.findFirst({ where: { id: input.addressId, userId } }); if (!found) apiException(404, "ADDRESS_NOT_FOUND", "Alamat tidak ditemukan."); return found; }
    if (!input.address) apiException(400, "ADDRESS_REQUIRED", "Alamat wajib diisi.");
    return input.address;
  }

  private totals(lines: Line[], shipping: number, voucher?: { type: string; value: Prisma.Decimal; minSpend: Prisma.Decimal | null; maxDiscount: Prisma.Decimal | null } | null) {
    const subtotal = lines.reduce((sum, line) => { if (line.quantity > line.stock) apiException(409, "INSUFFICIENT_STOCK", "Stok salah satu produk tidak lagi mencukupi."); return sum.add(line.unitPrice.mul(line.quantity)); }, new Prisma.Decimal(0));
    if (voucher?.minSpend && subtotal.lt(voucher.minSpend)) apiException(422, "VOUCHER_MIN_SPEND", "Belanja belum memenuhi minimum voucher.");
    let productDiscount = new Prisma.Decimal(0); let shippingDiscount = new Prisma.Decimal(0);
    if (voucher?.type === "PERCENTAGE") productDiscount = subtotal.mul(voucher.value).div(100);
    if (voucher?.type === "FIXED_AMOUNT") productDiscount = voucher.value;
    if (voucher?.type === "FREE_SHIPPING") shippingDiscount = Prisma.Decimal.min(shipping, voucher.value.isZero() ? shipping : voucher.value);
    if (voucher?.maxDiscount) productDiscount = Prisma.Decimal.min(productDiscount, voucher.maxDiscount);
    productDiscount = Prisma.Decimal.min(subtotal, productDiscount).toDecimalPlaces(2);
    const shippingTotal = new Prisma.Decimal(shipping).sub(shippingDiscount).toDecimalPlaces(2); const discountTotal = productDiscount.add(shippingDiscount).toDecimalPlaces(2);
    return { subtotal, discountTotal, shippingTotal, grandTotal: subtotal.add(shipping).sub(discountTotal).toDecimalPlaces(2) };
  }

  private async selection(userId: string, input: CheckoutInput, forceShippingRefresh = false) {
    const address = await this.address(userId, input); const { cart, lines } = await this.lines(userId);
    const quote = await this.shippingService.ratesForCart(userId, cart.id, input.shipping.destinationId, forceShippingRefresh);
    const shipping = selectShippingRate(quote.rates, input.shipping);
    if (!shipping) apiException(409, "SHIPPING_OPTION_INVALID", "Layanan pengiriman tidak lagi tersedia.");
    const now = new Date(); const voucher = input.voucherCode ? await this.prisma.voucher.findFirst({ where: { code: input.voucherCode, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } } }) : null;
    if (input.voucherCode && !voucher) apiException(422, "VOUCHER_INVALID", "Voucher tidak valid atau sudah berakhir.");
    return { address, cart, lines, shipping, quote, voucher, totals: this.totals(lines, shipping.cost, voucher) };
  }

  async preview(userId: string, input: CheckoutInput) {
    const selected = await this.selection(userId, input); const t = selected.totals;
    return { subtotal: t.subtotal.toNumber(), discountTotal: t.discountTotal.toNumber(), shippingTotal: t.shippingTotal.toNumber(), grandTotal: t.grandTotal.toNumber(), voucherCode: selected.voucher?.code ?? null, shipping: selected.shipping };
  }

  async create(userId: string, input: CheckoutInput) {
    const selected = await this.selection(userId, input, true); const { address, shipping, voucher, totals } = selected;
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, phone: true } });
      const cart = await tx.cart.findUniqueOrThrow({ where: { id: selected.cart.id }, include: { items: { include: { variant: { include: { inventory: true, product: true } } } } } });
      if (cart.userId !== userId || cart.status !== "ACTIVE" || cart.updatedAt.getTime() !== selected.cart.updatedAt.getTime()) apiException(409, "CART_CHANGED", "Keranjang berubah. Silakan cek ongkir kembali.");
      if (cart.items.length !== selected.lines.length || cart.items.some((item) => { const line = selected.lines.find((candidate) => candidate.variantId === item.variantId); const currentPrice = item.variant.price ?? item.variant.product.price; return !line || line.quantity !== item.quantity || !line.unitPrice.equals(currentPrice) || line.weightInGrams !== item.variant.weightInGrams; })) apiException(409, "CART_CHANGED", "Isi, harga, atau berat keranjang berubah. Silakan cek ongkir kembali.");
      try { assertOrderLines(cart.items.map((item) => ({ quantity: item.quantity, availableStock: Math.max(0, (item.variant.inventory?.quantity ?? 0) - (item.variant.inventory?.reserved ?? 0)), weightInGrams: item.variant.weightInGrams }))); } catch { apiException(409, "ORDER_VALIDATION_FAILED", "Stok atau berat produk tidak lagi valid."); }
      const transactionWeight = calculateShippingWeight(cart.items.map((item) => ({ quantity: item.quantity, weightInGrams: item.variant.weightInGrams })), Number(process.env.DEFAULT_PACKAGING_WEIGHT_GRAMS ?? 100));
      try { assertOrderShippingWeight(transactionWeight, selected.quote.weightGrams); } catch { apiException(409, "SHIPPING_WEIGHT_CHANGED", "Berat pesanan berubah. Silakan cek ongkir kembali."); }
      for (const item of cart.items) { const inv = item.variant.inventory; if (!inv) apiException(409, "INSUFFICIENT_STOCK", "Stok tidak mencukupi."); const update = await tx.inventory.updateMany({ where: { id: inv.id, version: inv.version, quantity: { gte: inv.reserved + item.quantity } }, data: { reserved: { increment: item.quantity }, version: { increment: 1 } } }); if (update.count !== 1) apiException(409, "INSUFFICIENT_STOCK", "Stok tidak mencukupi."); }
      const orderNumber = `IV-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const order = await tx.order.create({ data: { orderNumber, userId, customerEmail: user.email, customerName: user.name ?? address.recipient, customerPhone: user.phone ?? address.phone, shippingAddress: address, shippingAddressJson: address, subtotal: totals.subtotal, discountTotal: totals.discountTotal, shippingTotal: totals.shippingTotal, grandTotal: totals.grandTotal, voucherCode: voucher?.code, shippingMethod: `${shipping.courierCode}:${shipping.serviceCode}`, shippingEstimate: shipping.estimateLabel, shippingCourierCode: shipping.courierCode, shippingCourierName: shipping.courierName, shippingServiceCode: shipping.serviceCode, shippingServiceName: shipping.serviceName, shippingDescription: shipping.description, shippingCost: shipping.cost, shippingEtd: shipping.etd, shippingWeightGrams: selected.quote.weightGrams, shippingOriginId: selected.quote.originId, shippingDestinationId: selected.quote.destinationId, notes: input.notes, items: { create: selected.lines.map((line) => ({ variantId: line.variantId, productName: line.productName, productSlug: line.productSlug, sku: line.sku, variantName: line.variantName, colorSnapshot: line.color, sizeSnapshot: line.size, imageUrlSnapshot: line.imageUrl, unitPrice: line.unitPrice, compareAtPrice: line.compareAtPrice, quantity: line.quantity, lineTotal: line.unitPrice.mul(line.quantity), productSnapshot: { variantId: line.variantId, sku: line.sku, weightInGrams: line.weightInGrams } })) }, payments: { create: { provider: "midtrans", idempotencyKey: `checkout:${orderNumber}`, method: input.paymentMethod, amount: totals.grandTotal } }, shipments: { create: { provider: shipping.provider, courier: shipping.courierCode, service: shipping.serviceCode, shippingCost: shipping.cost, estimateMinDays: shipping.estimateMinDays, estimateMaxDays: shipping.estimateMaxDays, metadata: { quote: shipping } } } }, include: { payments: true, items: true } });
      if (voucher) { await tx.voucherUsage.create({ data: { voucherId: voucher.id, userId, orderId: order.id, discountAmount: totals.discountTotal } }); await tx.voucher.update({ where: { id: voucher.id }, data: { usedCount: { increment: 1 } } }); }
      await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED", activeKey: null } }); return order;
    }, { isolationLevel: "Serializable", timeout: 20_000 });
    try {
      const transaction = await this.midtrans.createSnapTransaction({
        orderNumber: result.orderNumber,
        amount: result.grandTotal.toNumber(),
        method: input.paymentMethod,
        customer: { name: result.customerName, email: result.customerEmail, phone: result.customerPhone },
        address,
        items: result.items.map((item) => ({ sku: item.sku, name: item.productName, price: item.unitPrice.toNumber(), quantity: item.quantity })),
        shippingTotal: result.shippingTotal.toNumber(),
      });
      await this.prisma.payment.update({ where: { id: result.payments[0].id }, data: { snapToken: transaction.token, redirectUrl: transaction.redirectUrl, expiresAt: transaction.expiresAt, metadata: { environment: transaction.environment } } });
      return { orderId: result.id, orderNumber: result.orderNumber, redirectUrl: transaction.redirectUrl, snapToken: transaction.token, provider: "midtrans", environment: transaction.environment };
    } catch (error) {
      await this.midtrans.markCreationFailed(result.id, selected.cart.id, error instanceof HttpException ? `HTTP_${error.getStatus()}` : "MIDTRANS_CREATE_FAILED");
      throw error;
    }
  }
}

export type { CheckoutInput };
