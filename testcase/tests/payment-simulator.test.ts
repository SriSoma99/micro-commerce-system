import request from "supertest";
import { launchPaymentSimulator } from "../support/testApp";

/**
 * The dummy payment gateway is its own service (payment-simulator/). These tests
 * talk to it over HTTP exactly as the browser (publishable key: tokenize) and the
 * shop backend (secret key: charge / capture / refund) do.
 */
const PK = "Bearer pk_test_dummy";
const SK = "Bearer sk_test_dummy";
const FUTURE_YEAR = new Date().getFullYear() + 2;

describe("Payment simulator service (dummy gateway)", () => {
  let sim: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => {
    sim = await launchPaymentSimulator();
  });

  afterAll(async () => {
    await sim.close();
  });

  const tokenize = (number: string, extra: Record<string, unknown> = {}, method = "card") =>
    request(sim.baseUrl)
      .post("/v1/tokens")
      .set("Authorization", PK)
      .send({ method, number, expMonth: 12, expYear: FUTURE_YEAR, cvc: "123", ...extra });

  const charge = (token: string, amountMinor = 2599) =>
    request(sim.baseUrl).post("/v1/payments").set("Authorization", SK).send({ token, amountMinor, currency: "USD", orderRef: "ord_1" });

  const payWith = async (number: string, extra: Record<string, unknown> = {}, method = "card") => {
    const token = await tokenize(number, extra, method);
    return (await charge(token.body.token)).body;
  };

  const act = (id: string, action: string, body: object = {}) =>
    request(sim.baseUrl).post(`/v1/payments/${id}/${action}`).set("Authorization", SK).send(body);

  // TC-120
  it("tokenizes a card (brand + last4 only) and approves the documented success cards", async () => {
    const visa = await tokenize("4242 4242 4242 4242");
    expect(visa.status).toBe(201);
    expect(visa.body).toMatchObject({ brand: "visa", last4: "4242", method: "card" });
    expect(visa.body.token).toMatch(/^tok_sim_/);

    const approved = await charge(visa.body.token);
    expect(approved.status).toBe(201);
    expect(approved.body).toMatchObject({ status: "authorized", amountMinor: 2599, currency: "USD", card: { brand: "visa", last4: "4242" } });
    expect(approved.body.id).toMatch(/^pay_sim_/);

    expect(await payWith("5555555555554444")).toMatchObject({ status: "authorized", card: { brand: "mastercard", last4: "4444" } });

    // A full card number appears nowhere in any response.
    expect(JSON.stringify([visa.body, approved.body])).not.toMatch(/4242424242424242|4242 4242 4242/);
  });

  // TC-121
  it.each([
    ["4000000000000002", "card_declined"],
    ["4000000000009995", "insufficient_funds"],
    ["4000000000000069", "expired_card"],
    ["4000000000000127", "incorrect_cvc"],
    ["4000000000000119", "processing_error"],
  ])("test card %s is declined with %s", async (number, declineCode) => {
    const payment = await payWith(number);
    expect(payment).toMatchObject({ status: "declined", declineCode });
    expect(payment.card.last4).toBe(number.slice(-4));
  });

  // TC-122
  it("3-D Secure card requires action, then authorizes on approval and can be captured", async () => {
    const challenge = await payWith("4000 0000 0000 3220");
    expect(challenge).toMatchObject({ status: "requires_action", actionType: "3ds" });

    const confirmed = await act(challenge.id, "confirm", { approved: true });
    expect(confirmed.body.status).toBe("authorized");
    expect(confirmed.body).not.toHaveProperty("actionType");
    expect((await act(challenge.id, "capture")).body.status).toBe("captured");
  });

  // TC-123
  it("a failed 3-D Secure challenge ends in a decline and cannot be captured", async () => {
    const challenge = await payWith("4000000000003220");
    const failed = await act(challenge.id, "confirm", { approved: false });
    expect(failed.body).toMatchObject({ status: "declined", declineCode: "card_declined" });
    expect((await act(challenge.id, "capture")).status).toBe(409);
  });

  // TC-124
  it("rejects Luhn-invalid numbers, but approves any other valid card number", async () => {
    expect(await payWith("4242424242424241")).toMatchObject({ status: "declined", declineCode: "invalid_number" });
    expect(await payWith("12345678")).toMatchObject({ status: "declined", declineCode: "invalid_number" });
    expect(await payWith("4111111111111111")).toMatchObject({ status: "authorized" });
  });

  // TC-125
  it("declines an expired card and a malformed CVC; the current month is still valid", async () => {
    expect(await payWith("4242424242424242", { expYear: 2020 })).toMatchObject({ status: "declined", declineCode: "expired_card" });
    expect(await payWith("4242424242424242", { cvc: "1" })).toMatchObject({ status: "declined", declineCode: "incorrect_cvc" });

    const now = new Date();
    expect(await payWith("4242424242424242", { expMonth: now.getMonth() + 1, expYear: now.getFullYear() })).toMatchObject({ status: "authorized" });
  });

  // TC-126
  it("validates requests: bad card shape, bad amounts, and the two API keys are not interchangeable", async () => {
    const bad = await tokenize("abc", { expMonth: 13 });
    expect(bad.status).toBe(400);
    expect(bad.body.details.length).toBeGreaterThanOrEqual(2);

    const { token } = (await tokenize("4242424242424242")).body;
    expect((await charge(token, 0)).status).toBe(400);
    expect((await charge(token, 19.99)).status).toBe(400);

    // Publishable key can't charge; secret key can't tokenize; no key at all is rejected.
    expect((await request(sim.baseUrl).post("/v1/payments").set("Authorization", PK).send({})).status).toBe(401);
    expect((await request(sim.baseUrl).post("/v1/tokens").set("Authorization", SK).send({})).status).toBe(401);
    expect((await request(sim.baseUrl).post("/v1/tokens").send({})).status).toBe(401);
  });

  // TC-127
  it("every documented test card behaves exactly as its description says", async () => {
    const { card, ebt } = (await request(sim.baseUrl).get("/v1/test-cards")).body as Record<string, { number: string; outcome: string }[]>;
    expect(card!.length).toBeGreaterThanOrEqual(8);
    expect(ebt!.length).toBe(2);

    for (const [method, cards] of [["card", card!], ["ebt", ebt!]] as const) {
      for (const { number, outcome } of cards) {
        const result = await payWith(number, {}, method);
        if (outcome.startsWith("Approved")) expect(result.status).toBe("authorized");
        else if (outcome.startsWith("Declined: ")) {
          expect(result).toMatchObject({ status: "declined", declineCode: outcome.replace("Declined: ", "") });
        } else if (outcome.startsWith("Requires")) expect(result.status).toBe("requires_action");
        else throw new Error(`Undocumented outcome wording: "${outcome}"`);
      }
    }
  });

  describe("lifecycle", () => {
    // TC-128
    it("authorize -> capture (idempotent) -> partial refunds accumulate -> over-refund is rejected", async () => {
      const { id } = await (async () => (await charge((await tokenize("4242424242424242")).body.token, 1000)).body)();

      expect((await act(id, "capture")).body).toMatchObject({ status: "captured", capturedMinor: 1000 });
      expect((await act(id, "capture")).body.status).toBe("captured"); // no double capture

      expect((await act(id, "refund", { amountMinor: 400 })).body.status).toBe("refunded");
      const tooMuch = await act(id, "refund", { amountMinor: 700 });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body.error).toBe("amount_exceeds_captured");
      expect((await act(id, "refund", { amountMinor: 600 })).body.status).toBe("refunded");
      expect((await request(sim.baseUrl).get(`/v1/payments/${id}`).set("Authorization", SK)).body).toMatchObject({ status: "refunded", refundedMinor: 1000 });
    });

    // TC-129
    it("rejects lifecycle misuse with 409, and unknown ids with 404", async () => {
      const approved = await payWith("4242424242424242");
      const declined = await payWith("4000000000000002");

      expect((await act(approved.id, "refund", { amountMinor: 100 })).status).toBe(409); // not captured
      expect((await act(declined.id, "capture")).status).toBe(409);
      expect((await act(approved.id, "confirm", { approved: true })).status).toBe(409);
      expect((await act("pay_sim_nope", "capture")).status).toBe(404);
    });

    // TC-130
    it("rejects a non-positive refund amount", async () => {
      const { id } = (await charge((await tokenize("4242424242424242")).body.token, 1000)).body;
      await act(id, "capture");
      expect((await act(id, "refund", { amountMinor: 0 })).status).toBe(400);
      expect((await act(id, "refund", {})).status).toBe(400);
    });
  });

  // TC-131
  it("honours PAYMENT_SIMULATION_LATENCY_MS, read fresh on each call", async () => {
    process.env.PAYMENT_SIMULATION_LATENCY_MS = "150";
    try {
      const started = Date.now();
      await tokenize("4242424242424242");
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    } finally {
      delete process.env.PAYMENT_SIMULATION_LATENCY_MS;
    }
    const fast = Date.now();
    await tokenize("4242424242424242");
    expect(Date.now() - fast).toBeLessThan(140);
  });

  // TC-132
  it("EBT tokens accept only 6000-prefixed cards; ...0002 is insufficient funds", async () => {
    expect(await payWith("6000 0000 0000 0001", {}, "ebt")).toMatchObject({ status: "authorized", card: { brand: "ebt", last4: "0001" } });
    expect(await payWith("6000000000000002", {}, "ebt")).toMatchObject({ status: "declined", declineCode: "insufficient_funds" });
    expect(await payWith("4242424242424242", {}, "ebt")).toMatchObject({ status: "declined", declineCode: "invalid_number" });
  });

  // TC-134
  it("tokens are single-use, and unknown tokens are rejected", async () => {
    const { token } = (await tokenize("4242424242424242")).body;
    expect((await charge(token)).status).toBe(201);

    const reused = await charge(token);
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe("token_already_used");

    const unknown = await charge("tok_sim_nope");
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe("invalid_token");
  });

  // TC-135
  it("answers /health and has CORS enabled for browser tokenization", async () => {
    expect((await request(sim.baseUrl).get("/health")).body).toEqual({ status: "ok", service: "payment-simulator" });

    const preflight = await request(sim.baseUrl)
      .options("/v1/tokens")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers["access-control-allow-origin"]).toBeDefined();
    expect(preflight.headers["access-control-allow-headers"]?.toLowerCase()).toContain("authorization");
  });
});

