import type { LlmProvider } from "./types";
import type { VectorSearchProvider } from "./vectorProvider";
import { DeterministicLocalLlmProvider } from "./deterministicLlmProvider";
import { CloudGeminiLlmProvider } from "./cloudGeminiLlmProvider";
import { SqliteFtsVectorProvider } from "./vectorProvider";

class AiProviderRegistry {
  private llmProvider: LlmProvider;
  private vectorProvider: VectorSearchProvider;

  constructor() {
    // Automatically select Gemini if GEMINI_API_KEY is present, else local deterministic engine
    if (process.env.GEMINI_API_KEY) {
      this.llmProvider = new CloudGeminiLlmProvider(process.env.GEMINI_API_KEY);
    } else {
      this.llmProvider = new DeterministicLocalLlmProvider();
    }
    this.vectorProvider = new SqliteFtsVectorProvider();
  }

  getLlmProvider(): LlmProvider {
    return this.llmProvider;
  }

  setLlmProvider(provider: LlmProvider): void {
    this.llmProvider = provider;
  }

  getVectorProvider(): VectorSearchProvider {
    return this.vectorProvider;
  }

  setVectorProvider(provider: VectorSearchProvider): void {
    this.vectorProvider = provider;
  }
}

export const aiProviders = new AiProviderRegistry();
