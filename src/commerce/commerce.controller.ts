import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { parseBody, success } from "../common/http";
import { CommerceService } from "./commerce.service";
import { AddCartItemRequestDto, UpdateCartItemRequestDto, WishlistRequestDto } from "../common/swagger.dto";

const addCartSchema = z.object({ variantId: z.string().cuid(), quantity: z.coerce.number().int().min(1).max(20).default(1) });
const updateCartSchema = z.object({ quantity: z.coerce.number().int().min(1).max(20) });
const wishlistSchema = z.object({ productId: z.string().cuid() });

@ApiTags("Commerce")
@ApiCookieAuth("ivory_session")
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get("cart")
  @ApiOperation({ summary: "Get the authenticated user's cart" })
  async cart(@Req() request: AuthRequest & Request) { return success(await this.commerce.cart(request.user!.id)); }

  @Post("cart")
  @ApiOperation({ summary: "Add a variant to the cart" })
  @ApiBody({ type: AddCartItemRequestDto })
  async addCart(@Req() request: AuthRequest & Request, @Body() body: unknown) {
    const input = parseBody(addCartSchema, body);
    return success(await this.commerce.addCartItem(request.user!.id, input.variantId, input.quantity));
  }

  @Patch("cart/items/:id")
  @ApiOperation({ summary: "Update cart item quantity" })
  @ApiBody({ type: UpdateCartItemRequestDto })
  async updateCart(@Req() request: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(updateCartSchema, body);
    return success(await this.commerce.updateCartItem(request.user!.id, id, input.quantity));
  }

  @Delete("cart/items/:id")
  @ApiOperation({ summary: "Remove a cart item" })
  async removeCart(@Req() request: AuthRequest & Request, @Param("id") id: string) { return success(await this.commerce.removeCartItem(request.user!.id, id)); }

  @Get("wishlist")
  @ApiOperation({ summary: "Get the authenticated user's wishlist" })
  async wishlist(@Req() request: AuthRequest & Request) { return success(await this.commerce.wishlist(request.user!.id)); }

  @Post("wishlist")
  @ApiOperation({ summary: "Add a product to the wishlist" })
  @ApiBody({ type: WishlistRequestDto })
  async addWishlist(@Req() request: AuthRequest & Request, @Body() body: unknown) {
    const input = parseBody(wishlistSchema, body);
    return success(await this.commerce.addWishlistItem(request.user!.id, input.productId));
  }

  @Delete("wishlist/items/:id")
  @ApiOperation({ summary: "Remove a wishlist item" })
  async removeWishlist(@Req() request: AuthRequest & Request, @Param("id") id: string) { return success(await this.commerce.removeWishlistItem(request.user!.id, id)); }
}
