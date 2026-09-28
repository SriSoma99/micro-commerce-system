export type AiPersona = "shopper" | "store_manager" | "support_desk";

export interface AiMessage {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
  createdAt?: string;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface AiToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, AiToolParameterProperty>;
    required?: string[];
  };
  requiredRoles?: ("customer" | "store-manager" | "finance" | "admin")[];
  requiredScopes?: string[];
}

export interface AiCompletionRequest {
  persona: AiPersona;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  customerId?: string;
  userRole?: string;
  storeId?: string;
  temperature?: number;
}

export interface AiCompletionResponse {
  message: AiMessage;
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Port interface for LLM execution: allows swapping between local deterministic rule engine
 * and cloud LLMs (Google Gemini / Vertex AI, OpenAI) without changing service business logic.
 */
export interface LlmProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isCloud: boolean;
  generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
