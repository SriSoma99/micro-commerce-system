import { randomUUID } from "node:crypto";
import { findOrder, resolvePendingOrder, saveOrder } from "../data/orderRepository";
import { getCart } from "../data/cartRepository";
import { inventoryRepository } from "../data/inventoryRepository";
import { money } from "../platform/money";
import { ActivePlatform, getPlatform } from "../platform/platform";
import {
  DeclineCode,
  PaymentGatewayUnavailableError,
  PaymentProvider,
  PaymentResult,
  PaymentSource,
  PaymentStateError,
  PaymentStatus,
  ReceiptData,
  ReceiptLine,
  StoreLocation,
} from "../platform/types";
import { Customer } from "../types/customer";
import { Order } from "../types/order";
import { clearCart } from "./cartService";
import { findEnabledProvider } from "./paymentService";
import { domainEventBus } from "../observability/domainEventBus";
import { metricsRegistry } from "../observability/metricsEngine";
import { logger } from "../utils/logger";

export interface CheckoutInput {
  customer: Customer;
  cartId: string;
  storeId: string;
  paymentMethod: string;
  paymentToken?: string;
  idempotencyKey?: string;
}

export type CheckoutOutcome =
  | { kind: "placed"; order: Order }
  | { kind: "payment_action_required"; order: Order; actionType: "3ds" }
  | { kind: "error"; status: 400 | 402 | 404 | 409 | 500 | 502 | 503; code: string; message: string; declineCode?: DeclineCode };

const fail = (status: 400 | 402 | 404 | 409 | 500 | 502 | 503, code: string, message: string, declineCode?: DeclineCode): CheckoutOutcome => ({
  kind: "error",
  status,
  code,
  message,
  ...(declineCode ? { declineCode } : {}),
});

/** Builds the immutable receipt snapshot the invoice is stored (and later rendered) from. */
function buildReceipt(order: Order, customer: Pick<Customer, "id" | "name" | "email">, platform: ActivePlatform, provider: PaymentProvider) {
  return (invoiceNumber: string, issuedAt: string): ReceiptData => {
    const byRate = new Map<number, { netMinor: number; taxMinor: number }>();
    for (const line of order.items) {
      const group = byRate.get(line.taxRateBps) ?? { netMinor: 0, taxMinor: 0 };
      group.netMinor += line.netMinor;
      group.taxMinor += line.taxMinor;
      byRate.set(line.taxRateBps, group);
    }

    return {
      invoiceNumber,
      issuedAt,
      orderId: order.orderId,
      store: { id: order.storeId, name: order.storeName, jurisdiction: order.taxJurisdiction },
      customer: { id: customer.id, name: customer.name, email: customer.email },
      currency: order.currency,
      locale: platform.config.locale,
      priceMode: platform.config.priceMode,
      lines: order.items,
      totals: { subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor },
      // Only taxed rates are listed; exempt lines are shown with an F flag instead.
      taxSummary: [...byRate.entries()].filter(([rateBps]) => rateBps > 0).sort(([a], [b]) => a - b).map(([rateBps, sums]) => ({ rateBps, ...sums })),
      payment: {
        methodId: provider.method.id,
        methodName: provider.method.displayName,
        status: order.payment.status,
        reference: order.payment.reference ?? "",
        simulated: provider.method.simulated,
        ...(order.payment.card ? { card: order.payment.card } : {}),
      },
    };
  };
}

/** Gateway outages fail CLOSED: no order is created and nothing is charged. */
function toGatewayFailure(err: unknown): CheckoutOutcome {
  if (err instanceof PaymentGatewayUnavailableError) {
    return fail(503, "PAYMENT_GATEWAY_UNAVAILABLE", "The payment service is unavailable. You have not been charged; please try again.");
  }
  if (err instanceof PaymentStateError) return fail(409, "PAYMENT_STATE_ERROR", err.message);
  throw err;
}

