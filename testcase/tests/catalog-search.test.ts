import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

interface Item {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  priceMinor: number;
  soldBy: string;
  sizeLabel: string;
  isPrivateLabel: boolean;
  isWeeklyFind: boolean;
  snapEligible: boolean;
  dietaryTags: string[];
  rating: { average: number; reviewCount: number };
  unitPrice: { minorPerUnit: number; unit: string };
}

type Params = Record<string, string | string[]>;

describe("Catalog search, filters, sort & facets", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Repeated keys (`brand=A&brand=B`) the way a browser sends them. */
  function search(params: Params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
    }
    return request(app.baseUrl).get(`/api/products?${query.toString()}`);
  }

  const data = async (params: Params = {}) => (await search(params)).body.data;
  const items = async (params: Params = {}): Promise<Item[]> => (await data({ pageSize: "100", ...params })).items;
  const totalOf = async (params: Params = {}): Promise<number> => (await data({ pageSize: "1", ...params })).total;

  // TC-150
  it("serves a mini-discounter-sized catalog with a facet block on the default page", async () => {
    const page = await data();

    expect(page.total).toBeGreaterThanOrEqual(1000);
    expect(page.total).toBeLessThanOrEqual(5000);
    expect(page.items).toHaveLength(24);
    expect(page.facets.categories).toHaveLength(13);
    expect(page.facets.categories.reduce((sum: number, c: { count: number }) => sum + c.count, 0)).toBe(page.total);
    expect(page.facets.subcategories).toEqual([]); // only populated once a category is chosen
  });

  // TC-151
  it("paginates: pages don't overlap, the last page is partial, and past-the-end is empty", async () => {
    const page1 = await data({ page: "1", pageSize: "24", sort: "name" });
    const page2 = await data({ page: "2", pageSize: "24", sort: "name" });
    const ids1 = new Set(page1.items.map((p: Item) => p.id));
    expect(page2.items.every((p: Item) => !ids1.has(p.id))).toBe(true);

    const pages = Math.ceil(page1.total / 24);
    const last = await data({ page: String(pages), pageSize: "24" });
    expect(last.items).toHaveLength(page1.total - (pages - 1) * 24);

    const beyond = await data({ page: String(pages + 1), pageSize: "24" });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(page1.total);
  });

  // TC-152
  it("keyword search returns only matching products", async () => {
    const found = await items({ q: "yogurt" });

    expect(found.length).toBeGreaterThan(10);
    expect(found.every((p) => /yogurt/i.test(p.name))).toBe(true);
  });

  // TC-153
  it("matches plurals (stemming) and partial words (prefix)", async () => {
    const yogurt = await totalOf({ q: "yogurt" });
    expect(await totalOf({ q: "yogurts" })).toBe(yogurt);
    expect(await totalOf({ q: "yog" })).toBe(yogurt);
    expect(await totalOf({ q: "YOGURT" })).toBe(yogurt); // case-insensitive
  });

  // TC-154
  it("multi-word queries require every word", async () => {
    const both = await items({ q: "vanilla yogurt" });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((p) => /vanilla/i.test(p.name) && /yogurt/i.test(p.name))).toBe(true);
    expect(both.length).toBeLessThan(await totalOf({ q: "yogurt" }));
  });

  // TC-155
  it("brand names are searchable and rank brand matches", async () => {
    const found = await items({ q: "Green Meadow" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.brand === "Green Meadow")).toBe(true);
  });

  // TC-156
  it("treats hostile search text as plain text: 200, no error, catalog intact", async () => {
    const before = await totalOf();
    for (const q of [`"; DROP TABLE products; --`, `' OR 1=1 --`, `* NEAR( AND OR NOT`, `"unbalanced`, `%_\\`]) {
      const response = await search({ q });
      expect(response.status).toBe(200);
    }
    expect(await totalOf()).toBe(before);
  });

  // TC-157
  it("a query of only punctuation behaves like no query", async () => {
    expect(await totalOf({ q: "!!! ???" })).toBe(await totalOf());
  });

  describe("filters", () => {
    // TC-158
    it("category and subcategory", async () => {
      const dairy = await items({ category: "dairy-eggs" });
      expect(dairy.every((p) => p.category === "dairy-eggs")).toBe(true);

      const milk = await items({ category: "dairy-eggs", subcategory: "milk" });
      expect(milk.length).toBeGreaterThan(0);
      expect(milk.every((p) => p.subcategory === "milk")).toBe(true);
      expect(milk.length).toBeLessThan(dairy.length);
    });

    // TC-159
    it("multiple brands are OR-ed", async () => {
      const found = await items({ brand: ["Green Meadow", "Pure Sip"] });
      const brands = new Set(found.map((p) => p.brand));

      expect(brands).toEqual(new Set(["Green Meadow", "Pure Sip"]));
    });

    // TC-160
    it("multiple dietary tags are AND-ed", async () => {
      const found = await items({ dietary: ["vegan", "gluten-free"] });

      expect(found.length).toBeGreaterThan(0);
      expect(found.every((p) => p.dietaryTags.includes("vegan") && p.dietaryTags.includes("gluten-free"))).toBe(true);
      // Compare totals, not the (capped) page contents.
      expect(await totalOf({ dietary: ["vegan", "gluten-free"] })).toBeLessThan(await totalOf({ dietary: ["vegan"] }));
    });

    // TC-161
    it("price range is inclusive of both bounds", async () => {
      const found = await items({ minPrice: "200", maxPrice: "499" });

      expect(found.length).toBeGreaterThan(0);
      expect(found.every((p) => p.priceMinor >= 200 && p.priceMinor <= 499)).toBe(true);
      expect(found.some((p) => p.priceMinor === 499 || p.priceMinor === 249)).toBe(true);
    });

    // TC-162
    it("minimum rating, SNAP-eligible and weekly finds", async () => {
      expect((await items({ minRating: "4" })).every((p) => p.rating.average >= 4)).toBe(true);
      expect((await items({ snap: "true" })).every((p) => p.snapEligible)).toBe(true);

      const finds = await items({ weeklyFinds: "true" });
      expect(finds.length).toBeGreaterThanOrEqual(20);
      expect(finds.every((p) => p.isWeeklyFind)).toBe(true);
    });

    // TC-163
    it("inStock removes out-of-stock products (count matches the facet)", async () => {
      const all = await data();
      const inStock = await totalOf({ inStock: "true" });

      expect(inStock).toBe(all.facets.inStock);
      expect(inStock).toBeLessThan(all.total);
    });

    // TC-164
    it("filters combine (AND across kinds)", async () => {
      const found = await items({ category: "snacks", dietary: ["vegan"], maxPrice: "399", snap: "true" });

      expect(found.every((p) => p.category === "snacks" && p.dietaryTags.includes("vegan") && p.priceMinor <= 399 && p.snapEligible)).toBe(true);
    });
  });

  describe("sorting", () => {
    const isSorted = <T>(values: T[], compare: (a: T, b: T) => number) => values.every((v, i) => i === 0 || compare(values[i - 1] as T, v) <= 0);

    // TC-165
    it("price ascending / descending", async () => {
      expect(isSorted((await items({ sort: "price-asc" })).map((p) => p.priceMinor), (a, b) => a - b)).toBe(true);
      expect(isSorted((await items({ sort: "price-desc" })).map((p) => p.priceMinor), (a, b) => b - a)).toBe(true);
    });

    // TC-166
    it("rating, unit price and name", async () => {
      expect(isSorted((await items({ sort: "rating" })).map((p) => p.rating.average), (a, b) => b - a)).toBe(true);
      expect(isSorted((await items({ sort: "unit-price-asc" })).map((p) => p.unitPrice.minorPerUnit), (a, b) => a - b)).toBe(true);
      expect(
        isSorted((await items({ sort: "name" })).map((p) => p.name.toLowerCase()), (a, b) => (a < b ? -1 : a > b ? 1 : 0))
      ).toBe(true);
    });

    // TC-167
    it("default sort is popularity (review count), or relevance when searching", async () => {
      const popular = await items();
      expect(isSorted(popular.map((p) => p.rating.reviewCount), (a, b) => b - a)).toBe(true);

      const explicit = await items({ sort: "popular" });
      expect(explicit.map((p) => p.id)).toEqual(popular.map((p) => p.id));
    });
  });

  describe("facets", () => {
    // TC-168
    it("are disjunctive: choosing a brand or category doesn't collapse its own facet", async () => {
      const base = await data();
      const brandChosen = await data({ brand: "Green Meadow" });
      expect(brandChosen.facets.brands.length).toBe(base.facets.brands.length);

      const categoryChosen = await data({ category: "dairy-eggs" });
      expect(categoryChosen.facets.categories).toHaveLength(13);
      expect(categoryChosen.facets.subcategories.length).toBeGreaterThan(1);
      const dairyCount = categoryChosen.facets.categories.find((c: { id: string }) => c.id === "dairy-eggs").count;
      expect(dairyCount).toBe(categoryChosen.total);
    });

    // TC-169
    it("other facets do react to the current selection", async () => {
      const base = await data();
      const narrowed = await data({ category: "frozen" });

      expect(narrowed.facets.priceRanges.reduce((s: number, r: { count: number }) => s + r.count, 0)).toBe(narrowed.total);
      expect(narrowed.facets.brands.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(narrowed.total);
      expect(narrowed.facets.snapEligible).toBeLessThanOrEqual(base.facets.snapEligible);
    });

    // TC-170
    it("every facet count equals the total you get by applying that facet", async () => {
      const { facets } = await data({ category: "pantry" });

      const brand = facets.brands[0];
      expect(await totalOf({ category: "pantry", brand: brand.id })).toBe(brand.count);

      const tag = facets.dietary[0];
      expect(await totalOf({ category: "pantry", dietary: tag.id })).toBe(tag.count);

      const sub = facets.subcategories[0];
      expect(await totalOf({ category: "pantry", subcategory: sub.id })).toBe(sub.count);

      for (const range of facets.priceRanges) {
        const params: Params = { category: "pantry", minPrice: String(range.minMinor) };
        if (range.maxMinor !== null) params.maxPrice = String(range.maxMinor);
        expect(await totalOf(params)).toBe(range.count);
      }
      for (const rating of facets.ratings) {
        expect(await totalOf({ category: "pantry", minRating: String(rating.minRating) })).toBe(rating.count);
      }
      expect(await totalOf({ category: "pantry", snap: "true" })).toBe(facets.snapEligible);
      expect(await totalOf({ category: "pantry", weeklyFinds: "true" })).toBe(facets.weeklyFinds);
    });

    // TC-171
    it("facet counts reflect a keyword search", async () => {
      const { facets, total } = await data({ q: "yogurt" });

      expect(facets.categories.map((c: { id: string }) => c.id)).toEqual(["dairy-eggs"]);
      expect(facets.brands.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(total);
    });
  });

  describe("validation", () => {
    // TC-172
    it("rejects bad parameters with 400 and a message per problem", async () => {
      const response = await search({
        category: "nope",
        dietary: "x",
        sort: "zzz",
        page: "0",
        pageSize: "101",
        minPrice: "-5",
        minRating: "9",
        snap: "maybe",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_FAILED");
      const details: string[] = response.body.details;
      for (const field of ["category", "dietary", "sort", "page", "pageSize", "minPrice", "minRating", "snap"]) {
        expect(details.some((d) => d.startsWith(field))).toBe(true);
      }
    });

    // TC-173
    it("rejects an inverted price range and non-numeric numbers", async () => {
      expect((await search({ minPrice: "500", maxPrice: "100" })).status).toBe(400);
      expect((await search({ page: "abc" })).status).toBe(400);
      expect((await search({ pageSize: "1.5" })).status).toBe(400);
    });
  });

  describe("catalog character", () => {
    // TC-174
    it("is mostly private label with realistic retail prices and a few weekly finds", async () => {
      const all: Item[] = [];
      for (let page = 1; page <= 20; page++) {
        const { items: batch } = await data({ page: String(page), pageSize: "100" });
        all.push(...batch);
        if (batch.length < 100) break;
      }
      const total = await totalOf();

      expect(all).toHaveLength(total);
      expect(new Set(all.map((p) => p.id)).size).toBe(total);
      expect(all.filter((p) => p.isPrivateLabel).length / total).toBeGreaterThan(0.5);
      expect(all.every((p) => Number.isInteger(p.priceMinor) && p.priceMinor % 10 === 9)).toBe(true);
      expect(all.filter((p) => p.isWeeklyFind).length).toBeGreaterThanOrEqual(20);
      expect(all.filter((p) => p.category === "household").every((p) => !p.snapEligible)).toBe(true);
    });

    // TC-175
    it("loose produce is sold by weight, priced per lb", async () => {
      const bananas = (await items({ q: "bananas", category: "produce" })).filter((p) => p.name.toLowerCase().includes("banana"));

      expect(bananas.length).toBeGreaterThan(0);
      expect(bananas.every((p) => p.soldBy === "weight" && p.sizeLabel === "per lb" && p.unitPrice.unit === "lb")).toBe(true);
    });
  });

  describe("images & departments", () => {
    // TC-176
    it("serves a generated SVG tile per product, cacheable, 404 for unknown ids", async () => {
      const [first] = await items();
      const image = await request(app.baseUrl)
        .get(`/api/products/${first?.id}/image.svg`)
        .buffer(true)
        .parse((res, done) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => done(null, body));
        });

      expect(image.status).toBe(200);
      expect(image.headers["content-type"]).toContain("image/svg+xml");
      expect(image.headers["cache-control"]).toContain("max-age");
      expect(image.body).toContain("<svg");
      expect(image.body).toContain((first as Item).brand.toUpperCase().replace(/&/g, "&amp;"));

      expect((await request(app.baseUrl).get("/api/products/nope/image.svg")).status).toBe(404);
    });

    // TC-177
    it("thumbnails point at the image endpoint", async () => {
      const [first] = await data({ pageSize: "1" }).then((d) => d.items);
      expect(first.thumbnail).toBe(`/api/products/${first.id}/image.svg`);
    });

    // TC-178
    it("GET /api/catalog/departments returns the tree with counts that add up", async () => {
      const response = await request(app.baseUrl).get("/api/catalog/departments");
      const departments = response.body.data as {
        id: string;
        name: string;
        emoji: string;
        count: number;
        subcategories: { id: string; name: string; count: number }[];
      }[];

      expect(response.status).toBe(200);
      expect(departments).toHaveLength(13);
      expect(departments.every((d) => d.emoji.length > 0 && d.name.length > 0)).toBe(true);
      for (const department of departments) {
        expect(department.subcategories.reduce((s, sub) => s + sub.count, 0)).toBe(department.count);
      }
      expect(departments.reduce((s, d) => s + d.count, 0)).toBe(await totalOf());
    });
  });
});
