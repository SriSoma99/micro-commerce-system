import { getDb } from "../db/database";
import { PaymentStatus, ReceiptData, ReceiptLine } from "../platform/types";
import { InvoiceSummary, Order, OrderStatus } from "../types/order";
import { findInvoiceByOrder, issueInvoice } from "./invoiceRepository";

interface OrderRow {
  id: string;
  customer_id: string;
  cart_id: string;
  store_id: string;
  store_name: string;
  tax_jurisdiction: string;
  status: OrderStatus;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  payment_method: string;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  card_brand: string | null;
  card_last4: string | null;
  placed_at: string;
}

interface LineRow {
  order_id: string;
  line_no: number;
  product_id: string;
  name: string;
  size_label: string;
  sold_by: "each" | "weight";
  quantity: number;
  unit_price_minor: number;
  net_minor: number;
  tax_code: string;
  tax_rate_bps: number;
  tax_minor: number;
  configuration_json: string;
}

const toLine = (row: LineRow): ReceiptLine => ({
  lineNo: row.line_no,
  productId: row.product_id,
  name: row.name,
  sizeLabel: row.size_label,
  soldBy: row.sold_by,
  quantity: row.quantity,
  unitPriceMinor: row.unit_price_minor,
  netMinor: row.net_minor,
  taxCode: row.tax_code,
  taxRateBps: row.tax_rate_bps,
  taxMinor: row.tax_minor,
  configuration: JSON.parse(row.configuration_json) as Record<string, string>,
});

/** What the service hands the repository to persist (no invoice yet). */
export type NewOrder = Omit<Order, "invoice" | "orderId"> & { orderId: string };

function hydrate(row: OrderRow, lines: LineRow[], invoice: InvoiceSummary | undefined): Order {
  return {
    orderId: row.id,
    customerId: row.customer_id,
    cartId: row.cart_id,
    storeId: row.store_id,
    storeName: row.store_name,
    taxJurisdiction: row.tax_jurisdiction,
    status: row.status,
    currency: row.currency,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    totalMinor: row.total_minor,
    payment: {
      method: row.payment_method,
      status: row.payment_status,
      reference: row.payment_reference,
      card: row.card_brand && row.card_last4 ? { brand: row.card_brand, last4: row.card_last4 } : null,
    },
    items: lines.map(toLine),
    placedAt: row.placed_at,
    invoice: invoice ?? null,
  };
}

/**
 * Persists an order with its lines and, when `invoiceBuilder` is given, its
 * invoice - all in ONE transaction, so an order never exists without the
 * invoice it should have (or the reverse).
 */
export function saveOrder(order: NewOrder, invoiceBuilder?: (invoiceNumber: string, issuedAt: string) => ReceiptData): Order {
  const db = getDb();
  let invoice: InvoiceSummary | undefined;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, customer_id, cart_id, store_id, store_name, tax_jurisdiction, status, currency,
         subtotal_minor, tax_minor, total_minor, payment_method, payment_status, payment_reference, card_brand, card_last4, placed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      order.orderId, order.customerId, order.cartId, order.storeId, order.storeName, order.taxJurisdiction, order.status, order.currency,
      order.subtotalMinor, order.taxMinor, order.totalMinor, order.payment.method, order.payment.status, order.payment.reference,
      order.payment.card?.brand ?? null, order.payment.card?.last4 ?? null, order.placedAt
    );

    const insertLine = db.prepare(
      `INSERT INTO order_lines (order_id, line_no, product_id, name, size_label, sold_by, quantity, unit_price_minor, net_minor,
         tax_code, tax_rate_bps, tax_minor, configuration_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of order.items) {
      insertLine.run(
        order.orderId, line.lineNo, line.productId, line.name, line.sizeLabel, line.soldBy, line.quantity, line.unitPriceMinor,
        line.netMinor, line.taxCode, line.taxRateBps, line.taxMinor, JSON.stringify(line.configuration)
      );
    }

    if (invoiceBuilder) invoice = issueInvoice(db, order, invoiceBuilder);
  })();

  return { ...order, invoice: invoice ?? null };
}

/** Moves a `payment_pending` order forward (or cancels it); issues the invoice if it became `placed`. */
export function resolvePendingOrder(
  orderId: string,
  patch: { status: OrderStatus; paymentStatus: PaymentStatus; paymentReference: string | null },
  invoiceBuilder?: (invoiceNumber: string, issuedAt: string) => ReceiptData
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, payment_status = ?, payment_reference = ? WHERE id = ?").run(
      patch.status, patch.paymentStatus, patch.paymentReference, orderId
    );
    if (patch.status === "placed" && invoiceBuilder) {
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow;
      issueInvoice(
        db,
        { orderId, customerId: row.customer_id, storeId: row.store_id, storeName: row.store_name, totalMinor: row.total_minor, currency: row.currency },
        invoiceBuilder
      );
    }
  })();
}

function load(row: OrderRow): Order {
  const db = getDb();
  const lines = db.prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY line_no").all(row.id) as LineRow[];
  return hydrate(row, lines, findInvoiceByOrder(db, row.id));
}

/** Owner-scoped: another customer's order id is indistinguishable from a nonexistent one. */
export function findOrder(customerId: string, orderId: string): Order | undefined {
  const row = getDb().prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?").get(orderId, customerId) as OrderRow | undefined;
  return row ? load(row) : undefined;
}

/** Internal / Admin look up by order id regardless of owner. */
export function findOrderById(orderId: string): Order | undefined {
  const row = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
  return row ? load(row) : undefined;
}

/** Updates fulfillment status across the lifecycle: placed -> packed -> ready -> collected. */
export function updateOrderStatus(orderId: string, status: OrderStatus): Order | undefined {
  const db = getDb();
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
  return findOrderById(orderId);
}

/** Newest first; cancelled (declined-after-3DS) orders are omitted from history. */
export function listOrders(customerId: string): Order[] {
  const rows = getDb()
    .prepare("SELECT * FROM orders WHERE customer_id = ? AND status <> 'cancelled' ORDER BY placed_at DESC, id DESC")
    .all(customerId) as OrderRow[];
  return rows.map(load);
}
