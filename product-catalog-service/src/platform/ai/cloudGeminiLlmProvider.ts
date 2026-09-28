import type { AiCompletionRequest, AiCompletionResponse, LlmProvider } from "./types";
import { DeterministicLocalLlmProvider } from "./deterministicLlmProvider";
import { logger } from "../../utils/logger";

/**
 * Cloud LLM Adapter for Google Gemini / Vertex AI.
 * If GEMINI_API_KEY is present, connects to Gemini 1.5/2.0 REST endpoint;
 * otherwise gracefully falls back to the deterministic local engine.
 */
export class CloudGeminiLlmProvider implements LlmProvider {
  readonly id = "google-gemini-cloud";
  readonly displayName = "Google Gemini (Cloud AI)";
  readonly isCloud = true;

  private apiKey: string;
  private modelName: string;
  private fallback: DeterministicLocalLlmProvider;

  constructor(apiKey?: string, modelName = "gemini-1.5-flash") {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.modelName = modelName;
    this.fallback = new DeterministicLocalLlmProvider();
  }

  async generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.apiKey) {
      return this.fallback.generateCompletion(request);
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      
      const contents = request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
        parts: [{ text: m.content }]
      }));

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: 800
          }
        })
      });

      if (!res.ok) {
        logger.warn("CloudGemini", `Gemini API returned status ${res.status}, falling back to local deterministic engine`);
        return this.fallback.generateCompletion(request);
      }

      const data = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return this.fallback.generateCompletion(request);
      }

      return {
        message: { role: "assistant", content: text },
        finishReason: "stop",
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata?.totalTokenCount ?? 0
        }
      };
    } catch (err) {
      logger.warn("CloudGemini", `Error calling Gemini API: ${err instanceof Error ? err.message : String(err)}, using local engine`);
      return this.fallback.generateCompletion(request);
    }
  }
}
