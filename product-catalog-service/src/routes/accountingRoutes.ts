import { Router } from "express";
import { accountingController } from "../controllers/accountingController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Guarded by Role-Based Access Control: finance officer or admin only
router.use(requireAuth);
router.use(requireRole("finance", "admin"));

router.get("/overview", accountingController.getOverview);
router.get("/daily-sales", accountingController.getDailySales);
router.get("/pipeline", accountingController.getPipeline);
router.get("/monthly-trends", accountingController.getMonthlyTrends);
router.get("/velocity", accountingController.getProductVelocity);
router.get("/margins", accountingController.getGrossMargins);
router.get("/regional", accountingController.getStoreRegionalBreakdown);
router.get("/tax-ledger", accountingController.getTaxLiabilityLedger);
router.get("/transactions", accountingController.getTransactionAuditLogs);

export { router as accountingRouter };
