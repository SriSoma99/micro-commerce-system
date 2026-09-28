import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "../db/database";
import { ReceiptData } from "../platform/types";
import { InvoiceSummary } from "../types/order";

interface InvoiceRow {
  id: string;
  number: string;
  order_id: string;
  store_id: string;
  store_name: string;
  total_minor: number;
  currency: string;
  issued_at: string;
  snapshot_json: string;
}

const toSummary = (row: InvoiceRow): InvoiceSummary => ({
  id: row.id,
  number: row.number,
  orderId: row.order_id,
  storeId: row.store_id,
  storeName: row.store_name,
  totalMinor: row.total_minor,
  currency: row.currency,
  issuedAt: row.issued_at,
});

/**
 * Issues the invoice for an order. MUST run inside the caller's transaction:
 * the store's next sequential number is taken and the invoice row written
 * together with the order, so there are never gaps in the numbering.
 */
export function issueInvoice(
  db: Database.Database,
  order: { orderId: string; customerId: string; storeId: string; storeName: string; totalMinor: number; currency: string },
  buildSnapshot: (invoiceNumber: string, issuedAt: string) => ReceiptData
): InvoiceSummary {
  const { last_number } = db
    .prepare(
      `INSERT INTO invoice_sequences (store_id, last_number) VALUES (?, 1)
       ON CONFLICT(store_id) DO UPDATE SET last_number = last_number + 1
       RETURNING last_number`
    )
    .get(order.storeId) as { last_number: number };

  const number = `${order.storeId}-${String(last_number).padStart(6, "0")}`;
  const issuedAt = new Date().toISOString();
  const snapshot = buildSnapshot(number, issuedAt);
  const id = `inv_${randomUUID()}`;

  db.prepare(
    `INSERT INTO invoices (id, number, order_id, customer_id, store_id, store_name, total_minor, currency, issued_at, snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, number, order.orderId, order.customerId, order.storeId, order.storeName, order.totalMinor, order.currency, issuedAt, JSON.stringify(snapshot));

  return { id, number, orderId: order.orderId, storeId: order.storeId, storeName: order.storeName, totalMinor: order.totalMinor, currency: order.currency, issuedAt };
}

function normalizeReceiptSnapshot(raw: any, row: InvoiceRow): ReceiptData {
  if (raw && raw.lines && Array.isArray(raw.lines) && raw.totals && raw.payment && raw.store && raw.customer) {
    return raw as ReceiptData;
  }

  const items = Array.isArray(raw?.lines) ? raw.lines : Array.isArray(raw?.items) ? raw.items : [];
  const lines: ReceiptData["lines"] = items.map((item: any, idx: number) => ({
    lineNo: item.lineNo ?? idx + 1,
    productId: item.productId ?? `prod_${idx + 1}`,
    name: item.name ?? "Item",
    sizeLabel: item.sizeLabel ?? "1 ea",
    soldBy: (item.soldBy === "weight" ? "weight" : "each") as "each" | "weight",
    quantity: item.quantity ?? 1,
    unitPriceMinor: item.unitPriceMinor ?? item.netMinor ?? 0,
    netMinor: item.netMinor ?? 0,
    taxCode: item.taxCode ?? "general",
    taxRateBps: item.taxRateBps ?? (item.taxMinor && item.netMinor ? Math.round((item.taxMinor / item.netMinor) * 10000) : 0),
    taxMinor: item.taxMinor ?? 0,
    configuration: item.configuration ?? {},
  }));

  const subtotalMinor = raw?.totals?.subtotalMinor ?? raw?.subtotalMinor ?? row.total_minor;
  const taxMinor = raw?.totals?.taxMinor ?? raw?.taxMinor ?? 0;
  const totalMinor = raw?.totals?.totalMinor ?? raw?.totalMinor ?? row.total_minor;

  const byRate = new Map<number, { netMinor: number; taxMinor: number }>();
  for (const line of lines) {
    if (line.taxRateBps > 0) {
      const g = byRate.get(line.taxRateBps) ?? { netMinor: 0, taxMinor: 0 };
      g.netMinor += line.netMinor;
      g.taxMinor += line.taxMinor;
      byRate.set(line.taxRateBps, g);
    }
  }

  const taxSummary = raw?.taxSummary ?? [...byRate.entries()].map(([rateBps, sums]) => ({ rateBps, ...sums }));

  const storeId = raw?.store?.id ?? row.store_id;
  const storeName = raw?.store?.name ?? raw?.storeName ?? row.store_name;
  const jurisdiction = raw?.store?.jurisdiction ?? raw?.taxJurisdiction ?? storeId.slice(0, 2);

  return {
    invoiceNumber: raw?.invoiceNumber ?? row.number,
    issuedAt: raw?.issuedAt ?? row.issued_at,
    orderId: raw?.orderId ?? row.order_id,
    store: { id: storeId, name: storeName, jurisdiction },
    customer: {
      id: raw?.customer?.id ?? raw?.customerId ?? "cust_guest",
      name: raw?.customer?.name ?? raw?.customerName ?? "Valued Customer",
      email: raw?.customer?.email ?? raw?.customerEmail ?? "customer@example.com",
    },
    currency: raw?.currency ?? row.currency ?? "USD",
    locale: raw?.locale ?? "en-US",
    priceMode: raw?.priceMode ?? "tax_exclusive",
    lines,
    totals: { subtotalMinor, taxMinor, totalMinor },
    taxSummary,
    payment: {
      methodId: raw?.payment?.methodId ?? "card-mock",
      methodName: raw?.payment?.methodName ?? "Credit Card",
      status: raw?.payment?.status ?? "captured",
      reference: raw?.payment?.reference ?? row.order_id,
      simulated: raw?.payment?.simulated ?? true,
      ...(raw?.payment?.card ? { card: raw?.payment.card } : {}),
    },
  };
}

/** Newest first. Scoped to the owner unless staff role. */
export function listInvoices(customerId: string, isStaff = false): InvoiceSummary[] {
  const rows = isStaff
    ? (getDb().prepare("SELECT * FROM invoices ORDER BY issued_at DESC, number DESC LIMIT 100").all() as InvoiceRow[])
    : (getDb()
        .prepare("SELECT * FROM invoices WHERE customer_id = ? ORDER BY issued_at DESC, number DESC")
        .all(customerId) as InvoiceRow[]);
  return rows.map(toSummary);
}

/** Owner-scoped for shoppers; staff (admin, finance, manager) can view any invoice. */
export function findInvoice(
  customerId: string,
  invoiceId: string,
  isStaff = false
): { summary: InvoiceSummary; snapshot: ReceiptData } | undefined {
  const row = isStaff
    ? (getDb().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as InvoiceRow | undefined)
    : (getDb().prepare("SELECT * FROM invoices WHERE id = ? AND customer_id = ?").get(invoiceId, customerId) as InvoiceRow | undefined);
  if (!row) return undefined;

  let rawSnapshot: any = {};
  try {
    rawSnapshot = JSON.parse(row.snapshot_json);
  } catch {
    rawSnapshot = {};
  }

  return { summary: toSummary(row), snapshot: normalizeReceiptSnapshot(rawSnapshot, row) };
}

export function findInvoiceByOrder(db: Database.Database, orderId: string): InvoiceSummary | undefined {
  const row = db.prepare("SELECT * FROM invoices WHERE order_id = ?").get(orderId) as InvoiceRow | undefined;
  return row ? toSummary(row) : undefined;
}
