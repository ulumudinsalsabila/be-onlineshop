import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const sourceUrl = process.env.REGION_DATA_URL?.trim() || "https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql";
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
type RegionRow = { code: string; name: string; parentCode?: string };

async function main() {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Region source returned HTTP ${response.status}.`);
  const rows = parseRows(await response.text());
  const provinces = rows.filter((row) => row.code.split(".").length === 1);
  const regencies = rows.filter((row) => row.code.split(".").length === 2).map(withParent);
  const districts = rows.filter((row) => row.code.split(".").length === 3).map(withParent);
  const villages = rows.filter((row) => row.code.split(".").length === 4).map(withParent);
  if (provinces.length !== 38 || regencies.length < 500 || districts.length < 7_000 || villages.length < 75_000) throw new Error(`Region dataset is incomplete: ${JSON.stringify({ provinces: provinces.length, regencies: regencies.length, districts: districts.length, villages: villages.length })}`);

  await upsertProvinces(provinces);
  await upsertChildren("RegionRegency", "provinceCode", regencies);
  await upsertChildren("RegionDistrict", "regencyCode", districts);
  await upsertChildren("RegionVillage", "districtCode", villages);
  console.info(`Region master synchronized: ${provinces.length} provinces, ${regencies.length} regencies/cities, ${districts.length} districts, ${villages.length} villages/subdistricts.`);
}

function parseRows(sql: string) {
  const rows: RegionRow[] = []; const pattern = /\('((?:\\.|''|[^'])*)','((?:\\.|''|[^'])*)'\)/g;
  for (const match of sql.matchAll(pattern)) rows.push({ code: unescapeSql(match[1]), name: unescapeSql(match[2]) });
  return rows;
}
function unescapeSql(value: string) { return value.replaceAll("''", "'").replace(/\\'/g, "'").replace(/\\\\/g, "\\").trim(); }
function withParent(row: RegionRow): RegionRow { return { ...row, parentCode: row.code.slice(0, row.code.lastIndexOf(".")) }; }
function chunks<T>(values: T[], size = 1_000) { return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size)); }

async function upsertProvinces(rows: RegionRow[]) {
  for (const batch of chunks(rows)) {
    const values = Prisma.join(batch.map((row) => Prisma.sql`(${row.code}, ${row.name})`));
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "RegionProvince" ("code", "name") VALUES ${values} ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP`);
  }
}

async function upsertChildren(table: "RegionRegency" | "RegionDistrict" | "RegionVillage", parentColumn: "provinceCode" | "regencyCode" | "districtCode", rows: RegionRow[]) {
  const tableSql = Prisma.raw(`"${table}"`); const parentSql = Prisma.raw(`"${parentColumn}"`);
  for (const batch of chunks(rows)) {
    const values = Prisma.join(batch.map((row) => Prisma.sql`(${row.code}, ${row.parentCode!}, ${row.name})`));
    await prisma.$executeRaw(Prisma.sql`INSERT INTO ${tableSql} ("code", ${parentSql}, "name") VALUES ${values} ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", ${parentSql} = EXCLUDED.${parentSql}, "updatedAt" = CURRENT_TIMESTAMP`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
