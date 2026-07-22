import { HttpException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import type { AuthUser } from "./auth.types";
import { EmailService } from "./email.service";

const loginSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) });
const passwordSchema = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().transform((value) => value.toLowerCase()), password: passwordSchema, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Konfirmasi password tidak sama." });

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly email: EmailService) {}

  schemas = { login: loginSchema, register: registerSchema };

  async login(input: z.infer<typeof loginSchema>) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash || !user.isActive || user.deletedAt || !user.emailVerified || !(await verify(user.passwordHash, input.password))) {
      apiException(401, "INVALID_CREDENTIALS", "Email atau password tidak valid.");
    }
    const safeUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    return { user: safeUser, token: await this.jwt.signAsync(safeUser) };
  }

  async register(input: z.infer<typeof registerSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) apiException(409, "EMAIL_EXISTS", "Email sudah terdaftar.");
    const passwordHash = await hash(input.password, { algorithm: 2, memoryCost: 19_456, timeCost: 3, parallelism: 1, outputLen: 32 });
    const user = await this.prisma.user.create({ data: { name: input.name, email: input.email, passwordHash, wishlist: { create: {} } } });
    let verificationEmailSent = true;
    try { await this.sendVerificationEmail(user.email); }
    catch (error) { if (!(error instanceof HttpException)) throw error; verificationEmailSent = false; }
    return { id: user.id, email: user.email, name: user.name, verificationRequired: true, verificationEmailSent };
  }

  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, isActive: true } });
    if (user?.isActive) {
      const raw = randomBytes(32).toString("base64url");
      await this.prisma.verificationToken.deleteMany({ where: { identifier: `reset:${user.email}` } });
      await this.prisma.verificationToken.create({ data: { identifier: `reset:${user.email}`, token: createHash("sha256").update(raw).digest("hex"), expires: new Date(Date.now() + 60 * 60_000) } });
      await this.email.sendAuthEmail({ to: user.email, subject: "Reset your IVORY password", heading: "Reset your password", body: "Use the secure link below to create a new password. The link is valid for one hour.", actionLabel: "Reset password", actionUrl: this.frontendUrl("/reset-password", user.email, raw) });
    }
    return { message: "If the account exists, a reset link has been sent." };
  }

  async resetPassword(input: { email: string; token: string; password: string; confirmPassword: string }) {
    if (input.password !== input.confirmPassword || !passwordSchema.safeParse(input.password).success) apiException(400, "VALIDATION_ERROR", "Password baru tidak valid.");
    const email = input.email.trim().toLowerCase();
    const digest = createHash("sha256").update(input.token).digest("hex");
    const record = await this.prisma.verificationToken.findFirst({ where: { identifier: `reset:${email}`, token: digest, expires: { gt: new Date() } } });
    if (!record) apiException(400, "INVALID_TOKEN", "Reset link tidak valid atau sudah kedaluwarsa.");
    await this.prisma.$transaction([this.prisma.user.update({ where: { email }, data: { passwordHash: await hash(input.password, { algorithm: 2, memoryCost: 19_456, timeCost: 3, parallelism: 1, outputLen: 32 }) } }), this.prisma.verificationToken.deleteMany({ where: { identifier: `reset:${email}` } })]);
    return { message: "Your password has been updated." };
  }

  async verifyEmail(email: string, rawToken: string) {
    const normalized = email.trim().toLowerCase();
    const digest = createHash("sha256").update(rawToken).digest("hex");
    const record = await this.prisma.verificationToken.findFirst({ where: { identifier: `verify:${normalized}`, token: digest, expires: { gt: new Date() } } });
    if (!record) apiException(400, "INVALID_TOKEN", "Verification link tidak valid atau sudah kedaluwarsa.");
    await this.prisma.$transaction([this.prisma.user.update({ where: { email: normalized }, data: { emailVerified: new Date() } }), this.prisma.verificationToken.deleteMany({ where: { identifier: `verify:${normalized}` } })]);
    return { verified: true };
  }

  async resendVerification(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email: normalized, emailVerified: null, isActive: true, deletedAt: null }, select: { email: true } });
    if (user) await this.sendVerificationEmail(user.email);
    return { message: "If the account exists and is not verified, a verification email has been sent." };
  }

  private async sendVerificationEmail(email: string) {
    const raw = randomBytes(32).toString("base64url");
    const identifier = `verify:${email}`;
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({ where: { identifier } }),
      this.prisma.verificationToken.create({ data: { identifier, token: createHash("sha256").update(raw).digest("hex"), expires: new Date(Date.now() + 24 * 60 * 60_000) } }),
    ]);
    await this.email.sendAuthEmail({ to: email, subject: "Verify your IVORY account", heading: "Verify your email", body: "Confirm your email address to activate your IVORY account. The link is valid for 24 hours.", actionLabel: "Verify email", actionUrl: this.frontendUrl("/verify-email", email, raw) });
  }

  private frontendUrl(path: string, email: string, token: string) {
    const origin = process.env.FRONTEND_URL?.split(",")[0]?.trim() || "http://localhost:3000";
    const url = new URL(path, `${origin.replace(/\/$/, "")}/`);
    url.searchParams.set("email", email);
    url.searchParams.set("token", token);
    return url.toString();
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<AuthUser>(token);
    const user = await this.prisma.user.findFirst({ where: { id: payload.id, isActive: true, deletedAt: null }, select: { id: true, email: true, name: true, role: true } });
    if (!user) apiException(401, "UNAUTHORIZED", "Sesi tidak lagi valid.");
    return user;
  }
}
