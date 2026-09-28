import { Router } from "express";
import { listPaymentMethods } from "../controllers/paymentController";

const router = Router();

router.get("/payments/methods", listPaymentMethods);

export default router;
