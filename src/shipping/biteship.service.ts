import { HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";

type RateLine = { productName: string; sku: string; unitPrice: Prisma.Decimal; quantity: number; weightGrams: number | null };
type Address = { recipient: string; phone: string; line1: string; line2?: string | null; district: string; city: string; province: string; postalCode: string; country: string };
type TrackingEvent = { status: string; note: string; occurredAt: string };

@Injectable()
export class BiteshipService {
  private readonly logger = new Logger(BiteshipService.name);
  private readonly production = booleanEnvironment("BITESHIP_IS_PRODUCTION", false);
  private readonly baseUrl = (process.env.BITESHIP_BASE_URL?.trim() || "https://api.biteship.com/v1").replace(/\/$/, "");
  private readonly apiKey = this.selectedApiKey();

  constructor(private readonly prisma: PrismaService) {
    if (this.apiKey && this.production && !this.apiKey.startsWith("biteship_live.")) throw new Error("BITESHIP_API_KEY_LIVE must be a live Biteship key when BITESHIP_IS_PRODUCTION=true.");
    if (this.apiKey && !this.production && !this.apiKey.startsWith("biteship_test.")) throw new Error("BITESHIP_API_KEY_TEST must be a test Biteship key when BITESHIP_IS_PRODUCTION=false.");
    if (process.env.NODE_ENV === "production" && !process.env.BITESHIP_WEBHOOK_SECRET?.trim()) throw new Error("BITESHIP_WEBHOOK_SECRET is required in production.");
    this.logger.log(`Biteship environment: ${this.environment}`);
  }

  get environment() { return this.production ? "production" as const : "testing" as const; }

  async rates(lines: RateLine[], destinationPostalCode: string, courierCodes: string[]) {
    this.requireConfiguration();
    const originPostalCode = postalCodeEnvironment("BITESHIP_ORIGIN_POSTAL_CODE");
    const response = asRecord(await this.request("/rates/couriers", {
      method: "POST",
      body: JSON.stringify({
        origin_postal_code: Number(originPostalCode),
        destination_postal_code: Number(destinationPostalCode),
        couriers: [...new Set(courierCodes.map((code) => code.trim().toLowerCase()).filter(Boolean))].join(","),
        items: lines.map((line) => ({ name: cleanText(line.productName, 100), sku: cleanText(line.sku, 100), category: "fashion", value: integerAmount(line.unitPrice.toNumber()), quantity: line.quantity, weight: Math.max(1, Math.ceil(line.weightGrams ?? 1000)) })),
      }),
    }));
    const pricing = Array.isArray(response.pricing) ? response.pricing : [];
    return pricing.flatMap((value) => {
      const item = asRecord(value); const courierCode = stringValue(item.courier_code ?? item.company); const serviceCode = stringValue(item.courier_service_code ?? item.type); const cost = numberValue(item.price);
      if (!courierCode || !serviceCode || cost === null) return [];
      const [estimateMinDays, estimateMaxDays] = durationDays(stringValue(item.shipment_duration_range), stringValue(item.shipment_duration_unit));
      return [{ provider: "biteship", environment: this.environment, courierCode, courierName: stringValue(item.courier_name) || courierCode.toUpperCase(), serviceCode, serviceName: stringValue(item.courier_service_name) || serviceCode.toUpperCase(), cost: integerAmount(cost), estimateMinDays, estimateMaxDays, estimateLabel: stringValue(item.duration) || estimateLabel(estimateMinDays, estimateMaxDays) }];
    });
  }

  async bookPaidShipment(shipmentId: string) {
    this.requireBookingConfiguration();
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true } } } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment tidak ditemukan.");
    if (shipment.providerRef) return this.trackingResponse(shipment);
    if (shipment.order.paymentStatus !== "PAID") apiException(409, "PAYMENT_NOT_PAID", "Shipment hanya dapat dipesan setelah pembayaran lunas.");
    const address = parseAddress(shipment.order.shippingAddress);
    const response = asRecord(await this.request("/orders", { method: "POST", body: JSON.stringify({
      shipper_contact_name: requiredEnvironment("BITESHIP_SHIPPER_NAME"),
      shipper_contact_phone: requiredEnvironment("BITESHIP_SHIPPER_PHONE"),
      shipper_contact_email: optionalEnvironment("BITESHIP_SHIPPER_EMAIL"),
      shipper_organization: optionalEnvironment("BITESHIP_SHIPPER_ORGANIZATION") || "IVORY",
      origin_contact_name: requiredEnvironment("BITESHIP_ORIGIN_CONTACT_NAME"),
      origin_contact_phone: requiredEnvironment("BITESHIP_ORIGIN_CONTACT_PHONE"),
      origin_contact_email: optionalEnvironment("BITESHIP_ORIGIN_CONTACT_EMAIL"),
      origin_address: requiredEnvironment("BITESHIP_ORIGIN_ADDRESS"),
      origin_note: optionalEnvironment("BITESHIP_ORIGIN_NOTE"),
      origin_postal_code: Number(postalCodeEnvironment("BITESHIP_ORIGIN_POSTAL_CODE")),
      destination_contact_name: address.recipient,
      destination_contact_phone: address.phone,
      destination_contact_email: shipment.order.customerEmail,
      destination_address: cleanText([address.line1, address.line2, address.district, address.city, address.province, address.postalCode, address.country].filter(Boolean).join(", "), 500),
      destination_postal_code: Number(address.postalCode),
      courier_company: shipment.courier.toLowerCase(),
      courier_type: (shipment.service || "reg").toLowerCase(),
      delivery_type: "now",
      order_note: shipment.order.notes || undefined,
      reference_id: shipment.order.orderNumber,
      metadata: { orderId: shipment.order.id, shipmentId: shipment.id, environment: this.environment },
      tags: ["ivory", this.environment],
      items: shipment.order.items.map((item) => ({ name: cleanText(item.productName, 100), description: cleanText(item.variantName, 100), sku: cleanText(item.sku, 100), category: "fashion", value: integerAmount(item.unitPrice.toNumber()), quantity: item.quantity, weight: Math.max(1, Math.ceil(numberValue(asRecord(item.productSnapshot).weightGrams) ?? 1000)) })),
    }) }));
    const providerRef = stringValue(response.id); const courier = asRecord(response.courier); const trackingNumber = stringValue(courier.waybill_id); const providerStatus = stringValue(response.status) || "confirmed";
    if (!providerRef) this.providerException(502, "BITESHIP_RESPONSE_INVALID", "Biteship tidak mengembalikan order ID yang valid.");
    const event = trackingEvent(providerStatus, "Shipment dibuat di Biteship.", new Date().toISOString());
    const updated = await this.prisma.shipment.update({ where: { id: shipment.id }, data: { provider: "biteship", providerRef, trackingNumber: trackingNumber || null, status: localStatus(providerStatus), lastTrackedAt: new Date(), shippedAt: isInTransit(providerStatus) ? new Date() : null, metadata: mergeMetadata(shipment.metadata, { environment: this.environment, providerStatus, trackingId: stringValue(courier.tracking_id), trackingLink: stringValue(courier.link), history: [event], order: response }) } });
    this.logger.log(`Biteship order created; shipment=${shipment.id} providerRef=${providerRef}`);
    return this.trackingResponse(updated);
  }

  async bookPaidOrder(orderId: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId, provider: "biteship" }, orderBy: { createdAt: "asc" } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment Biteship tidak ditemukan untuk order ini.");
    return this.bookPaidShipment(shipment.id);
  }

  async ownedTracking(userId: string, orderId: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId, order: { userId } }, orderBy: { createdAt: "asc" } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment tidak ditemukan.");
    return this.trackingResponse(shipment);
  }

  async syncOwnedTracking(userId: string, orderId: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId, order: { userId } }, orderBy: { createdAt: "asc" } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment tidak ditemukan.");
    if (!shipment.providerRef) return this.trackingResponse(shipment);
    return this.syncShipment(shipment.id);
  }

  async syncShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment tidak ditemukan.");
    if (!shipment.providerRef) apiException(409, "SHIPMENT_NOT_BOOKED", "Shipment belum dibuat di Biteship.");
    const trackingId = stringValue(asRecord(shipment.metadata).trackingId);
    if (!trackingId) apiException(409, "TRACKING_NOT_AVAILABLE", "Tracking ID Biteship belum tersedia.");
    const response = asRecord(await this.request(`/trackings/${encodeURIComponent(trackingId)}`, { method: "GET" }));
    return this.applyTracking(shipment, response, "sync");
  }

  verifyWebhookSecret(authorization?: string, headerSecret?: string) {
    const expected = process.env.BITESHIP_WEBHOOK_SECRET?.trim();
    if (!expected) apiException(503, "BITESHIP_WEBHOOK_NOT_CONFIGURED", "Secret webhook Biteship belum dikonfigurasi.");
    const received = headerSecret?.trim() || (authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : authorization?.trim());
    if (!received || received !== expected) apiException(401, "INVALID_BITESHIP_WEBHOOK_SECRET", "Autentikasi webhook Biteship tidak valid.");
  }

  async handleWebhook(body: unknown) {
    const payload = asRecord(body); const event = stringValue(payload.event); const providerRef = stringValue(payload.order_id); const trackingId = stringValue(payload.courier_tracking_id);
    if (!event || !["order.status", "order.price", "order.waybill_id"].includes(event) || (!providerRef && !trackingId)) apiException(400, "INVALID_BITESHIP_WEBHOOK", "Payload webhook Biteship tidak valid.");
    const shipment = await this.prisma.shipment.findFirst({ where: { provider: "biteship", OR: [...(providerRef ? [{ providerRef }] : []), ...(trackingId ? [{ metadata: { path: ["trackingId"], equals: trackingId } }] : [])] } });
    if (!shipment) apiException(404, "SHIPMENT_NOT_FOUND", "Shipment untuk webhook Biteship tidak ditemukan.");
    return this.applyTracking(shipment, payload, "webhook");
  }

  private async applyTracking(shipment: ShipmentLike, payload: Record<string, unknown>, source: "webhook" | "sync") {
    const providerStatus = stringValue(payload.status) || stringValue(asRecord(shipment.metadata).providerStatus) || "confirmed";
    const incomingHistory = Array.isArray(payload.history) ? payload.history.flatMap((value) => { const item = asRecord(value); const status = stringValue(item.status); if (!status) return []; return [trackingEvent(status, stringValue(item.note) || humanStatus(status), validDate(stringValue(item.updated_at)) || new Date().toISOString())]; }) : [];
    const currentHistory = trackingHistory(shipment.metadata); const webhookEvent = source === "webhook" && currentHistory.at(-1)?.status !== providerStatus ? trackingEvent(providerStatus, humanStatus(providerStatus), new Date().toISOString()) : null;
    const history = dedupeEvents([...currentHistory, ...incomingHistory, ...(webhookEvent ? [webhookEvent] : [])]);
    const trackingNumber = stringValue(payload.waybill_id ?? payload.courier_waybill_id) || shipment.trackingNumber;
    const courier = asRecord(payload.courier); const trackingId = stringValue(payload.courier_tracking_id ?? payload.id) || stringValue(asRecord(shipment.metadata).trackingId);
    const now = new Date(); const status = localStatus(providerStatus);
    const updated = await this.prisma.shipment.update({ where: { id: shipment.id }, data: { status, trackingNumber: trackingNumber || null, lastTrackedAt: now, shippedAt: status === "IN_TRANSIT" ? shipment.shippedAt ?? now : shipment.shippedAt, deliveredAt: status === "DELIVERED" ? shipment.deliveredAt ?? now : shipment.deliveredAt, metadata: mergeMetadata(shipment.metadata, { environment: this.environment, providerStatus, trackingId, trackingLink: stringValue(payload.link) || stringValue(courier.link) || stringValue(asRecord(shipment.metadata).trackingLink), history, lastEvent: source === "webhook" ? payload : undefined }) } });
    return this.trackingResponse(updated);
  }

  private trackingResponse(shipment: ShipmentLike) {
    const metadata = asRecord(shipment.metadata);
    return { shipmentId: shipment.id, provider: shipment.provider, environment: stringValue(metadata.environment) || this.environment, courier: shipment.courier, service: shipment.service, status: shipment.status, providerStatus: stringValue(metadata.providerStatus), trackingNumber: shipment.trackingNumber, trackingLink: stringValue(metadata.trackingLink), lastTrackedAt: shipment.lastTrackedAt, events: trackingHistory(shipment.metadata) };
  }

  private selectedApiKey() { return (this.production ? process.env.BITESHIP_API_KEY_LIVE : process.env.BITESHIP_API_KEY_TEST)?.trim() || process.env.BITESHIP_API_KEY?.trim() || null; }
  private requireConfiguration() { if (!this.apiKey) apiException(503, "SHIPPING_NOT_CONFIGURED", `Biteship API key untuk mode ${this.environment} belum dikonfigurasi.`); return this.apiKey; }
  private requireBookingConfiguration() { this.requireConfiguration(); for (const name of ["BITESHIP_SHIPPER_NAME", "BITESHIP_SHIPPER_PHONE", "BITESHIP_ORIGIN_CONTACT_NAME", "BITESHIP_ORIGIN_CONTACT_PHONE", "BITESHIP_ORIGIN_ADDRESS", "BITESHIP_ORIGIN_POSTAL_CODE"]) requiredEnvironment(name); }

  private async request(path: string, init: RequestInit) {
    const key = this.requireConfiguration(); let response: Response;
    try { response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: key } }); }
    catch (error) { this.logger.error(`Biteship network error: ${error instanceof Error ? error.message : "unknown error"}`); this.providerException(502, "BITESHIP_UNREACHABLE", "Biteship tidak dapat dihubungi. Silakan coba kembali."); }
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok || asRecord(body).success === false) { const record = asRecord(body); const providerCode = stringValue(record.code) ?? numberValue(record.code); const details = { provider: "biteship", environment: this.environment, httpStatus: response.status, code: providerCode, message: stringValue(record.message ?? record.error) || null }; this.logger.error(`Biteship API rejected request: ${JSON.stringify(details)}`); throw new HttpException({ success: false, error: { code: "BITESHIP_REQUEST_FAILED", message: "Biteship menolak permintaan pengiriman.", details } }, 502); }
    return body;
  }
  private providerException(status: number, code: string, message: string): never { throw new HttpException({ success: false, error: { code, message, details: { provider: "biteship", environment: this.environment } } }, status); }
}

