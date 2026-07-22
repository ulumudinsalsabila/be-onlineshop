import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { unauthorized } from "../common/http";
import { AuthService } from "./auth.service";
import type { AuthRequest } from "./auth.types";

export const SESSION_COOKIE = "ivory_session";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest & Request>();
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    const cookieToken: unknown = request.cookies?.[SESSION_COOKIE];
    const token = bearer ?? (typeof cookieToken === "string" ? cookieToken : undefined);
    if (!token) unauthorized();
    try {
      request.user = await this.auth.verifyToken(token);
      return true;
    } catch {
      unauthorized("Sesi tidak lagi valid.");
    }
  }
}
