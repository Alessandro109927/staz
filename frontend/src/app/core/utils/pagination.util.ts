export const DEFAULT_TABLE_PAGE_SIZE = 10;

export const TABLE_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

export function paginateSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0 || items.length === 0) {
    return [];
  }
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(totalItems: number, pageSize: number): number {
  if (totalItems <= 0 || pageSize <= 0) {
    return 1;
  }
  return Math.ceil(totalItems / pageSize);
}

export function clampPage(page: number, totalItems: number, pageSize: number): number {
  const max = totalPages(totalItems, pageSize);
  if (page < 1) {
    return 1;
  }
  if (page > max) {
    return max;
  }
  return page;
}

export function pageRangeLabel(page: number, pageSize: number, totalItems: number): string {
  if (totalItems <= 0) {
    return '0 di 0';
  }
  const safePage = clampPage(page, totalItems, pageSize);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);
  return `${from}–${to} di ${totalItems}`;
}
