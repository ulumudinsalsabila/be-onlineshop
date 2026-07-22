export type PaginationQuery = Record<string, string | string[] | undefined>;

export function pagination(query: PaginationQuery, defaultPageSize = 10, maxPageSize = 100) {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const page = Math.max(1, Math.min(100_000, Math.trunc(Number(first(query.page))) || 1));
  const requested = Math.trunc(Number(first(query.limit) ?? first(query.pageSize))) || defaultPageSize;
  const pageSize = Math.max(1, Math.min(maxPageSize, requested));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { total, page, pageSize, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}
