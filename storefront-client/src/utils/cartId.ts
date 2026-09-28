const CART_ID_STORAGE_KEY = "fresh-basket-cart-id";

/**
 * The cart is anonymous: scoped to an id generated once per browser and kept in
 * localStorage (the standard "guest cart" pattern). It is tied to an account only
 * when the shopper checks out. `crypto.randomUUID()` needs a secure context, which
 * `localhost` satisfies.
 */
export function getOrCreateCartId(): string {
  try {
    const existing = localStorage.getItem(CART_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(CART_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // Storage blocked: an in-memory id still works for this page's lifetime.
    return crypto.randomUUID();
  }
}
