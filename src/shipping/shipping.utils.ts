import type { ShippingDestination, ShippingRate } from "./shipping.types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateShippingWeight(
  lines: ReadonlyArray<{ quantity: number; weightInGrams: number }>,
  packagingWeightGrams: number,
): number {
  if (!Number.isInteger(packagingWeightGrams) || packagingWeightGrams < 0) throw new Error("Invalid packaging weight.");
  return lines.reduce((total, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isInteger(line.weightInGrams) || line.weightInGrams < 1) throw new Error("Invalid product weight.");
    return total + line.quantity * line.weightInGrams;
  }, packagingWeightGrams);
}

export function normalizeDestinations(payload: unknown): ShippingDestination[] {
  const data = object(payload)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const row = object(entry); const id = number(row?.id); const label = text(row?.label);
    if (!row || id === null || !Number.isInteger(id) || id < 1 || !label) return [];
    return [{ id, label, province: text(row.province_name ?? row.province), city: text(row.city_name ?? row.city), district: text(row.district_name ?? row.district), subdistrict: text(row.subdistrict_name ?? row.subdistrict), postalCode: text(row.zip_code ?? row.postal_code) }];
  });
}

export function normalizeRates(payload: unknown): ShippingRate[] {
  const data = object(payload)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const row = object(entry); const cost = number(row?.cost); const courierCode = text(row?.code).toLowerCase(); const serviceCode = text(row?.service);
    if (!row || cost === null || cost < 0 || !courierCode || !serviceCode) return [];
    const etd = text(row.etd); const days = etd.match(/(\d+)(?:\s*-\s*(\d+))?/);
    const min = days ? Number(days[1]) : null; const max = days ? Number(days[2] ?? days[1]) : null;
    return [{ provider: "rajaongkir" as const, courierCode, courierName: text(row.name) || courierCode.toUpperCase(), serviceCode, serviceName: serviceCode, description: text(row.description), cost: Math.round(cost), etd, estimateLabel: etd || "Estimasi tidak tersedia", estimateMinDays: min, estimateMaxDays: max }];
  });
}

export function selectShippingRate(rates: readonly ShippingRate[], selection: { courierCode: string; serviceCode: string }): ShippingRate | null {
  return rates.find((rate) => rate.courierCode === selection.courierCode.toLowerCase() && rate.serviceCode.toLowerCase() === selection.serviceCode.toLowerCase()) ?? null;
}

export function assertOrderShippingWeight(actualWeightGrams: number, quotedWeightGrams: number): void {
  if (actualWeightGrams !== quotedWeightGrams) throw new Error("SHIPPING_WEIGHT_CHANGED");
}

export function assertOrderLines(lines: ReadonlyArray<{ quantity: number; availableStock: number; weightInGrams: number }>): void {
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("INVALID_QUANTITY");
    if (line.quantity > line.availableStock) throw new Error("INSUFFICIENT_STOCK");
    if (!Number.isInteger(line.weightInGrams) || line.weightInGrams < 1) throw new Error("INVALID_WEIGHT");
  }
}

export function upstreamMessage(payload: unknown): string | null {
  const meta = object(object(payload)?.meta);
  return text(meta?.message) || null;
}
