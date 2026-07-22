import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { parseBody, success } from "../common/http";
import { AccountService } from "./account.service";
import { AddressRequestDto, UpdatePasswordRequestDto, UpdateProfileRequestDto } from "../common/swagger.dto";

const addressFields = z.object({ label: z.string().trim().min(2).max(50), recipient: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(20), line1: z.string().trim().min(5).max(200), line2: z.string().trim().max(200).optional().or(z.literal("")), district: z.string().trim().min(2).max(100).optional(), village: z.string().trim().min(2).max(100).optional(), city: z.string().trim().min(2).max(100).optional(), province: z.string().trim().min(2).max(100).optional(), provinceCode: z.string().regex(/^\d{2}$/).optional(), regencyCode: z.string().regex(/^\d{2}\.\d{2}$/).optional(), districtCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/).optional(), villageCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/).optional(), postalCode: z.string().regex(/^\d{5}$/), country: z.string().trim().min(2).max(80).default("Indonesia"), isDefault: z.boolean().default(false) });
const addressSchema = addressFields.refine((value) => Boolean((value.provinceCode && value.regencyCode && value.districtCode && value.villageCode) || (value.province && value.city && value.district)), { message: "Pilih wilayah alamat secara lengkap." });

@ApiTags("Account")
@ApiCookieAuth("ivory_session")
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}
  private id(request: AuthRequest & Request) { return request.user!.id; }

  @Get("account/profile") @ApiOperation({ summary: "Get account profile" }) profile(@Req() req: AuthRequest & Request) { return this.account.profile(this.id(req)).then(success); }
  @Patch("account/profile") @ApiOperation({ summary: "Update account profile" }) @ApiBody({ type: UpdateProfileRequestDto }) updateProfile(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.account.updateProfile(this.id(req), parseBody(z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional().or(z.literal("")) }), body)).then(success); }
  @Patch("account/security") @ApiOperation({ summary: "Change account password" }) @ApiBody({ type: UpdatePasswordRequestDto }) updatePassword(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.account.updatePassword(this.id(req), parseBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/), confirmPassword: z.string() }), body)).then(success); }
  @Get("account/overview") @ApiOperation({ summary: "Get account overview counters" }) overview(@Req() req: AuthRequest & Request) { return this.account.overview(this.id(req)).then(success); }
  @Get("addresses") @ApiOperation({ summary: "List saved addresses" }) @ApiQuery({ name: "page", required: false, type: Number }) @ApiQuery({ name: "limit", required: false, type: Number })
  async addresses(@Req() req: AuthRequest & Request, @Query() query: Record<string, string | undefined>) { const result = await this.account.addresses(this.id(req), query); return success(result.items, result.meta); }
  @Post("addresses") @ApiOperation({ summary: "Create an address" }) @ApiBody({ type: AddressRequestDto }) createAddress(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.account.createAddress(this.id(req), parseBody(addressSchema, body)).then(success); }
  @Patch("addresses/:id") @ApiOperation({ summary: "Update an address" }) @ApiBody({ type: AddressRequestDto }) updateAddress(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.account.updateAddress(this.id(req), id, parseBody(addressFields.partial(), body)).then(success); }
  @Delete("addresses/:id") @ApiOperation({ summary: "Delete an address" }) deleteAddress(@Req() req: AuthRequest & Request, @Param("id") id: string) { return this.account.deleteAddress(this.id(req), id).then(success); }
  @Get("orders") @ApiOperation({ summary: "List the user's orders" }) @ApiQuery({ name: "page", required: false, type: Number }) @ApiQuery({ name: "limit", required: false, type: Number })
  async orders(@Req() req: AuthRequest & Request, @Query() query: Record<string, string | undefined>) { const result = await this.account.orders(this.id(req), query); return success(result.items, result.meta); }
  @Get("orders/by-number/:orderNumber") @ApiOperation({ summary: "Get an owned order by order number" }) orderByNumber(@Req() req: AuthRequest & Request, @Param("orderNumber") orderNumber: string) { return this.account.orderByNumber(this.id(req), orderNumber).then(success); }
  @Get("orders/:id/tracking") @ApiOperation({ summary: "Get locally managed tracking details for an owned order" }) tracking(@Req() req: AuthRequest & Request, @Param("id") id: string) { return this.account.tracking(this.id(req), id).then(success); }
  @Get("orders/:id") @ApiOperation({ summary: "Get an order owned by the user" }) order(@Req() req: AuthRequest & Request, @Param("id") id: string) { return this.account.order(this.id(req), id).then(success); }
  @Get("returns") @ApiOperation({ summary: "List the user's return requests" }) @ApiQuery({ name: "page", required: false, type: Number }) @ApiQuery({ name: "limit", required: false, type: Number })
  async returns(@Req() req: AuthRequest & Request, @Query() query: Record<string, string | undefined>) { const result = await this.account.returns(this.id(req), query); return success(result.items, result.meta); }
}
