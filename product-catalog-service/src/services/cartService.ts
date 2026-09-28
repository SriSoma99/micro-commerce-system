import { createHash } from "node:crypto";
import { getCart as findCart, saveCart } from "../data/cartRepository";
import { getProductDetail } from "./catalogService";
import { Cart, CartLineItem } from "../types/cart";
import { ProductDetail, ResilientPayload } from "../types/product";

export type CartErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "INVALID_QUANTITY"
  | "INVALID_CONFIGURATION"
  | "LINE_ITEM_NOT_FOUND";

export type CartResult =
  | { ok: true; payload: ResilientPayload<Cart> }
  | { ok: false; status: 404 | 409 | 400; code: CartErrorCode; message: string };

function recompute(cartId: string, items: CartLineItem[]): Cart {
  const subtotalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const currency = items[0]?.currency ?? "USD";
  return { cartId, items, subtotalMinor, currency, itemCount, updatedAt: new Date().toISOString() };
}

function liveEnvelope(cart: Cart): ResilientPayload<Cart> {
  return { data: cart, isFallback: false, source: "live-core", retrievedAt: new Date().toISOString() };
}

/**
 * A cart line item's identity is the product plus its fully-resolved
 * configuration (e.g. "Aperture 75 Keyboard, Clicky Blue, Navy" and
 * "Aperture 75 Keyboard, Linear Red, Charcoal" are different line items).
 * Hashing rather than concatenating raw values keeps the id short, opaque,
 * and URL-safe by construction - a raw joined string could collide if a
 * configuration value itself contained the separator characters.
 */
function deriveLineItemId(productId: string, configuration: Record<string, string>): string {
  const canonical = Object.entries(configuration)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
  return createHash("sha1").update(`${productId}::${canonical}`).digest("hex").slice(0, 16);
}

/**
 * Resolves a client-supplied configuration against the product's real
 * `configurationOptions`, filling in each option's `defaultChoice` when the
 * client omits it. Normalizing before hashing means two adds that differ
 * only in whether the client bothered to send the default choice still
 * merge into the same line item, and it rejects unknown option names/values
 * up front rather than letting a client mint unbounded distinct line items
 * with garbage configuration keys.
 */
function normalizeConfiguration(
  product: ProductDetail,
  requested: Record<string, string> | undefined
): { configuration: Record<string, string> } | { error: string } {
  const requestedEntries = requested ?? {};
  const validOptionNames = new Set(product.configurationOptions.map((option) => option.name));

  for (const key of Object.keys(requestedEntries)) {
    if (!validOptionNames.has(key)) {
      return { error: `"${key}" is not a configurable option for "${product.name}"` };
    }
  }

  const configuration: Record<string, string> = {};
  for (const option of product.configurationOptions) {
    const value = requestedEntries[option.name] ?? option.defaultChoice;
    if (!option.choices.includes(value)) {
      return { error: `"${value}" is not a valid choice for "${option.name}"` };
    }
    configuration[option.name] = value;
  }

  return { configuration };
}

export function getCart(cartId: string): ResilientPayload<Cart> {
  return liveEnvelope(findCart(cartId));
}

/**
 * Validates and prices the item via the existing, already breaker-protected
 * `catalogService.getProductDetail` rather than owning a breaker of its
 * own - this inherits circuit-breaker resilience for free. If the catalog
 * breaker is open, this transparently validates against the stale fallback
 * snapshot's stock numbers instead of failing outright, which is what lets
 * cart operations keep working through a catalog outage. The cart's own
 * envelope mirrors the underlying lookup's `isFallback`/`source` so the UI
 * can surface that the add was served from cached data.
 */
