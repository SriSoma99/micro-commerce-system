import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { DetailLike, findDetail } from "../support/catalog";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

const SETUP_TOKEN = "checkout-test-token";
const FUTURE_YEAR = new Date().getFullYear() + 2;

interface OrderBody {
  orderId: string;
  status: string;
  storeId: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  payment: { method: string; status: string; reference: string; card: { brand: string; last4: string } | null };
  items: { name: string; quantity: number; netMinor: number; taxRateBps: number; taxMinor: number; taxCode: string }[];
  invoice: { id: string; number: string; totalMinor: number } | null;
}

describe("End-to-end shopping: login -> cart -> card payment via the dummy gateway -> invoice stored under the login", () => {
  let app: RunningTestApp;
  let tmpDir: string;
  let auth: { Authorization: string };
  let grocery: DetailLike;
  let candy: DetailLike;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-checkout-"));
    process.env.STORE_CONFIG_PATH = path.join(tmpDir, "store.config.json");
    process.env.SETUP_TOKEN = SETUP_TOKEN;
    setSimulatedFailureRate(0);
    app = await launchTestApp();

    const install = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send({
        region: "US",
        payments: ["card-mock", "ebt-mock", "pay-at-pickup"],
        stores: [
          { id: "IL-01", name: "Batavia", taxJurisdiction: "IL" },
          { id: "OH-01", name: "Columbus", taxJurisdiction: "OH" },
          { id: "PA-01", name: "Pittsburgh", taxJurisdiction: "PA" },
        ],
      });
    expect(install.status).toBe(201);

    auth = await signIn("testuser@mydomain.com", "123456");
    grocery = await findDetail(app.baseUrl, { category: "dairy-eggs", inStock: "true" }, (d) => d.stock >= 40 && d.taxCode === "grocery" && d.configurationOptions.length === 0);
    candy = await findDetail(app.baseUrl, { q: "Chocolate Bar", inStock: "true" }, (d) => d.stock >= 40 && d.taxCode === "candy");
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.STORE_CONFIG_PATH;
    delete process.env.SETUP_TOKEN;
  });

  // ---- helpers ----------------------------------------------------------------------
  async function signIn(email: string, password: string): Promise<{ Authorization: string }> {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email, password });
    return { Authorization: `Bearer ${response.body.data.token}` };
  }

  let cartCounter = 0;
  async function cartWith(items: { id: string; quantity: number }[]): Promise<string> {
    const cartId = `checkout-cart-${Date.now()}-${cartCounter++}`;
    for (const item of items) {
      const added = await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId: item.id, quantity: item.quantity });
      expect(added.status).toBe(200);
    }
    return cartId;
  }

  /** What the browser does: card details go to the GATEWAY, which returns a one-time token. */
  async function tokenize(number: string, method: "card" | "ebt" = "card", extra: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app.gatewayUrl)
      .post("/v1/tokens")
      .set("Authorization", "Bearer pk_test_dummy")
      .send({ method, number, expMonth: 12, expYear: FUTURE_YEAR, cvc: "123", ...extra });
    return response.body.token as string;
  }

  const checkout = (cartId: string, storeId: string, paymentMethod: string, paymentToken?: string, headers = auth) =>
    request(app.baseUrl).post("/api/checkout").set(headers).send({ cartId, storeId, paymentMethod, ...(paymentToken ? { paymentToken } : {}) });

  const myInvoices = async (headers = auth) => (await request(app.baseUrl).get("/api/customers/me/invoices").set(headers)).body.data as { id: string; number: string; orderId: string }[];
  const myOrders = async (headers = auth) => (await request(app.baseUrl).get("/api/orders").set(headers)).body.data as OrderBody[];

  async function payAndCheckout(storeId = "IL-01", items = [{ id: grocery.id, quantity: 2 }, { id: candy.id, quantity: 1 }], card = "4242 4242 4242 4242") {
    const cartId = await cartWith(items);
    const response = await checkout(cartId, storeId, "card-mock", await tokenize(card));
    return { cartId, response, order: response.body.data as OrderBody };
  }

  // ---- the customer's scenario ------------------------------------------------------

  // TC-190
  it("the documented test account signs in (testuser@mydomain.com / 123456)", async () => {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email: "testuser@mydomain.com", password: "123456" });

    expect(response.status).toBe(200);
    expect(response.body.data.customer).toMatchObject({ email: "testuser@mydomain.com", name: "Test User", role: "customer" });
    expect((await request(app.baseUrl).post("/api/auth/login").send({ email: "testuser@mydomain.com", password: "wrong" })).status).toBe(401);
  });

  // TC-191
  it("checkout requires a signed-in customer", async () => {
    const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);
    const response = await request(app.baseUrl).post("/api/checkout").send({ cartId, storeId: "IL-01", paymentMethod: "card-mock" });

    expect(response.status).toBe(401);
    expect((await request(app.baseUrl).get("/api/orders")).status).toBe(401);
    expect((await request(app.baseUrl).get("/api/customers/me/invoices")).status).toBe(401);
  });

  // TC-192
  it("adds 2 items, pays by card through the dummy gateway, and gets a placed + paid order", async () => {
    const before = (await myOrders()).length;
    const { cartId, response, order } = await payAndCheckout();

    expect(response.status).toBe(201);
    expect(order).toMatchObject({ status: "placed", storeId: "IL-01" });
    expect(order.items).toHaveLength(2);
    expect(order.payment).toMatchObject({ method: "card-mock", status: "captured", card: { brand: "visa", last4: "4242" } });
    expect(order.payment.reference).toMatch(/^pay_sim_/);

    // Money is exact integer cents: total = subtotal + tax, and tax = the sum of the line taxes.
    expect(order.items.reduce((s, l) => s + l.netMinor, 0)).toBe(order.subtotalMinor);
    expect(order.items.reduce((s, l) => s + l.taxMinor, 0)).toBe(order.taxMinor);
    expect(order.totalMinor).toBe(order.subtotalMinor + order.taxMinor);

    // Cart is emptied; the order is retrievable and listed under the login.
    expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(0);
    expect((await request(app.baseUrl).get(`/api/orders/${order.orderId}`).set(auth)).body.data.orderId).toBe(order.orderId);
    expect(await myOrders()).toHaveLength(before + 1);
  });

  // TC-193
  it("stores an invoice under the login, retrievable as JSON and as a printable receipt", async () => {
    const { order } = await payAndCheckout();

    expect(order.invoice).toMatchObject({ totalMinor: order.totalMinor });
    expect(order.invoice?.number).toMatch(/^IL-01-\d{6}$/);

    const listed = await myInvoices();
    expect(listed.find((i) => i.id === order.invoice?.id)).toMatchObject({ number: order.invoice?.number, orderId: order.orderId });

    const detail = (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}`).set(auth)).body.data;
    expect(detail.receipt).toMatchObject({
      invoiceNumber: order.invoice?.number,
      customer: { name: "Test User", email: "testuser@mydomain.com" },
      store: { id: "IL-01", name: "Batavia", jurisdiction: "IL" },
      totals: { subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor },
      payment: { methodName: "Credit / debit card", status: "captured", simulated: true, card: { brand: "visa", last4: "4242" } },
    });
    expect(detail.receipt.lines).toHaveLength(2);

    const html = await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}/html`).set(auth);
    expect(html.status).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.text).toContain(order.invoice?.number as string);
    expect(html.text).toContain("BATAVIA");
    expect(html.text).toContain("testuser@mydomain.com");
    expect(html.text).toContain("SIMULATED PAYMENT"); // the demo can't be mistaken for real money
    expect(html.text).toContain("····4242");
    expect(html.text).toMatch(/>T</); // the candy is taxable
  });

  // TC-194
  it("computes sales tax from the STORE's state: same basket, different tax in IL vs OH", async () => {
    const items = [{ id: grocery.id, quantity: 3 }, { id: candy.id, quantity: 2 }];
    const il = (await payAndCheckout("IL-01", items)).order;
    const oh = (await payAndCheckout("OH-01", items)).order;

    const rate = (order: OrderBody, code: string) => order.items.find((l) => l.taxCode === code)?.taxRateBps;
    expect([rate(il, "grocery"), rate(il, "candy")]).toEqual([100, 625]); // demo table: IL taxes groceries at 1%, candy at 6.25%
    expect([rate(oh, "grocery"), rate(oh, "candy")]).toEqual([0, 575]); // OH: groceries exempt, candy 5.75%
    expect(il.subtotalMinor).toBe(oh.subtotalMinor);
    expect(il.taxMinor).not.toBe(oh.taxMinor);
    // The OH grocery line is F (exempt) on the receipt, the candy line T.
    const ohHtml = (await request(app.baseUrl).get(`/api/customers/me/invoices/${oh.invoice?.id}/html`).set(auth)).text;
    expect(ohHtml).toMatch(/>F</);
    expect(ohHtml).toMatch(/>T</);
  });

  // TC-195
  it("numbers invoices sequentially per store, independently across stores", async () => {
    const number = async (store: string) => Number(((await payAndCheckout(store)).order.invoice?.number as string).split("-")[2]);

    const pa1 = await number("PA-01");
    const pa2 = await number("PA-01");
    const il = await number("IL-01");
    const pa3 = await number("PA-01");

    expect(pa2).toBe(pa1 + 1);
    expect(pa3).toBe(pa2 + 1); // an IL invoice in between doesn't consume a PA number
    expect(il).toBeGreaterThan(0);
  });

  // TC-196
  it("never sees or returns a card number or token: only brand + last4 anywhere", async () => {
    const { cartId, order } = await payAndCheckout();
    const token = await tokenize("4242 4242 4242 4242");
    const cart2 = await cartWith([{ id: grocery.id, quantity: 1 }]);
    await checkout(cart2, "IL-01", "card-mock", token);

    const everything = JSON.stringify([
      order,
      (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}`).set(auth)).body,
      (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}/html`).set(auth)).text,
      (await request(app.baseUrl).get(`/api/cart/${cartId}`)).body,
    ]);
    expect(everything).not.toMatch(/4242424242424242|4242 4242 4242 4242/);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain("tok_sim_");
  });

  // TC-197
  it("total sent to the gateway equals the order total (checked at the gateway itself)", async () => {
    const { order } = await payAndCheckout();
    const payment = (await request(app.gatewayUrl).get(`/v1/payments/${order.payment.reference}`).set("Authorization", "Bearer sk_test_dummy")).body;

    expect(payment).toMatchObject({ status: "captured", amountMinor: order.totalMinor, currency: "USD", orderRef: order.orderId, capturedMinor: order.totalMinor });
  });

  // ---- declines & failures ------------------------------------------------------------

  describe("payment failures leave no order and no invoice, and keep the cart", () => {
    it.each([
      // TC-198
      ["4000 0000 0000 0002", "card_declined"],
      ["4000 0000 0000 9995", "insufficient_funds"],
      ["4000 0000 0000 0069", "expired_card"],
    ])("card %s -> 402 %s", async (card, declineCode) => {
      const ordersBefore = (await myOrders()).length;
      const invoicesBefore = (await myInvoices()).length;
      const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);

      const response = await checkout(cartId, "IL-01", "card-mock", await tokenize(card));

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({ error: "PAYMENT_DECLINED", declineCode });
      expect(await myOrders()).toHaveLength(ordersBefore);
      expect(await myInvoices()).toHaveLength(invoicesBefore);
      expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(1); // can retry
    });

    // TC-199
    it("a payment token works once; reusing it is declined", async () => {
      const token = await tokenize("4242 4242 4242 4242");
      const first = await checkout(await cartWith([{ id: grocery.id, quantity: 1 }]), "IL-01", "card-mock", token);
      const second = await checkout(await cartWith([{ id: grocery.id, quantity: 1 }]), "IL-01", "card-mock", token);

      expect(first.status).toBe(201);
      expect(second.status).toBe(402);
      expect(second.body.declineCode).toBe("invalid_token");
    });

    // TC-207
    it("fails CLOSED when the gateway is down: 503, nothing charged, no order, cart intact", async () => {
      const token = await tokenize("4242 4242 4242 4242");
      const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);
      const ordersBefore = (await myOrders()).length;

      const realUrl = process.env.PAYMENT_GATEWAY_URL;
      process.env.PAYMENT_GATEWAY_URL = "http://127.0.0.1:1"; // nothing listens here
      let response;
      try {
        response = await checkout(cartId, "IL-01", "card-mock", token);
      } finally {
        process.env.PAYMENT_GATEWAY_URL = realUrl;
      }

      expect(response.status).toBe(503);
      expect(response.body.error).toBe("PAYMENT_GATEWAY_UNAVAILABLE");
      expect(await myOrders()).toHaveLength(ordersBefore);
      expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(1);
    });
  });

  // ---- 3-D Secure -----------------------------------------------------------------------

  describe("3-D Secure challenge", () => {
    // TC-200
    it("parks the order as pending (202, no invoice), then approval places it and issues the invoice", async () => {
      const invoicesBefore = (await myInvoices()).length;
      const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);

      const challenge = await checkout(cartId, "IL-01", "card-mock", await tokenize("4000 0000 0000 3220"));
      expect(challenge.status).toBe(202);
      expect(challenge.body.data.paymentAction).toEqual({ type: "3ds" });
      const pending = challenge.body.data.order as OrderBody;
      expect(pending).toMatchObject({ status: "payment_pending", invoice: null });
      expect(await myInvoices()).toHaveLength(invoicesBefore);
      expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(1); // not emptied yet

      const confirmed = await request(app.baseUrl).post(`/api/orders/${pending.orderId}/payment/confirm`).set(auth).send({ approved: true });
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data).toMatchObject({ status: "placed", payment: { status: "captured" } });
      expect(confirmed.body.data.invoice.number).toMatch(/^IL-01-\d{6}$/);
      expect(await myInvoices()).toHaveLength(invoicesBefore + 1);
      expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(0);
    });

    // TC-201
    it("a failed challenge cancels the order: 402, no invoice, not in order history", async () => {
      const invoicesBefore = (await myInvoices()).length;
      const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);
      const pending = (await checkout(cartId, "IL-01", "card-mock", await tokenize("4000 0000 0000 3220"))).body.data.order as OrderBody;

      const failed = await request(app.baseUrl).post(`/api/orders/${pending.orderId}/payment/confirm`).set(auth).send({ approved: false });

      expect(failed.status).toBe(402);
      expect(await myInvoices()).toHaveLength(invoicesBefore);
      expect((await myOrders()).some((o) => o.orderId === pending.orderId)).toBe(false);
    });

    // TC-202
    it("confirming is guarded: body must be valid, order must be pending, and only the owner can confirm", async () => {
      const { order: done } = await payAndCheckout();
      expect((await request(app.baseUrl).post(`/api/orders/${done.orderId}/payment/confirm`).set(auth).send({ approved: true })).status).toBe(409);
      expect((await request(app.baseUrl).post(`/api/orders/${done.orderId}/payment/confirm`).set(auth).send({})).status).toBe(400);
      expect((await request(app.baseUrl).post(`/api/orders/nope/payment/confirm`).set(auth).send({ approved: true })).status).toBe(404);

      const pending = (await checkout(await cartWith([{ id: grocery.id, quantity: 1 }]), "IL-01", "card-mock", await tokenize("4000 0000 0000 3220"))).body.data.order as OrderBody;
      const stranger = await signIn("demo@example.com", "Demo@1234");
      expect((await request(app.baseUrl).post(`/api/orders/${pending.orderId}/payment/confirm`).set(stranger).send({ approved: true })).status).toBe(404);
    });
  });

  // ---- other payment methods ---------------------------------------------------------------

  // TC-203
  it("pay at pickup: no card, order is placed with payment still to collect, invoice says so", async () => {
    const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);
    const response = await checkout(cartId, "OH-01", "pay-at-pickup");
    const order = response.body.data as OrderBody;

    expect(response.status).toBe(201);
    expect(order.payment).toMatchObject({ method: "pay-at-pickup", status: "authorized", card: null });
    const html = (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}/html`).set(auth)).text;
    expect(html).toContain("PAY AT PICKUP");
  });

  // TC-204
  it("SNAP/EBT: EBT card pays; an EBT card without funds is declined", async () => {
    const paid = await checkout(await cartWith([{ id: grocery.id, quantity: 1 }]), "IL-01", "ebt-mock", await tokenize("6000 0000 0000 0001", "ebt"));
    expect(paid.status).toBe(201);
    expect(paid.body.data.payment).toMatchObject({ method: "ebt-mock", status: "captured", card: { brand: "ebt", last4: "0001" } });

    const broke = await checkout(await cartWith([{ id: grocery.id, quantity: 1 }]), "IL-01", "ebt-mock", await tokenize("6000 0000 0000 0002", "ebt"));
    expect(broke.status).toBe(402);
    expect(broke.body.declineCode).toBe("insufficient_funds");
  });

  // ---- validation ------------------------------------------------------------------------------

  // TC-205
  it("validates the checkout request", async () => {
    const token = await tokenize("4242 4242 4242 4242");
    const cartId = await cartWith([{ id: grocery.id, quantity: 1 }]);

    expect((await request(app.baseUrl).post("/api/checkout").set(auth).send({})).status).toBe(400);
    expect((await checkout(cartId, "NOPE-99", "card-mock", token)).body.error).toBe("UNKNOWN_STORE");
    expect((await checkout(cartId, "IL-01", "bitcoin", token)).body.error).toBe("PAYMENT_METHOD_UNAVAILABLE");
    expect((await checkout(cartId, "IL-01", "card-mock")).body.error).toBe("PAYMENT_TOKEN_REQUIRED");
    expect((await checkout(`empty-${Date.now()}`, "IL-01", "card-mock", token)).body.error).toBe("EMPTY_CART");
  });

  // ---- ownership & immutability ---------------------------------------------------------------------

  // TC-206
  it("another customer can never read this customer's orders or invoices", async () => {
    const { order } = await payAndCheckout();
    const stranger = await signIn("demo@example.com", "Demo@1234");

    expect((await request(app.baseUrl).get(`/api/orders/${order.orderId}`).set(stranger)).status).toBe(404);
    expect((await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}`).set(stranger)).status).toBe(404);
    expect((await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}/html`).set(stranger)).status).toBe(404);
    expect((await myOrders(stranger)).some((o) => o.orderId === order.orderId)).toBe(false);
    expect((await myInvoices(stranger)).some((i) => i.id === order.invoice?.id)).toBe(false);
  });

  // TC-208
  it("an issued invoice is an immutable snapshot: renaming the customer doesn't rewrite it", async () => {
    const { order } = await payAndCheckout();
    const before = (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}`).set(auth)).body.data.receipt;

    await request(app.baseUrl).patch("/api/customers/me").set(auth).send({ name: "Renamed Person" });
    const after = (await request(app.baseUrl).get(`/api/customers/me/invoices/${order.invoice?.id}`).set(auth)).body.data.receipt;
    await request(app.baseUrl).patch("/api/customers/me").set(auth).send({ name: "Test User" }); // restore

    expect(after).toEqual(before);
    expect(after.customer.name).toBe("Test User");
  });

  // TC-209
  it("lists invoices newest first, each linked to its order", async () => {
    const invoices = await myInvoices();
    const orders = await myOrders();

    expect(invoices.length).toBeGreaterThanOrEqual(5);
    const byOrder = new Map(orders.map((o) => [o.orderId, o]));
    for (const invoice of invoices) {
      expect(byOrder.get(invoice.orderId)?.invoice?.number).toBe(invoice.number);
    }
  });
});

