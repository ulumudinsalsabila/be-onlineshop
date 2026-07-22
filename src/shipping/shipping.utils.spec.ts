import assert from "node:assert/strict";
import test from "node:test";
import { assertOrderLines, assertOrderShippingWeight, calculateShippingWeight, normalizeRates, selectShippingRate } from "./shipping.utils";

void test("menghitung berat seluruh variant dan packaging dalam gram", () => {
  assert.equal(calculateShippingWeight([{ quantity: 2, weightInGrams: 450 }, { quantity: 1, weightInGrams: 1200 }], 100), 2200);
});

void test("menolak berat variant yang tidak valid saat validasi order", () => {
  assert.throws(() => calculateShippingWeight([{ quantity: 1, weightInGrams: 0 }], 100), /Invalid product weight/);
  assert.throws(() => assertOrderShippingWeight(1100, 1000), /SHIPPING_WEIGHT_CHANGED/);
});

void test("memvalidasi ulang kuantitas, stok, dan berat order", () => {
  assert.doesNotThrow(() => assertOrderLines([{ quantity: 2, availableStock: 3, weightInGrams: 500 }]));
  assert.throws(() => assertOrderLines([{ quantity: 4, availableStock: 3, weightInGrams: 500 }]), /INSUFFICIENT_STOCK/);
});

void test("menormalisasi tarif RajaOngkir dan ETD", () => {
  const rates = normalizeRates({ data: [{ name: "Jalur Nugraha Ekakurir", code: "JNE", service: "REG", description: "Layanan Reguler", cost: 18000, etd: "2-3 day" }] });
  assert.deepEqual(rates[0], { provider: "rajaongkir", courierCode: "jne", courierName: "Jalur Nugraha Ekakurir", serviceCode: "REG", serviceName: "REG", description: "Layanan Reguler", cost: 18000, etd: "2-3 day", estimateLabel: "2-3 day", estimateMinDays: 2, estimateMaxDays: 3 });
});

void test("menggunakan biaya server dan mengabaikan manipulasi biaya dari frontend", () => {
  const rates = normalizeRates({ data: [{ name: "JNE", code: "jne", service: "REG", description: "Regular", cost: 25000, etd: "2 day" }] });
  const manipulatedInput = { courierCode: "jne", serviceCode: "REG", cost: 1 };
  const selected = selectShippingRate(rates, manipulatedInput);
  assert.equal(selected?.cost, 25000);
});
