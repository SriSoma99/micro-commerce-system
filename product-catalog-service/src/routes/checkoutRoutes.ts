import { Router } from "express";
import { checkout, quote } from "../controllers/checkoutController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.post("/checkout/quote", requireAuth, quote);
router.post("/checkout", requireAuth, checkout);

export default router;
