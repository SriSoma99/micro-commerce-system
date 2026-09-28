import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

const MASTER_FIELDS = [
  "id",
  "name",
  "thumbnail",
  "priceMinor",
  "currency",
  "category",
  "subcategory",
  "brand",
  "isPrivateLabel",
  "sizeLabel",
  "soldBy",
  "unitPrice",
  "rating",
  "snapEligible",
  "dietaryTags",
  "isWeeklyFind",
] as const;
const DETAIL_ONLY_FIELDS = ["description", "stock", "specifications", "configurationOptions", "gallery", "taxCode", "ageRestricted"];
const CATEGORIES = [
  "produce",
  "meat-seafood",
  "dairy-eggs",
  "deli",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "snacks",
  "household",
  "health-beauty",
  "baby",
  "pet",
];

describe("GET /api/products (Master list)", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    // Deterministic downstream for contract/shape assertions — the
    // failure/fallback path is exercised deliberately in circuit-breaker.test.ts.
    setSimulatedFailureRate(0);
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // TC-010
  it("returns 200 with a ResilientPayload envelope wrapping a page of products", async () => {
    const response = await request(app.baseUrl).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      isFallback: false,
      source: "live-core",
    });
    expect(typeof response.body.retrievedAt).toBe("string");
    expect(Array.isArray(response.body.data.items)).toBe(true);
    expect(response.body.data.items.length).toBeGreaterThan(0);
    expect(response.body.data).toMatchObject({ page: 1, pageSize: 24 });
    expect(response.body.data.total).toBeGreaterThanOrEqual(response.body.data.items.length);
  });

  // TC-011
  it("every item has exactly the ProductMaster field set — no Detail leakage", async () => {
    const response = await request(app.baseUrl).get("/api/products?pageSize=100");

    for (const product of response.body.data.items) {
      expect(Object.keys(product).sort()).toEqual([...MASTER_FIELDS].sort());
      for (const field of DETAIL_ONLY_FIELDS) {
        expect(product).not.toHaveProperty(field);
      }
    }
  });

  // TC-012
  it("prices are positive integer cents, unit prices are positive, currency is a 3-letter code", async () => {
    const response = await request(app.baseUrl).get("/api/products?pageSize=100");

    for (const product of response.body.data.items) {
      expect(Number.isInteger(product.priceMinor)).toBe(true);
      expect(product.priceMinor).toBeGreaterThan(0);
      expect(product.unitPrice.minorPerUnit).toBeGreaterThan(0);
      expect(typeof product.unitPrice.unit).toBe("string");
      expect(product.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  // TC-013
  it("only serves the known grocery departments", async () => {
    const response = await request(app.baseUrl).get("/api/products?pageSize=100");
    const categories = new Set(response.body.data.items.map((p: { category: string }) => p.category));

    for (const category of categories) {
      expect(CATEGORIES).toContain(category);
    }
  });
});
