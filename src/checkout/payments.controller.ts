import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { success } from "../common/http";
import { MidtransService } from "./midtrans.service";

@ApiTags("Payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly midtrans: MidtransService) {}

  @Post("midtrans/notification")
  @HttpCode(200)
  @ApiOperation({ summary: "Receive and verify a Midtrans HTTP notification" })
  @ApiBody({ schema: { type: "object", additionalProperties: true } })
  notification(@Body() body: unknown) { return this.midtrans.handleNotification(body).then(success); }

  @Post(":orderId/sync")
  @UseGuards(AuthGuard)
  @ApiCookieAuth("ivory_session")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Synchronize an owned order with the Midtrans Get Status API" })
  sync(@Req() request: AuthRequest & Request, @Param("orderId") orderId: string) { return this.midtrans.sync(request.user!.id, orderId).then(success); }
}
