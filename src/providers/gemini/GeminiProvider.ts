import type { AIRequest, AIEvent, ModelInfo, ProviderCapabilities, AuthState } from "@/core/types";
import type { AIProvider } from "@/providers/base/AIProvider";
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
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1_000_000, supportsTools: true, supportsStreaming: true, supportsVision: true },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2_000_000, supportsTools: true, supportsStreaming: true, supportsVision: true },
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
