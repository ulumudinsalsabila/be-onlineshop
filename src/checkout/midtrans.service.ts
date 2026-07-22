import { HttpException, Injectable, Logger } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client";
import { apiException, englishApiMessage } from "../common/http";
import { PrismaService } from "../common/prisma.service";

type PaymentMethod = "BANK_TRANSFER" | "CREDIT_CARD" | "E_WALLET" | "VIRTUAL_ACCOUNT";
type LocalPaymentStatus = "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";

type SnapInput = {
  orderNumber: string;
  amount: number;
  method: PaymentMethod;
  customer: { name: string; email: string; phone?: string | null };
  address: { recipient: string; phone: string; line1: string; line2?: string | null; district: string; city: string; province: string; postalCode: string; country: string };
  items: Array<{ sku: string; name: string; price: number; quantity: number }>;
  shippingTotal: number;
};

const statusPayloadSchema = z.object({
  order_id: z.string().min(1).max(50),
  transaction_id: z.string().min(1).optional(),
  transaction_status: z.string().min(1),
  status_code: z.string().min(3),
  gross_amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  signature_key: z.string().optional(),
  fraud_status: z.string().optional(),
  payment_type: z.string().optional(),
  status_message: z.string().optional(),
}).passthrough();

type StatusPayload = z.infer<typeof statusPayloadSchema>;

