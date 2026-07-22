import { BadRequestException, HttpException, UnauthorizedException } from "@nestjs/common";
import type { ZodType } from "zod";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ success: false, error: { code: "VALIDATION_ERROR", message: "The submitted data is invalid.", details: result.error.flatten() } });
  return result.data;
}

export function success<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function unauthorized(message = "Sign in to continue."): never {
  throw new UnauthorizedException({ success: false, error: { code: "UNAUTHORIZED", message } });
}

export function apiException(status: number, code: string, message: string): never {
  throw new HttpException({ success: false, error: { code, message } }, status);
}
