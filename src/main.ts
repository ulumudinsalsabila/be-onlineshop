import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { join } from "node:path";
import * as cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module";
import { SESSION_COOKIE } from "./auth/auth.guard";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const allowedOrigins = frontendUrl.split(",").map((origin) => origin.trim());
  app.setGlobalPrefix("api");
  app.useStaticAssets(join(process.cwd(), "public", "uploads"), { prefix: "/uploads", index: false });
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) return next();
    response.status(403).json({ success: false, error: { code: "INVALID_ORIGIN", message: "Origin request tidak diizinkan." } });
  });
  app.enableCors({ origin: allowedOrigins, credentials: true });
  if (process.env.SWAGGER_ENABLED !== "false") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("IVORY Online Shop API")
      .setDescription("Dokumentasi REST API untuk storefront, account, checkout, seller, dan admin IVORY.")
      .setVersion("1.0.0")
      .addServer(process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`, "Configured backend")
      .addCookieAuth(SESSION_COOKIE, { type: "apiKey", in: "cookie" })
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    });
    SwaggerModule.setup("api/docs", app, documentFactory, {
      customSiteTitle: "IVORY API Documentation",
      jsonDocumentUrl: "api/docs-json",
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, filter: true },
    });
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
