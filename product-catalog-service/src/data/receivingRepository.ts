import { randomUUID } from "node:crypto";
import { getDb } from "../db/database";
import {
  AdjustmentReason,
  GoodsReceipt,
  GoodsReceiptItem,
  GrnItemInput,
  StockAdjustment,
  StockTransfer,
} from "../types/receiving";

export const receivingRepository = {
  generateGrnNumber(storeId: string): string {
    const db = getDb();
    const cleanStore = storeId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    return db.transaction(() => {
      const existing = db
        .prepare("SELECT last_number FROM grn_sequences WHERE store_id = ?")
        .get(storeId) as { last_number: number } | undefined;

      const next = (existing?.last_number ?? 0) + 1;
      db.prepare(
        "INSERT INTO grn_sequences (store_id, last_number) VALUES (?, ?) ON CONFLICT(store_id) DO UPDATE SET last_number = ?"
      ).run(storeId, next, next);

      return `GRN-${cleanStore}-${String(next).padStart(4, "0")}`;
    })();
  },

  createGoodsReceipt(
    storeId: string,
    supplier: string,
    poReference: string,
    receivedBy: string,
    items: GrnItemInput[],
    notes?: string
  ): GoodsReceipt {
    const db = getDb();
    const grnId = randomUUID();
    const grnNumber = this.generateGrnNumber(storeId);
    const now = new Date().toISOString();

    const totalCostMinor = items.reduce((sum, it) => sum + it.quantity * it.unitCostMinor, 0);

    return db.transaction(() => {
      db.prepare(
        `
        INSERT INTO goods_receipts (id, grn_number, store_id, supplier, po_reference, status, total_cost_minor, received_by, received_at, notes)
        VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?, ?)
        `
      ).run(grnId, grnNumber, storeId, supplier, poReference, totalCostMinor, receivedBy, now, notes ?? null);

      const createdItems: GoodsReceiptItem[] = [];
      const itemStmt = db.prepare(
        `
        INSERT INTO goods_receipt_items (id, grn_id, product_id, quantity, unit_cost_minor, batch_number, expiry_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const it of items) {
        const itemId = randomUUID();
        itemStmt.run(itemId, grnId, it.productId, it.quantity, it.unitCostMinor, it.batchNumber, it.expiryDate, now);

        const prod = db.prepare("SELECT name FROM products WHERE id = ?").get(it.productId) as { name: string } | undefined;

        createdItems.push({
          id: itemId,
          grnId,
          productId: it.productId,
          productName: prod?.name ?? "Unknown Product",
          quantity: it.quantity,
          unitCostMinor: it.unitCostMinor,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          createdAt: now,
        });
      }

      return {
        id: grnId,
        grnNumber,
        storeId,
        supplier,
        poReference,
        status: "received" as const,
        totalCostMinor,
        receivedBy,
        receivedAt: now,
        notes: notes ?? null,
        items: createdItems,
      };
    })();
  },

  listGoodsReceipts(storeId?: string): GoodsReceipt[] {
    const db = getDb();
    const grnQuery = storeId
      ? "SELECT * FROM goods_receipts WHERE store_id = ? ORDER BY received_at DESC"
      : "SELECT * FROM goods_receipts ORDER BY received_at DESC";

    const rows = (storeId ? db.prepare(grnQuery).all(storeId) : db.prepare(grnQuery).all()) as Array<{
      id: string;
      grn_number: string;
      store_id: string;
      supplier: string;
      po_reference: string;
      status: GoodsReceipt["status"];
      total_cost_minor: number;
      received_by: string;
      received_at: string;
      notes: string | null;
    }>;

    return rows.map((r) => {
      const items = db
        .prepare(
          `
          SELECT gri.*, p.name AS product_name 
          FROM goods_receipt_items gri
          LEFT JOIN products p ON p.id = gri.product_id
          WHERE gri.grn_id = ?
          ORDER BY gri.created_at ASC
          `
        )
        .all(r.id) as Array<{
        id: string;
        grn_id: string;
        product_id: string;
        product_name: string | null;
        quantity: number;
        unit_cost_minor: number;
        batch_number: string;
        expiry_date: string;
        created_at: string;
      }>;

      return {
        id: r.id,
        grnNumber: r.grn_number,
        storeId: r.store_id,
        supplier: r.supplier,
        poReference: r.po_reference,
        status: r.status,
        totalCostMinor: r.total_cost_minor,
        receivedBy: r.received_by,
        receivedAt: r.received_at,
        notes: r.notes,
        items: items.map((it) => ({
          id: it.id,
          grnId: it.grn_id,
          productId: it.product_id,
          productName: it.product_name ?? "Unknown Product",
          quantity: it.quantity,
          unitCostMinor: it.unit_cost_minor,
          batchNumber: it.batch_number,
          expiryDate: it.expiry_date,
          createdAt: it.created_at,
        })),
      };
    });
  },

  getGoodsReceiptById(id: string): GoodsReceipt | null {
    const db = getDb();
    const r = db.prepare("SELECT * FROM goods_receipts WHERE id = ?").get(id) as
      | {
          id: string;
          grn_number: string;
          store_id: string;
          supplier: string;
          po_reference: string;
          status: GoodsReceipt["status"];
          total_cost_minor: number;
          received_by: string;
          received_at: string;
          notes: string | null;
        }
      | undefined;

    if (!r) return null;

    const items = db
      .prepare(
        `
        SELECT gri.*, p.name AS product_name 
        FROM goods_receipt_items gri
        LEFT JOIN products p ON p.id = gri.product_id
        WHERE gri.grn_id = ?
        ORDER BY gri.created_at ASC
        `
      )
      .all(r.id) as Array<{
      id: string;
      grn_id: string;
      product_id: string;
      product_name: string | null;
      quantity: number;
      unit_cost_minor: number;
      batch_number: string;
      expiry_date: string;
      created_at: string;
    }>;

    return {
      id: r.id,
      grnNumber: r.grn_number,
      storeId: r.store_id,
      supplier: r.supplier,
      poReference: r.po_reference,
      status: r.status,
      totalCostMinor: r.total_cost_minor,
      receivedBy: r.received_by,
      receivedAt: r.received_at,
      notes: r.notes,
      items: items.map((it) => ({
        id: it.id,
        grnId: it.grn_id,
        productId: it.product_id,
        productName: it.product_name ?? "Unknown Product",
        quantity: it.quantity,
        unitCostMinor: it.unit_cost_minor,
        batchNumber: it.batch_number,
        expiryDate: it.expiry_date,
        createdAt: it.created_at,
      })),
    };
  },

  createStockTransfer(fromStoreId: string, toStoreId: string, productId: string, quantity: number): StockTransfer {
    const db = getDb();
    const transferId = randomUUID();
    const transferNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO stock_transfers (id, transfer_number, from_store_id, to_store_id, product_id, quantity, status, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
      `
    ).run(transferId, transferNumber, fromStoreId, toStoreId, productId, quantity, now, now);

    const prod = db.prepare("SELECT name FROM products WHERE id = ?").get(productId) as { name: string } | undefined;

    return {
      id: transferId,
      transferNumber,
      fromStoreId,
      toStoreId,
      productId,
      productName: prod?.name ?? "Unknown Product",
      quantity,
      status: "completed",
      createdAt: now,
      completedAt: now,
    };
  },

  listStockTransfers(storeId?: string): StockTransfer[] {
    const db = getDb();
    const query = storeId
      ? `
        SELECT st.*, p.name AS product_name 
        FROM stock_transfers st
        LEFT JOIN products p ON p.id = st.product_id
        WHERE st.from_store_id = ? OR st.to_store_id = ?
        ORDER BY st.created_at DESC
        `
      : `
        SELECT st.*, p.name AS product_name 
        FROM stock_transfers st
        LEFT JOIN products p ON p.id = st.product_id
        ORDER BY st.created_at DESC
        `;

    const rows = (storeId ? db.prepare(query).all(storeId, storeId) : db.prepare(query).all()) as Array<{
      id: string;
      transfer_number: string;
      from_store_id: string;
      to_store_id: string;
      product_id: string;
      product_name: string | null;
      quantity: number;
      status: StockTransfer["status"];
      created_at: string;
      completed_at: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      transferNumber: r.transfer_number,
      fromStoreId: r.from_store_id,
      toStoreId: r.to_store_id,
      productId: r.product_id,
      productName: r.product_name ?? "Unknown Product",
      quantity: r.quantity,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  },

  createStockAdjustment(
    storeId: string,
    productId: string,
    quantityDelta: number,
    reason: AdjustmentReason,
    adjustedBy: string
  ): StockAdjustment {
    const db = getDb();
    const adjustmentId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO stock_adjustments (id, store_id, product_id, quantity_delta, reason, adjusted_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(adjustmentId, storeId, productId, quantityDelta, reason, adjustedBy, now);

    const prod = db.prepare("SELECT name FROM products WHERE id = ?").get(productId) as { name: string } | undefined;

    return {
      id: adjustmentId,
      storeId,
      productId,
      productName: prod?.name ?? "Unknown Product",
      quantityDelta,
      reason,
      adjustedBy,
      createdAt: now,
    };
  },

  listStockAdjustments(storeId?: string): StockAdjustment[] {
    const db = getDb();
    const query = storeId
      ? `
        SELECT sa.*, p.name AS product_name 
        FROM stock_adjustments sa
        LEFT JOIN products p ON p.id = sa.product_id
        WHERE sa.store_id = ?
        ORDER BY sa.created_at DESC
        `
      : `
        SELECT sa.*, p.name AS product_name 
        FROM stock_adjustments sa
        LEFT JOIN products p ON p.id = sa.product_id
        ORDER BY sa.created_at DESC
        `;

    const rows = (storeId ? db.prepare(query).all(storeId) : db.prepare(query).all()) as Array<{
      id: string;
      store_id: string;
      product_id: string;
      product_name: string | null;
      quantity_delta: number;
      reason: AdjustmentReason;
      adjusted_by: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      storeId: r.store_id,
      productId: r.product_id,
      productName: r.product_name ?? "Unknown Product",
      quantityDelta: r.quantity_delta,
      reason: r.reason,
      adjustedBy: r.adjusted_by,
      createdAt: r.created_at,
    }));
  },
};
