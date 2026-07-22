import { BadRequestException, HttpException, UnauthorizedException } from "@nestjs/common";
import type { ZodType } from "zod";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.flatten();
    const fieldErrors = details.fieldErrors as Record<string, string[] | undefined>;
    throw new BadRequestException({ success: false, error: { code: "VALIDATION_ERROR", message: "The submitted data is invalid.", details: { formErrors: details.formErrors.map((message) => englishApiMessage("VALIDATION_ERROR", message)), fieldErrors: Object.fromEntries(Object.entries(fieldErrors).map(([field, messages]) => [field, messages?.map((message) => englishApiMessage("VALIDATION_ERROR", message))])) } } });
  }
  return result.data;
}

export function success<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function unauthorized(message = "Sign in to continue."): never {
  throw new UnauthorizedException({ success: false, error: { code: "UNAUTHORIZED", message: englishApiMessage("UNAUTHORIZED", message) } });
}

export function apiException(status: number, code: string, message: string): never {
  throw new HttpException({ success: false, error: { code, message: englishApiMessage(code, message) } }, status);
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Your session is no longer valid. Please sign in again.", INVALID_ORIGIN: "The request origin is not allowed.", VALIDATION_ERROR: "The submitted data is invalid.", NOT_FOUND: "The requested resource was not found.",
  RATE_LIMITED: "Too many requests. Please try again in one minute.", CART_NOT_FOUND: "The active cart was not found.", EMPTY_CART: "Your cart is empty.", CART_CHANGED: "Your cart has changed. Please review it and check shipping rates again.", INSUFFICIENT_STOCK: "One or more items no longer have sufficient stock.", ORDER_VALIDATION_FAILED: "The order stock or product weight is no longer valid.",
  SHIPPING_UNAVAILABLE: "No shipping service is available for this destination.", SHIPPING_NOT_CONFIGURED: "The shipping service has not been configured.", SHIPPING_TIMEOUT: "The shipping provider did not respond in time. Please try again.", SHIPPING_UPSTREAM_ERROR: "The shipping provider rejected the request.", SHIPPING_QUOTA_EXCEEDED: "The RajaOngkir quota has been exceeded or too many requests were made.", SHIPPING_OPTION_INVALID: "The selected shipping service is no longer available.", SHIPPING_WEIGHT_CHANGED: "The order weight has changed. Please check shipping rates again.",
  ADDRESS_NOT_FOUND: "The address was not found.", ADDRESS_REQUIRED: "A shipping address is required.", REGION_INCOMPLETE: "Please select the complete address region.", REGION_INVALID: "The address region hierarchy is invalid.", INVALID_REGION_CODE: "The region code is invalid.", ORDER_NOT_FOUND: "The order was not found.",
  VOUCHER_MIN_SPEND: "The order does not meet the voucher minimum spend.", VOUCHER_INVALID: "The voucher is invalid or has expired.", INVALID_PASSWORD: "The current password is incorrect.", INVALID_CREDENTIALS: "The email address or password is incorrect.", INVALID_TOKEN: "The link is invalid or has expired.",
  ADMIN_REQUIRED: "An ADMIN role is required to modify this data.", FORBIDDEN: "Your role does not have permission to access this resource.", SELF_LOCKOUT: "Administrators cannot deactivate or demote their own account.", TRACKING_REQUIRED: "A tracking number is required before marking the order as shipped.", STOCK_BELOW_RESERVED: "Physical stock cannot be lower than reserved stock.",
  IMAGE_REQUIRED: "Please select an image to upload.", IMAGE_INVALID: "The image does not meet the requirements.", IMAGE_UPLOAD_FAILED: "The image could not be uploaded.", IMAGE_STORAGE_NOT_CONFIGURED: "Image storage has not been configured.", UNSUPPORTED_IMAGE: "The image must be JPEG, PNG, or WebP.", EMPTY_IMAGE: "The image file is empty.", IMAGE_TOO_LARGE: "The image file is too large.",
  PAYMENT_NOT_CONFIGURED: "Midtrans has not been configured.", PAYMENT_NOT_FOUND: "The payment was not found.", PAYMENT_AMOUNT_INVALID: "The payment details do not match the order total.", PAYMENT_AMOUNT_MISMATCH: "The payment amount does not match the order.", INVALID_PAYMENT_SIGNATURE: "The Midtrans notification signature is invalid.", INVALID_MIDTRANS_PAYLOAD: "The Midtrans status payload is invalid.", MIDTRANS_RESPONSE_INVALID: "Midtrans returned an invalid response.", MIDTRANS_UNREACHABLE: "Midtrans could not be reached. Please try again.", INVENTORY_COMMIT_FAILED: "Inventory could not be committed for this payment.", FRONTEND_URL_INVALID: "The backend FRONTEND_URL configuration is invalid.", EMAIL_DELIVERY_FAILED: "The email could not be delivered. Please try again.",
  SELLER_PROFILE_REQUIRED: "Please submit a seller application first.", SELLER_NOT_APPROVED: "The seller account has not been approved.", SUBMISSION_LOCKED: "This submission can no longer be edited.", DECISION_REQUIRED: "Please accept or reject the estimated price.", INVALID_SUBMISSION_TRANSITION: "The requested status transition is invalid.", IMAGES_REQUIRED: "Add at least three photos before submitting.", BANK_ACCOUNT_REQUIRED: "Complete the payout bank account details.", PAYOUT_ITEM_NOT_ELIGIBLE: "One or more items are not eligible or have already been paid out.",
};

const INDONESIAN_WORDS = /\b(tidak|belum|wajib|silakan|pesanan|pembayaran|pengiriman|alamat|keranjang|produk|stok|berhasil|gagal|pilih|layanan|tujuan|ditemukan|dikonfigurasi|diizinkan|berubah|habis|pengajuan|akun|data)\b/i;

export function englishApiMessage(code: string, message: string): string {
  if (code === "VALIDATION_ERROR" && message !== "The submitted data is invalid.") return INDONESIAN_WORDS.test(message) ? "This field is invalid." : message;
  return ERROR_MESSAGES[code] ?? (INDONESIAN_WORDS.test(message) ? "The request could not be completed." : message);
}
