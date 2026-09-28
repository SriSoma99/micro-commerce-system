import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  listPaymentMethodsHandler,
  savePaymentMethodHandler,
  deletePaymentMethodHandler,
  setDefaultPaymentMethodHandler,
} from "../controllers/savedPaymentController";

const router = Router();

router.get("/customers/me/payment-methods", requireAuth, listPaymentMethodsHandler);
router.post("/customers/me/payment-methods", requireAuth, savePaymentMethodHandler);
router.delete("/customers/me/payment-methods/:cardId", requireAuth, deletePaymentMethodHandler);
router.patch("/customers/me/payment-methods/:cardId/default", requireAuth, setDefaultPaymentMethodHandler);

export default router;
