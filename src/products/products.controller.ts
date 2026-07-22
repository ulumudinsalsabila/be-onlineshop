import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";

import { success } from "../common/http";
import { ProductsService } from "./products.service";

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("products")
  async list(@Query() query: Record<string, string | string[] | undefined>) {
    const result = await this.products.list(query);
    return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages });
  }

  @Get("products/:slug")
  async detail(@Param("slug") slug: string) {
    const product = await this.products.bySlug(slug);
    if (!product) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "Produk tidak ditemukan." } });
    return success(product);
  }

  @Get("products/:slug/related")
  async related(@Param("slug") slug: string, @Query("limit") rawLimit?: string) {
    return success(await this.products.related(slug, Number(rawLimit) || 4));
  }

  @Get("categories/:slug")
  async category(@Param("slug") slug: string) {
    const category = await this.products.category(slug);
    if (!category) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "Kategori tidak ditemukan." } });
    return success(category);
  }

  @Get("brands/:slug")
  async brand(@Param("slug") slug: string) {
    const brand = await this.products.brand(slug);
    if (!brand) throw new NotFoundException({ success: false, error: { code: "NOT_FOUND", message: "Brand tidak ditemukan." } });
    return success(brand);
  }

  @Get("storefront/featured")
  async featured(@Query("limit") rawLimit?: string) {
    return success(await this.products.featured(Number(rawLimit) || 8));
  }

  @Get("storefront/home")
  async home() {
    return success(await this.products.home());
  }

  @Get("storefront/related")
  async relatedByCategory(@Query("category") category: string, @Query("excludeId") excludeId: string, @Query("limit") rawLimit?: string) {
    return success(await this.products.relatedByCategory(category, excludeId, Number(rawLimit) || 4));
  }

  @Get("search")
  async search(@Query() query: Record<string, string | string[] | undefined>) {
    const result = await this.products.list({ ...query, page: "1" });
    return success({ suggestions: result.items.slice(0, 6), query: typeof query.q === "string" ? query.q : "" }, { total: result.total, page: 1, totalPages: result.totalPages });
  }
}
