import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthRequest } from "../auth/auth.types";
import { apiException, success } from "../common/http";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { AdminWriteService } from "./admin-write.service";

@ApiTags("Admin") @ApiCookieAuth("ivory_session") @ApiBearerAuth()
@Controller("admin") @UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly write: AdminWriteService) {}
  private actor(request: AuthRequest & Request) { if (request.user?.role !== "ADMIN") apiException(403, "ADMIN_REQUIRED", "Hanya role ADMIN yang dapat mengubah data."); return request.user.id; }
  private read(request: AuthRequest & Request, resource: string) { if (request.user?.role === "ADMIN") return; const staffResources = new Set(["layout", "dashboard", "search", "options", "products", "orders", "customers", "categories", "brands", "content", "inventory", "shipments"]); if (!staffResources.has(resource)) apiException(403, "FORBIDDEN", "Role ini tidak memiliki izin untuk resource admin tersebut."); }

  @Get("views/:view") @ApiOperation({ summary: "Get an admin dashboard data view" }) @ApiQuery({ name: "page", required: false, type: Number, description: "Page number for table views; 10 records per page" })
  view(@Req() req: AuthRequest & Request, @Param("view") view: string, @Query() query: Record<string, string | undefined>) { this.read(req, view); return this.admin.view(view, query).then(success); }
  @Get("details/:resource/:id") @ApiOperation({ summary: "Get an admin resource detail" })
  detail(@Req() req: AuthRequest & Request, @Param("resource") resource: string, @Param("id") id: string) { this.read(req, resource); return this.admin.detail(resource, id).then(success); }

  @Post("entities/:entity") @ApiOperation({ summary: "Create category, brand, voucher, banner, or testimonial" })
  createEntity(@Req() req: AuthRequest & Request, @Param("entity") entity: string, @Body() body: unknown) { return this.write.entity(this.actor(req), entity, body).then(success); }
  @Patch("entities/:entity") @ApiOperation({ summary: "Update category, brand, voucher, banner, or testimonial" })
  updateEntity(@Req() req: AuthRequest & Request, @Param("entity") entity: string, @Body() body: Record<string, unknown>) { const { id, ...data } = body; if (typeof id !== "string") apiException(400, "VALIDATION_ERROR", "Id wajib diisi."); return this.write.entity(this.actor(req), entity, data, id).then(success); }
  @Delete("entities/:entity") @ApiOperation({ summary: "Soft-delete admin entities in bulk" })
  deleteEntities(@Req() req: AuthRequest & Request, @Param("entity") entity: string, @Body() body: { ids?: string[] }) { return this.write.removeEntities(this.actor(req), entity, body.ids ?? []).then(success); }

  @Post("products") @ApiOperation({ summary: "Create a product including images, variants, and inventory" })
  createProduct(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.write.product(this.actor(req), body).then(success); }
  @Post("products/images")
  @ApiOperation({ summary: "Upload a product image" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["image"], properties: { image: { type: "string", format: "binary" } } } })
  @UseInterceptors(FileInterceptor("image", { limits: { files: 1, fileSize: 4 * 1024 * 1024 } }))
  uploadProductImage(
    @Req() req: AuthRequest & Request,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    if (!file) apiException(400, "IMAGE_REQUIRED", "Pilih file gambar yang akan diunggah.");
    return this.write.uploadProductImage(this.actor(req), file).then(success);
  }
  @Patch("products/:id") @ApiOperation({ summary: "Update a product including images, variants, and inventory" })
  updateProduct(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.product(this.actor(req), body, id).then(success); }
  @Patch("customers/:id") @ApiOperation({ summary: "Update user role, activation, and email verification" })
  updateCustomer(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.customer(this.actor(req), id, body).then(success); }
  @Patch("orders/:id") @ApiOperation({ summary: "Update order and payment statuses" })
  updateOrder(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.order(this.actor(req), id, body).then(success); }
  @Patch("inventory/:id") @ApiOperation({ summary: "Update physical inventory" })
  updateInventory(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.inventory(this.actor(req), id, body).then(success); }
  @Patch("shipments/:id") @ApiOperation({ summary: "Update shipment and tracking status" })
  updateShipment(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.shipment(this.actor(req), id, body).then(success); }
  @Patch("sellers/:id") @ApiOperation({ summary: "Review, approve, reject, or suspend a seller" })
  updateSeller(@Req() req: AuthRequest & Request, @Param("id") id: string, @Body() body: unknown) { return this.write.seller(this.actor(req), id, body).then(success); }
  @Patch("content/sections") @ApiOperation({ summary: "Update homepage section visibility and ordering" })
  updateSections(@Req() req: AuthRequest & Request, @Body() body: unknown) { return this.write.sections(this.actor(req), body).then(success); }
}