/** What a cart costs at a given store: per-line tax from the STORE's jurisdiction, via the installed tax provider. */
interface PricedCart {
  currency: string;
  items: ReceiptLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** Shared by the quote and the real checkout, so the price shown before paying is the price charged. */
async function priceCart(platform: ActivePlatform, cartId: string, store: StoreLocation): Promise<PricedCart | { error: CheckoutOutcome }> {
  const cart = getCart(cartId);
  if (cart.items.length === 0) return { error: fail(400, "EMPTY_CART", "Cannot check out an empty cart") };

  const currency = cart.currency;
  const tax = await platform.tax.calculate({
    jurisdiction: store.taxJurisdiction,
    lines: cart.items.map((item) => ({ lineId: item.lineItemId, net: money(item.priceMinor * item.quantity, currency), taxCode: item.taxCode })),
  });
  const taxByLine = new Map(tax.lines.map((line) => [line.lineId, line]));

  const items: ReceiptLine[] = cart.items.map((item, index) => {
    const taxed = taxByLine.get(item.lineItemId);
    return {
      lineNo: index + 1,
      productId: item.productId,
      name: item.name,
      sizeLabel: item.sizeLabel,
      soldBy: item.soldBy,
      quantity: item.quantity,
      unitPriceMinor: item.priceMinor,
      netMinor: item.priceMinor * item.quantity,
      taxCode: item.taxCode,
      taxRateBps: taxed?.rateBps ?? 0,
      taxMinor: taxed?.tax.amountMinor ?? 0,
      configuration: item.selectedConfiguration ?? {},
    };
  });

  const subtotalMinor = cart.subtotalMinor;
  const taxMinor = tax.total.amountMinor;
  return { currency, items, subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}

export type QuoteOutcome = { kind: "quote"; quote: PricedCart & { storeId: string; storeName: string; jurisdiction: string } } | Extract<CheckoutOutcome, { kind: "error" }>;

/** Prices a cart at a store without charging or saving anything (the checkout page shows this before the card form). */
export async function quoteOrder(cartId: string, storeId: string): Promise<QuoteOutcome> {
  const platform = getPlatform();
  if (!platform) return fail(409, "NOT_INSTALLED", "Store setup has not been completed") as Extract<CheckoutOutcome, { kind: "error" }>;

  const store = platform.config.stores.find((candidate) => candidate.id === storeId);
  if (!store) return fail(400, "UNKNOWN_STORE", `No store "${storeId}"`) as Extract<CheckoutOutcome, { kind: "error" }>;

  const priced = await priceCart(platform, cartId, store);
  if ("error" in priced) return priced.error as Extract<CheckoutOutcome, { kind: "error" }>;
  return { kind: "quote", quote: { ...priced, storeId: store.id, storeName: store.name, jurisdiction: store.taxJurisdiction } };
}

// Idempotency cache: stores completed checkouts (5 min TTL) and in-flight operations
const IDEMPOTENCY_CACHE = new Map<string, { timestamp: number; outcome: CheckoutOutcome }>();
const IN_FLIGHT_CHECKOUTS = new Map<string, Promise<CheckoutOutcome>>();

function cleanStaleIdempotencyKeys(): void {
  const now = Date.now();
  for (const [key, val] of IDEMPOTENCY_CACHE.entries()) {
    if (now - val.timestamp > 300_000) {
      IDEMPOTENCY_CACHE.delete(key);
    }
  }
}

async function runCheckout(input: CheckoutInput): Promise<CheckoutOutcome> {
  const platform = getPlatform();
  if (!platform) return fail(409, "NOT_INSTALLED", "Store setup has not been completed");

  const store = platform.config.stores.find((candidate) => candidate.id === input.storeId);
  if (!store) return fail(400, "UNKNOWN_STORE", `No store "${input.storeId}"`);

  const provider = findEnabledProvider(input.paymentMethod);
  if (!provider) return fail(400, "PAYMENT_METHOD_UNAVAILABLE", `Payment method "${input.paymentMethod}" is not enabled`);

  const needsToken = provider.method.clientConfig !== undefined;
  if (needsToken && !input.paymentToken) return fail(400, "PAYMENT_TOKEN_REQUIRED", "This payment method needs a card token from the payment gateway");
  const source: PaymentSource = needsToken ? { kind: "token", token: input.paymentToken as string } : { kind: "none" };

  const priced = await priceCart(platform, input.cartId, store);
  if ("error" in priced) return priced.error;
  const { currency, items, subtotalMinor, taxMinor, totalMinor } = priced;

  // 2. Pre-Payment Stock Check & Atomic Decrement (CO-09)
  const stockItems = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const stockResult = inventoryRepository.checkAndDecrementStock(store.id, stockItems);
  if (!stockResult.ok) {
    return fail(
      409,
      "OUT_OF_STOCK",
      `Item "${stockResult.outOfStockProduct}" is out of stock at ${store.name} (available: ${stockResult.available})`
    );
  }

  const orderId = randomUUID();

  // 3. Payment Authorization
  let payment: PaymentResult;
  try {
    payment = await provider.authorize({ orderRef: orderId, amount: money(totalMinor, currency), source });
  } catch (err) {
    inventoryRepository.restoreStock(store.id, stockItems);
    return toGatewayFailure(err);
  }

  if (payment.status === "declined") {
    inventoryRepository.restoreStock(store.id, stockItems);
    return fail(402, "PAYMENT_DECLINED", "Your payment was declined", payment.declineCode);
  }

  const draft = {
    orderId,
    customerId: input.customer.id,
    cartId: input.cartId,
    storeId: store.id,
    storeName: store.name,
    taxJurisdiction: store.taxJurisdiction,
    currency,
    subtotalMinor,
    taxMinor,
    totalMinor,
    items,
    placedAt: new Date().toISOString(),
  };

  // 3-D Secure: park the order as pending (no invoice yet) until the customer completes the challenge.
  if (payment.status === "requires_action") {
    let order: Order;
    try {
      order = saveOrder({
        ...draft,
        status: "payment_pending",
        payment: { method: provider.method.id, status: "requires_action", reference: payment.reference, card: payment.card ?? null },
      });
    } catch (saveErr) {
      logger.error("Checkout", `Failed to save payment_pending order ${orderId}: ${(saveErr as Error).message}`);
      inventoryRepository.restoreStock(store.id, stockItems);
      return fail(500, "ORDER_PERSISTENCE_FAILED", "Order could not be saved");
    }
    return { kind: "payment_action_required", order, actionType: "3ds" };
  }

  // Card/EBT are charged now; pay-at-pickup stays authorized until the counter captures it.
  let finalStatus: PaymentStatus = payment.status;
  if (provider.method.kind !== "offline") {
    try {
      finalStatus = (await provider.capture(payment.reference)).status;
    } catch (err) {
      inventoryRepository.restoreStock(store.id, stockItems);
      return toGatewayFailure(err);
    }
  }

  const placed: Order = {
    ...draft,
    status: "placed",
    invoice: null,
    payment: { method: provider.method.id, status: finalStatus, reference: payment.reference, card: payment.card ?? null },
  };

  // 4. Persistence with Compensating Refund Protection
  let saved: Order;
  try {
    saved = saveOrder(placed, buildReceipt(placed, input.customer, platform, provider));
  } catch (dbErr) {
    logger.error("Checkout", `Database error saving order ${orderId}: ${(dbErr as Error).message}. Initiating rollback.`);
    inventoryRepository.restoreStock(store.id, stockItems);
    if (provider.method.kind !== "offline") {
      try {
        await provider.refund(payment.reference, money(totalMinor, currency));
        logger.info("Checkout", `Compensating refund issued for payment reference ${payment.reference}`);
      } catch (refundErr) {
        logger.error("Checkout", `Compensating refund failed for ${payment.reference}: ${(refundErr as Error).message}`);
      }
    }
    return fail(500, "ORDER_PERSISTENCE_FAILED", "Order could not be saved. Any charge has been automatically reversed.");
  }

  clearCart(input.cartId);

  domainEventBus.publish({
    type: "ORDER_PLACED",
    summary: `Order ${saved.orderId} placed for $${(saved.totalMinor / 100).toFixed(2)} at ${saved.storeName} by ${input.customer?.name || "Guest"}`,
    storeId: saved.storeId,
    actor: {
      customerId: input.customer?.id,
      email: input.customer?.email,
      role: input.customer?.role,
    },
    payload: {
      orderId: saved.orderId,
      totalMinor: saved.totalMinor,
      itemCount: saved.items.length,
      paymentMethod: saved.payment.method,
      cardBrand: saved.payment.card?.brand,
      cardLast4: saved.payment.card?.last4,
    },
  });
  metricsRegistry.recordCheckout("success", saved.payment.method);

  return { kind: "placed", order: saved };
}

/**
 * Cart -> stock reservation -> tax -> payment -> order -> invoice.
 *
 * Ordering matters: stock is checked and decremented atomically before charging.
 * If payment fails, stock is immediately restored.
 * If order saving fails post-capture, compensating refund and stock restoration occur.
 */
export async function placeOrder(input: CheckoutInput): Promise<CheckoutOutcome> {
  cleanStaleIdempotencyKeys();

  const idempotencyKey = input.idempotencyKey;
  if (idempotencyKey) {
    // 1. Return cached completed outcome if present
    const cached = IDEMPOTENCY_CACHE.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < 300_000) {
      logger.info("Checkout", `Returning cached idempotent response for key: ${idempotencyKey}`);
      return cached.outcome;
    }

    // 2. Await in-flight promise if currently running
    const inFlight = IN_FLIGHT_CHECKOUTS.get(idempotencyKey);
    if (inFlight) {
      logger.info("Checkout", `Awaiting in-flight checkout for key: ${idempotencyKey}`);
      return await inFlight;
    }

    const promise = runCheckout(input);
    IN_FLIGHT_CHECKOUTS.set(idempotencyKey, promise);
    try {
      const outcome = await promise;
      if (outcome.kind === "placed" || outcome.kind === "payment_action_required") {
        IDEMPOTENCY_CACHE.set(idempotencyKey, { timestamp: Date.now(), outcome });
      }
      return outcome;
    } finally {
      IN_FLIGHT_CHECKOUTS.delete(idempotencyKey);
    }
  }

  return await runCheckout(input);
}

/** Completes (or fails) a 3-D Secure challenge for a pending order the customer owns. */
export async function confirmPayment(customer: Customer, orderId: string, approved: boolean): Promise<CheckoutOutcome> {
  const platform = getPlatform();
  if (!platform) return fail(409, "NOT_INSTALLED", "Store setup has not been completed");

  const order = findOrder(customer.id, orderId);
  if (!order) return fail(404, "ORDER_NOT_FOUND", `No order found with id "${orderId}"`);
  if (order.status !== "payment_pending" || !order.payment.reference) {
    return fail(409, "INVALID_STATE", "This order is not waiting for payment confirmation");
  }

  const provider = findEnabledProvider(order.payment.method);
  if (!provider) return fail(400, "PAYMENT_METHOD_UNAVAILABLE", "The payment method is no longer enabled");

  const stockItems = order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));

  try {
    const confirmed = await provider.confirmAction(order.payment.reference, approved);
    if (confirmed.status === "declined") {
      resolvePendingOrder(orderId, { status: "cancelled", paymentStatus: "declined", paymentReference: order.payment.reference });
      inventoryRepository.restoreStock(order.storeId, stockItems);
      return fail(402, "PAYMENT_DECLINED", "Your payment was declined", confirmed.declineCode);
    }

    const captured = await provider.capture(order.payment.reference);
    const placed: Order = {
      ...order,
      status: "placed",
      payment: { ...order.payment, status: captured.status },
    };
    resolvePendingOrder(
      orderId,
      { status: "placed", paymentStatus: captured.status, paymentReference: order.payment.reference },
      buildReceipt(placed, customer, platform, provider)
    );
    clearCart(order.cartId);
    return { kind: "placed", order: findOrder(customer.id, orderId) as Order };
  } catch (err) {
    resolvePendingOrder(orderId, { status: "cancelled", paymentStatus: "declined", paymentReference: order.payment.reference });
    inventoryRepository.restoreStock(order.storeId, stockItems);
    return toGatewayFailure(err);
  }
}