@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name);
  private readonly serverKey = process.env.MIDTRANS_SERVER_KEY?.trim() || null;
  private readonly production = booleanEnvironment("MIDTRANS_IS_PRODUCTION", false);
  private readonly expiryMinutes = positiveInteger(process.env.MIDTRANS_PAYMENT_EXPIRY_MINUTES, 60, 5, 1440);

  constructor(private readonly prisma: PrismaService) {
    if (process.env.NODE_ENV === "production" && !this.serverKey) throw new Error("MIDTRANS_SERVER_KEY is required in production.");
    if (process.env.NODE_ENV === "production" && process.env.MIDTRANS_IS_PRODUCTION === undefined) throw new Error("MIDTRANS_IS_PRODUCTION must be set explicitly in production.");
    if (this.production && this.serverKey?.startsWith("SB-")) throw new Error("A Sandbox MIDTRANS_SERVER_KEY cannot be used when MIDTRANS_IS_PRODUCTION=true.");
    if (!this.production && this.serverKey && !this.serverKey.startsWith("SB-")) this.logger.warn("MIDTRANS_SERVER_KEY does not look like a Sandbox key while MIDTRANS_IS_PRODUCTION=false.");
    this.logger.log(`Midtrans environment: ${this.production ? "production" : "sandbox"}`);
  }

  async createSnapTransaction(input: SnapInput) {
    this.requireConfiguration();
    const productTotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = input.amount - productTotal - input.shippingTotal;
    const itemDetails = [
      ...input.items.map((item) => ({ id: cleanText(item.sku, 50), price: integerAmount(item.price), quantity: item.quantity, name: cleanText(item.name, 50) })),
      ...(input.shippingTotal ? [{ id: "SHIPPING", price: integerAmount(input.shippingTotal), quantity: 1, name: "Shipping" }] : []),
      ...(discount ? [{ id: "DISCOUNT", price: integerAmount(discount), quantity: 1, name: "Discount" }] : []),
    ];
    const itemTotal = itemDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (itemTotal !== integerAmount(input.amount)) apiException(500, "PAYMENT_AMOUNT_INVALID", "Rincian pembayaran tidak sesuai dengan total order.");

    const frontend = frontendOrigin();
    const payload = {
      transaction_details: { order_id: input.orderNumber, gross_amount: integerAmount(input.amount) },
      item_details: itemDetails,
      enabled_payments: enabledPayments(input.method),
      credit_card: { secure: true },
      customer_details: {
        first_name: cleanText(input.customer.name, 50),
        email: input.customer.email,
        phone: input.customer.phone || input.address.phone,
        shipping_address: {
          first_name: cleanText(input.address.recipient, 50),
          phone: input.address.phone,
          address: cleanText([input.address.line1, input.address.line2, input.address.district].filter(Boolean).join(", "), 200),
          city: cleanText(input.address.city, 50),
          postal_code: input.address.postalCode,
          country_code: "IDN",
        },
      },
      callbacks: { finish: `${frontend}/checkout/pending?order=${encodeURIComponent(input.orderNumber)}` },
      expiry: { unit: "minutes", duration: this.expiryMinutes },
      custom_field1: input.orderNumber,
    };
    const response = await this.midtransRequest("snap", "/snap/v1/transactions", { method: "POST", body: JSON.stringify(payload) });
    const parsed = z.object({ token: z.string().min(1), redirect_url: z.string().url() }).safeParse(response);
    if (!parsed.success) this.providerException(502, "MIDTRANS_RESPONSE_INVALID", "Midtrans tidak mengembalikan Snap token yang valid.");
    return { token: parsed.data.token, redirectUrl: parsed.data.redirect_url, expiresAt: new Date(Date.now() + this.expiryMinutes * 60_000), environment: this.production ? "production" as const : "sandbox" as const };
  }

  async handleNotification(body: unknown) {
    this.requireConfiguration();
    const payload = parseStatusPayload(body);
    if (!payload.signature_key || !this.validSignature(payload)) apiException(401, "INVALID_PAYMENT_SIGNATURE", "Signature notification Midtrans tidak valid.");
    return this.applyStatus(payload, "notification");
  }

  async sync(userId: string, orderId: string) {
    this.requireConfiguration();
    const payment = await this.prisma.payment.findFirst({ where: { orderId, provider: "midtrans", order: { userId } }, include: { order: { select: { orderNumber: true } } } });
    if (!payment) apiException(404, "PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.");
    const response = await this.midtransRequest("core", `/v2/${encodeURIComponent(payment.order.orderNumber)}/status`, { method: "GET" });
    return this.applyStatus(parseStatusPayload(response), "status_api");
  }

  async markCreationFailed(orderId: string, cartId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, voucherUsages: true } });
      if (!order || order.paymentStatus !== "PENDING") return;
      await releaseReservedStock(tx, order.items);
      await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED", failureCode: cleanText(reason, 120), lastSyncedAt: new Date() } });
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date() } });
      for (const usage of order.voucherUsages) {
        await tx.voucher.updateMany({ where: { id: usage.voucherId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      }
      await tx.voucherUsage.deleteMany({ where: { orderId } });
      await tx.cart.updateMany({ where: { id: cartId, status: "CONVERTED", activeKey: null }, data: { status: "ACTIVE", activeKey: `user:${order.userId}` } });
    });
  }

  private validSignature(payload: StatusPayload) {
    const serverKey = this.requireConfiguration();
    const expected = createHash("sha512").update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`).digest("hex");
    const received = payload.signature_key?.toLowerCase() ?? "";
    if (!/^[a-f0-9]{128}$/.test(received)) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  }

  private async applyStatus(payload: StatusPayload, source: "notification" | "status_api") {
    const nextStatus = localStatus(payload.transaction_status, payload.fraud_status, payload.status_code);
    const eventKey = `midtrans:${payload.transaction_id ?? payload.order_id}:${payload.transaction_status}:${payload.status_code}`;
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { provider: "midtrans", order: { orderNumber: payload.order_id } }, include: { order: { include: { items: true } } } });
      if (!payment) apiException(404, "PAYMENT_NOT_FOUND", "Pembayaran Midtrans tidak ditemukan.");
      if (!new Prisma.Decimal(payload.gross_amount).equals(payment.amount)) apiException(400, "PAYMENT_AMOUNT_MISMATCH", "Nominal notification tidak sesuai dengan order.");
      const duplicate = await tx.paymentWebhookEvent.findUnique({ where: { eventKey } });
      if (duplicate) return { orderId: payment.orderId, status: payment.status, duplicate: true };

      const canConsumeReservation = ["PENDING", "AUTHORIZED"].includes(payment.status);
      const isFailure = ["FAILED", "EXPIRED", "CANCELLED"].includes(nextStatus);
      if (nextStatus === "PAID" && canConsumeReservation) await consumeReservedStock(tx, payment.order.items);
      else if (isFailure && canConsumeReservation) await releaseReservedStock(tx, payment.order.items);

      const appliedStatus = allowedTransition(payment.status, nextStatus) ? nextStatus : payment.status;
      const orderStatus = appliedStatus === "PAID" ? "PAID" : isFailure && canConsumeReservation ? "CANCELLED" : appliedStatus === "REFUNDED" ? "REFUNDED" : payment.order.status;
      await tx.payment.update({ where: { id: payment.id }, data: {
        providerRef: payload.transaction_id ?? payment.providerRef,
        status: appliedStatus,
        paidAt: appliedStatus === "PAID" ? payment.paidAt ?? new Date() : payment.paidAt,
        failureCode: isFailure ? cleanText(payload.status_message ?? payload.transaction_status, 120) : null,
        lastSyncedAt: new Date(),
        metadata: { source, transactionStatus: payload.transaction_status, fraudStatus: payload.fraud_status ?? null, paymentType: payload.payment_type ?? null, statusCode: payload.status_code, environment: this.production ? "production" : "sandbox" },
      } });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: orderStatus, paymentStatus: appliedStatus, cancelledAt: orderStatus === "CANCELLED" ? payment.order.cancelledAt ?? new Date() : payment.order.cancelledAt } });
      await tx.paymentWebhookEvent.create({ data: { paymentId: payment.id, provider: "midtrans", eventKey, payload: payload as Prisma.InputJsonValue } });
      this.logger.log(`Midtrans ${source} applied; order=${payload.order_id} status=${appliedStatus}`);
      return { orderId: payment.orderId, status: appliedStatus, duplicate: false };
    }, { isolationLevel: "Serializable", timeout: 20_000 });
  }

  private async midtransRequest(api: "snap" | "core", path: string, init: RequestInit) {
    const serverKey = this.requireConfiguration();
    const host = api === "snap" ? (this.production ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com") : (this.production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
    let response: Response;
    try {
      response = await fetch(`${host}${path}`, { ...init, signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}` } });
    } catch (error) {
      this.logger.error(`Midtrans network error: ${error instanceof Error ? error.message : "unknown error"}`);
      this.providerException(502, "MIDTRANS_UNREACHABLE", "Midtrans tidak dapat dihubungi. Silakan coba kembali.");
    }
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const details = providerErrorDetails(body, response.status, this.production);
      this.logger.error(`Midtrans API rejected request: ${JSON.stringify(details)}`);
      throw new HttpException({ success: false, error: { code: "MIDTRANS_REQUEST_FAILED", message: "Midtrans rejected the payment request.", details } }, 502);
    }
    return body;
  }

  private requireConfiguration() {
    if (!this.serverKey) apiException(503, "PAYMENT_NOT_CONFIGURED", "MIDTRANS_SERVER_KEY belum dikonfigurasi pada backend.");
    return this.serverKey;
  }

  private providerException(status: number, code: string, message: string): never {
    throw new HttpException({ success: false, error: { code, message: englishApiMessage(code, message), details: { provider: "midtrans", environment: this.production ? "production" : "sandbox" } } }, status);
  }
}

