import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";

import { success } from "../common/http";
import { ProductsService } from "./products.service";

@ApiTags("Storefront")
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("products")
  @ApiOperation({ summary: "List and filter published products" })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "brand", required: false })
  @ApiQuery({ name: "sort", required: false })
  async list(@Query() query: Record<string, string | string[] | undefined>) {
    const result = await this.products.list(query);
    const { items, ...meta } = result;
    return success(items, meta);
  }

  @Get("products/:slug")
  @ApiOperation({ summary: "Get a product by slug" })
  async detail(@Param("slug") slug: string) {
    const product = await this.products.bySlug(slug);
    if (!product) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "The product was not found." } });
    return success(product);
  }

  @Get("products/:slug/related")
  @ApiOperation({ summary: "Get related products for a product slug" })
  async related(@Param("slug") slug: string, @Query("limit") rawLimit?: string) {
    return success(await this.products.related(slug, Number(rawLimit) || 4));
  }

  @Get("categories/:slug")
  @ApiOperation({ summary: "Get category metadata by slug" })
  async category(@Param("slug") slug: string) {
    const category = await this.products.category(slug);
    if (!category) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "The category was not found." } });
    return success(category);
  }

  @Get("brands/:slug")
  @ApiOperation({ summary: "Get brand metadata by slug" })
  async brand(@Param("slug") slug: string) {
    const brand = await this.products.brand(slug);
    if (!brand) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "The brand was not found." } });
    return success(brand);
  }

  @Get("storefront/featured")
  @ApiOperation({ summary: "Get featured storefront products" })
  async featured(@Query("limit") rawLimit?: string) {
    return success(await this.products.featured(Number(rawLimit) || 8));
  }

  @Get("storefront/home")
  @ApiOperation({ summary: "Get homepage content and product groups" })
  async home() {
    return success(await this.products.home());
  }

  @Get("storefront/related")
  @ApiOperation({ summary: "Get related products by category" })
  async relatedByCategory(@Query("category") category: string, @Query("excludeId") excludeId: string, @Query("limit") rawLimit?: string) {
    return success(await this.products.relatedByCategory(category, excludeId, Number(rawLimit) || 4));
  }

  @Get("search")
  @ApiOperation({ summary: "Search products for suggestions" })
  @ApiQuery({ name: "q", required: true })
  async search(@Query() query: Record<string, string | string[] | undefined>) {
    const result = await this.products.list({ ...query, page: "1" });
    return success({ suggestions: result.items.slice(0, 6), query: typeof query.q === "string" ? query.q : "" }, { total: result.total, page: 1, totalPages: result.totalPages });
  }
}
