import type { AIRequest, AIEvent, ModelInfo, ProviderCapabilities, AuthState } from "@/core/types";\nimport type { AIProvider } from "@/providers/base/AIProvider";
import { GeminiClient, type GeminiFallback } from "./GeminiClient";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolCalling: true,
    vision: false,
    corsCompatible: true,
  };

  private apiKey: string | null = null;
  private readonly client: GeminiClient;

  constructor(fallback?: GeminiFallback) {
    this.client = new GeminiClient(fallback);
  }

  async authenticate(method: "api_key" | "oauth", credential?: string): Promise<void> {
    if (method !== "api_key") throw new Error("Gemini provider currently supports API-key authentication only.");
    const key = credential?.trim();
    if (!key) throw new Error("Gemini API key is required.");
    this.apiKey = key;
  }

  getAuthState(): AuthState {
    return { method: "api_key", isAuthenticated: Boolean(this.apiKey) };
  }

  async logout(): Promise<void> {
    this.apiKey = null;
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", contextWindow: 1_000_000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", contextWindow: 1_000_000, supportsTools: true, supportsStreaming: true, supportsVision: true },
    ];
  }

  async *generate(request: AIRequest): AsyncIterable<AIEvent> {
    if (!this.apiKey) {
      yield { type: "error", message: "Gemini API key is not configured. Add it in Vault Mind settings." };
      return;
    }
    yield* this.client.generate(request, this.apiKey);
  }
}
