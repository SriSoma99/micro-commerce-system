import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";
import { findDetail } from "../support/catalog";

const DEMO_PASSWORD = "Demo@1234";

describe("Refunds & Return Processing (WS D, CO-06)", () => {
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

  // TC-400
  it("TC-400: Store manager can issue a full refund for an order (CO-06)", async () => {
    const customerAuth = await signIn("demo@example.com");
    const product = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);

    const cartId = `cart_ref_${Date.now()}`;
    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: product.id, quantity: 2 });

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

    const managerAuth = await signIn("manager@example.com");
    const refundRes = await request(app.baseUrl)
      .post(`/api/orders/${orderId}/refund`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ reason: "Customer changed mind" });

    expect(refundRes.status).toBe(201);
    expect(refundRes.body).toHaveProperty("data");
    expect(refundRes.body.data.orderId).toBe(orderId);
    expect(refundRes.body.data.amountMinor).toBe(checkoutRes.body.data.totalMinor);
    expect(refundRes.body.data.creditInvoiceNumber).toMatch(/^CR-/);
  });

  // TC-401
  it("TC-401: Store manager can issue a partial refund", async () => {
    const customerAuth = await signIn("demo@example.com");
    const product = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);

    const cartId = `cart_partref_${Date.now()}`;
    await request(app.baseUrl)
      .post(`/api/cart/${cartId}/items`)
      .send({ productId: product.id, quantity: 2 });

    const checkoutRes = await request(app.baseUrl)
      .post("/api/checkout")
      .set({ Authorization: customerAuth.Authorization })
      .send({
        cartId,
        storeId: "IL-01",
        paymentMethod: "pay-at-pickup",
      });

    const order = checkoutRes.body.data;
    const partialAmount = Math.floor(order.totalMinor / 2);

    const managerAuth = await signIn("manager@example.com");
    const refundRes = await request(app.baseUrl)
      .post(`/api/orders/${order.orderId}/refund`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ amountMinor: partialAmount, reason: "Damaged item" });

    expect(refundRes.status).toBe(201);
    expect(refundRes.body.data.amountMinor).toBe(partialAmount);
    expect(refundRes.body.data.reason).toBe("Damaged item");
  });

  // TC-402
  it("TC-402: Regular customer is forbidden from issuing refunds (403)", async () => {
    const customerAuth = await signIn("demo@example.com");
    const res = await request(app.baseUrl)
      .post("/api/orders/ord_123/refund")
      .set({ Authorization: customerAuth.Authorization })
      .send({ reason: "Self refund" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  // TC-403
  it("TC-403: Rejects refund on non-existent order (404)", async () => {
    const managerAuth = await signIn("manager@example.com");
    const res = await request(app.baseUrl)
      .post("/api/orders/ord_nonexistent_9999/refund")
      .set({ Authorization: managerAuth.Authorization })
      .send({ reason: "test" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ORDER_NOT_FOUND");
  });

  // TC-404
  it("TC-404: Rejects invalid refund amounts <= 0 or > totalMinor (400)", async () => {
    const customerAuth = await signIn("demo@example.com");
    const product = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);

    const cartId = `cart_val_${Date.now()}`;
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

    const order = checkoutRes.body.data;
    const managerAuth = await signIn("manager@example.com");

    const negRes = await request(app.baseUrl)
      .post(`/api/orders/${order.orderId}/refund`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ amountMinor: -500 });
    expect(negRes.status).toBe(400);

    const overRes = await request(app.baseUrl)
      .post(`/api/orders/${order.orderId}/refund`)
      .set({ Authorization: managerAuth.Authorization })
      .send({ amountMinor: order.totalMinor + 1000 });
    expect(overRes.status).toBe(400);
  });

  // TC-405
  it("TC-405: Unauthenticated request to refund returns 401", async () => {
    const res = await request(app.baseUrl)
      .post("/api/orders/ord_123/refund")
      .send({ reason: "Unauth" });
    expect(res.status).toBe(401);
  });
});
