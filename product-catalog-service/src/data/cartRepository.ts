import { Cart } from "../types/cart";
import { createBoundedMap } from "../utils/boundedMap";

/** Caps the number of concurrently tracked carts in this demo process. */
const MAX_CARTS = 1000;

const carts = createBoundedMap<string, Cart>(MAX_CARTS);

function emptyCart(cartId: string): Cart {
  return {
    cartId,
    items: [],
    subtotalMinor: 0,
    currency: "USD",
    itemCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read-only lookup. Deliberately does NOT persist a synthesized empty cart
 * for an id that's never been touched - otherwise every page load from a
 * fresh anonymous visitor would grow the bounded map even if they never
 * add anything, defeating the point of capping it.
 */
export function getCart(cartId: string): Cart {
  return carts.get(cartId) ?? emptyCart(cartId);
}

export function saveCart(cart: Cart): void {
  carts.set(cart.cartId, cart);
}

export function deleteCart(cartId: string): void {
  carts.delete(cartId);
}
