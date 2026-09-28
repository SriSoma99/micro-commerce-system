import { DEPARTMENT_BY_ID } from "../db/catalog/taxonomy";
import { ProductDetail, ProductListPage, ProductQuery, ProductSort } from "../types/product";
import { toFtsExpression } from "./productQuery";

/**
 * Degraded-mode search over the in-memory snapshot, used when the circuit
 * breaker is open. It supports the same filters and sorts as the SQL path so
 * the storefront keeps working, but returns `facets: null`: stale data can't
 * produce trustworthy counts, and pretending otherwise would be worse than
 * hiding them. Keyword matching is a simple all-tokens-are-prefixes check, not
 * FTS relevance, so `relevance` falls back to popularity.
 */
const COMPARATORS: Record<Exclude<ProductSort, "relevance">, (a: ProductDetail, b: ProductDetail) => number> = {
  popular: (a, b) => b.rating.reviewCount - a.rating.reviewCount || a.id.localeCompare(b.id),
  "price-asc": (a, b) => a.priceMinor - b.priceMinor || a.id.localeCompare(b.id),
  "price-desc": (a, b) => b.priceMinor - a.priceMinor || a.id.localeCompare(b.id),
  rating: (a, b) => b.rating.average - a.rating.average || b.rating.reviewCount - a.rating.reviewCount || a.id.localeCompare(b.id),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id),
  "unit-price-asc": (a, b) => a.unitPrice.minorPerUnit - b.unitPrice.minorPerUnit || a.id.localeCompare(b.id),
};

function matches(product: ProductDetail, query: ProductQuery, tokens: string[]): boolean {
  if (query.category && product.category !== query.category) return false;
  if (query.subcategory && product.subcategory !== query.subcategory) return false;
  if (query.brands && query.brands.length > 0 && !query.brands.includes(product.brand)) return false;
  if (query.dietary && !query.dietary.every((tag) => product.dietaryTags.includes(tag))) return false;
  if (query.minPriceMinor !== undefined && product.priceMinor < query.minPriceMinor) return false;
  if (query.maxPriceMinor !== undefined && product.priceMinor > query.maxPriceMinor) return false;
  if (query.minRating !== undefined && product.rating.average < query.minRating) return false;
  if (query.snapEligible && !product.snapEligible) return false;
  if (query.weeklyFinds && !product.isWeeklyFind) return false;
  if (query.inStock && product.stock <= 0) return false;

  if (tokens.length > 0) {
    const words = `${product.name} ${product.brand} ${DEPARTMENT_BY_ID[product.category].name} ${product.subcategory}`
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
    if (!tokens.every((token) => words.some((word) => word.startsWith(token)))) return false;
  }
  return true;
}

export function searchSnapshot(all: ProductDetail[], query: ProductQuery, toMaster: (p: ProductDetail) => ProductListPage["items"][number]): ProductListPage {
  const tokens = (toFtsExpression(query.q)?.match(/[a-z0-9]+/g) ?? []) as string[];
  const compare = COMPARATORS[query.sort === "relevance" ? "popular" : query.sort];
  const matched = all.filter((product) => matches(product, query, tokens)).sort(compare);
  const start = (query.page - 1) * query.pageSize;

  return {
    items: matched.slice(start, start + query.pageSize).map(toMaster),
    total: matched.length,
    page: query.page,
    pageSize: query.pageSize,
    facets: null,
  };
}
