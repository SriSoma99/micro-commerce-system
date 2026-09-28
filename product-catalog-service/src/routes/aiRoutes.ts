import { Router } from "express";
import { aiController } from "../controllers/aiController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const aiRouter = Router();

// Public / Shopper AI Assistant endpoints
aiRouter.post("/chat", aiController.chat);
aiRouter.get("/conversations", aiController.listConversations);
aiRouter.get("/conversations/:id/messages", aiController.getConversationMessages);
aiRouter.get("/policies", aiController.getPolicies);
aiRouter.get("/metrics", aiController.getMetrics);

// Supervisor & Management Action Draft Endpoints (RBAC protected)
aiRouter.get("/drafts", requireAuth, requireRole("store-manager", "admin", "finance"), aiController.listDrafts);
aiRouter.post("/drafts/:id/approve", requireAuth, requireRole("store-manager", "admin"), aiController.approveDraft);
aiRouter.post("/drafts/:id/reject", requireAuth, requireRole("store-manager", "admin"), aiController.rejectDraft);
