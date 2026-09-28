/**
 * Domain model for the Product Catalog bounded context (grocery discounter).
 *
 * ProductMaster is the lightweight projection served to grid/list views.
 * ProductDetail is the fully-hydrated aggregate served to single-item views.
 * Keeping these as distinct types (rather than one "optional-fields" shape)
 * lets the repository/service layers return exactly the payload shape each
 * consumer needs, and lets the compiler catch accidental leakage of heavy
 * fields into list responses.
 *
 * Money is integer minor units (`priceMinor`, cents) - never a float dollar
 * amount - see `platform/money.ts`.
 */

export type ProductCategory =
  | "produce"
  | "meat-seafood"
  | "dairy-eggs"
  | "deli"
  | "bakery"
  | "pantry"
  | "frozen"
  | "beverages"
  | "snacks"
  | "household"
  | "health-beauty"
  | "baby"
  | "pet";

export type DietaryTag = "organic" | "vegan" | "vegetarian" | "gluten-free" | "dairy-free" | "keto";

/** `weight` items are priced per lb and sold in whole-pound quantities. */
export type SoldBy = "each" | "weight";

export interface ProductMaster {
  id: string;
  name: string;
  /** Path relative to the API origin, e.g. `/api/products/p-00042/image.svg`. */
  thumbnail: string;
  priceMinor: number;
  currency: string;
  category: ProductCategory;
  /** Subcategory slug, e.g. "milk" (display names come from the facets). */
  subcategory: string;
  brand: string;
  isPrivateLabel: boolean;
  /** Human size, e.g. "1 gal", "16 oz", "per lb". */
  sizeLabel: string;
  soldBy: SoldBy;
  /**
   * Display-only price per unit of measure (legally required in the EU, common
   * in US groceries). `minorPerUnit` can be fractional (2.5 cents per oz), so
   * it is a derived display value, not money to be summed.
   */
  unitPrice: { minorPerUnit: number; unit: string };
  rating: {
    average: number;
    reviewCount: number;
  };
  snapEligible: boolean;
  dietaryTags: DietaryTag[];
  isWeeklyFind: boolean;
  storeId?: string;
  storeStock?: number;
  storeReserved?: number;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface ConfigurationOption {
  name: string;
  choices: string[];
  defaultChoice: string;
}

export interface ProductDetail extends ProductMaster {
  description: string;
  stock: number;
  specifications: ProductSpecification[];
  configurationOptions: ConfigurationOption[];
  gallery: string[];
  /** Region tax vocabulary key (US pack: grocery, prepared-food, candy, soft-drink, alcohol, general). */
  taxCode: string;
  ageRestricted: boolean;
}

export type ProductSort = "relevance" | "popular" | "price-asc" | "price-desc" | "rating" | "name" | "unit-price-asc";

/** Validated list/search query. Every field is optional; absent means "no filter". */
export interface ProductQuery {
  q?: string;
  category?: ProductCategory;
  subcategory?: string;
  brands?: string[];
  dietary?: DietaryTag[];
  minPriceMinor?: number;
  maxPriceMinor?: number;
  minRating?: number;
  snapEligible?: boolean;
  weeklyFinds?: boolean;
  inStock?: boolean;
  storeId?: string;
  sort: ProductSort;
  page: number;
  pageSize: number;
}

export interface FacetCount {
  id: string;
  name: string;
  count: number;
}

/**
 * Sidebar counts. Each facet is counted with every filter EXCEPT its own, so
 * picking a brand doesn't make the other brands vanish from the brand list.
 */
export interface ProductFacets {
  categories: FacetCount[];
  /** Only populated when a category is selected. */
  subcategories: FacetCount[];
  brands: FacetCount[];
  dietary: FacetCount[];
  /** Cumulative: "4 & up" includes 5-star products. */
  ratings: { minRating: number; count: number }[];
  priceRanges: { id: string; name: string; minMinor: number; maxMinor: number | null; count: number }[];
  snapEligible: number;
  weeklyFinds: number;
  inStock: number;
}

export interface ProductListPage {
  items: ProductMaster[];
  /** Total matches across all pages. */
  total: number;
  page: number;
  pageSize: number;
  /** `null` in circuit-breaker fallback mode: stale data can't produce trustworthy counts. */
  facets: ProductFacets | null;
}

/**
 * Wrapper applied by the resilience layer so downstream consumers (API
 * responses, UI) can distinguish a live read from a circuit-breaker
 * fallback without inspecting HTTP status codes or headers.
 */
export interface ResilientPayload<T> {
  data: T;
  isFallback: boolean;
  source: "live-core" | "circuit-breaker-fallback";
  retrievedAt: string;
}
