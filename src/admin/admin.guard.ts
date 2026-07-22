import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { apiException } from "../common/http";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthGuard) {}
  async canActivate(context: ExecutionContext) { await this.auth.canActivate(context); const request = context.switchToHttp().getRequest<AuthRequest & Request>(); if (!request.user || !["STAFF", "ADMIN"].includes(request.user.role)) apiException(403, "FORBIDDEN", "Akses backoffice diperlukan."); return true; }
}