function parseStatusPayload(value: unknown): StatusPayload {
  const parsed = statusPayloadSchema.safeParse(value);
  if (!parsed.success) apiException(400, "INVALID_MIDTRANS_PAYLOAD", "Payload status Midtrans tidak valid.");
  return parsed.data;
}

export function localStatus(status: string, fraudStatus?: string, statusCode?: string): LocalPaymentStatus {
  if (fraudStatus === "deny") return "FAILED";
  if (status === "authorize") return "AUTHORIZED";
  if (status === "capture") return statusCode !== undefined && statusCode !== "200" || fraudStatus !== undefined && fraudStatus !== "accept" ? "PENDING" : "PAID";
  if (status === "settlement") return statusCode !== undefined && statusCode !== "200" ? "PENDING" : "PAID";
  if (status === "deny" || status === "failure") return "FAILED";
  if (status === "expire") return "EXPIRED";
  if (status === "cancel") return "CANCELLED";
  if (status === "refund" || status === "chargeback") return "REFUNDED";
  if (status === "partial_refund" || status === "partial_chargeback") return "PARTIALLY_REFUNDED";
  return "PENDING";
}

export function allowedTransition(current: string, next: LocalPaymentStatus) {
  if (current === next) return true;
  const allowed: Record<string, LocalPaymentStatus[]> = {
    PENDING: ["AUTHORIZED", "PAID", "FAILED", "EXPIRED", "CANCELLED"],
    AUTHORIZED: ["PAID", "FAILED", "EXPIRED", "CANCELLED"],
    PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
    PARTIALLY_REFUNDED: ["REFUNDED"],
  };
  return allowed[current]?.includes(next) ?? false;
}

