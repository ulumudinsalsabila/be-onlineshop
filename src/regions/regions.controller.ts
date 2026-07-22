import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { success } from "../common/http";
import { RegionsService } from "./regions.service";

@ApiTags("Region master data")
@Controller("regions")
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}
  @Get("provinces") @ApiOperation({ summary: "List Indonesian provinces" }) @PagedQuery() async provinces(@Query() query: Record<string, string | undefined>) { const result = await this.regions.provinces(query); return success(result.items, result.meta); }
  @Get("provinces/:provinceCode/regencies") @ApiOperation({ summary: "List regencies/cities in a province" }) @PagedQuery() async regencies(@Param("provinceCode") code: string, @Query() query: Record<string, string | undefined>) { const result = await this.regions.regencies(code, query); return success(result.items, result.meta); }
  @Get("regencies/:regencyCode/districts") @ApiOperation({ summary: "List districts in a regency/city" }) @PagedQuery() async districts(@Param("regencyCode") code: string, @Query() query: Record<string, string | undefined>) { const result = await this.regions.districts(code, query); return success(result.items, result.meta); }
  @Get("districts/:districtCode/villages") @ApiOperation({ summary: "List villages/subdistricts in a district" }) @PagedQuery() async villages(@Param("districtCode") code: string, @Query() query: Record<string, string | undefined>) { const result = await this.regions.villages(code, query); return success(result.items, result.meta); }
}

function PagedQuery() { return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) { ApiQuery({ name: "page", required: false, type: Number })(target, propertyKey, descriptor); ApiQuery({ name: "limit", required: false, type: Number, description: "Maximum 500" })(target, propertyKey, descriptor); ApiQuery({ name: "q", required: false, type: String })(target, propertyKey, descriptor); }; }
