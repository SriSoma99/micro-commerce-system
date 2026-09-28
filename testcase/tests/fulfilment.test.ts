import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";
import { findDetail } from "../support/catalog";

const DEMO_PASSWORD = "Demo@1234";

describe("Fulfilment & Pickup Slots (WS C, CO-04, CO-07)", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    process.env.DEMO_AUTO_INSTALL = "true";
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DEMO_AUTO_INSTALL;
  });

  async function signIn(email: string, password = DEMO_PASSWORD): Promise<{ Authorization: string; role: string; id: string }> {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email, password });
    return {
      Authorization: `Bearer ${response.body.data.token}`,
      role: response.body.data.customer.role,
      id: response.body.data.customer.id,
    };
  }

  // TC-300
  it("TC-300: GET /api/stores/:storeId/pickup-slots returns 1-hour time windows with availability", async () => {
    const res = await request(app.baseUrl).get("/api/stores/IL-01/pickup-slots");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const slot = res.body.data[0];
    expect(slot).toHaveProperty("id");
    expect(slot.storeId).toBe("IL-01");
    expect(slot).toHaveProperty("date");
    expect(slot).toHaveProperty("startTime");
    expect(slot).toHaveProperty("endTime");
    expect(slot).toHaveProperty("available");
    expect(slot).toHaveProperty("capacity");
    expect(slot.capacity).toBe(10);
  });

  // TC-301
  it("TC-301: GET /api/stores/:storeId/pickup-slots validates storeId presence", async () => {
    const res = await request(app.baseUrl).get("/api/stores/UNKNOWN-STORE/pickup-slots");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("STORE_NOT_FOUND");
  });

  // TC-302
  it("TC-302: Store manager can transition order lifecycle status (placed -> packed -> ready -> collected)", async () => {
    const customerAuth = await signIn("demo@example.com");
    const product = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);

    const cartId = `cart_fulfilment_${Date.now()}`;
    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: product.id, quantity: 1 });

    const checkoutRes = await request(app.baseUrl)
      .post("/api/checkout")
      .set({ Authorization: customerAuth.Authorization })
      .send({
        cartId,
        storeId: "IL-01",
        paymentMethod: "pay-at-pickup",
      });

    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.data.orderId;
    expect(checkoutRes.body.data.status).toBe("placed");

    // Manager status update
    const managerAuth = await signIn("manager@example.com");

    const packedRes = await request(app.baseUrl)
      .patch(`/api/orders/${orderId}/status`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ status: "packed" });

    expect(packedRes.status).toBe(200);
    expect(packedRes.body.data.status).toBe("packed");

    const readyRes = await request(app.baseUrl)
      .patch(`/api/orders/${orderId}/status`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ status: "ready" });

    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe("ready");

    const collectedRes = await request(app.baseUrl)
      .patch(`/api/orders/${orderId}/status`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ status: "collected" });

    expect(collectedRes.status).toBe(200);
    expect(collectedRes.body.data.status).toBe("collected");
  });

  // TC-303
  it("TC-303: Regular customer is forbidden from changing order status (403)", async () => {
    const customerAuth = await signIn("demo@example.com");
    const product = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);

    const cartId = `cart_sec_${Date.now()}`;
    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: product.id, quantity: 1 });

    const checkoutRes = await request(app.baseUrl)
      .post("/api/checkout")
      .set({ Authorization: customerAuth.Authorization })
      .send({
        cartId,
        storeId: "IL-01",
        paymentMethod: "pay-at-pickup",
      });

    const orderId = checkoutRes.body.data.orderId;

    const attemptRes = await request(app.baseUrl)
      .patch(`/api/orders/${orderId}/status`)
      .set({ Authorization: customerAuth.Authorization })
      .send({ status: "collected" });

    expect(attemptRes.status).toBe(403);
    expect(attemptRes.body.error).toBe("FORBIDDEN");
  });

  // TC-304
  it("TC-304: PATCH /api/orders/:orderId/status rejects invalid status strings (400)", async () => {
    const managerAuth = await signIn("manager@example.com");
    const res = await request(app.baseUrl)
      .patch("/api/orders/any-id/status")
      .set({ Authorization: managerAuth.Authorization })
      .send({ status: "flying_to_moon" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_STATUS");
  });

  // TC-305
  it("TC-305: Unauthenticated request to update order status returns 401", async () => {
    const res = await request(app.baseUrl)
      .patch("/api/orders/any-id/status")
      .send({ status: "packed" });

    expect(res.status).toBe(401);
  });
});
