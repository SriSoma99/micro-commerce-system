import request from "supertest";
import { findDetail } from "../support/catalog";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate, shutdownBreakers } from "../support/testApp";

// Discovered from the catalog in beforeAll (not hardcoded ids), so tuning the
// seed data can never break these tests.
let KNOWN_PRODUCT_ID: string; // in stock (>= 20), has a "Scent" configuration option
let OTHER_PRODUCT_ID: string; // in stock (>= 20), no configuration options

function freshCartId(): string {
  return `test-cart-${Math.random().toString(36).slice(2)}`;
}

describe("Cart & Checkout API", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
    KNOWN_PRODUCT_ID = (
      await findDetail(app.baseUrl, { q: "Trash Bags", inStock: "true" }, (d) => d.stock >= 20 && d.configurationOptions.length > 0)
    ).id;
    OTHER_PRODUCT_ID = (
      await findDetail(app.baseUrl, { category: "beverages", inStock: "true" }, (d) => d.stock >= 20 && d.configurationOptions.length === 0)
    ).id;
  });

  afterAll(async () => {
    await app.close();    shutdownBreakers();
  });

  // TC-040
  it("GET on a never-touched cartId returns 200 with an empty cart, not 404", async () => {
    const response = await request(app.baseUrl).get(`/api/cart/${freshCartId()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ items: [], subtotalMinor: 0, itemCount: 0 });
  });

  // TC-041
  it("adds an item to an empty cart", async () => {
    const cartId = freshCartId();

    const response = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ productId: KNOWN_PRODUCT_ID, quantity: 2 });
    expect(response.body.data.itemCount).toBe(2);
    expect(Number.isInteger(response.body.data.subtotalMinor)).toBe(true);
    expect(response.body.data.subtotalMinor).toBeGreaterThan(0);
  });

  // TC-042
  it("merges a second add of the same product + configuration into one line item", async () => {
    const cartId = freshCartId();
    const configuration = { Scent: "Lemon Fresh" };

    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1, selectedConfiguration: configuration });
    const second = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 3, selectedConfiguration: configuration });

    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.items[0].quantity).toBe(4);
  });

  // TC-043
  it("treats the same product with a different configuration as a separate line item", async () => {
    const cartId = freshCartId();

    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1, selectedConfiguration: { Scent: "Unscented" } });
    const response = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1, selectedConfiguration: { Scent: "Lemon Fresh" } });

    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.itemCount).toBe(2);
  });

  // TC-044
  it("returns 404 PRODUCT_NOT_FOUND when adding a nonexistent product", async () => {
    const response = await request(app.baseUrl)
      .post(`/api/cart/${freshCartId()}/items`)
      .send({ productId: "does-not-exist", quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("PRODUCT_NOT_FOUND");
  });

  // TC-045
  it("returns 409 INSUFFICIENT_STOCK when the requested quantity exceeds stock", async () => {
    const response = await request(app.baseUrl)
      .post(`/api/cart/${freshCartId()}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 9999 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("INSUFFICIENT_STOCK");
  });

  // TC-046
  it("returns 400 INVALID_CONFIGURATION for an unknown configuration option", async () => {
    const response = await request(app.baseUrl)
      .post(`/api/cart/${freshCartId()}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1, selectedConfiguration: { NotAnOption: "x" } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_CONFIGURATION");
  });

  // TC-047
  it("updates a line item's quantity", async () => {
    const cartId = freshCartId();
    const added = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1 });
    const lineItemId = added.body.data.items[0].lineItemId;

    const response = await request(app.baseUrl)
      .patch(`/api/cart/${cartId}/items/${lineItemId}`)
      .send({ quantity: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.items[0].quantity).toBe(5);
  });

  // TC-048
  it("updating a line item's quantity to 0 removes it", async () => {
    const cartId = freshCartId();
    const added = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1 });
    const lineItemId = added.body.data.items[0].lineItemId;

    const response = await request(app.baseUrl)
      .patch(`/api/cart/${cartId}/items/${lineItemId}`)
      .send({ quantity: 0 });

    expect(response.body.data.items).toHaveLength(0);
  });

  // TC-049
  it("returns 404 LINE_ITEM_NOT_FOUND for an unknown lineItemId", async () => {
    const response = await request(app.baseUrl)
      .patch(`/api/cart/${freshCartId()}/items/does-not-exist`)
      .send({ quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("LINE_ITEM_NOT_FOUND");
  });

  // TC-050
  it("removes a line item", async () => {
    const cartId = freshCartId();
    const added = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1 });
    const lineItemId = added.body.data.items[0].lineItemId;

    const response = await request(app.baseUrl).delete(`/api/cart/${cartId}/items/${lineItemId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(0);
  });

  // TC-054
  it("isolates cart contents between two distinct cartIds", async () => {
    const cartA = freshCartId();
    const cartB = freshCartId();

    await request(app.baseUrl)
      .post(`/api/cart/${cartA}/items`)
      .send({ productId: KNOWN_PRODUCT_ID, quantity: 1 });

    const cartBResponse = await request(app.baseUrl).get(`/api/cart/${cartB}`);
    expect(cartBResponse.body.data.items).toHaveLength(0);
  });

  // TC-056
  it("prices in integer cents: line items snapshot price, size and tax code; subtotal is exact", async () => {
    const cartId = freshCartId();
    const detail = (await request(app.baseUrl).get(`/api/products/${OTHER_PRODUCT_ID}`)).body.data;

    const response = await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: OTHER_PRODUCT_ID, quantity: 3 });

    const [line] = response.body.data.items;
    expect(line).toMatchObject({
      priceMinor: detail.priceMinor,
      currency: detail.currency,
      sizeLabel: detail.sizeLabel,
      soldBy: detail.soldBy,
      taxCode: detail.taxCode,
      quantity: 3,
    });
    expect(response.body.data.subtotalMinor).toBe(detail.priceMinor * 3);
    expect(line).not.toHaveProperty("price");
  });

  // TC-055 — proves addItem genuinely inherits catalogService's circuit
  // breaker fallback path rather than having a parallel, untested failure
  // mode: with the downstream failing, adding to cart still succeeds using
  // the stale snapshot's stock data (mirrors TC-030's single-request check
  // that a failed fire() is caught and served as a fallback).
  it("still allows adding to cart, using fallback stock data, when the downstream fails", async () => {
    setSimulatedFailureRate(1);
    try {
      const response = await request(app.baseUrl)
        .post(`/api/cart/${freshCartId()}/items`)
        .send({ productId: KNOWN_PRODUCT_ID, quantity: 1 });

      expect(response.status).toBe(200);
      expect(response.body.isFallback).toBe(true);
      expect(response.body.source).toBe("circuit-breaker-fallback");
    } finally {
      setSimulatedFailureRate(0);
    }
  });
});
