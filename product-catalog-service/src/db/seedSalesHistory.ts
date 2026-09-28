import type Database from "better-sqlite3";

const STORES = [
  { id: "IL-01", name: "Batavia Flagship", taxJurisdiction: "IL", taxRateBps: 625 },
  { id: "OH-01", name: "Short North Express", taxJurisdiction: "OH", taxRateBps: 575 },
  { id: "PA-01", name: "Steel City Market", taxJurisdiction: "PA", taxRateBps: 700 },
];

const PAYMENT_METHODS = ["card-mock", "ebt-mock", "pay-at-pickup"];
const CARD_BRANDS = ["visa", "mastercard", "amex", "discover"];

const RATES_BPS: Record<string, Record<string, number>> = {
  IL: { grocery: 100, "prepared-food": 625, candy: 625, "soft-drink": 625, alcohol: 625, general: 625 },
  OH: { grocery: 0, "prepared-food": 575, candy: 575, "soft-drink": 575, alcohol: 575, general: 575 },
  PA: { grocery: 0, "prepared-food": 600, candy: 600, "soft-drink": 600, alcohol: 600, general: 600 },
};

interface ProductSummary {
  id: string;
  name: string;
  priceMinor: number;
  sizeLabel: string;
  soldBy: string;
  taxCode: string;
  categoryName: string;
}

/**
 * Seeds ~12 months of deterministic historical sales, orders, and invoices
 * so accounting dashboards and ledger reports have realistic monthly and daily shapes. (DATA-03 / WS H)
 */
