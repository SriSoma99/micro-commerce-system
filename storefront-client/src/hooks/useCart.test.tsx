import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCart } from "./useCart";

const cartOf = (itemCount: number) => ({ cartId: "c1", items: [], subtotalMinor: itemCount * 349, currency: "USD", itemCount, updatedAt: "2026-01-01T00:00:00Z" });
const ok = (data: unknown) => new Response(JSON.stringify({ data, isFallback: false, source: "live-core", retrievedAt: "2026-01-01T00:00:00Z" }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe("useCart", () => {
  it("loads the cart for a stable anonymous id kept in localStorage", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(cartOf(0)));

    const first = renderHook(() => useCart());
    await waitFor(() => expect(first.result.current.cart).not.toBeNull());
    const id = first.result.current.cartId;
    first.unmount();

    const second = renderHook(() => useCart());
    expect(second.result.current.cartId).toBe(id);
    expect((spy.mock.calls[0] as [string])[0]).toMatch(new RegExp(`/cart/${id}$`));
  });

  it("adds an item and updates the cart from the response", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(cartOf(0)));
    const { result } = renderHook(() => useCart());
    await waitFor(() => expect(result.current.cart).not.toBeNull());

    spy.mockResolvedValue(ok(cartOf(2)));
    let message: string | null = "unset";
    await act(async () => {
      message = await result.current.addItem("p-1", 2, { Scent: "Lemon Fresh" });
    });

    expect(message).toBeNull();
    expect(result.current.cart?.itemCount).toBe(2);
    const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toMatch(/\/items$/);
    expect(JSON.parse(init.body as string)).toEqual({ productId: "p-1", quantity: 2, selectedConfiguration: { Scent: "Lemon Fresh" } });
  });

  it("returns the server's message when an add is refused, and keeps the old cart", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(cartOf(1)));
    const { result } = renderHook(() => useCart());
    await waitFor(() => expect(result.current.cart?.itemCount).toBe(1));

    spy.mockResolvedValue(new Response(JSON.stringify({ error: "INSUFFICIENT_STOCK", message: "Only 3 unit(s) available" }), { status: 409 }));
    let message: string | null = null;
    await act(async () => {
      message = await result.current.addItem("p-1", 99);
    });

    expect(message).toBe("Only 3 unit(s) available");
    expect(result.current.error).toBe("Only 3 unit(s) available");
    expect(result.current.cart?.itemCount).toBe(1);
  });

  it("updates quantity and removes lines with the right verbs", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(cartOf(1)));
    const { result } = renderHook(() => useCart());
    await waitFor(() => expect(result.current.cart).not.toBeNull());

    await act(async () => {
      await result.current.updateQuantity("line1", 3);
      await result.current.removeItem("line1");
    });

    const calls = spy.mock.calls.slice(-2) as [string, RequestInit][];
    expect(calls[0]?.[1].method).toBe("PATCH");
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual({ quantity: 3 });
    expect(calls[1]?.[1].method).toBe("DELETE");
    expect(calls[1]?.[0]).toMatch(/\/items\/line1$/);
  });
});
