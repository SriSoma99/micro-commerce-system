import { getDb } from "../db/database";
import { warmCatalogSnapshot } from "./productRepository";
import { StoreInventoryRecord } from "../types/receiving";

interface RawInventoryRow {
  store_id: string;
  product_id: string;
  product_name: string;
  brand: string;
  department: string;
  stock: number;
  reserved: number;
  unit_cost_minor: number;
  low_stock_threshold: number;
  updated_at: string;
}

export const inventoryRepository = {
  getStoreInventory(storeId: string): StoreInventoryRecord[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT 
          COALESCE(si.store_id, ?) AS store_id,
          p.id AS product_id,
          p.name AS product_name,
          p.brand,
          p.category AS department,
          COALESCE(si.stock, p.stock) AS stock,
          COALESCE(si.reserved, 0) AS reserved,
          COALESCE(si.unit_cost_minor, CAST(p.price_minor * 0.6 AS INTEGER)) AS unit_cost_minor,
          COALESCE(si.low_stock_threshold, 10) AS low_stock_threshold,
          COALESCE(si.updated_at, datetime('now')) AS updated_at
        FROM products p
        LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?
        ORDER BY p.name ASC
        `
      )
      .all(storeId, storeId) as RawInventoryRow[];

    return rows.map((r) => {
      const available = Math.max(0, r.stock - r.reserved);
      return {
        storeId: r.store_id,
        productId: r.product_id,
        productName: r.product_name,
        brand: r.brand,
        department: r.department,
        stock: r.stock,
        reserved: r.reserved,
        available,
        unitCostMinor: r.unit_cost_minor,
        lowStockThreshold: r.low_stock_threshold,
        isLowStock: available <= r.low_stock_threshold,
        updatedAt: r.updated_at,
      };
    });
  },

  getInventoryRecord(storeId: string, productId: string): StoreInventoryRecord | null {
    const db = getDb();
    const row = db
      .prepare(
        `
        SELECT 
          COALESCE(si.store_id, ?) AS store_id,
          p.id AS product_id,
          p.name AS product_name,
          p.brand,
          p.category AS department,
          COALESCE(si.stock, p.stock) AS stock,
          COALESCE(si.reserved, 0) AS reserved,
          COALESCE(si.unit_cost_minor, CAST(p.price_minor * 0.6 AS INTEGER)) AS unit_cost_minor,
          COALESCE(si.low_stock_threshold, 10) AS low_stock_threshold,
          COALESCE(si.updated_at, datetime('now')) AS updated_at
        FROM products p
        LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?
        WHERE p.id = ?
        `
      )
      .get(storeId, storeId, productId) as RawInventoryRow | undefined;

    if (!row) return null;
    const available = Math.max(0, row.stock - row.reserved);
    return {
      storeId: row.store_id,
      productId: row.product_id,
      productName: row.product_name,
      brand: row.brand,
      department: row.department,
      stock: row.stock,
      reserved: row.reserved,
      available,
      unitCostMinor: row.unit_cost_minor,
      lowStockThreshold: row.low_stock_threshold,
      isLowStock: available <= row.low_stock_threshold,
      updatedAt: row.updated_at,
    };
  },

  /**
   * Atomically checks available stock for all items in cart at storeId,
   * and decrements store_inventory.stock as well as products.stock.
   */
  checkAndDecrementStock(
    storeId: string,
    items: Array<{ productId: string; quantity: number }>
  ): { ok: true } | { ok: false; outOfStockProduct: string; available: number } {
    const db = getDb();
    const now = new Date().toISOString();

    const result = db.transaction(() => {
      // 1. Verify availability for all items first
      for (const item of items) {
        const row = db
          .prepare(
            `SELECT COALESCE(si.stock, p.stock) AS stock, COALESCE(si.reserved, 0) AS reserved, p.name
             FROM products p
             LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?
             WHERE p.id = ?`
          )
          .get(storeId, item.productId) as { stock: number; reserved: number; name: string } | undefined;

        if (!row) {
          return { ok: false as const, outOfStockProduct: item.productId, available: 0 };
        }

        const available = row.stock - row.reserved;
        if (available < item.quantity) {
          return { ok: false as const, outOfStockProduct: row.name || item.productId, available };
        }
      }

      // 2. Decrement store inventory and product stock
      for (const item of items) {
        const existing = db
          .prepare("SELECT stock FROM store_inventory WHERE store_id = ? AND product_id = ?")
          .get(storeId, item.productId) as { stock: number } | undefined;

        if (existing) {
          db.prepare(
            `UPDATE store_inventory 
             SET stock = MAX(0, stock - ?), updated_at = ? 
             WHERE store_id = ? AND product_id = ?`
          ).run(item.quantity, now, storeId, item.productId);
        } else {
          const prod = db.prepare("SELECT stock, price_minor FROM products WHERE id = ?").get(item.productId) as { stock: number; price_minor: number } | undefined;
          const baseStock = prod ? prod.stock : 0;
          const baseCost = prod ? Math.round(prod.price_minor * 0.6) : 0;
          db.prepare(
            `INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
             VALUES (?, ?, ?, 0, ?, 10, ?)`
          ).run(storeId, item.productId, Math.max(0, baseStock - item.quantity), baseCost, now);
        }

        db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?").run(item.quantity, item.productId);
      }

      return { ok: true as const };
    })();

    if (result.ok) {
      try {
        warmCatalogSnapshot();
      } catch {
        // non-fatal
      }
    }

    return result;
  },

  /** Compensating stock restoration when payment captures succeed but downstream persistence fails. */
  restoreStock(storeId: string, items: Array<{ productId: string; quantity: number }>): void {
    const db = getDb();
    const now = new Date().toISOString();

    db.transaction(() => {
      for (const item of items) {
        db.prepare(
          `UPDATE store_inventory 
           SET stock = stock + ?, updated_at = ? 
           WHERE store_id = ? AND product_id = ?`
        ).run(item.quantity, now, storeId, item.productId);

        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.productId);
      }
    })();

    try {
      warmCatalogSnapshot();
    } catch {
      // non-fatal
    }
  },

  updateInventoryOnReceipt(storeId: string, productId: string, receivedQty: number, unitCostMinor: number): void {
    const db = getDb();
    const now = new Date().toISOString();

    db.transaction(() => {
      const existing = db
        .prepare("SELECT stock, unit_cost_minor FROM store_inventory WHERE store_id = ? AND product_id = ?")
        .get(storeId, productId) as { stock: number; unit_cost_minor: number } | undefined;

      let newStock = receivedQty;
      let newWac = unitCostMinor;

      if (existing) {
        const totalOldValue = existing.stock * existing.unit_cost_minor;
        const totalReceivedValue = receivedQty * unitCostMinor;
        newStock = existing.stock + receivedQty;
        newWac = newStock > 0 ? Math.round((totalOldValue + totalReceivedValue) / newStock) : unitCostMinor;

        db.prepare(
          `
          UPDATE store_inventory
          SET stock = ?, unit_cost_minor = ?, updated_at = ?
          WHERE store_id = ? AND product_id = ?
          `
        ).run(newStock, newWac, now, storeId, productId);
      } else {
        const prod = db.prepare("SELECT stock, price_minor FROM products WHERE id = ?").get(productId) as { stock: number; price_minor: number } | undefined;
        const baseStock = prod ? prod.stock : 0;
        const baseCost = prod ? Math.round(prod.price_minor * 0.6) : unitCostMinor;
        newStock = baseStock + receivedQty;
        newWac = newStock > 0 ? Math.round((baseStock * baseCost + receivedQty * unitCostMinor) / newStock) : unitCostMinor;

        db.prepare(
          `
          INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
          VALUES (?, ?, ?, 0, ?, 10, ?)
          `
        ).run(storeId, productId, newStock, newWac, now);
      }

      // Also increment global product stock
      db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(receivedQty, productId);
    })();

    try {
      warmCatalogSnapshot();
    } catch {
      // non-fatal
    }
  },

  adjustStock(storeId: string, productId: string, quantityDelta: number): void {
    const db = getDb();
    const now = new Date().toISOString();

    db.transaction(() => {
      const existing = db
        .prepare("SELECT stock, unit_cost_minor, low_stock_threshold FROM store_inventory WHERE store_id = ? AND product_id = ?")
        .get(storeId, productId) as { stock: number; unit_cost_minor: number; low_stock_threshold: number } | undefined;

      if (existing) {
        const updatedStock = Math.max(0, existing.stock + quantityDelta);
        db.prepare("UPDATE store_inventory SET stock = ?, updated_at = ? WHERE store_id = ? AND product_id = ?").run(
          updatedStock,
          now,
          storeId,
          productId
        );
      } else {
        const prod = db.prepare("SELECT stock, price_minor FROM products WHERE id = ?").get(productId) as { stock: number; price_minor: number } | undefined;
        const baseStock = prod ? prod.stock : 0;
        const baseCost = prod ? Math.round(prod.price_minor * 0.6) : 0;
        const updatedStock = Math.max(0, baseStock + quantityDelta);
        db.prepare(
          `
          INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
          VALUES (?, ?, ?, 0, ?, 10, ?)
          `
        ).run(storeId, productId, updatedStock, baseCost, now);
      }

      db.prepare("UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?").run(quantityDelta, productId);
    })();

    try {
      warmCatalogSnapshot();
    } catch {
      // non-fatal
    }
  },

  transferStock(fromStoreId: string, toStoreId: string, productId: string, quantity: number): boolean {
    const db = getDb();
    const now = new Date().toISOString();

    const success = db.transaction(() => {
      const prod = db.prepare("SELECT stock, price_minor FROM products WHERE id = ?").get(productId) as { stock: number; price_minor: number } | undefined;
      const baseStock = prod ? prod.stock : 0;
      const baseCost = prod ? Math.round(prod.price_minor * 0.6) : 0;

      const fromRow = db
        .prepare("SELECT stock, reserved, unit_cost_minor FROM store_inventory WHERE store_id = ? AND product_id = ?")
        .get(fromStoreId, productId) as { stock: number; reserved: number; unit_cost_minor: number } | undefined;

      const fromCurrentStock = fromRow ? fromRow.stock : baseStock;
      const fromReserved = fromRow ? fromRow.reserved : 0;
      const available = fromCurrentStock - fromReserved;

      if (available < quantity) return false;

      // Decrement source store
      if (fromRow) {
        db.prepare("UPDATE store_inventory SET stock = stock - ?, updated_at = ? WHERE store_id = ? AND product_id = ?").run(
          quantity,
          now,
          fromStoreId,
          productId
        );
      } else {
        db.prepare(
          `
          INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
          VALUES (?, ?, ?, 0, ?, 10, ?)
          `
        ).run(fromStoreId, productId, baseStock - quantity, baseCost, now);
      }

      // Increment destination store
      const toRow = db
        .prepare("SELECT stock, unit_cost_minor FROM store_inventory WHERE store_id = ? AND product_id = ?")
        .get(toStoreId, productId) as { stock: number; unit_cost_minor: number } | undefined;

      const unitCost = fromRow ? fromRow.unit_cost_minor : baseCost;
      if (toRow) {
        db.prepare("UPDATE store_inventory SET stock = stock + ?, updated_at = ? WHERE store_id = ? AND product_id = ?").run(
          quantity,
          now,
          toStoreId,
          productId
        );
      } else {
        db.prepare(
          `
          INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
          VALUES (?, ?, ?, 0, ?, 10, ?)
          `
        ).run(toStoreId, productId, baseStock + quantity, unitCost, now);
      }

      return true;
    })();

    if (success) {
      try {
        warmCatalogSnapshot();
      } catch {
        // non-fatal
      }
    }

    return success;
  },
};
