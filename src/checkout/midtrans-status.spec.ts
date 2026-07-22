import assert from "node:assert/strict";
import test from "node:test";
import { allowedTransition, localStatus } from "./midtrans.service";

void test("status Midtrans selesai otomatis menjadi PAID", () => {
  assert.equal(localStatus("settlement", undefined, "200"), "PAID");
  assert.equal(localStatus("capture", "accept", "200"), "PAID");
});

void test("fraud deny tidak pernah dianggap lunas", () => {
  assert.equal(localStatus("capture", "deny"), "FAILED");
  assert.equal(localStatus("capture", "challenge", "201"), "PENDING");
});

void test("transisi pembayaran mencegah status PAID kembali menjadi PENDING", () => {
  assert.equal(allowedTransition("PENDING", "PAID"), true);
  assert.equal(allowedTransition("PAID", "PENDING"), false);
  assert.equal(allowedTransition("PAID", "REFUNDED"), true);
});
