import type { CatalogState } from "../hooks/useCatalog";
import { EMPTY_FILTERS, type CatalogFilters } from "../api/catalogQuery";
import type { ProductDetail, ProductFacets, ProductListPage, ProductMaster } from "../types/product";

export const product = (overrides: Partial<ProductMaster> = {}): ProductMaster => ({
  id: "p-00001",
  name: "Green Meadow Vanilla Greek Yogurt",
  thumbnail: "/api/products/p-00001/image.svg",
  priceMinor: 539,
  currency: "USD",
  category: "dairy-eggs",
  subcategory: "yogurt",
  brand: "Green Meadow",
  isPrivateLabel: true,
  sizeLabel: "16 oz",
  soldBy: "each",
  unitPrice: { minorPerUnit: 33.7, unit: "oz" },
  rating: { average: 4.3, reviewCount: 312 },
  snapEligible: true,
  dietaryTags: ["gluten-free", "vegetarian"],
  isWeeklyFind: false,
  ...overrides,
});

export const detail = (overrides: Partial<ProductDetail> = {}): ProductDetail => ({
  ...product(),
  description: "Creamy Greek yogurt.",
  stock: 42,
  specifications: [
    { label: "Size", value: "16 oz" },
    { label: "Storage", value: "Keep refrigerated" },
  ],
  configurationOptions: [],
  gallery: ["/api/products/p-00001/image.svg"],
  taxCode: "grocery",
  ageRestricted: false,
  ...overrides,
});

export const facets = (overrides: Partial<ProductFacets> = {}): ProductFacets => ({
  categories: [
    { id: "dairy-eggs", name: "Dairy & Eggs", count: 142 },
    { id: "frozen", name: "Frozen", count: 125 },
  ],
  subcategories: [],
  brands: [
    { id: "Green Meadow", name: "Green Meadow", count: 40 },
    { id: "Pure Sip", name: "Pure Sip", count: 12 },
  ],
  dietary: [{ id: "vegan", name: "vegan", count: 30 }],
  ratings: [
    { minRating: 4, count: 900 },
    { minRating: 3, count: 1398 },
  ],
  priceRanges: [
    { id: "under-2", name: "Under $2", minMinor: 0, maxMinor: 199, count: 152 },
    { id: "2-5", name: "$2 – $5", minMinor: 200, maxMinor: 499, count: 601 },
  ],
  snapEligible: 1136,
  weeklyFinds: 31,
  inStock: 1338,
  ...overrides,
});

export const listPage = (items: ProductMaster[], overrides: Partial<ProductListPage> = {}): ProductListPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 24,
  facets: facets(),
  ...overrides,
});

export const catalogState = (overrides: Omit<Partial<CatalogState>, "filters"> & { filters?: Partial<CatalogFilters> } = {}): CatalogState => {
  const { filters, ...rest } = overrides;
  return {
    filters: { ...EMPTY_FILTERS, ...filters },
    page: listPage([product()]),
    isFetching: false,
    error: null,
    isFallback: false,
    status: { source: "live-core", retrievedAt: "2026-01-01T00:00:00Z" },
    refetch: () => {},
    ...rest,
  };
};
