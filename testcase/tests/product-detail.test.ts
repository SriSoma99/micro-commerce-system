import request from "supertest";
import { DetailLike, findDetail } from "../support/catalog";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

const DETAIL_FIELDS = [
  "id",
  "name",
  "thumbnail",
  "priceMinor",
  "currency",
  "category",
  "subcategory",
  "brand",
  "sizeLabel",
  "unitPrice",
  "description",
  "stock",
  "specifications",
  "configurationOptions",
  "gallery",
  "rating",
  "taxCode",
  "ageRestricted",
];

describe("GET /api/products/:id (Detail)", () => {
  let app: RunningTestApp;
  let product: DetailLike; // a product that has configuration options

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
    product = await findDetail(app.baseUrl, { q: "Trash Bags" }, (d) => d.configurationOptions.length > 0);
  });

  afterAll(async () => {
    await app.close();
  });

  // TC-020
  it("returns 200 with the full ProductDetail field set for a known id", async () => {
    const response = await request(app.baseUrl).get(`/api/products/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.body.isFallback).toBe(false);
    expect(response.body.source).toBe("live-core");
    for (const field of DETAIL_FIELDS) {
      expect(response.body.data).toHaveProperty(field);
    }
    expect(Number.isInteger(response.body.data.stock)).toBe(true);
    expect(response.body.data.gallery.length).toBeGreaterThan(0);
  });

  // TC-021
  it("returns 404 with an error envelope for an unknown id", async () => {
    const response = await request(app.baseUrl).get("/api/products/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "NOT_FOUND",
      isFallback: false,
      source: "live-core",
    });
    expect(response.body.message).toContain("does-not-exist");
  });

  // TC-022 — data integrity: every configuration option's default choice
  // must actually be one of its own listed choices.
  it("every configuration option's defaultChoice is among its own choices", async () => {
    const response = await request(app.baseUrl).get(`/api/products/${product.id}`);

    expect(response.body.data.configurationOptions.length).toBeGreaterThan(0);
    for (const option of response.body.data.configurationOptions) {
      expect(option.choices).toContain(option.defaultChoice);
    }
  });

  // TC-023 — data integrity: rating must be a plausible 0-5 star value.
  it("rating.average is within the valid 0-5 range", async () => {
    const response = await request(app.baseUrl).get(`/api/products/${product.id}`);

    expect(response.body.data.rating.average).toBeGreaterThanOrEqual(0);
    expect(response.body.data.rating.average).toBeLessThanOrEqual(5);
    expect(response.body.data.rating.reviewCount).toBeGreaterThanOrEqual(0);
  });

  // TC-024 — cross-endpoint consistency: the Master projection returned by
  // the list endpoint must exactly match the shared fields on Detail.
  it("shares identical Master fields with the list endpoint's entry for the same id", async () => {
    const [listResponse, detailResponse] = await Promise.all([
      request(app.baseUrl).get("/api/products?q=Trash%20Bags&pageSize=60"),
      request(app.baseUrl).get(`/api/products/${product.id}`),
    ]);

    const masterEntry = listResponse.body.data.items.find((p: { id: string }) => p.id === product.id);
    const detail = detailResponse.body.data;

    expect(masterEntry).toBeDefined();
    for (const field of Object.keys(masterEntry)) {
      expect(masterEntry[field]).toEqual(detail[field]);
    }
  });

  // TC-025
  it("detail carries the tax code, size and unit price checkout will need", async () => {
    const { data } = (await request(app.baseUrl).get(`/api/products/${product.id}`)).body;

    expect(data.taxCode).toBe("general"); // household goods are taxed as general merchandise
    expect(typeof data.sizeLabel).toBe("string");
    expect(data.ageRestricted).toBe(false);
  });
});