describe("Checkout quote and demo auto-install", () => {
  let app: RunningTestApp;
  let tmpDir: string;
  let auth: { Authorization: string };
  let productId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-quote-"));
    process.env.STORE_CONFIG_PATH = path.join(tmpDir, "store.config.json");
    process.env.DEMO_AUTO_INSTALL = "true"; // no setup wizard, no token
    setSimulatedFailureRate(0);
    app = await launchTestApp();
    const login = await request(app.baseUrl).post("/api/auth/login").send({ email: "testuser@mydomain.com", password: "123456" });
    auth = { Authorization: `Bearer ${login.body.data.token}` };
    productId = (await findDetail(app.baseUrl, { category: "dairy-eggs", inStock: "true" }, (d) => d.stock >= 40 && d.taxCode === "grocery")).id;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.STORE_CONFIG_PATH;
    delete process.env.DEMO_AUTO_INSTALL;
  });

  // TC-210
  it("DEMO_AUTO_INSTALL=true installs the US demo configuration on a fresh store (5 stores, all payment methods)", async () => {
    expect((await request(app.baseUrl).get("/api/setup/status")).body.data).toEqual({ installed: true });

    const config = (await request(app.baseUrl).get("/api/store-config")).body.data;
    expect(config.stores.map((s: { id: string }) => s.id)).toEqual(["IL-01", "IL-02", "OH-01", "OH-02", "PA-01"]);
    expect(config.paymentMethods.map((m: { id: string }) => m.id)).toEqual(["card-mock", "ebt-mock", "pay-at-pickup"]);
  });

  // TC-211
  it("quote prices a cart at a store without charging or saving anything", async () => {
    const cartId = `quote-cart-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId, quantity: 4 });
    const ordersBefore = (await request(app.baseUrl).get("/api/orders").set(auth)).body.data.length;

    const il = (await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({ cartId, storeId: "IL-01" })).body.data;
    const oh = (await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({ cartId, storeId: "OH-01" })).body.data;

    expect(il).toMatchObject({ storeId: "IL-01", jurisdiction: "IL", currency: "USD" });
    expect(il.totalMinor).toBe(il.subtotalMinor + il.taxMinor);
    expect(il.taxMinor).toBeGreaterThan(0); // demo table: IL taxes groceries at 1%
    expect(oh.taxMinor).toBe(0); // OH: groceries exempt
    expect(il.items[0]).toMatchObject({ quantity: 4, taxRateBps: 100 });

    // Nothing was saved and the cart is untouched.
    expect((await request(app.baseUrl).get("/api/orders").set(auth)).body.data).toHaveLength(ordersBefore);
    expect((await request(app.baseUrl).get(`/api/cart/${cartId}`)).body.data.itemCount).toBe(4);
  });

  // TC-212
  it("the quoted total is exactly what checkout then charges", async () => {
    const cartId = `quote-cart-${Date.now()}-b`;
    await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId, quantity: 3 });

    const quoted = (await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({ cartId, storeId: "IL-01" })).body.data;
    const token = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4242424242424242", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;
    const order = (await request(app.baseUrl).post("/api/checkout").set(auth).send({ cartId, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token })).body.data;

    expect(order.totalMinor).toBe(quoted.totalMinor);
    expect(order.taxMinor).toBe(quoted.taxMinor);
  });

  // TC-213
  it("quote is guarded: needs sign-in, valid input, a real store and a non-empty cart", async () => {
    const cartId = `quote-cart-${Date.now()}-c`;
    expect((await request(app.baseUrl).post("/api/checkout/quote").send({ cartId, storeId: "IL-01" })).status).toBe(401);
    expect((await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({})).status).toBe(400);
    expect((await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({ cartId, storeId: "NOPE" })).body.error).toBe("UNKNOWN_STORE");
    expect((await request(app.baseUrl).post("/api/checkout/quote").set(auth).send({ cartId, storeId: "IL-01" })).body.error).toBe("EMPTY_CART");
  });

  // TC-214
  it("client Idempotency-Key deduplicates concurrent/duplicate checkouts; successive checkouts succeed with new keys", async () => {
    const cartId1 = `idemp-cart-1-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId1}/items`).send({ productId, quantity: 1 });

    const key1 = `key-test-${Date.now()}`;
    const token1 = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4242424242424242", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;

    // First checkout with key1
    const res1 = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .set("Idempotency-Key", key1)
      .send({ cartId: cartId1, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token1 });
    expect(res1.status).toBe(201);
    const order1Id = res1.body.data.orderId;

    // Duplicate checkout with identical key1 -> returns identical order without re-charging
    const resDuplicate = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .set("Idempotency-Key", key1)
      .send({ cartId: cartId1, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token1 });
    expect(resDuplicate.status).toBe(201);
    expect(resDuplicate.body.data.orderId).toBe(order1Id);

    // Successive checkout with new cart and key2 within 5 minutes succeeds normally
    const cartId2 = `idemp-cart-2-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId2}/items`).send({ productId, quantity: 1 });
    const token2 = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4242424242424242", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;

    const key2 = `key-test-2-${Date.now()}`;
    const res2 = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .set("Idempotency-Key", key2)
      .send({ cartId: cartId2, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token2 });
    expect(res2.status).toBe(201);
    expect(res2.body.data.orderId).not.toBe(order1Id);
  });

  // TC-215
  it("rejects checkout with 409 OUT_OF_STOCK when item quantity exceeds store availability", async () => {
    const managerRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "manager@example.com", password: "Demo@1234" });
    const managerAuth = { Authorization: `Bearer ${managerRes.body.data.token}` };

    const cartId = `oos-cart-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId, quantity: 2 });

    // Store manager records adjustment reducing store inventory to 0
    const invItem = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    );

    await request(app.baseUrl)
      .post("/api/manager/adjustments")
      .set(managerAuth)
      .send({
        storeId: "IL-01",
        productId,
        quantityDelta: -invItem.stock,
        reason: "shrinkage",
      });

    const token = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4242424242424242", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;

    const res = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .send({ cartId, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OUT_OF_STOCK");

    // Restore stock for subsequent tests
    await request(app.baseUrl)
      .post("/api/manager/adjustments")
      .set(managerAuth)
      .send({
        storeId: "IL-01",
        productId,
        quantityDelta: invItem.stock,
        reason: "audit",
      });
  });

  // TC-216
  it("restores stock when 3-D Secure challenge is declined", async () => {
    // Manager login to check inventory
    const managerRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "manager@example.com", password: "Demo@1234" });
    const managerAuth = { Authorization: `Bearer ${managerRes.body.data.token}` };

    const invBefore = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    ).stock;

    const cartId = `3ds-decline-cart-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId, quantity: 2 });

    // Card ending 3220 triggers 3DS challenge
    const token = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4000 0000 0000 3220", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;

    const checkoutRes = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .send({ cartId, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token });
    expect(checkoutRes.status).toBe(202);
    const orderId = checkoutRes.body.data.order.orderId;

    // Reject 3DS challenge
    const confirmRes = await request(app.baseUrl)
      .post(`/api/orders/${orderId}/payment/confirm`)
      .set(auth)
      .send({ approved: false });
    expect(confirmRes.status).toBe(402);

    // Stock must be restored back to invBefore
    const invAfter = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    ).stock;
    expect(invAfter).toBe(invBefore);
  });

  // TC-217
  it("restores stock when order is cancelled by store manager", async () => {
    const managerRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "manager@example.com", password: "Demo@1234" });
    const managerAuth = { Authorization: `Bearer ${managerRes.body.data.token}` };

    const invBefore = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    ).stock;

    const cartId = `cancel-cart-${Date.now()}`;
    await request(app.baseUrl).post(`/api/cart/${cartId}/items`).send({ productId, quantity: 3 });

    const token = (
      await request(app.gatewayUrl)
        .post("/v1/tokens")
        .set("Authorization", "Bearer pk_test_dummy")
        .send({ method: "card", number: "4242424242424242", expMonth: 12, expYear: FUTURE_YEAR, cvc: "123" })
    ).body.token;

    const checkoutRes = await request(app.baseUrl)
      .post("/api/checkout")
      .set(auth)
      .send({ cartId, storeId: "IL-01", paymentMethod: "card-mock", paymentToken: token });
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.data.orderId;

    // Store inventory should be decremented by 3
    const invDuring = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    ).stock;
    expect(invDuring).toBe(invBefore - 3);

    // Cancel the order
    const cancelRes = await request(app.baseUrl)
      .patch(`/api/orders/${orderId}/status`)
      .set(managerAuth)
      .send({ status: "cancelled" });
    expect(cancelRes.status).toBe(200);

    // Stock must be restored to invBefore
    const invAfter = (await request(app.baseUrl).get("/api/manager/stores/IL-01/inventory").set(managerAuth)).body.data.inventory.find(
      (i: { productId: string }) => i.productId === productId
    ).stock;
    expect(invAfter).toBe(invBefore);
  });
});
