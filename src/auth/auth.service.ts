import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { apiException } from "../common/http";
import { PrismaService } from "../common/prisma.service";
import type { AuthUser } from "./auth.types";

const loginSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) });
const passwordSchema = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().transform((value) => value.toLowerCase()), password: passwordSchema, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Konfirmasi password tidak sama." });

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

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
    const token = randomBytes(32).toString("base64url");
    const user = await this.prisma.user.create({ data: { name: input.name, email: input.email, passwordHash, wishlist: { create: {} } } });
    await this.prisma.verificationToken.create({ data: { identifier: `verify:${user.email}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 24 * 60 * 60_000) } });
    await this.sendAuthEmail({ to: user.email, subject: "Verify your IVORY account", heading: "Verify your email", body: "Confirm your email address to activate your account.", actionLabel: "Verify email", actionUrl: `${process.env.FRONTEND_URL?.split(",")[0] ?? "http://localhost:3000"}/verify-email?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}` });
    return { id: user.id, email: user.email, name: user.name, verificationRequired: true };
  }

  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, isActive: true } });
    if (user?.isActive) {
      const raw = randomBytes(32).toString("base64url");
      await this.prisma.verificationToken.deleteMany({ where: { identifier: `reset:${user.email}` } });
      await this.prisma.verificationToken.create({ data: { identifier: `reset:${user.email}`, token: createHash("sha256").update(raw).digest("hex"), expires: new Date(Date.now() + 60 * 60_000) } });
      await this.sendAuthEmail({ to: user.email, subject: "Reset your IVORY password", heading: "Reset password", body: "Use the secure link below to choose a new password.", actionLabel: "Reset password", actionUrl: `${process.env.FRONTEND_URL?.split(",")[0] ?? "http://localhost:3000"}/reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(raw)}` });
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
    return { message: "Password berhasil diperbarui." };
  }

  async verifyEmail(email: string, rawToken: string) {
    const normalized = email.trim().toLowerCase();
    const digest = createHash("sha256").update(rawToken).digest("hex");
    const record = await this.prisma.verificationToken.findFirst({ where: { identifier: `verify:${normalized}`, token: digest, expires: { gt: new Date() } } });
    if (!record) apiException(400, "INVALID_TOKEN", "Verification link tidak valid atau sudah kedaluwarsa.");
    await this.prisma.$transaction([this.prisma.user.update({ where: { email: normalized }, data: { emailVerified: new Date() } }), this.prisma.verificationToken.deleteMany({ where: { identifier: `verify:${normalized}` } })]);
    return { verified: true };
  }

  private async sendAuthEmail(message: { to: string; subject: string; heading: string; body: string; actionLabel: string; actionUrl: string }) {
    if (!process.env.RESEND_API_KEY) { if (process.env.NODE_ENV === "development") console.info(`[development email] ${message.subject}: ${message.actionUrl}`); return; }
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "IVORY <noreply@example.com>", to: [message.to], subject: message.subject, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>${message.heading}</h1><p>${message.body}</p><p><a href="${message.actionUrl}">${message.actionLabel}</a></p></div>` }) });
    if (!response.ok) throw new Error(`Email provider rejected request: ${response.status}`);
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<AuthUser>(token);
    const user = await this.prisma.user.findFirst({ where: { id: payload.id, isActive: true, deletedAt: null }, select: { id: true, email: true, name: true, role: true } });
    if (!user) apiException(401, "UNAUTHORIZED", "Sesi tidak lagi valid.");
    return user;
  }
}
