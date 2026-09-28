import type { DietaryTag, ProductCategory, ProductSort } from "../types/product";

export const PAGE_SIZE = 24;

/** Everything the shopper can choose on the catalog page. Mirrors the backend's query parameters. */
export interface CatalogFilters {
  q: string;
  category: ProductCategory | null;
  subcategory: string | null;
  brands: string[];
  dietary: DietaryTag[];
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  snap: boolean;
  weeklyFinds: boolean;
  inStock: boolean;
  storeId: string | null;
  sort: ProductSort;
  page: number;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: "",
  category: null,
  subcategory: null,
  brands: [],
  dietary: [],
  minPrice: null,
  maxPrice: null,
  minRating: null,
  snap: false,
  weeklyFinds: false,
  inStock: false,
  storeId: null,
  sort: "popular",
  page: 1,
};

const SORTS: ProductSort[] = ["relevance", "popular", "price-asc", "price-desc", "rating", "name", "unit-price-asc"];

/** Filters -> the query string the API expects (repeated keys for brand / dietary; defaults omitted). */
export function toApiQuery(filters: CatalogFilters): string {
  const query = new URLSearchParams();
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.subcategory) query.set("subcategory", filters.subcategory);
  for (const brand of filters.brands) query.append("brand", brand);
  for (const tag of filters.dietary) query.append("dietary", tag);
  if (filters.minPrice !== null) query.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== null) query.set("maxPrice", String(filters.maxPrice));
  if (filters.minRating !== null) query.set("minRating", String(filters.minRating));
  if (filters.snap) query.set("snap", "true");
  if (filters.weeklyFinds) query.set("weeklyFinds", "true");
  if (filters.inStock) query.set("inStock", "true");
  if (filters.storeId) query.set("storeId", filters.storeId);
  // With a keyword the API defaults to relevance; otherwise to popularity. Only send an explicit choice.
  const defaultSort: ProductSort = filters.q.trim() ? "relevance" : "popular";
  if (filters.sort !== defaultSort) query.set("sort", filters.sort);
  if (filters.page > 1) query.set("page", String(filters.page));
  query.set("pageSize", String(PAGE_SIZE));
  return query.toString();
}

/** The address-bar form of the filters (same keys, but without the fixed page size), so views can be linked and bookmarked. */
export function toUrlSearch(filters: CatalogFilters): string {
  const query = new URLSearchParams(toApiQuery(filters));
  query.delete("pageSize");
  return query.toString();
}

const num = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses an address-bar query string back into filters, ignoring anything invalid. */
export function fromUrlSearch(search: string): CatalogFilters {
  const query = new URLSearchParams(search);
  const q = query.get("q") ?? "";
  const sort = query.get("sort") as ProductSort | null;
  const page = num(query.get("page"));

  return {
    q,
    category: (query.get("category") as ProductCategory | null) ?? null,
    subcategory: query.get("subcategory"),
    brands: query.getAll("brand"),
    dietary: query.getAll("dietary") as DietaryTag[],
    minPrice: num(query.get("minPrice")),
    maxPrice: num(query.get("maxPrice")),
    minRating: num(query.get("minRating")),
    snap: query.get("snap") === "true",
    weeklyFinds: query.get("weeklyFinds") === "true",
    inStock: query.get("inStock") === "true",
    storeId: query.get("storeId"),
    sort: sort && SORTS.includes(sort) ? sort : q.trim() ? "relevance" : "popular",
    page: page !== null && Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** True when the shopper has chosen anything at all (drives "Clear all"). */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.category !== null ||
    filters.subcategory !== null ||
    filters.brands.length > 0 ||
    filters.dietary.length > 0 ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.minRating !== null ||
    filters.snap ||
    filters.weeklyFinds ||
    filters.inStock
  );
}

/**
 * Applies a shopper's change to the filters, with the rules the UI relies on:
 *  - any change goes back to page 1 (unless the change IS the page)
 *  - starting a keyword search switches to relevance ranking, clearing it goes back to popularity
 *  - switching department drops the old subcategory
 */
export function updateFilters(current: CatalogFilters, patch: Partial<CatalogFilters>): CatalogFilters {
  const next: CatalogFilters = { ...current, ...patch };
  if (!("page" in patch)) next.page = 1;

  if ("q" in patch && !("sort" in patch)) {
    const hadKeyword = current.q.trim() !== "";
    const hasKeyword = next.q.trim() !== "";
    if (hasKeyword && !hadKeyword) next.sort = "relevance";
    if (!hasKeyword && hadKeyword && next.sort === "relevance") next.sort = "popular";
  }

  if ("category" in patch && patch.category !== current.category && !("subcategory" in patch)) {
    next.subcategory = null;
  }
  return next;
}