export async function addItem(
  cartId: string,
  productId: string,
  quantity: number,
  selectedConfiguration?: Record<string, string>,
  storeId?: string
): Promise<CartResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, status: 400, code: "INVALID_QUANTITY", message: "quantity must be a positive integer" };
  }

  const productPayload = await getProductDetail(productId, storeId);
  const product = productPayload.data;
  if (!product) {
    return { ok: false, status: 404, code: "PRODUCT_NOT_FOUND", message: `No product found with id "${productId}"` };
  }

  const normalized = normalizeConfiguration(product, selectedConfiguration);
  if ("error" in normalized) {
    return { ok: false, status: 400, code: "INVALID_CONFIGURATION", message: normalized.error };
  }

  const { configuration } = normalized;
  const lineItemId = deriveLineItemId(productId, configuration);
  const cart = findCart(cartId);

  const existing = cart.items.find((item) => item.lineItemId === lineItemId);
  const existingQuantity = existing?.quantity ?? 0;
  const totalQuantity = existingQuantity + quantity;

  const availableStock = product.storeStock !== undefined ? product.storeStock : product.stock;

  if (totalQuantity > availableStock) {
    return {
      ok: false,
      status: 409,
      code: "INSUFFICIENT_STOCK",
      message: `Only ${availableStock} unit(s) of "${product.name}" available ${storeId ? `at selected store ` : ""}(cart already has ${existingQuantity})`,
    };
  }

  const items: CartLineItem[] = existing
    ? cart.items.map((item) => (item.lineItemId === lineItemId ? { ...item, quantity: totalQuantity } : item))
    : [
        ...cart.items,
        {
          lineItemId,
          productId,
          name: product.name,
          thumbnail: product.thumbnail,
          priceMinor: product.priceMinor,
          currency: product.currency,
          quantity,
          sizeLabel: product.sizeLabel,
          soldBy: product.soldBy,
          taxCode: product.taxCode,
          selectedConfiguration: configuration,
        },
      ];

  const updatedCart = recompute(cartId, items);
  saveCart(updatedCart);

  return {
    ok: true,
    payload: {
      data: updatedCart,
      isFallback: productPayload.isFallback,
      source: productPayload.source,
      retrievedAt: productPayload.retrievedAt,
    },
  };
}

/** quantity <= 0 removes the line item. Re-validates against current stock
 * (via the same breaker-protected product lookup as `addItem`) so a
 * quantity bump through this endpoint can't bypass the stock ceiling. */
export async function updateQuantity(cartId: string, lineItemId: string, quantity: number, storeId?: string): Promise<CartResult> {
  if (!Number.isInteger(quantity)) {
    return { ok: false, status: 400, code: "INVALID_QUANTITY", message: "quantity must be an integer" };
  }

  const cart = findCart(cartId);
  const existing = cart.items.find((item) => item.lineItemId === lineItemId);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      code: "LINE_ITEM_NOT_FOUND",
      message: `No line item "${lineItemId}" in this cart`,
    };
  }

  if (quantity <= 0) {
    const items = cart.items.filter((item) => item.lineItemId !== lineItemId);
    const updatedCart = recompute(cartId, items);
    saveCart(updatedCart);
    return { ok: true, payload: liveEnvelope(updatedCart) };
  }

  const productPayload = await getProductDetail(existing.productId, storeId);
  const stock = productPayload.data?.storeStock !== undefined ? productPayload.data.storeStock : productPayload.data?.stock;
  if (stock !== undefined && quantity > stock) {
    return {
      ok: false,
      status: 409,
      code: "INSUFFICIENT_STOCK",
      message: `Only ${stock} unit(s) of "${existing.name}" available`,
    };
  }

  const items = cart.items.map((item) => (item.lineItemId === lineItemId ? { ...item, quantity } : item));
  const updatedCart = recompute(cartId, items);
  saveCart(updatedCart);

  return {
    ok: true,
    payload: {
      data: updatedCart,
      isFallback: productPayload.isFallback,
      source: productPayload.source,
      retrievedAt: productPayload.retrievedAt,
    },
  };
}

export function removeItem(cartId: string, lineItemId: string): CartResult {
  const cart = findCart(cartId);
  const existing = cart.items.find((item) => item.lineItemId === lineItemId);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      code: "LINE_ITEM_NOT_FOUND",
      message: `No line item "${lineItemId}" in this cart`,
    };
  }

  const items = cart.items.filter((item) => item.lineItemId !== lineItemId);
  const updatedCart = recompute(cartId, items);
  saveCart(updatedCart);
  return { ok: true, payload: liveEnvelope(updatedCart) };
}

export function clearCart(cartId: string): ResilientPayload<Cart> {
  const clearedCart = recompute(cartId, []);
  saveCart(clearedCart);
  return liveEnvelope(clearedCart);
}

export async function mergeCarts(sourceCartId: string, targetCartId: string): Promise<ResilientPayload<Cart>> {
  if (sourceCartId === targetCartId) {
    return getCart(targetCartId);
  }

  const sourceCart = findCart(sourceCartId);
  if (!sourceCart || sourceCart.items.length === 0) {
    return getCart(targetCartId);
  }

  for (const item of sourceCart.items) {
    await addItem(targetCartId, item.productId, item.quantity, item.selectedConfiguration);
  }

  // Clear source cart after successful merge
  clearCart(sourceCartId);
  return getCart(targetCartId);
}
