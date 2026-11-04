import type { AIRequest, AIEvent, ModelInfo, ProviderCapabilities, AuthState } from "@/core/types";
import type { AIProvider } from "@/providers/base/AIProvider";
import { GeminiClient } from "./GeminiClient";

export class GeminiProvider implements AIProvider {
	readonly id = "gemini";
	readonly name = "Google Gemini";
	readonly capabilities: ProviderCapabilities = {
		streaming: true,
		toolCalling: true,
		vision: true,
		corsCompatible: true,
	};

	private apiKey?: string;
	private client: GeminiClient = new GeminiClient();

	async authenticate(method: "api_key" | "oauth", credential?: string): Promise<void> {
		if (method === "api_key" && credential) {
			this.apiKey = credential;
			this.client.setApiKey(credential);
		} else {
			throw new Error("GeminiProvider only supports api_key authentication in Phase 1");
		}
	}

	getAuthState(): AuthState {
		return {
			method: "api_key",
			isAuthenticated: !!this.apiKey,
			token: this.apiKey ? "***" : undefined,
		};
	}

	async logout(): Promise<void> {
		this.apiKey = undefined;
		this.client.setApiKey("");
	}

	async getModels(): Promise<ModelInfo[]> {
		return [
			{
				id: "gemini-3.8-flash",
				name: "Gemini 3.8 Flash",
				contextWindow: 1048576,
				supportsTools: true,
				supportsStreaming: true,
				supportsVision: true,
			},
			{
				id: "gemini-3.6-flash",
				name: "Gemini 3.6 Flash",
				contextWindow: 1048576,
				supportsTools: true,
				supportsStreaming: true,
				supportsVision: true,
			},
			{
				id: "gemini-4-argon",
				name: "Gemini 4 Argon",
				contextWindow: 1048576,
				supportsTools: true,
				supportsStreaming: true,
				supportsVision: true,
			},
		];
	}

	async *generate(request: AIRequest): AsyncIterable<AIEvent> {
		if (!this.apiKey) {
			yield { type: "error", message: "Gemini API key not configured" };
			return;
		}

		// Stable Flash-class fallback; deprecated ids (e.g. gemini-2.0-flash) 404
		// in production and reference models newer Gemini ones auto-route to.
		const model = request.model || "gemini-3.8-flash";

		try {
			const stream = this.client.streamGenerateContent({
				model,
				messages: request.messages,
				tools: request.tools,
				systemPrompt: request.systemPrompt,
				signal: request.signal,
			});

			for await (const chunk of stream) {
				if (chunk.text) {
					yield { type: "text_delta", delta: chunk.text };
				}
				if (chunk.functionCall) {
					yield {
						type: "tool_call",
						// Gemini's functionCall parts carry no stable call id, so mint a
						// unique one per call; the orchestrator echoes it back in the
						// matching tool_use / tool_result history blocks.
						id: crypto.randomUUID(),
						name: chunk.functionCall.name,
						arguments: chunk.functionCall.args,
					};
				}
			}
			yield { type: "done" };
		} catch (err: any) {
			yield { type: "error", message: err.message || String(err) };
		}
	}
}
