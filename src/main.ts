import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const allowedOrigins = frontendUrl.split(",").map((origin) => origin.trim());
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) return next();
    response.status(403).json({ success: false, error: { code: "INVALID_ORIGIN", message: "Origin request tidak diizinkan." } });
  });
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