/* eslint-disable @typescript-eslint/no-var-requires */
describe("Pay-at-pickup provider (local, no gateway)", () => {
  const { createPayAtPickupProvider } = require("../../product-catalog-service/dist/platform/httpPaymentProvider") as {
    createPayAtPickupProvider: (m: object) => {
      method: { simulated: boolean; clientConfig?: unknown };
      authorize: (r: object) => Promise<{ status: string; reference: string; declineCode?: string }>;
      capture: (ref: string) => Promise<{ status: string }>;
    };
  };
  const provider = createPayAtPickupProvider({ id: "pay-at-pickup", displayName: "Pay at pickup", kind: "offline" });
  const amount = { amountMinor: 4200, currency: "USD" };

  // TC-133
  it("authorizes with no source (no clientConfig: nothing to tokenize), refuses a token, and captures at the counter", async () => {
    expect(provider.method.simulated).toBe(true);
    expect(provider.method.clientConfig).toBeUndefined();

    const held = await provider.authorize({ orderRef: "o", amount, source: { kind: "none" } });
    expect(held.status).toBe("authorized");
    expect((await provider.capture(held.reference)).status).toBe("captured");

    const withToken = await provider.authorize({ orderRef: "o", amount, source: { kind: "token", token: "tok_x" } });
    expect(withToken).toMatchObject({ status: "declined", declineCode: "unsupported_source" });
  });
});
