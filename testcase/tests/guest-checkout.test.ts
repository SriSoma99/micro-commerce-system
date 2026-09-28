import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";
import { findDetail } from "../support/catalog";

const DEMO_PASSWORD = "Demo@1234";

describe("Guest Cart Merging, Saved Payments & Password Reset (WS I, CO-01, CUS-03, CUS-05, CUS-11)", () => {
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

  // TC-900
  it("TC-900: Merges anonymous cart into customer cart upon registration (CO-01)", async () => {
    const p1 = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);
    const anonCartId = `anon_reg_${Date.now()}`;

    // Add item to anonymous cart
    await request(app.baseUrl)
      .post(`/api/cart/${anonCartId}/items`)
      .send({ productId: p1.id, quantity: 2 });

    // Register with anonymousCartId
    const email = `newshopper.${Date.now()}@example.com`;
    const regRes = await request(app.baseUrl)
      .post("/api/auth/register")
      .send({ email, password: "Password@123", name: "Guest To User", anonymousCartId: anonCartId });

    expect(regRes.status).toBe(201);
    const customerId = regRes.body.data.customer.id;

    // Check merged customer cart
    const custCartRes = await request(app.baseUrl).get(`/api/cart/customer_${customerId}`);
    expect(custCartRes.body.data.items.length).toBe(1);
    expect(custCartRes.body.data.items[0].productId).toBe(p1.id);
    expect(custCartRes.body.data.items[0].quantity).toBe(2);

    // Old anonymous cart is cleared
    const anonCheck = await request(app.baseUrl).get(`/api/cart/${anonCartId}`);
    expect(anonCheck.body.data.items.length).toBe(0);
  });

  // TC-901
  it("TC-901: Merges anonymous cart into customer cart upon login (CO-01)", async () => {
    const p1 = await findDetail(app.baseUrl, {}, (d) => d.stock > 5);
    const anonCartId = `anon_login_${Date.now()}`;

    await request(app.baseUrl)
      .post(`/api/cart/${anonCartId}/items`)
      .send({ productId: p1.id, quantity: 1 });

    const loginRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "demo@example.com", password: DEMO_PASSWORD, anonymousCartId: anonCartId });

    expect(loginRes.status).toBe(200);

    const custCartRes = await request(app.baseUrl).get("/api/cart/customer_cust_demo");
    expect(custCartRes.body.data.items.some((item: { productId: string }) => item.productId === p1.id)).toBe(true);
  });

  // TC-902
  it("TC-902: Customer can manage saved payment methods (CUS-05, CUS-11)", async () => {
    const auth = await signIn("demo@example.com");

    // Add a saved card
    const saveRes = await request(app.baseUrl)
      .post("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization })
      .send({
        token: "tok_visa_4242",
        brand: "Visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      });

    expect(saveRes.status).toBe(201);
    expect(saveRes.body.paymentMethod).toHaveProperty("id");
    expect(saveRes.body.paymentMethod.last4).toBe("4242");
    expect(saveRes.body.paymentMethod.isDefault).toBe(true);

    const cardId = saveRes.body.paymentMethod.id;

    // List saved cards
    const listRes = await request(app.baseUrl)
      .get("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization });

    expect(listRes.status).toBe(200);
    expect(listRes.body.paymentMethods.length).toBeGreaterThan(0);
    expect(listRes.body.paymentMethods.some((c: { id: string }) => c.id === cardId)).toBe(true);

    // Delete saved card
    const delRes = await request(app.baseUrl)
      .delete(`/api/customers/me/payment-methods/${cardId}`)
      .set({ Authorization: auth.Authorization });

    expect(delRes.status).toBe(200);

    // Verify deletion
    const verifyList = await request(app.baseUrl)
      .get("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization });

    expect(verifyList.body.paymentMethods.some((c: { id: string }) => c.id === cardId)).toBe(false);
  });

  // TC-903
  it("TC-903: Setting default payment method updates default across customer cards (CUS-05)", async () => {
    const auth = await signIn("demo@example.com");

    const card1 = await request(app.baseUrl)
      .post("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization })
      .send({ token: "tok_1", brand: "Mastercard", last4: "1111", expMonth: 1, expYear: 2029, isDefault: true });

    const card2 = await request(app.baseUrl)
      .post("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization })
      .send({ token: "tok_2", brand: "Visa", last4: "2222", expMonth: 2, expYear: 2029, isDefault: false });

    // Set card2 as default
    const patchRes = await request(app.baseUrl)
      .patch(`/api/customers/me/payment-methods/${card2.body.paymentMethod.id}/default`)
      .set({ Authorization: auth.Authorization });

    expect(patchRes.status).toBe(200);

    const listRes = await request(app.baseUrl)
      .get("/api/customers/me/payment-methods")
      .set({ Authorization: auth.Authorization });

    const c1 = listRes.body.paymentMethods.find((c: { id: string }) => c.id === card1.body.paymentMethod.id);
    const c2 = listRes.body.paymentMethods.find((c: { id: string }) => c.id === card2.body.paymentMethod.id);

    expect(c2.isDefault).toBe(true);
    expect(c1.isDefault).toBe(false);
  });

  // TC-904
  it("TC-904: POST /api/auth/forgot-password sends password reset token (CUS-03)", async () => {
    const res = await request(app.baseUrl)
      .post("/api/auth/forgot-password")
      .send({ email: "demo@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("resetToken");
    expect(typeof res.body.resetToken).toBe("string");
  });

  // TC-905
  it("TC-905: POST /api/auth/reset-password updates password and burns token (CUS-03)", async () => {
    // Request reset token
    const forgotRes = await request(app.baseUrl)
      .post("/api/auth/forgot-password")
      .send({ email: "demo@example.com" });

    const token = forgotRes.body.resetToken;
    const newPassword = "NewPassword@123";

    // Reset password
    const resetRes = await request(app.baseUrl)
      .post("/api/auth/reset-password")
      .send({ token, newPassword });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toContain("success");

    // Login with new password
    const loginRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "demo@example.com", password: newPassword });

    expect(loginRes.status).toBe(200);

    // Second use of the same token is rejected
    const reuseRes = await request(app.baseUrl)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "AnotherPassword@123" });

    expect(reuseRes.status).toBe(400);

    // Restore original password for demo user
    const restoreRes = await request(app.baseUrl)
      .post("/api/auth/forgot-password")
      .send({ email: "demo@example.com" });
    await request(app.baseUrl)
      .post("/api/auth/reset-password")
      .send({ token: restoreRes.body.resetToken, newPassword: DEMO_PASSWORD });
  });
});
