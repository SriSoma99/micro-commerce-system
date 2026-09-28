import { afterEach, describe, expect, it, vi } from "vitest";
import { declineMessage, fetchTestCards, tokenizeCard } from "./payment";

const config = { tokenizationUrl: "http://gateway.test/v1/tokens", publishableKey: "pk_test_dummy", tokenMethod: "card" as const };
const card = { number: "4242 4242 4242 4242", month: 12, year: 2028, cvc: "123" };

afterEach(() => vi.restoreAllMocks());

describe("tokenizeCard", () => {
  it("sends the card to the GATEWAY with only the publishable key, and returns the token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ token: "tok_sim_1", brand: "visa", last4: "4242" }), { status: 201 }));

    const result = await tokenizeCard(config, card);

    expect(result).toEqual({ ok: true, token: "tok_sim_1", brand: "visa", last4: "4242" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway.test/v1/tokens");
    expect(init.headers).toMatchObject({ Authorization: "Bearer pk_test_dummy" });
    expect(JSON.parse(init.body as string)).toEqual({ method: "card", number: "4242424242424242", expMonth: 12, expYear: 2028, cvc: "123" });
  });

  it("asks for an EBT token when the method is EBT", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ token: "t", brand: "ebt", last4: "0001" }), { status: 201 }));

    await tokenizeCard({ ...config, tokenMethod: "ebt" }, card);

    expect(JSON.parse((spy.mock.calls[0] as [string, RequestInit])[1].body as string).method).toBe("ebt");
  });

  it("surfaces the gateway's field problems", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "invalid_request", message: "Invalid card details", details: ["expMonth must be 1-12"] }), { status: 400 }));

    expect(await tokenizeCard(config, card)).toEqual({ ok: false, message: "Please check your card details: expMonth must be 1-12." });
  });

  it("says nothing was charged when the gateway can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await tokenizeCard(config, card);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("haven't been charged");
  });
});

describe("fetchTestCards", () => {
  it("returns the list for the method, or nothing on any failure", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockResolvedValueOnce(new Response(JSON.stringify({ card: [{ number: "4242 4242 4242 4242", outcome: "Approved" }], ebt: [{ number: "6000 0000 0000 0001", outcome: "Approved (SNAP/EBT)" }] })));
    expect(await fetchTestCards("http://g/v1/test-cards", "ebt")).toEqual([{ number: "6000 0000 0000 0001", outcome: "Approved (SNAP/EBT)" }]);

    spy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    expect(await fetchTestCards("http://g/v1/test-cards", "card")).toEqual([]);

    spy.mockRejectedValueOnce(new TypeError("offline"));
    expect(await fetchTestCards("http://g/v1/test-cards", "card")).toEqual([]);
  });
});

describe("declineMessage", () => {
  it("explains each decline reason in plain language", () => {
    expect(declineMessage("insufficient_funds")).toContain("enough funds");
    expect(declineMessage("incorrect_cvc")).toContain("security code");
    expect(declineMessage("expired_card")).toContain("expired");
  });

  it("has a safe default", () => {
    expect(declineMessage(undefined)).toContain("declined");
    expect(declineMessage("something_new")).toContain("declined");
  });
});
