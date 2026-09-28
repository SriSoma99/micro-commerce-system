import { Router } from "express";
import { confirmOrderPayment } from "../controllers/checkoutController";
import { getOrderById, listMyOrders, updateStatus } from "../controllers/orderController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Orders belong to a customer: every route is scoped to the signed-in one.
router.use("/orders", requireAuth);
router.get("/orders", listMyOrders);
router.get("/orders/:orderId", getOrderById);
router.post("/orders/:orderId/payment/confirm", confirmOrderPayment);
router.patch("/orders/:orderId/status", requireRole("store-manager", "admin"), updateStatus);

export default router;
