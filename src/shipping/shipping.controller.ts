import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { apiException, parseBody, success } from "../common/http";
import { ShippingService } from "./shipping.service";
import { ShippingRatesRequestDto } from "../common/swagger.dto";

@ApiTags("Shipping") @ApiCookieAuth("ivory_session") @ApiBearerAuth()
@Controller("shipping") @UseGuards(AuthGuard)
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get("destinations") @ApiOperation({ summary: "Search RajaOngkir domestic destinations" })
  async destinations(@Req() req: AuthRequest & Request, @Query("search") search?: string) {
    const parsed = z.string().trim().min(3).max(80).safeParse(search);
    if (!parsed.success) apiException(400, "VALIDATION_ERROR", "Pencarian tujuan minimal 3 karakter dan maksimal 80 karakter.");
    this.shipping.enforceRateLimit(`destination:${req.user!.id}`, 20);
    return success(await this.shipping.destinations(parsed.data));
  }

  @Post("rates") @ApiOperation({ summary: "Calculate RajaOngkir rates from the authenticated user's cart" }) @ApiBody({ type: ShippingRatesRequestDto })
  async rates(@Req() req: AuthRequest & Request, @Body() body: unknown) {
    const input = parseBody(z.object({ destinationId: z.coerce.number().int().positive(), cartId: z.string().cuid() }).strict(), body);
    this.shipping.enforceRateLimit(`rates:${req.user!.id}`, 10);
    return success(await this.shipping.ratesForCart(req.user!.id, input.cartId, input.destinationId));
  }
}
