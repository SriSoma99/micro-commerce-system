import { Router } from "express";
import { receivingController } from "../controllers/receivingController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const receivingRouter = Router();

// Gated for store managers and administrators
receivingRouter.use(requireAuth, requireRole("store-manager", "admin"));

// GRN routes
receivingRouter.post("/grn", receivingController.createGoodsReceipt);
receivingRouter.post("/grn/upload-csv", receivingController.uploadCsv);
receivingRouter.get("/grn", receivingController.listGoodsReceipts);
receivingRouter.get("/grn/:id", receivingController.getGoodsReceipt);

// Inventory & Low-Stock Alerts
receivingRouter.get("/stores/:storeId/inventory", receivingController.getStoreInventory);

// Inter-Store Transfers
receivingRouter.post("/transfers", receivingController.createTransfer);
receivingRouter.get("/transfers", receivingController.listTransfers);

// Stock Adjustments (Shrinkage/Damage/Wastage)
receivingRouter.post("/adjustments", receivingController.createAdjustment);
receivingRouter.get("/adjustments", receivingController.listAdjustments);
