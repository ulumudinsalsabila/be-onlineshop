import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { parseBody, success } from "../common/http";
import { CheckoutService, type CheckoutInput } from "./checkout.service";
import { CheckoutRequestDto } from "../common/swagger.dto";

const address = z.object({ recipient: z.string().min(2), phone: z.string().min(8), line1: z.string().min(5), line2: z.string().optional(), district: z.string().min(2), city: z.string().min(2), province: z.string().min(2), postalCode: z.string().regex(/^\d{5}$/), country: z.string().default("Indonesia") });
const checkout = z.object({ addressId: z.string().cuid().optional(), address: address.optional(), shipping: z.object({ destinationId: z.coerce.number().int().positive(), courierCode: z.string().min(2).max(30), serviceCode: z.string().min(1).max(50) }).strict(), voucherCode: z.string().trim().toUpperCase().max(40).optional(), paymentMethod: z.enum(["BANK_TRANSFER", "CREDIT_CARD", "E_WALLET", "VIRTUAL_ACCOUNT"]), notes: z.string().trim().max(500).optional() }).strict().refine((value) => Boolean(value.addressId || value.address));

@ApiTags("Checkout")
@ApiCookieAuth("ivory_session")
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}
  @Get("checkout") @ApiOperation({ summary: "Get checkout context" }) context(@Req() req: AuthRequest & Request) { return this.checkoutService.context(req.user!.id).then(success); }
  @Post("checkout/preview") @ApiOperation({ summary: "Validate and preview checkout totals" }) @ApiBody({ type: CheckoutRequestDto }) preview(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.checkoutService.preview(req.user!.id, parseBody(checkout, body) as CheckoutInput).then(success); }
  @Post("checkout") @ApiOperation({ summary: "Create an order from the current cart" }) @ApiBody({ type: CheckoutRequestDto }) create(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.checkoutService.create(req.user!.id, parseBody(checkout, body) as CheckoutInput).then(success); }
}
