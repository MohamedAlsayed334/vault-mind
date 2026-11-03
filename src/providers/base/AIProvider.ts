import type { AIRequest, AIEvent, ModelInfo, ProviderCapabilities, AuthState } from "@/core/types";

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  authenticate(method: "api_key" | "oauth", credential?: string): Promise<void>;
  getAuthState(): AuthState;
  logout(): Promise<void>;

  getModels(): Promise<ModelInfo[]>;

  /**
   * Generate a response. Yields AIEvents.
   * All providers must implement this — streaming is optional per capabilities.
   */
  generate(request: AIRequest): AsyncIterable<AIEvent>;
}
