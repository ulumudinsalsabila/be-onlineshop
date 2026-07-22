import { Injectable } from "@nestjs/common";
import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import type { ShippingDestination, ShippingQuote } from "./shipping.types";
import { calculateShippingWeight, normalizeDestinations, normalizeRates, upstreamMessage } from "./shipping.utils";

type CacheEntry<T> = { expiresAt: number; value: T };

@Injectable()
export class ShippingService {
  private readonly destinationCache = new Map<string, CacheEntry<ShippingDestination[]>>();
  private readonly quoteCache = new Map<string, CacheEntry<ShippingQuote>>();
  private readonly requestCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  enforceRateLimit(key: string, maximum: number): void {
    const now = Date.now(); const current = this.requestCounters.get(key);
    if (!current || current.resetAt <= now) { this.requestCounters.set(key, { count: 1, resetAt: now + 60_000 }); return; }
    if (current.count >= maximum) apiException(429, "RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi dalam satu menit.");
    current.count += 1;
    if (this.requestCounters.size > 2_000) for (const [entryKey, entry] of this.requestCounters) if (entry.resetAt <= now) this.requestCounters.delete(entryKey);
  }

  async destinations(search: string): Promise<{ query: string; items: ShippingDestination[]; cached: boolean }> {
    const query = search.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
    const cached = this.destinationCache.get(query);
    if (cached?.expiresAt && cached.expiresAt > Date.now()) return { query, items: cached.value, cached: true };
    const url = new URL(`${this.baseUrl()}/destination/domestic-destination`); url.searchParams.set("search", query); url.searchParams.set("limit", "10"); url.searchParams.set("offset", "0");
    const payload = await this.request(url, { method: "GET" }); const items = normalizeDestinations(payload).slice(0, 10);
    this.destinationCache.set(query, { value: items, expiresAt: Date.now() + 10 * 60_000 });
    if (this.destinationCache.size > 250) this.destinationCache.delete(this.destinationCache.keys().next().value ?? query);
    return { query, items, cached: false };
  }

  async ratesForCart(userId: string, cartId: string, destinationId: number, forceRefresh = false): Promise<ShippingQuote> {
    const cart = await this.prisma.cart.findFirst({ where: { id: cartId, userId, status: "ACTIVE" }, include: { items: { include: { variant: { select: { weightInGrams: true } } } } } });
    if (!cart) apiException(404, "CART_NOT_FOUND", "Keranjang aktif tidak ditemukan.");
    if (!cart.items.length) apiException(409, "EMPTY_CART", "Keranjang Anda kosong.");
    const weightGrams = calculateShippingWeight(cart.items.map((item) => ({ quantity: item.quantity, weightInGrams: item.variant.weightInGrams })), this.packagingWeight());
    const key = `${cart.id}:${destinationId}:${weightGrams}`; const cached = this.quoteCache.get(key);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const quote = await this.quote(cart.id, destinationId, weightGrams);
    this.quoteCache.set(key, { value: quote, expiresAt: Date.now() + 60_000 });
    if (this.quoteCache.size > 250) this.quoteCache.delete(this.quoteCache.keys().next().value ?? key);
    return quote;
  }

  async quote(cartId: string, destinationId: number, weightGrams: number): Promise<ShippingQuote> {
    const originId = this.originId(); const body = new URLSearchParams({ origin: String(originId), destination: String(destinationId), weight: String(weightGrams), courier: this.couriers().join(":") });
    const payload = await this.request(new URL(`${this.baseUrl()}/calculate/domestic-cost`), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const allowed = new Set(this.couriers()); const rates = normalizeRates(payload).filter((rate) => allowed.has(rate.courierCode));
    if (!rates.length) apiException(422, "SHIPPING_UNAVAILABLE", "Tidak ada layanan pengiriman untuk tujuan ini.");
    return { cartId, originId, destinationId, weightGrams, rates };
  }

  private baseUrl(): string { return (process.env.RAJAONGKIR_BASE_URL?.trim() || "https://rajaongkir.komerce.id/api/v1").replace(/\/$/, ""); }
  private apiKey(): string { const value = process.env.RAJAONGKIR_API_KEY?.trim(); if (!value) apiException(503, "SHIPPING_NOT_CONFIGURED", "Layanan ongkir belum dikonfigurasi."); return value; }
  private originId(): number { const value = Number(process.env.RAJAONGKIR_ORIGIN_ID); if (!Number.isInteger(value) || value < 1) apiException(503, "SHIPPING_NOT_CONFIGURED", "Lokasi asal pengiriman belum dikonfigurasi."); return value; }
  private packagingWeight(): number { const value = Number(process.env.DEFAULT_PACKAGING_WEIGHT_GRAMS ?? 100); if (!Number.isInteger(value) || value < 0) apiException(503, "SHIPPING_NOT_CONFIGURED", "Berat kemasan tidak valid."); return value; }
  private couriers(): string[] { const values = (process.env.RAJAONGKIR_COURIERS || "jne:sicepat:jnt:tiki:anteraja:pos").split(":").map((value) => value.trim().toLowerCase()).filter((value) => /^[a-z0-9_-]+$/.test(value)); if (!values.length) apiException(503, "SHIPPING_NOT_CONFIGURED", "Daftar kurir belum dikonfigurasi."); return [...new Set(values)]; }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), key: this.apiKey(), Accept: "application/json" }, signal: AbortSignal.timeout(8_000) }); }
    catch (error) { if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) apiException(504, "SHIPPING_TIMEOUT", "RajaOngkir tidak merespons tepat waktu. Silakan coba lagi."); apiException(502, "SHIPPING_UPSTREAM_ERROR", "Layanan ongkir sedang tidak dapat dihubungi."); }
    let payload: unknown = null; try { payload = await response.json() as unknown; } catch { /* handled as an invalid upstream response below */ }
    if (response.status === 429) apiException(429, "SHIPPING_QUOTA_EXCEEDED", "Kuota RajaOngkir telah habis atau terlalu banyak permintaan.");
    if (!response.ok) apiException(response.status >= 500 ? 502 : 422, "SHIPPING_UPSTREAM_ERROR", upstreamMessage(payload) ?? "RajaOngkir menolak permintaan ongkir.");
    return payload;
  }
}
