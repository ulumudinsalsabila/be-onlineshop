import { Body, Controller, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard"; import type { AuthRequest } from "../auth/auth.types"; import { parseBody, success } from "../common/http"; import { SellerService } from "./seller.service";
import { PayoutRequestDto, SellerApplicationRequestDto, SellerProfileRequestDto, SubmissionRequestDto, SubmissionTransitionRequestDto } from "../common/swagger.dto";
const clean = (max: number) => z.string().trim().min(1).max(max).transform((v) => v.replace(/[<>]/g, ""));
const application = z.object({ displayName: clean(100), phone: z.string().min(8).max(20), identityNumber: z.string().max(40).optional().or(z.literal("")), bio: z.string().max(1500).optional().or(z.literal("")), applicationNote: clean(2000), bankName: clean(80), bankAccountName: clean(100), bankAccountNumber: z.string().regex(/^\d{6,30}$/) });
const submission = z.object({ title: clean(160), brandId: z.string().cuid().optional().or(z.literal("")), proposedBrand: z.string().max(100).optional().or(z.literal("")), categoryId: z.string().cuid(), conditionLabel: z.enum(["PRISTINE", "EXCELLENT", "VERY_GOOD", "GOOD"]), completeness: clean(500), flawNotes: z.string().max(2000).optional().or(z.literal("")), description: clean(5000), expectedPrice: z.coerce.number().int().min(100_000).max(10_000_000_000) });
@ApiTags("Seller") @ApiCookieAuth("ivory_session") @ApiBearerAuth()
@Controller("seller") @UseGuards(AuthGuard)
export class SellerController { constructor(private readonly seller: SellerService) {} private id(r: AuthRequest & Request) { return r.user!.id; }
  @Get("profile") @ApiOperation({ summary: "Get seller profile" }) profile(@Req() r: AuthRequest & Request) { return this.seller.profile(this.id(r)).then(success); }
  @Post("application") @ApiOperation({ summary: "Apply to become a seller" }) @ApiBody({ type: SellerApplicationRequestDto }) apply(@Req() r: AuthRequest & Request, @Body() b: unknown) { return this.seller.apply(this.id(r), parseBody(application, b)).then(success); }
  @Patch("profile") @ApiOperation({ summary: "Update seller profile" }) @ApiBody({ type: SellerProfileRequestDto }) updateProfile(@Req() r: AuthRequest & Request, @Body() b: unknown) { return this.seller.updateProfile(this.id(r), parseBody(application.omit({ identityNumber: true, applicationNote: true }), b)).then(success); }
  @Get("overview") @ApiOperation({ summary: "Get seller dashboard overview" }) overview(@Req() r: AuthRequest & Request) { return this.seller.overview(this.id(r)).then(success); }
  @Get("options") @ApiOperation({ summary: "Get submission category and brand options" }) options() { return this.seller.options().then(success); }
  @Get("submissions") @ApiOperation({ summary: "List seller submissions" }) submissions(@Req() r: AuthRequest & Request) { return this.seller.submissions(this.id(r)).then(success); }
  @Post("submissions") @ApiOperation({ summary: "Create a consignment submission" }) @ApiBody({ type: SubmissionRequestDto }) create(@Req() r: AuthRequest & Request, @Body() b: unknown) { return this.seller.createSubmission(this.id(r), parseBody(submission, b)).then(success); }
  @Get("submissions/:id") @ApiOperation({ summary: "Get a seller submission" }) one(@Req() r: AuthRequest & Request, @Param("id") id: string) { return this.seller.submission(this.id(r), id).then(success); }
  @Patch("submissions/:id") @ApiOperation({ summary: "Update a seller submission" }) @ApiBody({ type: SubmissionRequestDto }) update(@Req() r: AuthRequest & Request, @Param("id") id: string, @Body() b: unknown) { return this.seller.updateSubmission(this.id(r), id, parseBody(submission, b)).then(success); }
  @Post("submissions/:id/transition") @ApiOperation({ summary: "Transition a submission status" }) @ApiBody({ type: SubmissionTransitionRequestDto }) transition(@Req() r: AuthRequest & Request, @Param("id") id: string, @Body() b: unknown) { return this.seller.transition(this.id(r), id, parseBody(z.object({ status: z.enum(["SUBMITTED", "WAITING_FOR_ITEM", "CANCELLED"]), decision: z.enum(["ACCEPTED", "REJECTED"]).optional(), reason: z.string().max(1000).optional() }), b)).then(success); }
  @Post("submissions/:id/images") @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: "Upload a consignment image" }) @ApiConsumes("multipart/form-data") @ApiBody({ schema: { type: "object", required: ["image"], properties: { image: { type: "string", format: "binary" } } } })
  image(@Req() r: AuthRequest & Request, @Param("id") id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) { if (!file) throw new Error("IMAGE_REQUIRED"); return this.seller.addImage(this.id(r), id, file).then(success); }
  @Get("listed") listed(@Req() r: AuthRequest & Request) { return this.seller.listed(this.id(r)).then(success); }
  @Get("sales") sales(@Req() r: AuthRequest & Request) { return this.seller.sales(this.id(r)).then(success); }
  @Get("balance") balance(@Req() r: AuthRequest & Request) { return this.seller.balance(this.id(r)).then(success); }
  @Get("payouts") payouts(@Req() r: AuthRequest & Request) { return this.seller.payouts(this.id(r)).then(success); }
  @Post("payouts") @ApiOperation({ summary: "Request a payout for eligible commissions" }) @ApiBody({ type: PayoutRequestDto }) payout(@Req() r: AuthRequest & Request, @Body() b: unknown) { return this.seller.requestPayout(this.id(r), parseBody(z.object({ commissionIds: z.array(z.string().cuid()).min(1).max(100) }), b).commissionIds).then(success); }
}
