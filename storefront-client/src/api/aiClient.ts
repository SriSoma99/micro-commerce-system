import { apiRequest } from "./client";
import type { AiChatResponse, PolicyDocumentUi, AiActionDraftUi, AiMetricsSummaryUi, AiPersona } from "../types/ai";

export async function sendAiChatMessage(
  message: string,
  options: {
    conversationId?: string;
    persona?: AiPersona;
    storeId?: string;
    token?: string;
  } = {}
) {
  return apiRequest<AiChatResponse>("/ai/chat", {
    method: "POST",
    token: options.token,
    body: {
      message,
      conversationId: options.conversationId,
      persona: options.persona ?? "shopper",
      storeId: options.storeId
    }
  });
}

export async function fetchAiPolicies() {
  return apiRequest<{ policies: PolicyDocumentUi[] }>("/ai/policies");
}

export async function fetchAiMetrics() {
  return apiRequest<AiMetricsSummaryUi>("/ai/metrics");
}

export async function fetchAiDrafts(token: string, status?: "pending" | "approved" | "rejected") {
  const query = status ? `?status=${status}` : "";
  return apiRequest<{ drafts: AiActionDraftUi[] }>(`/ai/drafts${query}`, { token });
}

export async function approveAiDraft(token: string, draftId: string) {
  return apiRequest<{ status: string; draftId: string }>(`/ai/drafts/${draftId}/approve`, {
    method: "POST",
    token
  });
}

export async function rejectAiDraft(token: string, draftId: string) {
  return apiRequest<{ status: string; draftId: string }>(`/ai/drafts/${draftId}/reject`, {
    method: "POST",
    token
  });
}