async function consumeReservedStock(tx: Prisma.TransactionClient, items: Array<{ variantId: string | null; quantity: number }>) {
  for (const item of items) {
    if (!item.variantId) continue;
    const updated = await tx.inventory.updateMany({ where: { variantId: item.variantId, quantity: { gte: item.quantity }, reserved: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity }, reserved: { decrement: item.quantity }, version: { increment: 1 } } });
    if (updated.count !== 1) apiException(409, "INVENTORY_COMMIT_FAILED", "Stok pembayaran tidak dapat dikonfirmasi.");
  }
}

async function releaseReservedStock(tx: Prisma.TransactionClient, items: Array<{ variantId: string | null; quantity: number }>) {
  for (const item of items) {
    if (!item.variantId) continue;
    await tx.inventory.updateMany({ where: { variantId: item.variantId, reserved: { gte: item.quantity } }, data: { reserved: { decrement: item.quantity }, version: { increment: 1 } } });
  }
}

function enabledPayments(method: PaymentMethod) {
  if (method === "CREDIT_CARD") return ["credit_card"];
  if (method === "E_WALLET") return ["gopay", "ovo", "dana", "shopeepay", "other_qris"];
  if (method === "BANK_TRANSFER") return ["echannel"];
  return ["permata_va", "bca_va", "bni_va", "bri_va", "cimb_va", "danamon_va", "bsi_va"];
}

function frontendOrigin() {
  const value = process.env.FRONTEND_URL?.split(",")[0]?.trim() || "http://localhost:3000";
  try { return new URL(value).origin; }
  catch { apiException(500, "FRONTEND_URL_INVALID", "FRONTEND_URL backend tidak valid."); }
}

function integerAmount(value: number) {
  if (!Number.isSafeInteger(value)) apiException(422, "PAYMENT_AMOUNT_INVALID", "Midtrans memerlukan nominal IDR berupa bilangan bulat.");
  return value;
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/[\r\n|]/g, " ").trim().slice(0, maxLength);
}

function positiveInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function booleanEnvironment(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be either "true" or "false".`);
}

function providerErrorDetails(body: unknown, httpStatus: number, production: boolean) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const messages = Array.isArray(record.error_messages) ? record.error_messages.filter((value): value is string => typeof value === "string").map((value) => cleanText(value, 200)).slice(0, 5) : [];
  return { provider: "midtrans", environment: production ? "production" : "sandbox", httpStatus, statusCode: typeof record.status_code === "string" ? record.status_code : null, message: typeof record.status_message === "string" ? cleanText(record.status_message, 200) : null, messages };
}
