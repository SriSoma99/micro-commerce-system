import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate, shutdownBreakers } from "../support/testApp";

type Params = Record<string, string | string[]>;

/**
 * Degraded mode: when the datastore fails, the list endpoint serves the
 * in-memory snapshot. It must return the SAME products for the same filters
 * (so the storefront keeps working), just without facet counts. The two
 * implementations (SQL and in-memory) are separate code, so this suite is what
 * stops them drifting apart.
 */
describe("Catalog fallback parity (circuit-breaker snapshot vs live SQL)", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
  });

  afterAll(async () => {
    setSimulatedFailureRate(0);
    await app.close();    shutdownBreakers();
  });

  const get = (params: Params) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
    return request(app.baseUrl).get(`/api/products?${query.toString()}`);
  };

  // sort is price-asc (ties broken by id in both implementations) so order is comparable too.
  const CASES: { name: string; params: Params }[] = [
    { name: "department", params: { category: "dairy-eggs", sort: "price-asc", pageSize: "100" } },
    { name: "brands + dietary", params: { brand: ["Green Meadow", "Pure Sip"], dietary: ["vegan"], sort: "price-asc", pageSize: "100" } },
    { name: "keyword", params: { q: "vanilla yogurt", sort: "price-asc", pageSize: "100" } },
    { name: "price + rating + snap + stock", params: { minPrice: "200", maxPrice: "499", minRating: "4", snap: "true", inStock: "true", sort: "price-asc", pageSize: "100" } },
    { name: "weekly finds", params: { weeklyFinds: "true", sort: "price-asc", pageSize: "100" } },
    { name: "subcategory, page 2", params: { category: "pantry", subcategory: "condiments", sort: "price-asc", pageSize: "5", page: "2" } },
  ];

  // TC-180
  it.each(CASES)("returns the same products live and in fallback mode: $name", async ({ params }) => {
    setSimulatedFailureRate(0);
    const live = await get(params);
    expect(live.body.isFallback).toBe(false);

    setSimulatedFailureRate(1);
    const degraded = await get(params);
    setSimulatedFailureRate(0);

    expect(degraded.status).toBe(200);
    expect(degraded.body.isFallback).toBe(true);
    expect(degraded.body.source).toBe("circuit-breaker-fallback");
    expect(degraded.body.data.total).toBe(live.body.data.total);
    expect(degraded.body.data.items.map((p: { id: string }) => p.id)).toEqual(live.body.data.items.map((p: { id: string }) => p.id));
  });

  // TC-181
  it("degraded pages carry no facets and no Detail-only fields", async () => {
    setSimulatedFailureRate(1);
    const response = await get({ pageSize: "50" });
    setSimulatedFailureRate(0);

    expect(response.body.isFallback).toBe(true);
    expect(response.body.data.facets).toBeNull();
    for (const item of response.body.data.items) {
      for (const field of ["description", "stock", "specifications", "configurationOptions", "gallery", "taxCode", "ageRestricted"]) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });

  // TC-182
  it("still validates the query in degraded mode (400, not a fallback page)", async () => {
    setSimulatedFailureRate(1);
    const response = await get({ sort: "nonsense" });
    setSimulatedFailureRate(0);

    expect(response.status).toBe(400);
  });

  // TC-183
  it("the snapshot serves any product's detail during an outage", async () => {
    setSimulatedFailureRate(0);
    const [someProduct] = (await get({ category: "frozen", pageSize: "1" })).body.data.items;

    setSimulatedFailureRate(1);
    const detail = await request(app.baseUrl).get(`/api/products/${someProduct.id}`);
    setSimulatedFailureRate(0);

    expect(detail.status).toBe(200);
    expect(detail.body.isFallback).toBe(true);
    expect(detail.body.data.id).toBe(someProduct.id);
    expect(typeof detail.body.data.stock).toBe("number");
  });
});
