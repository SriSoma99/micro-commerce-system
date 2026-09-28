import type { Request, Response } from "express";
import { aiAgentService } from "../services/ai/aiAgentService";
import { aiRepository } from "../data/aiRepository";
import { STORE_POLICIES } from "../platform/ai/policyRAG";
import type { AiPersona } from "../platform/ai/types";
import { liveEnvelope } from "../utils/envelope";
import { authenticate } from "../services/authService";
import type { Customer } from "../types/customer";

function getOptionalCustomer(req: Request, res: Response): Customer | undefined {
  if (res.locals?.customer) return res.locals.customer as Customer;
  const authHeader = req.header("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme === "Bearer" && token) {
    return authenticate(token);
  }
  return undefined;
}

export const aiController = {
  async chat(req: Request, res: Response): Promise<void> {
    const { conversationId, persona, message, storeId } = req.body as {
      conversationId?: string;
      persona?: AiPersona;
      message?: string;
      storeId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const selectedPersona: AiPersona = persona === "store_manager" || persona === "support_desk" ? persona : "shopper";
    const customer = getOptionalCustomer(req, res);
    const customerId = customer?.id;
    const userRole = customer?.role ?? (selectedPersona === "store_manager" ? "store-manager" : selectedPersona === "support_desk" ? "support" : "customer");

    try {
      const result = await aiAgentService.chat({
        conversationId,
        persona: selectedPersona,
        message: message.trim(),
        customerId,
        userRole,
        storeId
      });

      res.status(200).json(liveEnvelope(result));
    } catch (err) {
      res.status(500).json({ error: "AI_PROCESSING_ERROR", message: err instanceof Error ? err.message : String(err) });
    }
  },

  async listConversations(req: Request, res: Response): Promise<void> {
    const customer = getOptionalCustomer(req, res);
    const conversations = aiRepository.listConversations(customer?.id);
    res.status(200).json(liveEnvelope({ conversations }));
  },

  async getConversationMessages(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const conversationId = Array.isArray(id) ? id[0] : id;
    if (!conversationId) {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    const conv = aiRepository.getConversation(conversationId);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const messages = aiRepository.getMessages(conversationId);
    res.status(200).json(liveEnvelope({ conversation: conv, messages }));
  },

  async getPolicies(_req: Request, res: Response): Promise<void> {
    res.status(200).json(liveEnvelope({ policies: STORE_POLICIES }));
  },

  async getMetrics(_req: Request, res: Response): Promise<void> {
    const metrics = aiAgentService.getMetrics();
    res.status(200).json(liveEnvelope(metrics));
  },

  async listDrafts(req: Request, res: Response): Promise<void> {
    const status = req.query.status as "pending" | "approved" | "rejected" | undefined;
    const drafts = aiRepository.listActionDrafts(status);
    res.status(200).json(liveEnvelope({ drafts }));
  },

  async approveDraft(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const draftId = Array.isArray(id) ? id[0] : id;
    if (!draftId) {
      res.status(400).json({ error: "Draft ID required" });
      return;
    }

    const customer = getOptionalCustomer(req, res);
    const supervisorId = customer?.id ?? "supervisor_demo";
    const success = await aiAgentService.approveActionDraft(draftId, supervisorId);

    if (!success) {
      res.status(404).json({ error: "Draft not found or already processed" });
      return;
    }

    res.status(200).json(liveEnvelope({ status: "approved", draftId, supervisorId }));
  },

  async rejectDraft(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const draftId = Array.isArray(id) ? id[0] : id;
    if (!draftId) {
      res.status(400).json({ error: "Draft ID required" });
      return;
    }

    const customer = getOptionalCustomer(req, res);
    const supervisorId = customer?.id ?? "supervisor_demo";
    const success = aiAgentService.rejectActionDraft(draftId, supervisorId);

    if (!success) {
      res.status(404).json({ error: "Draft not found or already processed" });
      return;
    }

    res.status(200).json(liveEnvelope({ status: "rejected", draftId, supervisorId }));
  }
};
