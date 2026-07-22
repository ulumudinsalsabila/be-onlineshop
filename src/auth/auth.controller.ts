import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { parseBody, success } from "../common/http";
import { AuthGuard, SESSION_COOKIE } from "./auth.guard";
import { AuthService } from "./auth.service";
import type { AuthRequest } from "./auth.types";

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 * 1000 });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(parseBody(this.auth.schemas.login, body));
    response.cookie(SESSION_COOKIE, result.token, cookieOptions());
    return success({ user: result.user });
  }

  @Post("register")
  async register(@Body() body: unknown) {
    return success(await this.auth.register(parseBody(this.auth.schemas.register, body)));
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    return success({ signedOut: true });
  }

  @Get("session")
  @UseGuards(AuthGuard)
  session(@Req() request: AuthRequest & Request) {
    return success({ user: request.user });
  }
}
