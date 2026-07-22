import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
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
    const user = await this.prisma.user.create({ data: { name: input.name, email: input.email, passwordHash, wishlist: { create: {} } } });
    return { id: user.id, email: user.email, name: user.name, verificationRequired: true };
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<AuthUser>(token);
    const user = await this.prisma.user.findFirst({ where: { id: payload.id, isActive: true, deletedAt: null }, select: { id: true, email: true, name: true, role: true } });
    if (!user) apiException(401, "UNAUTHORIZED", "Sesi tidak lagi valid.");
    return user;
  }
}
