import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";

const customer = { id: "cust_1", email: "testuser@mydomain.com", name: "Test User", phone: null, preferredStoreId: null, marketingOptIn: false, role: "customer", status: "active" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe("useAuth", () => {
  it("starts anonymous with no stored token", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.status).toBe("anonymous");
    expect(result.current.customer).toBeNull();
  });

  it("signs in, stores the token, and exposes the customer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { data: { customer, token: "tok_123", expiresAt: "2099-01-01" } }));
    const { result } = renderHook(() => useAuth());

    let error: unknown;
    await act(async () => {
      error = await result.current.login("testuser@mydomain.com", "123456");
    });

    expect(error).toBeNull();
    expect(result.current).toMatchObject({ status: "signedIn", token: "tok_123", customer: { name: "Test User" } });
    expect(localStorage.getItem("fresh-basket-token")).toBe("tok_123");
  });

  it("returns the API error and stays anonymous on a bad password", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: "INVALID_CREDENTIALS", message: "Incorrect email or password" }));
    const { result } = renderHook(() => useAuth());

    let error: { code?: string } | null = null;
    await act(async () => {
      error = await result.current.login("testuser@mydomain.com", "wrong");
    });

    expect(error).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(result.current.status).toBe("anonymous");
    expect(localStorage.getItem("fresh-basket-token")).toBeNull();
  });

  it("restores a session from a stored token by asking the server who it is", async () => {
    localStorage.setItem("fresh-basket-token", "tok_saved");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { data: customer }));

    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    const firstCall = spy.mock.calls[0] as [string, RequestInit];
    expect(firstCall[1].headers).toMatchObject({ Authorization: "Bearer tok_saved" });
    expect(result.current.customer?.email).toBe("testuser@mydomain.com");
  });

  it("drops an expired or revoked stored token", async () => {
    localStorage.setItem("fresh-basket-token", "tok_stale");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: "UNAUTHENTICATED", message: "Sign in required" }));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(localStorage.getItem("fresh-basket-token")).toBeNull();
  });

  it("signs out: clears the token locally and tells the server", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { data: { customer, token: "tok_123", expiresAt: "2099-01-01" } }));
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login("testuser@mydomain.com", "123456");
    });

    spy.mockResolvedValue(new Response(null, { status: 204 }));
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current).toMatchObject({ status: "anonymous", token: null, customer: null });
    expect(localStorage.getItem("fresh-basket-token")).toBeNull();
    const logoutCall = spy.mock.calls.at(-1) as [string, RequestInit];
    expect(logoutCall[0]).toMatch(/\/auth\/logout$/);
    expect(logoutCall[1].headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });
});
