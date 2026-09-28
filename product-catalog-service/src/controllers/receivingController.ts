import { Request, Response } from "express";
import { ReceivingServiceError, receivingService } from "../services/receivingService";

function buildPayload<T>(data: T) {
  return {
    data,
    isFallback: false,
    source: "live-core" as const,
    retrievedAt: new Date().toISOString(),
  };
}

export const receivingController = {
  createGoodsReceipt(req: Request, res: Response): void {
    try {
      const user = (req as any).user;
      const receivedBy = user ? `${user.firstName} ${user.lastName}` : "Store Manager";

      const grn = receivingService.createGoodsReceipt(req.body, receivedBy);
      res.status(201).json(buildPayload({ grn }));
    } catch (err) {
      if (err instanceof ReceivingServiceError) {
        res.status(400).json({ error: err.code, message: err.message, details: err.details });
        return;
      }
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create goods receipt" });
    }
  },

  uploadCsv(req: Request, res: Response): void {
    try {
      const user = (req as any).user;
      const receivedBy = user ? `${user.firstName} ${user.lastName}` : "Store Manager";
      const storeId = req.body?.storeId;
      const csvContent = req.body?.csvContent ?? req.body?.csv;

      if (!storeId || !csvContent) {
        res.status(400).json({ error: "INVALID_INPUT", message: "storeId and csvContent are required" });
        return;
      }

      const result = receivingService.ingestCsvGoodsReceipt(storeId, csvContent, receivedBy);
      res.status(201).json(buildPayload(result));
    } catch (err) {
      if (err instanceof ReceivingServiceError) {
        res.status(400).json({ error: err.code, message: err.message, details: err.details });
        return;
      }
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to ingest CSV goods receipt" });
    }
  },

  listGoodsReceipts(req: Request, res: Response): void {
    try {
      const storeId = req.query.storeId as string | undefined;
      const receipts = receivingService.listGoodsReceipts(storeId);
      res.json(buildPayload({ receipts }));
    } catch (err) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list goods receipts" });
    }
  },

  getGoodsReceipt(req: Request, res: Response): void {
    try {
      const id = req.params.id as string;
      const grn = receivingService.getGoodsReceipt(id);
      if (!grn) {
        res.status(404).json({ error: "GRN_NOT_FOUND", message: "Goods receipt note not found" });
        return;
      }
      res.json(buildPayload({ grn }));
    } catch (err) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch goods receipt" });
    }
  },

  getStoreInventory(req: Request, res: Response): void {
    try {
      const storeId = req.params.storeId as string;
      if (!storeId) {
        res.status(400).json({ error: "INVALID_INPUT", message: "storeId is required" });
        return;
      }
      const inventory = receivingService.getStoreInventory(storeId);
      res.json(buildPayload({ inventory }));
    } catch (err) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store inventory" });
    }
  },

  createTransfer(req: Request, res: Response): void {
    try {
      const { fromStoreId, toStoreId, productId, quantity } = req.body ?? {};
      const result = receivingService.transferStock(fromStoreId, toStoreId, productId, quantity);
      res.status(201).json(buildPayload(result));
    } catch (err) {
      if (err instanceof ReceivingServiceError) {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      console.error("createTransfer internal error:", err);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to process stock transfer", details: String(err) });
    }
  },

  listTransfers(req: Request, res: Response): void {
    try {
      const storeId = req.query.storeId as string | undefined;
      const transfers = receivingService.listStockTransfers(storeId);
      res.json(buildPayload({ transfers }));
    } catch (err) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list stock transfers" });
    }
  },

  createAdjustment(req: Request, res: Response): void {
    try {
      const user = (req as any).user;
      const adjustedBy = user ? `${user.firstName} ${user.lastName}` : "Store Manager";
      const { storeId, productId, quantityDelta, reason } = req.body ?? {};

      const adjustment = receivingService.adjustStock(storeId, productId, quantityDelta, reason, adjustedBy);
      res.status(201).json(buildPayload({ adjustment }));
    } catch (err) {
      if (err instanceof ReceivingServiceError) {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to process stock adjustment" });
    }
  },

  listAdjustments(req: Request, res: Response): void {
    try {
      const storeId = req.query.storeId as string | undefined;
      const adjustments = receivingService.listStockAdjustments(storeId);
      res.json(buildPayload({ adjustments }));
    } catch (err) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list stock adjustments" });
    }
  },
};
