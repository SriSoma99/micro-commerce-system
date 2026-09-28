import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, fromUrlSearch, hasActiveFilters, toApiQuery, toUrlSearch, updateFilters, type CatalogFilters } from "./catalogQuery";

const filters = (overrides: Partial<CatalogFilters>): CatalogFilters => ({ ...EMPTY_FILTERS, ...overrides });

describe("toApiQuery", () => {
  it("sends only the page size when nothing is chosen", () => {
    expect(toApiQuery(EMPTY_FILTERS)).toBe("pageSize=24");
  });

  it("repeats brand and dietary keys", () => {
    const query = new URLSearchParams(toApiQuery(filters({ brands: ["Green Meadow", "Pure Sip"], dietary: ["vegan", "gluten-free"] })));
    expect(query.getAll("brand")).toEqual(["Green Meadow", "Pure Sip"]);
    expect(query.getAll("dietary")).toEqual(["vegan", "gluten-free"]);
  });

  it("encodes every filter", () => {
    const query = new URLSearchParams(
      toApiQuery(filters({ q: " vanilla yogurt ", sort: "relevance", category: "dairy-eggs", subcategory: "yogurt", minPrice: 200, maxPrice: 499, minRating: 4, snap: true, weeklyFinds: true, inStock: true, page: 3 }))
    );
    expect(Object.fromEntries(query)).toEqual({
      q: "vanilla yogurt",
      category: "dairy-eggs",
      subcategory: "yogurt",
      minPrice: "200",
      maxPrice: "499",
      minRating: "4",
      snap: "true",
      weeklyFinds: "true",
      inStock: "true",
      page: "3",
      pageSize: "24",
    });
  });

  it("omits the sort when it is the default for the situation, sends it otherwise", () => {
    expect(new URLSearchParams(toApiQuery(filters({ sort: "popular" }))).has("sort")).toBe(false);
    expect(new URLSearchParams(toApiQuery(filters({ q: "milk", sort: "relevance" }))).has("sort")).toBe(false);
    expect(new URLSearchParams(toApiQuery(filters({ sort: "price-asc" }))).get("sort")).toBe("price-asc");
    // Popular is NOT the default once you search, so it must be sent explicitly.
    expect(new URLSearchParams(toApiQuery(filters({ q: "milk", sort: "popular" }))).get("sort")).toBe("popular");
  });

  it("omits page 1", () => {
    expect(new URLSearchParams(toApiQuery(filters({ page: 1 }))).has("page")).toBe(false);
  });
});

describe("URL round trip", () => {
  it("survives toUrlSearch -> fromUrlSearch", () => {
    const original = filters({ q: "milk", category: "dairy-eggs", brands: ["Green Meadow"], dietary: ["vegan"], minPrice: 200, maxPrice: 499, minRating: 4, snap: true, inStock: true, sort: "price-asc", page: 2 });
    expect(fromUrlSearch(toUrlSearch(original))).toEqual(original);
  });

  it("has no page size in the address bar", () => {
    expect(toUrlSearch(EMPTY_FILTERS)).toBe("");
  });

  it("ignores junk: unknown sort, bad numbers, page < 1", () => {
    const parsed = fromUrlSearch("sort=zzz&minPrice=abc&page=0&snap=maybe");
    expect(parsed).toMatchObject({ sort: "popular", minPrice: null, page: 1, snap: false });
  });

  it("defaults the sort to relevance for a keyword search", () => {
    expect(fromUrlSearch("q=milk").sort).toBe("relevance");
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty state and for sort / page alone", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ sort: "price-asc", page: 4 }))).toBe(false);
  });

  it("is true once anything is chosen", () => {
    expect(hasActiveFilters(filters({ q: "milk" }))).toBe(true);
    expect(hasActiveFilters(filters({ brands: ["X"] }))).toBe(true);
    expect(hasActiveFilters(filters({ inStock: true }))).toBe(true);
    expect(hasActiveFilters(filters({ minRating: 4 }))).toBe(true);
  });
});

describe("updateFilters", () => {
  it("returns to page 1 whenever a filter changes", () => {
    expect(updateFilters(filters({ page: 4 }), { inStock: true }).page).toBe(1);
    expect(updateFilters(filters({ page: 4 }), { brands: ["X"] }).page).toBe(1);
  });

  it("keeps the page when the change is the page", () => {
    expect(updateFilters(filters({}), { page: 3 }).page).toBe(3);
  });

  it("switches to relevance when a search starts, and back to popularity when it is cleared", () => {
    const searching = updateFilters(filters({ sort: "popular" }), { q: "milk" });
    expect(searching.sort).toBe("relevance");

    expect(updateFilters(searching, { q: "" }).sort).toBe("popular");
  });

  it("does not override a sort the shopper chose deliberately", () => {
    expect(updateFilters(filters({ sort: "price-asc" }), { q: "milk" }).sort).toBe("relevance"); // starting a search resets it
    expect(updateFilters(filters({ q: "milk", sort: "price-asc" }), { q: "milk chocolate" }).sort).toBe("price-asc"); // refining keeps it
    expect(updateFilters(filters({}), { q: "milk", sort: "rating" }).sort).toBe("rating"); // an explicit sort wins
  });

  it("drops the subcategory when the department changes", () => {
    const next = updateFilters(filters({ category: "dairy-eggs", subcategory: "milk" }), { category: "frozen" });
    expect(next).toMatchObject({ category: "frozen", subcategory: null });
    expect(updateFilters(filters({ category: "dairy-eggs", subcategory: "milk" }), { category: "dairy-eggs" }).subcategory).toBe("milk");
  });
});
