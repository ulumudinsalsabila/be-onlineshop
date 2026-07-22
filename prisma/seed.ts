import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!email) throw new Error("SEED_ADMIN_EMAIL is required.");
if (!password) throw new Error("SEED_ADMIN_PASSWORD is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const passwordHash = await hash(password!, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });

  const user = await prisma.user.upsert({
    where: { email: email! },
    update: {
      name: "Administrator",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
      emailVerified: new Date(),
    },
    create: {
      name: "Administrator",
      email: email!,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      emailVerified: new Date(),
      wishlist: { create: {} },
    },
    select: { id: true, email: true, role: true, isActive: true, emailVerified: true },
  });

  console.info(`Admin account ready: ${user.email} (${user.role})`);
}

main()
  .finally(async () => prisma.$disconnect());