export function seedSalesHistory(db: Database.Database): number {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };
  if (count > 10) return 0; // Don't re-seed if orders already exist

  const products = db.prepare(
    "SELECT id, name, price_minor AS priceMinor, size_label AS sizeLabel, sold_by AS soldBy, tax_code AS taxCode, category AS categoryName FROM products LIMIT 200"
  ).all() as ProductSummary[];

  if (products.length === 0) return 0;

  const customers = db.prepare("SELECT id, name, email FROM customers LIMIT 20").all() as Array<{ id: string; name: string; email: string }>;
  if (customers.length === 0) return 0;

  const now = new Date("2026-09-20T12:00:00.000Z");
  const ONE_DAY_MS = 86_400_000;

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, customer_id, cart_id, store_id, store_name, tax_jurisdiction,
      status, currency, subtotal_minor, tax_minor, total_minor,
      payment_method, payment_status, payment_reference, card_brand, card_last4, placed_at
    ) VALUES (
      @id, @customerId, @cartId, @storeId, @storeName, @taxJurisdiction,
      @status, 'USD', @subtotalMinor, @taxMinor, @totalMinor,
      @paymentMethod, @paymentStatus, @paymentReference, @cardBrand, @cardLast4, @placedAt
    )
  `);

  const insertOrderLine = db.prepare(`
    INSERT INTO order_lines (
      order_id, line_no, product_id, name, size_label, sold_by,
      quantity, unit_price_minor, net_minor, tax_code, tax_rate_bps, tax_minor, configuration_json
    ) VALUES (
      @orderId, @lineNo, @productId, @name, @sizeLabel, @soldBy,
      @quantity, @unitPriceMinor, @netMinor, @taxCode, @taxRateBps, @taxMinor, '{}'
    )
  `);

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      id, number, order_id, customer_id, store_id, store_name,
      total_minor, currency, issued_at, snapshot_json
    ) VALUES (
      @id, @number, @orderId, @customerId, @storeId, @storeName,
      @totalMinor, 'USD', @issuedAt, @snapshotJson
    )
  `);

  const invoiceSeq: Record<string, number> = { "IL-01": 100, "OH-01": 100, "PA-01": 100 };

  let totalOrdersCreated = 0;

  db.transaction(() => {
    // Generate ~12 months (360 days) of transactions
    for (let dayOffset = 360; dayOffset >= 0; dayOffset--) {
      const dayDate = new Date(now.getTime() - dayOffset * ONE_DAY_MS);
      const isWeekend = dayDate.getUTCDay() === 0 || dayDate.getUTCDay() === 6;
      // 2 to 4 orders on weekdays, 4 to 7 on weekends
      const ordersForDay = isWeekend ? 4 + (dayOffset % 4) : 2 + (dayOffset % 3);

      for (let o = 0; o < ordersForDay; o++) {
        const store = STORES[(dayOffset + o) % STORES.length]!;
        const customer = customers[(dayOffset * 3 + o) % customers.length]!;
        const orderId = `ord_hist_${dayOffset}_${o}`;
        const invoiceId = `inv_hist_${dayOffset}_${o}`;

        // Hourly placement time
        const hour = 8 + ((o * 3 + dayOffset) % 12);
        const minute = (o * 17 + dayOffset * 7) % 60;
        dayDate.setUTCHours(hour, minute, 0, 0);
        const placedAt = dayDate.toISOString();

        // Historical orders are mostly 'collected', very recent can be pipeline stages
        let status = "collected";
        if (dayOffset === 0) {
          status = o === 0 ? "placed" : o === 1 ? "packed" : "ready";
        } else if (dayOffset <= 3 && o % 5 === 0) {
          status = "ready";
        } else if (dayOffset % 19 === 0 && o === 0) {
          status = "refunded";
        }

        const paymentMethod = PAYMENT_METHODS[(dayOffset + o) % PAYMENT_METHODS.length]!;
        const cardBrand = paymentMethod === "card-mock" ? CARD_BRANDS[(dayOffset + o) % CARD_BRANDS.length] : null;
        const cardLast4 = paymentMethod === "card-mock" ? String(1000 + ((dayOffset * 13 + o) % 9000)) : null;

        // Select 2 to 5 line items
        const numItems = 2 + ((dayOffset + o) % 4);
        let subtotalMinor = 0;
        let taxMinor = 0;
        const lineItemsToInsert: Array<{
          lineNo: number;
          productId: string;
          name: string;
          sizeLabel: string;
          soldBy: string;
          quantity: number;
          unitPriceMinor: number;
          netMinor: number;
          taxCode: string;
          taxRateBps: number;
          taxMinor: number;
        }> = [];
        const lineSnapshots: Array<Record<string, unknown>> = [];

        for (let l = 0; l < numItems; l++) {
          const prodIdx = (dayOffset * 7 + o * 11 + l * 13) % products.length;
          const prod = products[prodIdx]!;
          const qty = 1 + ((dayOffset + l) % 3);
          const netMinor = prod.priceMinor * qty;
          const jurisdictionRates = RATES_BPS[store.taxJurisdiction] || {};
          const itemRateBps = jurisdictionRates[prod.taxCode] ?? (store.taxJurisdiction === "IL" ? 100 : 600);
          const itemTax = Math.round((netMinor * itemRateBps) / 10000);

          subtotalMinor += netMinor;
          taxMinor += itemTax;

          lineItemsToInsert.push({
            lineNo: l + 1,
            productId: prod.id,
            name: prod.name,
            sizeLabel: prod.sizeLabel,
            soldBy: prod.soldBy,
            quantity: qty,
            unitPriceMinor: prod.priceMinor,
            netMinor,
            taxCode: prod.taxCode,
            taxRateBps: itemRateBps,
            taxMinor: itemTax,
          });

          lineSnapshots.push({
            productId: prod.id,
            name: prod.name,
            quantity: qty,
            unitPriceMinor: prod.priceMinor,
            netMinor,
            taxMinor: itemTax,
          });
        }

        const totalMinor = subtotalMinor + taxMinor;

        insertOrder.run({
          id: orderId,
          customerId: customer.id,
          cartId: `cart_hist_${dayOffset}_${o}`,
          storeId: store.id,
          storeName: store.name,
          taxJurisdiction: store.taxJurisdiction,
          status,
          subtotalMinor,
          taxMinor,
          totalMinor,
          paymentMethod,
          paymentStatus: status === "refunded" ? "refunded" : "paid",
          paymentReference: `ch_hist_${dayOffset}_${o}`,
          cardBrand,
          cardLast4,
          placedAt,
        });

        for (const item of lineItemsToInsert) {
          insertOrderLine.run({
            orderId,
            lineNo: item.lineNo,
            productId: item.productId,
            name: item.name,
            sizeLabel: item.sizeLabel,
            soldBy: item.soldBy,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            netMinor: item.netMinor,
            taxCode: item.taxCode,
            taxRateBps: item.taxRateBps,
            taxMinor: item.taxMinor,
          });
        }

        // Insert matching invoice for completed / delivered / historical orders
        if (status !== "cancelled") {
          invoiceSeq[store.id] = (invoiceSeq[store.id] || 100) + 1;
          const invNumber = `INV-${store.id}-${String(invoiceSeq[store.id]).padStart(5, "0")}`;

          const lineReceiptItems = lineItemsToInsert.map((item) => ({
            lineNo: item.lineNo,
            productId: item.productId,
            name: item.name,
            sizeLabel: item.sizeLabel,
            soldBy: (item.soldBy === "weight" ? "weight" : "each") as "each" | "weight",
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            netMinor: item.netMinor,
            taxCode: item.taxCode,
            taxRateBps: item.taxRateBps,
            taxMinor: item.taxMinor,
            configuration: {},
          }));

          const byRate = new Map<number, { netMinor: number; taxMinor: number }>();
          for (const item of lineItemsToInsert) {
            const group = byRate.get(item.taxRateBps) ?? { netMinor: 0, taxMinor: 0 };
            group.netMinor += item.netMinor;
            group.taxMinor += item.taxMinor;
            byRate.set(item.taxRateBps, group);
          }

          insertInvoice.run({
            id: invoiceId,
            number: invNumber,
            orderId,
            customerId: customer.id,
            storeId: store.id,
            storeName: store.name,
            totalMinor,
            issuedAt: placedAt,
            snapshotJson: JSON.stringify({
              invoiceNumber: invNumber,
              issuedAt: placedAt,
              orderId,
              store: { id: store.id, name: store.name, jurisdiction: store.taxJurisdiction },
              customer: { id: customer.id, name: customer.name, email: customer.email },
              currency: "USD",
              locale: "en-US",
              priceMode: "tax_exclusive",
              lines: lineReceiptItems,
              totals: { subtotalMinor, taxMinor, totalMinor },
              taxSummary: [...byRate.entries()].filter(([rateBps]) => rateBps > 0).sort(([a], [b]) => a - b).map(([rateBps, sums]) => ({ rateBps, ...sums })),
              payment: {
                methodId: paymentMethod,
                methodName: paymentMethod === "card-mock" ? "Credit Card" : paymentMethod === "ebt-mock" ? "SNAP / EBT" : "Pay at Pickup",
                status: status === "refunded" ? "refunded" : "captured",
                reference: `ch_hist_${dayOffset}_${o}`,
                simulated: true,
                ...(cardBrand && cardLast4 ? { card: { brand: cardBrand, last4: cardLast4 } } : {}),
              },
            }),
          });
        }

        totalOrdersCreated++;
      }
    }
  })();

  return totalOrdersCreated;
}
