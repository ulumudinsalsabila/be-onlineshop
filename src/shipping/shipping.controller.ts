import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { apiException, success } from "../common/http";
import { BiteshipService } from "./biteship.service";

@ApiTags("Shipping")
@Controller()
export class ShippingController {
  constructor(private readonly biteship: BiteshipService) {}

  @Post("shipments/biteship/webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive real-time Biteship shipment updates" })
  @ApiHeader({ name: "x-biteship-webhook-secret", required: false })
  webhook(@Headers("authorization") authorization: string | undefined, @Headers("x-biteship-webhook-secret") secret: string | undefined, @Body() body: unknown) {
    if (isEmptyBody(body)) return success({ received: true, validation: true });
    this.biteship.verifyWebhookSecret(authorization, secret);
    return this.biteship.handleWebhook(body).then(success);
  }

  @Get("orders/:orderId/tracking") @UseGuards(AuthGuard) @ApiCookieAuth("ivory_session") @ApiBearerAuth()
  @ApiOperation({ summary: "Get the latest stored shipment tracking state" })
  tracking(@Req() req: AuthRequest & Request, @Param("orderId") orderId: string) { return this.biteship.ownedTracking(req.user!.id, orderId).then(success); }

  @Post("orders/:orderId/tracking/sync") @UseGuards(AuthGuard) @ApiCookieAuth("ivory_session") @ApiBearerAuth()
  @ApiOperation({ summary: "Synchronize an owned shipment from Biteship Tracking API" })
  sync(@Req() req: AuthRequest & Request, @Param("orderId") orderId: string) { return this.biteship.syncOwnedTracking(req.user!.id, orderId).then(success); }

  @Post("admin/shipments/:shipmentId/book") @UseGuards(AuthGuard) @ApiCookieAuth("ivory_session") @ApiBearerAuth()
  @ApiOperation({ summary: "Retry creation of a paid shipment in Biteship" })
  book(@Req() req: AuthRequest & Request, @Param("shipmentId") shipmentId: string) { if (req.user?.role !== "ADMIN") apiException(403, "ADMIN_REQUIRED", "Hanya admin yang dapat membuat shipment Biteship."); return this.biteship.bookPaidShipment(shipmentId).then(success); }

  @Post("admin/shipments/:shipmentId/sync") @UseGuards(AuthGuard) @ApiCookieAuth("ivory_session") @ApiBearerAuth()
  @ApiOperation({ summary: "Synchronize any shipment from Biteship Tracking API" })
  syncAdmin(@Req() req: AuthRequest & Request, @Param("shipmentId") shipmentId: string) { if (req.user?.role !== "ADMIN") apiException(403, "ADMIN_REQUIRED", "Hanya admin yang dapat menyinkronkan shipment Biteship."); return this.biteship.syncShipment(shipmentId).then(success); }
}

function isEmptyBody(body: unknown) { return body == null || (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0); }
