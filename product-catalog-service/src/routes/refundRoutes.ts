import { Router } from "express";
import { createRefund } from "../controllers/refundController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/orders/:orderId/refund", requireAuth, requireRole("store-manager", "admin"), createRefund);

export default router;