type ShipmentLike = { id: string; provider: string; courier: string; service: string | null; trackingNumber: string | null; status: string; lastTrackedAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; metadata: unknown };
function booleanEnvironment(name: string, fallback: boolean) { const value = process.env[name]?.trim().toLowerCase(); return value === undefined || value === "" ? fallback : value === "true" || value === "1"; }
function requiredEnvironment(name: string) { const value = process.env[name]?.trim(); if (!value) apiException(503, "SHIPPING_NOT_CONFIGURED", `${name} belum dikonfigurasi pada backend.`); return value; }
function optionalEnvironment(name: string) { return process.env[name]?.trim() || undefined; }
function postalCodeEnvironment(name: string) { const value = requiredEnvironment(name); if (!/^\d{5}$/.test(value)) apiException(503, "SHIPPING_CONFIGURATION_INVALID", `${name} harus berisi 5 digit kode pos.`); return value; }
function integerAmount(value: number) { return Math.max(0, Math.round(value)); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value: unknown) { const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(number) ? number : null; }
function cleanText(value: string, max: number) { return value.replace(/[<>]/g, "").trim().slice(0, max); }
function durationDays(range: string | null, unit: string | null): [number | null, number | null] { if (unit && unit !== "days" && unit !== "day") return [null, null]; const numbers = (range?.match(/\d+/g) ?? []).map(Number); return [numbers[0] ?? null, numbers[1] ?? numbers[0] ?? null]; }
function estimateLabel(min: number | null, max: number | null) { return min === null ? "Estimate available from courier" : `${min}${max !== null && max !== min ? `-${max}` : ""} days`; }
function parseAddress(value: unknown): Address { const item = asRecord(value); const result = { recipient: stringValue(item.recipient), phone: stringValue(item.phone), line1: stringValue(item.line1), line2: stringValue(item.line2), district: stringValue(item.district), city: stringValue(item.city), province: stringValue(item.province), postalCode: stringValue(item.postalCode), country: stringValue(item.country) || "Indonesia" }; if (!result.recipient || !result.phone || !result.line1 || !result.district || !result.city || !result.province || !result.postalCode || !/^\d{5}$/.test(result.postalCode)) apiException(500, "SHIPPING_ADDRESS_INVALID", "Alamat pengiriman order tidak lengkap."); return result as Address; }
function localStatus(status: string) { const normalized = status.replace(/[_\s-]/g, "").toLowerCase(); if (["delivered"].includes(normalized)) return "DELIVERED" as const; if (["returnintransit", "returned", "disposed"].includes(normalized)) return "RETURNED" as const; if (["rejected", "couriernotfound", "cancelled"].includes(normalized)) return "FAILED" as const; if (["picked", "intransit", "droppingoff"].includes(normalized)) return "IN_TRANSIT" as const; if (["confirmed", "allocated", "pickingup", "onhold"].includes(normalized)) return "READY" as const; return "PENDING" as const; }
function isInTransit(status: string) { return localStatus(status) === "IN_TRANSIT"; }
function humanStatus(status: string) { return status.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function validDate(value: string | null) { if (!value || Number.isNaN(Date.parse(value))) return null; return new Date(value).toISOString(); }
function trackingEvent(status: string, note: string, occurredAt: string): TrackingEvent { return { status, note, occurredAt }; }
function trackingHistory(metadata: unknown): TrackingEvent[] { const history = asRecord(metadata).history; if (!Array.isArray(history)) return []; return history.flatMap((value: unknown) => { const item = asRecord(value); const status = stringValue(item.status); const occurredAt = validDate(stringValue(item.occurredAt)); if (!status || !occurredAt) return []; return [{ status, note: stringValue(item.note) || humanStatus(status), occurredAt }]; }); }
function dedupeEvents(events: TrackingEvent[]) { const seen = new Set<string>(); return events.filter((event) => { const key = `${event.status}|${event.note}|${event.occurredAt}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-100); }
function mergeMetadata(current: unknown, next: Record<string, unknown>) { return { ...asRecord(current), ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) } as Prisma.InputJsonValue; }
