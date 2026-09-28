export type AiPersona = "shopper" | "store_manager" | "support_desk";

export interface AiMessageUi {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: { name: string; arguments: Record<string, unknown>; result: unknown }[];
  draftCreated?: { id: string; actionType: string; reason: string; riskScore: number };
  createdAt?: string;
}

export interface AiChatResponse {
  conversationId: string;
  response: string;
  toolCalls?: { name: string; arguments: Record<string, unknown>; result: unknown }[];
  draftCreated?: { id: string; actionType: string; reason: string; riskScore: number };
}

export interface PolicyDocumentUi {
  id: string;
  topic: string;
  title: string;
  summary: string;
  rules: string[];
  instantAutoApproveLimitMinor?: number;
}

export interface AiActionDraftUi {
  id: string;
  conversationId: string | null;
  customerId: string;
  actionType: "refund" | "reschedule" | "transfer";
  parametersJson: string;
  reason: string;
  riskScore: number;
  status: "pending" | "approved" | "rejected";
  supervisorId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AiMetricsSummaryUi {
  totalQueries: number;
  faithfulnessScore: number;
  contextPrecision: number;
  contextRecall: number;
  avgLatencyMs: number;
  autoApprovedActionsCount: number;
  supervisorDraftsCount: number;
  autoRefundTotalMinor: number;
  toolInvocations: Record<string, number>;
  personaBreakdown: Record<string, number>;
}
