import assert from "node:assert/strict";
import test from "node:test";
import { englishApiMessage } from "./http";

void test("API errors default to English by error code", () => {
  assert.equal(englishApiMessage("EMPTY_CART", "Keranjang Anda kosong."), "Your cart is empty.");
  assert.equal(englishApiMessage("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan."), "The payment was not found.");
});

void test("validation details preserve English and replace Indonesian", () => {
  assert.equal(englishApiMessage("VALIDATION_ERROR", "String must contain at least 3 character(s)"), "String must contain at least 3 character(s)");
  assert.equal(englishApiMessage("VALIDATION_ERROR", "Pilih wilayah alamat secara lengkap."), "This field is invalid.");
});
