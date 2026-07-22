import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { Request, Response } from "express";

import { parseBody, success } from "../common/http";
import { AuthGuard, SESSION_COOKIE } from "./auth.guard";
import { AuthService } from "./auth.service";
import type { AuthRequest } from "./auth.types";
import { EmailRequestDto, LoginRequestDto, RegisterRequestDto, ResetPasswordRequestDto } from "../common/swagger.dto";

const cookieOptions = () => {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 * 1000, ...(domain ? { domain } : {}) };
};

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Sign in and set the HttpOnly session cookie" })
  @ApiBody({ type: LoginRequestDto })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(parseBody(this.auth.schemas.login, body));
    response.cookie(SESSION_COOKIE, result.token, cookieOptions());
    return success({ user: result.user, accessToken: result.token, tokenType: "Bearer" as const, expiresIn: "30d" });
  }

  @Post("register")
  @ApiOperation({ summary: "Register a customer account" })
  @ApiBody({ type: RegisterRequestDto })
  async register(@Body() body: unknown) {
    return success(await this.auth.register(parseBody(this.auth.schemas.register, body)));
  }

  @Post("forgot-password")
  @ApiOperation({ summary: "Request a password reset email" })
  @ApiBody({ type: EmailRequestDto })
  forgotPassword(@Body() body: unknown) { return this.auth.forgotPassword(parseBody(z.object({ email: z.string().email() }), body).email).then(success); }

  @Post("resend-verification")
  @ApiOperation({ summary: "Send a new email verification link" })
  @ApiBody({ type: EmailRequestDto })
  resendVerification(@Body() body: unknown) { return this.auth.resendVerification(parseBody(z.object({ email: z.string().email() }), body).email).then(success); }

  @Post("reset-password")
  @ApiOperation({ summary: "Reset password using an emailed token" })
  @ApiBody({ type: ResetPasswordRequestDto })
  resetPassword(@Body() body: unknown) { return this.auth.resetPassword(parseBody(z.object({ email: z.string().email(), token: z.string().min(20), password: z.string(), confirmPassword: z.string() }), body)).then(success); }

  @Get("verify-email")
  @ApiOperation({ summary: "Verify an email address" })
  @ApiQuery({ name: "email", format: "email" })
  @ApiQuery({ name: "token", minLength: 20 })
  verifyEmail(@Query("email") email: string, @Query("token") token: string) { return this.auth.verifyEmail(email, token).then(success); }

  @Post("logout")
  @ApiOperation({ summary: "Clear the session cookie" })
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    return success({ signedOut: true });
  }

  @Get("session")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Return the authenticated user" })
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiBearerAuth()
  session(@Req() request: AuthRequest & Request) {
    return success({ user: request.user });
  }
}
