import assert from "node:assert/strict";
import test from "node:test";
import { buildTrackingEvents } from "./tracking";

void test("membentuk timeline tracking lokal secara kronologis", () => {
  const events = buildTrackingEvents({
    orderCreatedAt: new Date("2026-07-20T01:00:00.000Z"),
    paidAt: new Date("2026-07-20T02:00:00.000Z"),
    shippedAt: new Date("2026-07-21T03:00:00.000Z"),
    deliveredAt: new Date("2026-07-22T04:00:00.000Z"),
  });
  assert.deepEqual(events.map((event) => event.status), ["ORDER_PLACED", "PAYMENT_CONFIRMED", "SHIPPED", "DELIVERED"]);
});

void test("order yang belum dikirim tidak mengarang event perjalanan", () => {
  const events = buildTrackingEvents({ orderCreatedAt: new Date("2026-07-20T01:00:00.000Z") });
  assert.deepEqual(events.map((event) => event.status), ["ORDER_PLACED"]);
});
