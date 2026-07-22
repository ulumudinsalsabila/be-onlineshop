import { Injectable } from "@nestjs/common";
import { apiException } from "../common/http";
import { pagination, paginationMeta, type PaginationQuery } from "../common/pagination";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  provinces(query: PaginationQuery) { return this.list("province", undefined, query); }
  regencies(provinceCode: string, query: PaginationQuery) { validateCode(provinceCode, /^\d{2}$/, "provinceCode"); return this.list("regency", provinceCode, query); }
  districts(regencyCode: string, query: PaginationQuery) { validateCode(regencyCode, /^\d{2}\.\d{2}$/, "regencyCode"); return this.list("district", regencyCode, query); }
  villages(districtCode: string, query: PaginationQuery) { validateCode(districtCode, /^\d{2}\.\d{2}\.\d{2}$/, "districtCode"); return this.list("village", districtCode, query); }

  private async list(level: "province" | "regency" | "district" | "village", parentCode: string | undefined, query: PaginationQuery) {
    const { page, pageSize, skip, take } = pagination(query, 100, 500); const rawQuery = Array.isArray(query.q) ? query.q[0] : query.q; const q = rawQuery?.trim(); const name = q ? { contains: q, mode: "insensitive" as const } : undefined;
    if (level === "province") { const where = name ? { name } : {}; const [items, total] = await this.prisma.$transaction([this.prisma.regionProvince.findMany({ where, select: { code: true, name: true }, orderBy: { name: "asc" }, skip, take }), this.prisma.regionProvince.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }
    if (level === "regency") { const where = { provinceCode: parentCode!, ...(name ? { name } : {}) }; const [items, total] = await this.prisma.$transaction([this.prisma.regionRegency.findMany({ where, select: { code: true, name: true, provinceCode: true }, orderBy: { name: "asc" }, skip, take }), this.prisma.regionRegency.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }
    if (level === "district") { const where = { regencyCode: parentCode!, ...(name ? { name } : {}) }; const [items, total] = await this.prisma.$transaction([this.prisma.regionDistrict.findMany({ where, select: { code: true, name: true, regencyCode: true }, orderBy: { name: "asc" }, skip, take }), this.prisma.regionDistrict.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) }; }
    const where = { districtCode: parentCode!, ...(name ? { name } : {}) }; const [items, total] = await this.prisma.$transaction([this.prisma.regionVillage.findMany({ where, select: { code: true, name: true, districtCode: true }, orderBy: { name: "asc" }, skip, take }), this.prisma.regionVillage.count({ where })]); return { items, meta: paginationMeta(total, page, pageSize) };
  }
}

function validateCode(value: string, pattern: RegExp, field: string) { if (!pattern.test(value)) apiException(400, "INVALID_REGION_CODE", `${field} tidak valid.`); }
