import { getDb } from "../db/database";
import { inventoryRepository } from "../data/inventoryRepository";
import { receivingRepository } from "../data/receivingRepository";
import { domainEventBus } from "../observability/domainEventBus";
import {
  AdjustmentReason,
  CreateGrnInput,
  GoodsReceipt,
  GrnItemInput,
  StockAdjustment,
  StockTransfer,
  StoreInventoryRecord,
} from "../types/receiving";

export class ReceivingServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: string[]
  ) {
    super(message);
  }
}

export const receivingService = {
  createGoodsReceipt(input: CreateGrnInput, receivedBy: string): GoodsReceipt {
    if (!input.storeId?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Store ID is required");
    }
    if (!input.supplier?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Supplier is required");
    }
    if (!input.poReference?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "PO reference is required");
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new ReceivingServiceError("INVALID_INPUT", "At least one receipt item is required");
    }

    const validatedItems: GrnItemInput[] = [];
    const errors: string[] = [];

    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      if (!it || !it.productId?.trim()) {
        errors.push(`Item #${i + 1}: product ID is required`);
        continue;
      }
      const db = getDb();
      const prod = db.prepare("SELECT id, name FROM products WHERE id = ?").get(it.productId.trim());
      if (!prod) {
        errors.push(`Item #${i + 1}: product '${it.productId}' not found`);
        continue;
      }
      if (typeof it.quantity !== "number" || it.quantity <= 0 || !Number.isInteger(it.quantity)) {
        errors.push(`Item #${i + 1}: quantity must be a positive integer`);
        continue;
      }
      if (typeof it.unitCostMinor !== "number" || it.unitCostMinor < 0 || !Number.isInteger(it.unitCostMinor)) {
        errors.push(`Item #${i + 1}: unit cost must be a non-negative integer in cents`);
        continue;
      }
      if (!it.batchNumber?.trim()) {
        errors.push(`Item #${i + 1}: batch number is required`);
        continue;
      }
      if (!it.expiryDate?.trim() || isNaN(Date.parse(it.expiryDate))) {
        errors.push(`Item #${i + 1}: valid expiry date (YYYY-MM-DD) is required`);
        continue;
      }

      validatedItems.push({
        productId: it.productId.trim(),
        quantity: it.quantity,
        unitCostMinor: it.unitCostMinor,
        batchNumber: it.batchNumber.trim(),
        expiryDate: it.expiryDate.trim(),
      });
    }

    if (errors.length > 0) {
      throw new ReceivingServiceError("VALIDATION_FAILED", "One or more receipt items failed validation", errors);
    }

    // Create GRN
    const grn = receivingRepository.createGoodsReceipt(
      input.storeId.trim(),
      input.supplier.trim(),
      input.poReference.trim(),
      receivedBy,
      validatedItems,
      input.notes?.trim()
    );

    // Increment store inventory and update weighted-average cost per SKU
    for (const it of validatedItems) {
      inventoryRepository.updateInventoryOnReceipt(input.storeId.trim(), it.productId, it.quantity, it.unitCostMinor);
    }

    domainEventBus.publish({
      type: "GRN_RECORDED",
      summary: `GRN ${grn.grnNumber} ingested for store ${grn.storeId} from ${grn.supplier} (${validatedItems.length} lines, total $${(grn.totalCostMinor / 100).toFixed(2)})`,
      storeId: grn.storeId,
      actor: { role: "store-manager", email: receivedBy },
      payload: {
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        poReference: grn.poReference,
        totalCostMinor: grn.totalCostMinor,
        itemCount: validatedItems.length,
      },
    });

    return grn;
  },

  ingestCsvGoodsReceipt(
    storeId: string,
    csvContent: string,
    receivedBy: string
  ): { grn: GoodsReceipt; processedRows: number } {
    if (!storeId?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Store ID is required");
    }
    if (!csvContent?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "CSV content is empty");
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      throw new ReceivingServiceError("INVALID_CSV", "CSV must contain a header and at least one data row");
    }

    const header = lines[0]!.toLowerCase().split(",").map((h) => h.trim());
    const skuIdx = header.findIndex((h) => h === "sku" || h === "product_id" || h === "productid");
    const supplierIdx = header.findIndex((h) => h === "supplier");
    const poIdx = header.findIndex((h) => h === "po_reference" || h === "po" || h === "poref");
    const qtyIdx = header.findIndex((h) => h === "quantity" || h === "qty");
    const costIdx = header.findIndex((h) => h === "unit_cost" || h === "cost" || h === "unitcost");
    const batchIdx = header.findIndex((h) => h === "batch" || h === "batch_number" || h === "batchno");
    const expiryIdx = header.findIndex((h) => h === "expiry" || h === "expiry_date" || h === "exp");

    if (skuIdx === -1 || qtyIdx === -1 || costIdx === -1) {
      throw new ReceivingServiceError(
        "INVALID_CSV_HEADER",
        "CSV header must contain at least 'sku', 'quantity', and 'unit_cost' columns"
      );
    }

    const items: GrnItemInput[] = [];
    let detectedSupplier = "General Supplier";
    let detectedPo = `PO-${Date.now().toString().slice(-6)}`;
    const errors: string[] = [];

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const line = lines[rowIdx]!;
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      if (cols.length < 3) continue;

      const sku = cols[skuIdx] ?? "";
      const rawQty = cols[qtyIdx] ?? "";
      const rawCost = cols[costIdx] ?? "";
      const supplier = supplierIdx !== -1 && cols[supplierIdx] ? cols[supplierIdx]! : detectedSupplier;
      const po = poIdx !== -1 && cols[poIdx] ? cols[poIdx]! : detectedPo;
      const batch = batchIdx !== -1 && cols[batchIdx] ? cols[batchIdx]! : `B-${Date.now().toString().slice(-4)}`;
      const expiry =
        expiryIdx !== -1 && cols[expiryIdx]
          ? cols[expiryIdx]!
          : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

      detectedSupplier = supplier;
      detectedPo = po;

      const db = getDb();
      const prod = db.prepare("SELECT id FROM products WHERE id = ?").get(sku);
      if (!prod) {
        errors.push(`Row ${rowIdx + 1}: SKU '${sku}' not found in catalog`);
        continue;
      }

      const qty = parseInt(rawQty, 10);
      if (isNaN(qty) || qty <= 0) {
        errors.push(`Row ${rowIdx + 1}: quantity '${rawQty}' must be a positive integer`);
        continue;
      }

      // Cost in dollar string (e.g. 2.50 or 250 cents)
      let costMinor: number;
      if (rawCost.includes(".")) {
        costMinor = Math.round(parseFloat(rawCost) * 100);
      } else {
        costMinor = parseInt(rawCost, 10);
      }

      if (isNaN(costMinor) || costMinor < 0) {
        errors.push(`Row ${rowIdx + 1}: unit cost '${rawCost}' is invalid`);
        continue;
      }

      items.push({
        productId: sku,
        quantity: qty,
        unitCostMinor: costMinor,
        batchNumber: batch,
        expiryDate: expiry,
      });
    }

    if (errors.length > 0) {
      throw new ReceivingServiceError("CSV_VALIDATION_FAILED", "CSV validation failed", errors);
    }

    const grn = this.createGoodsReceipt(
      {
        storeId,
        supplier: detectedSupplier,
        poReference: detectedPo,
        items,
        notes: `Imported via CSV (${items.length} rows)`,
      },
      receivedBy
    );

    return { grn, processedRows: items.length };
  },

  listGoodsReceipts(storeId?: string): GoodsReceipt[] {
    return receivingRepository.listGoodsReceipts(storeId);
  },

  getGoodsReceipt(id: string): GoodsReceipt | null {
    return receivingRepository.getGoodsReceiptById(id);
  },

  getStoreInventory(storeId: string): StoreInventoryRecord[] {
    return inventoryRepository.getStoreInventory(storeId);
  },

  transferStock(
    fromStoreId: string,
    toStoreId: string,
    productId: string,
    quantity: number
  ): { transfer: StockTransfer } {
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) {
      throw new ReceivingServiceError("INVALID_INPUT", "Source and destination stores must be different");
    }
    if (!productId?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Product ID is required");
    }
    if (typeof quantity !== "number" || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new ReceivingServiceError("INVALID_INPUT", "Transfer quantity must be a positive integer");
    }

    const prod = getDb().prepare("SELECT id FROM products WHERE id = ?").get(productId);
    if (!prod) {
      throw new ReceivingServiceError("PRODUCT_NOT_FOUND", `Product '${productId}' not found`);
    }

    const success = inventoryRepository.transferStock(fromStoreId, toStoreId, productId, quantity);
    if (!success) {
      throw new ReceivingServiceError(
        "INSUFFICIENT_STOCK",
        `Store '${fromStoreId}' does not have enough available stock for product '${productId}'`
      );
    }

    const transfer = receivingRepository.createStockTransfer(fromStoreId, toStoreId, productId, quantity);

    domainEventBus.publish({
      type: "STOCK_TRANSFERRED",
      summary: `Transferred ${quantity} units of ${productId} from ${fromStoreId} to ${toStoreId}`,
      storeId: fromStoreId,
      payload: {
        transferId: transfer.id,
        transferNumber: transfer.transferNumber,
        fromStoreId,
        toStoreId,
        productId,
        quantity,
      },
    });

    return { transfer };
  },

  listStockTransfers(storeId?: string): StockTransfer[] {
    return receivingRepository.listStockTransfers(storeId);
  },

  adjustStock(
    storeId: string,
    productId: string,
    quantityDelta: number,
    reason: AdjustmentReason,
    adjustedBy: string
  ): StockAdjustment {
    if (!storeId?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Store ID is required");
    }
    if (!productId?.trim()) {
      throw new ReceivingServiceError("INVALID_INPUT", "Product ID is required");
    }
    if (typeof quantityDelta !== "number" || quantityDelta === 0 || !Number.isInteger(quantityDelta)) {
      throw new ReceivingServiceError("INVALID_INPUT", "Quantity delta must be a non-zero integer");
    }
    if (!["shrinkage", "damage", "expired", "audit"].includes(reason)) {
      throw new ReceivingServiceError("INVALID_INPUT", `Invalid adjustment reason '${reason}'`);
    }

    const prod = getDb().prepare("SELECT id FROM products WHERE id = ?").get(productId);
    if (!prod) {
      throw new ReceivingServiceError("PRODUCT_NOT_FOUND", `Product '${productId}' not found`);
    }

    inventoryRepository.adjustStock(storeId, productId, quantityDelta);
    const adjustment = receivingRepository.createStockAdjustment(storeId, productId, quantityDelta, reason, adjustedBy);

    domainEventBus.publish({
      type: "STOCK_ADJUSTED",
      summary: `Stock adjustment at ${storeId}: ${quantityDelta > 0 ? "+" : ""}${quantityDelta} units for ${productId} (reason: ${reason}) by ${adjustedBy}`,
      storeId,
      actor: { email: adjustedBy },
      payload: {
        adjustmentId: adjustment.id,
        productId,
        quantityDelta,
        reason,
        adjustedBy,
      },
    });

    return adjustment;
  },

  listStockAdjustments(storeId?: string): StockAdjustment[] {
    return receivingRepository.listStockAdjustments(storeId);
  },
};
