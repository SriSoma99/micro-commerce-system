import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";
import type { Cart } from "../types/cart";
import type { ResilienceSource } from "../types/product";
import { getOrCreateCartId } from "../utils/cartId";

export interface UseCartResult {
  cartId: string;
  cart: Cart | null;
  error: string | null;
  status: { source: ResilienceSource; retrievedAt: string } | null;
  /** Each mutation resolves to `null` on success, or a message the UI can show. */
  addItem: (productId: string, quantity: number, selectedConfiguration?: Record<string, string>, storeId?: string | null) => Promise<string | null>;
  updateQuantity: (lineItemId: string, quantity: number, storeId?: string | null) => Promise<string | null>;
  removeItem: (lineItemId: string) => Promise<string | null>;
  /** Re-reads the cart from the server (after checkout empties it). */
  reload: () => Promise<void>;
}

/**
 * The shopper's cart. It is anonymous and keyed by an id kept in localStorage
 * (see utils/cartId.ts); it only becomes tied to an account at checkout.
 */
export function useCart(storeId?: string | null): UseCartResult {
  const cartId = useMemo(() => getOrCreateCartId(), []);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UseCartResult["status"]>(null);

  const mutate = useCallback(async (path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> => {
    const result = await apiRequest<Cart>(path, { method, body });
    if (!result.ok) {
      setError(result.message);
      return result.message;
    }
    setCart(result.data);
    setStatus({ source: result.source, retrievedAt: result.retrievedAt });
    setError(null);
    return null;
  }, []);

  const reload = useCallback(async () => {
    await mutate(`/cart/${cartId}`, "GET");
  }, [cartId, mutate]);

  useEffect(() => {
    // Initial load: syncing React with the server's cart, which is what effects are for.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  const addItem = useCallback(
    (productId: string, quantity: number, selectedConfiguration?: Record<string, string>, itemStoreId?: string | null) =>
      mutate(`/cart/${cartId}/items`, "POST", { productId, quantity, selectedConfiguration, storeId: itemStoreId ?? storeId }),
    [cartId, mutate, storeId]
  );
  const updateQuantity = useCallback(
    (lineItemId: string, quantity: number, itemStoreId?: string | null) =>
      mutate(`/cart/${cartId}/items/${lineItemId}`, "PATCH", { quantity, storeId: itemStoreId ?? storeId }),
    [cartId, mutate, storeId]
  );
  const removeItem = useCallback((lineItemId: string) => mutate(`/cart/${cartId}/items/${lineItemId}`, "DELETE"), [cartId, mutate]);

  return { cartId, cart, error, status, addItem, updateQuantity, removeItem, reload };
}
