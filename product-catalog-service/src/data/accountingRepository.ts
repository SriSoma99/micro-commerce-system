import { getDb } from "../db/database";
import type {
  DailySalesSummary,
  MarginReport,
  MonthlyComparisonReport,
  MonthComparisonItem,
  PipelineMetrics,
  ProductVelocityItem,
  StoreRegionalBreakdown,
  TaxLiabilityLedger,
  VelocityReport,
  CategoryMarginItem,
  StoreMarginItem,
  StoreRegionalItem,
  StateRegionalItem,
  JurisdictionTaxItem,
  PipelineStageMetric,
  TransactionAuditItem,
  TransactionAuditResponse,
} from "../types/accounting";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatMonthName(yearMonth: string): string {
  const [year, monthStr] = yearMonth.split("-");
  const monthIdx = parseInt(monthStr || "1", 10) - 1;
  return `${MONTH_NAMES[monthIdx] || monthStr} ${year}`;
}

export const accountingRepository = {
  /** ACC-01: Daily sales summary with payment method breakdown */
  getDailySales(days = 30, storeId?: string): DailySalesSummary[] {
    const db = getDb();
    let query = `
      SELECT 
        substr(placed_at, 1, 10) AS date,
        COUNT(*) AS orderCount,
        SUM(subtotal_minor) AS netSalesMinor,
        SUM(tax_minor) AS taxMinor,
        SUM(total_minor) AS grossSalesMinor,
        payment_method AS paymentMethod,
        SUM(total_minor) AS paymentTotalMinor
      FROM orders
      WHERE status != 'cancelled'
    `;
    const params: (string | number)[] = [];

    if (storeId) {
      query += ` AND store_id = ? `;
      params.push(storeId);
    }

    query += `
      GROUP BY substr(placed_at, 1, 10), payment_method
      ORDER BY date DESC
      LIMIT ?
    `;
    params.push(days * 4);

    const rows = db.prepare(query).all(...params) as Array<{
      date: string;
      orderCount: number;
      netSalesMinor: number;
      taxMinor: number;
      grossSalesMinor: number;
      paymentMethod: string;
      paymentTotalMinor: number;
    }>;

    const grouped = new Map<string, DailySalesSummary>();

    for (const r of rows) {
      if (!grouped.has(r.date)) {
        grouped.set(r.date, {
          date: r.date,
          orderCount: 0,
          grossSalesMinor: 0,
          netSalesMinor: 0,
          taxMinor: 0,
          discountsMinor: 0,
          averageOrderValueMinor: 0,
          paymentBreakdown: {},
        });
      }

      const item = grouped.get(r.date)!;
      item.orderCount += r.orderCount;
      item.grossSalesMinor += r.grossSalesMinor;
      item.netSalesMinor += r.netSalesMinor;
      item.taxMinor += r.taxMinor;
      item.paymentBreakdown[r.paymentMethod] = {
        count: r.orderCount,
        totalMinor: r.paymentTotalMinor,
      };
    }

    const result: DailySalesSummary[] = [];
    for (const item of grouped.values()) {
      item.averageOrderValueMinor = item.orderCount > 0 ? Math.round(item.grossSalesMinor / item.orderCount) : 0;
      result.push(item);
    }

    return result.slice(0, days);
  },

  /** ACC-02: Pipeline volume across fulfilment states */
  getPipelineMetrics(storeId?: string): PipelineMetrics {
    const db = getDb();
    let query = `
      SELECT 
        status,
        COUNT(*) AS count,
        SUM(total_minor) AS totalMinor
      FROM orders
    `;
    const params: string[] = [];

    if (storeId) {
      query += ` WHERE store_id = ? `;
      params.push(storeId);
    }

    query += ` GROUP BY status `;

    const rows = db.prepare(query).all(...params) as Array<{
      status: string;
      count: number;
      totalMinor: number;
    }>;

    const defaultStages: Record<string, PipelineStageMetric> = {
      placed: { status: "placed", count: 0, totalMinor: 0 },
      packed: { status: "packed", count: 0, totalMinor: 0 },
      ready: { status: "ready", count: 0, totalMinor: 0 },
      collected: { status: "collected", count: 0, totalMinor: 0 },
      refunded: { status: "refunded", count: 0, totalMinor: 0 },
      cancelled: { status: "cancelled", count: 0, totalMinor: 0 },
    };

    let activeCount = 0;
    let activeValue = 0;
    let completedCount = 0;
    let completedValue = 0;
    let refundedCount = 0;
    let refundedValue = 0;

    for (const r of rows) {
      if (defaultStages[r.status]) {
        defaultStages[r.status] = {
          status: r.status as PipelineStageMetric["status"],
          count: r.count,
          totalMinor: r.totalMinor || 0,
        };
      }

      if (r.status === "placed" || r.status === "packed" || r.status === "ready") {
        activeCount += r.count;
        activeValue += r.totalMinor || 0;
      } else if (r.status === "collected") {
        completedCount += r.count;
        completedValue += r.totalMinor || 0;
      } else if (r.status === "refunded") {
        refundedCount += r.count;
        refundedValue += r.totalMinor || 0;
      }
    }

    return {
      stages: defaultStages,
      activeOrderCount: activeCount,
      activeOrderValueMinor: activeValue,
      completedCount,
      completedValueMinor: completedValue,
      refundedCount,
      refundedValueMinor: refundedValue,
    };
  },

  /** ACC-03: Month-over-month comparisons across 12 months */
  getMonthlyTrends(monthsCount = 12, storeId?: string): MonthlyComparisonReport {
    const db = getDb();
    let query = `
      SELECT 
        substr(placed_at, 1, 7) AS yearMonth,
        COUNT(*) AS orderCount,
        SUM(subtotal_minor) AS netRevenueMinor,
        SUM(tax_minor) AS taxMinor,
        SUM(total_minor) AS grossRevenueMinor
      FROM orders
      WHERE status != 'cancelled'
    `;
    const params: (string | number)[] = [];

    if (storeId) {
      query += ` AND store_id = ? `;
      params.push(storeId);
    }

    query += `
      GROUP BY substr(placed_at, 1, 7)
      ORDER BY yearMonth ASC
    `;

    const rows = db.prepare(query).all(...params) as Array<{
      yearMonth: string;
      orderCount: number;
      netRevenueMinor: number;
      taxMinor: number;
      grossRevenueMinor: number;
    }>;

    const months: MonthComparisonItem[] = [];
    let prevRevenue: number | null = null;
    let total12Month = 0;

    for (const r of rows) {
      const growth = prevRevenue != null && prevRevenue > 0
        ? Math.round(((r.grossRevenueMinor - prevRevenue) / prevRevenue) * 1000) / 10
        : null;

      months.push({
        yearMonth: r.yearMonth,
        monthName: formatMonthName(r.yearMonth),
        orderCount: r.orderCount,
        grossRevenueMinor: r.grossRevenueMinor,
        netRevenueMinor: r.netRevenueMinor,
        taxMinor: r.taxMinor,
        averageOrderValueMinor: r.orderCount > 0 ? Math.round(r.grossRevenueMinor / r.orderCount) : 0,
        revenueGrowthPercent: growth,
      });

      prevRevenue = r.grossRevenueMinor;
      total12Month += r.grossRevenueMinor;
    }

    const trimmed = months.slice(-monthsCount);
    const avg = trimmed.length > 0 ? Math.round(total12Month / trimmed.length) : 0;

    return {
      months: trimmed,
      total12MonthRevenueMinor: total12Month,
      averageMonthlyRevenueMinor: avg,
    };
  },

  /** ACC-04: Fast, slow, dead stock velocity and near-expiry goods */
  getProductVelocity(storeId?: string): VelocityReport {
    const db = getDb();

    // 30 days cutoff
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const query = `
      SELECT 
        p.id AS productId,
        p.name AS name,
        p.category AS category,
        p.subcategory_name AS department,
        p.price_minor AS priceMinor,
        COALESCE(sales.unitsSold, 0) AS unitsSold30d,
        COALESCE(sales.revenueMinor, 0) AS revenue30dMinor,
        COALESCE(inv.stock, 25) AS currentStock,
        COALESCE(inv.unit_cost_minor, ROUND(p.price_minor * 0.65)) AS wacCostMinor,
        exp.earliestExpiryDate AS earliestExpiryDate
      FROM products p
      LEFT JOIN (
        SELECT 
          ol.product_id,
          SUM(ol.quantity) AS unitsSold,
          SUM(ol.net_minor) AS revenueMinor
        FROM order_lines ol
        JOIN orders o ON ol.order_id = o.id
        WHERE o.placed_at >= ? AND o.status != 'cancelled'
        ${storeId ? "AND o.store_id = ?" : ""}
        GROUP BY ol.product_id
      ) sales ON p.id = sales.product_id
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(stock) AS stock,
          AVG(unit_cost_minor) AS unit_cost_minor
        FROM store_inventory
        ${storeId ? "WHERE store_id = ?" : ""}
        GROUP BY product_id
      ) inv ON p.id = inv.product_id
      LEFT JOIN (
        SELECT 
          product_id,
          MIN(expiry_date) AS earliestExpiryDate
        FROM goods_receipt_items
        GROUP BY product_id
      ) exp ON p.id = exp.product_id
      ORDER BY unitsSold30d DESC
    `;

    const params: string[] = [cutoff30d];
    if (storeId) params.push(storeId);
    if (storeId) params.push(storeId);

    const rows = db.prepare(query).all(...params) as Array<{
      productId: string;
      name: string;
      category: string;
      department: string;
      unitsSold30d: number;
      revenue30dMinor: number;
      currentStock: number;
      wacCostMinor: number;
      earliestExpiryDate: string | null;
    }>;

    const fastMoving: ProductVelocityItem[] = [];
    const slowMoving: ProductVelocityItem[] = [];
    const deadStock: ProductVelocityItem[] = [];
    const nearExpiryItems: ProductVelocityItem[] = [];

    const nowIso = new Date().toISOString().slice(0, 10);
    const next30dIso = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    for (const r of rows) {
      let velocity: "fast" | "moderate" | "slow" | "dead" = "moderate";
      if (r.unitsSold30d >= 10) {
        velocity = "fast";
      } else if (r.unitsSold30d >= 3) {
        velocity = "moderate";
      } else if (r.unitsSold30d >= 1) {
        velocity = "slow";
      } else {
        velocity = "dead";
      }

      const isNearExpiry = r.earliestExpiryDate != null && r.earliestExpiryDate >= nowIso && r.earliestExpiryDate <= next30dIso;

      const item: ProductVelocityItem = {
        productId: r.productId,
        name: r.name,
        category: r.category || "General",
        department: r.department || "Grocery",
        unitsSold30d: r.unitsSold30d,
        revenue30dMinor: r.revenue30dMinor,
        currentStock: r.currentStock,
        wacCostMinor: Math.round(r.wacCostMinor),
        velocity,
        isNearExpiry,
        earliestExpiryDate: r.earliestExpiryDate,
      };

      if (velocity === "fast") fastMoving.push(item);
      else if (velocity === "slow") slowMoving.push(item);
      else if (velocity === "dead") deadStock.push(item);

      if (isNearExpiry) nearExpiryItems.push(item);
    }

    return {
      fastMoving: fastMoving.slice(0, 20),
      slowMoving: slowMoving.slice(0, 20),
      deadStock: deadStock.slice(0, 20),
      nearExpiryItems: nearExpiryItems.slice(0, 20),
      totalSkusTracked: rows.length,
    };
  },

  /** ACC-05: Gross Margins by Product Category & Store */
  getGrossMargins(storeId?: string): MarginReport {
    const db = getDb();

    let query = `
      SELECT 
        p.category AS category,
        o.store_id AS storeId,
        o.store_name AS storeName,
        o.tax_jurisdiction AS state,
        SUM(ol.net_minor) AS revenueMinor,
        SUM(ol.quantity * COALESCE(si.unit_cost_minor, ROUND(ol.unit_price_minor * 0.65))) AS cogsMinor
      FROM order_lines ol
      JOIN orders o ON ol.order_id = o.id
      JOIN products p ON ol.product_id = p.id
      LEFT JOIN store_inventory si ON o.store_id = si.store_id AND ol.product_id = si.product_id
      WHERE o.status != 'cancelled'
    `;
    const params: string[] = [];

    if (storeId) {
      query += ` AND o.store_id = ? `;
      params.push(storeId);
    }

    query += ` GROUP BY p.category, o.store_id `;

    const rows = db.prepare(query).all(...params) as Array<{
      category: string;
      storeId: string;
      storeName: string;
      state: string;
      revenueMinor: number;
      cogsMinor: number;
    }>;

    let overallRevenue = 0;
    let overallCogs = 0;

    const catMap = new Map<string, { revenue: number; cogs: number }>();
    const storeMap = new Map<string, { storeName: string; state: string; revenue: number; cogs: number }>();

    for (const r of rows) {
      overallRevenue += r.revenueMinor;
      overallCogs += r.cogsMinor;

      // Category map
      const catKey = r.category || "General";
      const catEntry = catMap.get(catKey) || { revenue: 0, cogs: 0 };
      catEntry.revenue += r.revenueMinor;
      catEntry.cogs += r.cogsMinor;
      catMap.set(catKey, catEntry);

      // Store map
      const storeEntry = storeMap.get(r.storeId) || { storeName: r.storeName, state: r.state, revenue: 0, cogs: 0 };
      storeEntry.revenue += r.revenueMinor;
      storeEntry.cogs += r.cogsMinor;
      storeMap.set(r.storeId, storeEntry);
    }

    const categories: CategoryMarginItem[] = [];
    for (const [cat, data] of catMap.entries()) {
      const profit = data.revenue - data.cogs;
      const marginPct = data.revenue > 0 ? Math.round((profit / data.revenue) * 1000) / 10 : 0;
      categories.push({
        category: cat,
        revenueMinor: data.revenue,
        cogsMinor: data.cogs,
        grossProfitMinor: profit,
        marginPercent: marginPct,
      });
    }

    const stores: StoreMarginItem[] = [];
    for (const [sId, data] of storeMap.entries()) {
      const profit = data.revenue - data.cogs;
      const marginPct = data.revenue > 0 ? Math.round((profit / data.revenue) * 1000) / 10 : 0;
      stores.push({
        storeId: sId,
        storeName: data.storeName,
        state: data.state,
        revenueMinor: data.revenue,
        cogsMinor: data.cogs,
        grossProfitMinor: profit,
        marginPercent: marginPct,
      });
    }

    const overallProfit = overallRevenue - overallCogs;
    const overallMarginPct = overallRevenue > 0 ? Math.round((overallProfit / overallRevenue) * 1000) / 10 : 0;

    return {
      grossRevenueMinor: overallRevenue,
      cogsMinor: overallCogs,
      grossProfitMinor: overallProfit,
      grossMarginPercent: overallMarginPct,
      categories: categories.sort((a, b) => b.revenueMinor - a.revenueMinor),
      stores: stores.sort((a, b) => b.revenueMinor - a.revenueMinor),
    };
  },

  /** ACC-06: Breakdown by Store and State */
  getStoreRegionalBreakdown(): StoreRegionalBreakdown {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        store_id AS storeId,
        store_name AS storeName,
        tax_jurisdiction AS state,
        COUNT(*) AS orderCount,
        SUM(subtotal_minor) AS revenueMinor,
        SUM(tax_minor) AS taxMinor
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY store_id
      ORDER BY revenueMinor DESC
    `).all() as Array<{
      storeId: string;
      storeName: string;
      state: string;
      orderCount: number;
      revenueMinor: number;
      taxMinor: number;
    }>;

    let totalRevenue = 0;
    let totalOrders = 0;

    for (const r of rows) {
      totalRevenue += r.revenueMinor;
      totalOrders += r.orderCount;
    }

    const stores: StoreRegionalItem[] = rows.map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      state: r.state,
      orderCount: r.orderCount,
      revenueMinor: r.revenueMinor,
      taxMinor: r.taxMinor,
      shareOfTotalPercent: totalRevenue > 0 ? Math.round((r.revenueMinor / totalRevenue) * 1000) / 10 : 0,
    }));

    const stateMap = new Map<string, { orderCount: number; revenueMinor: number; taxMinor: number }>();
    for (const r of rows) {
      const entry = stateMap.get(r.state) || { orderCount: 0, revenueMinor: 0, taxMinor: 0 };
      entry.orderCount += r.orderCount;
      entry.revenueMinor += r.revenueMinor;
      entry.taxMinor += r.taxMinor;
      stateMap.set(r.state, entry);
    }

    const states: StateRegionalItem[] = [];
    for (const [st, data] of stateMap.entries()) {
      states.push({
        state: st,
        orderCount: data.orderCount,
        revenueMinor: data.revenueMinor,
        taxMinor: data.taxMinor,
        shareOfTotalPercent: totalRevenue > 0 ? Math.round((data.revenueMinor / totalRevenue) * 1000) / 10 : 0,
      });
    }

    return {
      stores,
      states: states.sort((a, b) => b.revenueMinor - a.revenueMinor),
      totalRevenueMinor: totalRevenue,
      totalOrders,
    };
  },

  /** ACC-07: Sales tax collected ledger by jurisdiction */
  getTaxLiabilityLedger(): TaxLiabilityLedger {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        tax_jurisdiction AS jurisdiction,
        tax_jurisdiction AS state,
        COUNT(*) AS orderCount,
        SUM(subtotal_minor) AS taxableSalesMinor,
        SUM(tax_minor) AS taxCollectedMinor
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY tax_jurisdiction
      ORDER BY taxCollectedMinor DESC
    `).all() as Array<{
      jurisdiction: string;
      state: string;
      orderCount: number;
      taxableSalesMinor: number;
      taxCollectedMinor: number;
    }>;

    let totalTax = 0;
    let totalTaxable = 0;

    const jurisdictions: JurisdictionTaxItem[] = rows.map((r) => {
      totalTax += r.taxCollectedMinor;
      totalTaxable += r.taxableSalesMinor;
      const rateBps = r.taxableSalesMinor > 0 ? Math.round((r.taxCollectedMinor / r.taxableSalesMinor) * 10000) : 0;
      return {
        jurisdiction: r.jurisdiction,
        state: r.state,
        orderCount: r.orderCount,
        taxableSalesMinor: r.taxableSalesMinor,
        taxCollectedMinor: r.taxCollectedMinor,
        effectiveTaxRateBps: rateBps,
      };
    });

    return {
      totalTaxCollectedMinor: totalTax,
      totalTaxableSalesMinor: totalTaxable,
      jurisdictions,
    };
  },

  /** ACC-08: Detailed payment & transaction audit logs for finance officers */
  getTransactionAuditLogs(options?: {
    limit?: number;
    offset?: number;
    storeId?: string;
    paymentMethod?: string;
    status?: string;
    search?: string;
  }): TransactionAuditResponse {
    const db = getDb();
    const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
    const offset = Math.max(Number(options?.offset) || 0, 0);

    let whereClause = "WHERE 1=1";
    const params: (string | number)[] = [];

    if (options?.storeId) {
      whereClause += " AND o.store_id = ?";
      params.push(options.storeId);
    }
    if (options?.paymentMethod) {
      whereClause += " AND o.payment_method = ?";
      params.push(options.paymentMethod);
    }
    if (options?.status) {
      whereClause += " AND o.status = ?";
      params.push(options.status);
    }
    if (options?.search) {
      whereClause += " AND (o.id LIKE ? OR c.name LIKE ? OR c.email LIKE ? OR o.card_last4 LIKE ? OR o.payment_reference LIKE ?)";
      const term = `%${options.search}%`;
      params.push(term, term, term, term, term);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `;
    const countRow = db.prepare(countQuery).get(...params) as { total: number };
    const totalCount = countRow ? countRow.total : 0;

    const dataQuery = `
      SELECT 
        o.id AS orderId,
        o.placed_at AS placedAt,
        o.customer_id AS customerId,
        COALESCE(c.name, 'Guest Customer') AS customerName,
        COALESCE(c.email, 'guest@example.com') AS customerEmail,
        o.store_id AS storeId,
        o.store_name AS storeName,
        o.status AS status,
        o.payment_method AS paymentMethod,
        o.payment_status AS paymentStatus,
        o.payment_reference AS paymentReference,
        o.card_brand AS cardBrand,
        o.card_last4 AS cardLast4,
        o.subtotal_minor AS subtotalMinor,
        o.tax_minor AS taxMinor,
        o.total_minor AS totalMinor,
        o.currency AS currency
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      ORDER BY o.placed_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limit, offset) as TransactionAuditItem[];

    return {
      transactions: rows,
      totalCount,
      limit,
      offset,
    };
  },
};
