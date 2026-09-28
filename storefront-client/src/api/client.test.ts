import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiText } from "./client";

const respond = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("apiRequest", () => {
  it("unwraps the ResilientPayload envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(200, { data: { hello: "world" }, isFallback: true, source: "circuit-breaker-fallback", retrievedAt: "2026-01-01T00:00:00Z" }));

    const result = await apiRequest<{ hello: string }>("/x");

    expect(result).toMatchObject({ ok: true, status: 200, data: { hello: "world" }, isFallback: true, source: "circuit-breaker-fallback" });
  });

  it("sends the bearer token and a JSON body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(201, { data: {} }));

    await apiRequest("/checkout", { method: "POST", token: "tok", body: { a: 1 } });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/checkout$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
    expect(init.body).toBe('{"a":1}');
  });

  it("returns API errors (with code, details and decline code) instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(402, { error: "PAYMENT_DECLINED", message: "Your payment was declined", declineCode: "insufficient_funds" }));

    expect(await apiRequest("/checkout", { method: "POST" })).toEqual({
      ok: false,
      status: 402,
      code: "PAYMENT_DECLINED",
      message: "Your payment was declined",
      details: undefined,
      declineCode: "insufficient_funds",
    });
  });

  it("falls back to a generic error for a non-JSON failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));

    expect(await apiRequest("/x")).toMatchObject({ ok: false, status: 502, code: "REQUEST_FAILED" });
  });

  it("reports an unreachable service as status 0, not an exception", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await apiRequest("/x")).toMatchObject({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });

  it("handles 204 No Content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(204, null));

    expect(await apiRequest("/auth/logout", { method: "POST" })).toMatchObject({ ok: true, status: 204 });
  });
});

describe("apiText", () => {
  it("returns the document text, or null on failure", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockResolvedValueOnce(new Response("<html>receipt</html>", { status: 200 }));
    expect(await apiText("/customers/me/invoices/x/html", "tok")).toBe("<html>receipt</html>");

    spy.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect(await apiText("/customers/me/invoices/y/html", "tok")).toBeNull();

    spy.mockRejectedValueOnce(new TypeError("offline"));
    expect(await apiText("/z", "tok")).toBeNull();
  });
});
