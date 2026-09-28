/**
 * Client-side mirror of the product-catalog-service domain model (hand-kept in
 * sync with the backend's src/types/product.ts - there is no shared package).
 * Money is integer cents (`priceMinor`); `unitPrice` is display-only.
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
export type SoldBy = "each" | "weight";

export interface ProductMaster {
  id: string;
  name: string;
  /** Path relative to the API origin; resolve with `assetUrl()`. */
  thumbnail: string;
  priceMinor: number;
  currency: string;
  category: ProductCategory;
  subcategory: string;
  brand: string;
  isPrivateLabel: boolean;
  sizeLabel: string;
  soldBy: SoldBy;
  unitPrice: { minorPerUnit: number; unit: string };
  rating: { average: number; reviewCount: number };
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
  taxCode: string;
  ageRestricted: boolean;
}

export type ProductSort = "relevance" | "popular" | "price-asc" | "price-desc" | "rating" | "name" | "unit-price-asc";

export interface FacetCount {
  id: string;
  name: string;
  count: number;
}

export interface ProductFacets {
  categories: FacetCount[];
  subcategories: FacetCount[];
  brands: FacetCount[];
  dietary: FacetCount[];
  ratings: { minRating: number; count: number }[];
  priceRanges: { id: string; name: string; minMinor: number; maxMinor: number | null; count: number }[];
  snapEligible: number;
  weeklyFinds: number;
  inStock: number;
}

export interface ProductListPage {
  items: ProductMaster[];
  total: number;
  page: number;
  pageSize: number;
  /** `null` while the circuit breaker is serving stale data: no trustworthy counts. */
  facets: ProductFacets | null;
}

export interface Department {
  id: ProductCategory;
  name: string;
  emoji: string;
  colors: [string, string];
  count: number;
  subcategories: FacetCount[];
}

export type ResilienceSource = "live-core" | "circuit-breaker-fallback";

export interface ResilientPayload<T> {
  data: T;
  isFallback: boolean;
  source: ResilienceSource;
  retrievedAt: string;
}
