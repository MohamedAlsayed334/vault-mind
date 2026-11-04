import type { ChatMessage, AIRequest, AIEvent, ModelInfo, ProviderCapabilities, AuthState } from "@/core/types";
import type { AIProvider } from "@/providers/base/AIProvider";

export class OpenAIProvider implements AIProvider {
	readonly id = "openai";
	readonly name = "OpenAI";
	readonly capabilities: ProviderCapabilities = {
		streaming: true,
		// Tool-call mapping is not implemented yet for OpenAI; the agent loop
		// simply won't receive tool_call events from this provider for now.
		toolCalling: false,
		vision: true,
		corsCompatible: true,
	};

	// Auth is purely credential-driven: the plugin/settings pass the key via
	// authenticate(). Token persistence stays with the TokenStore (see
	// PluginStorage / SettingsTab), not with the provider instance.
	private accessToken?: string;

	async authenticate(method: "api_key" | "oauth", credential?: string): Promise<void> {
		if (method !== "api_key") {
			throw new Error("OpenAI OAuth is not supported yet; use an API key");
		}
		if (credential) {
			this.accessToken = credential;
		} else {
			throw new Error("Credential required for OpenAI authentication");
		}
	}

	getAuthState(): AuthState {
		return {
			method: "api_key",
			isAuthenticated: !!this.accessToken,
			token: this.accessToken ? "***" : undefined,
		};
	}

	async logout(): Promise<void> {
		this.accessToken = undefined;
	}

	/**
	 * Used as-is when the live models fetch fails (network error, non-200,
	 * malformed body) so the settings UI always has a usable list.
	 */
	static readonly fallbackModels: ModelInfo[] = [
		{
			id: "gpt-6.1-sol",
			name: "GPT-6.1 Sol",
			contextWindow: 1050000,
			supportsTools: true,
			supportsStreaming: true,
			supportsVision: true,
		},
		{
			id: "gpt-6-luna",
			name: "GPT-6 Luna",
			contextWindow: 1050000,
			supportsTools: true,
			supportsStreaming: true,
			supportsVision: true,
		},
	];

	/**
	 * Minimal honest probe for the settings test-connection button. Unlike
	 * getModels() it reports failure instead of falling back silently, so a
	 * wrong key shows an error rather than a passing list.
	 */
	static async checkConnection(apiKey: string): Promise<void> {
		const res = await fetch("https://api.openai.com/v1/models", {
			method: "GET",
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			throw new Error(`OpenAI API error (${res.status})`);
		}
		const data = await res.json();
		if (!data || !Array.isArray(data.data)) {
			throw new Error("Unexpected response from OpenAI models endpoint");
		}
	}

	async getModels(): Promise<ModelInfo[]> {
		if (!this.accessToken) {
			return OpenAIProvider.fallbackModels;
		}

		try {
			const res = await fetch("https://api.openai.com/v1/models", {
				method: "GET",
				headers: { Authorization: `Bearer ${this.accessToken}` },
			});
			if (!res.ok) {
				return OpenAIProvider.fallbackModels;
			}

			const data = await res.json();
			const entries = data?.data;
			if (!Array.isArray(entries)) {
				return OpenAIProvider.fallbackModels;
			}

			const models = entries
				.filter((m) => typeof m.id === "string" && m.id.length > 0)
				.map((m): ModelInfo => {
					const id = m.id;
					// The list endpoint does not advertise modality per family, so
					// tool/stream/vision support is derived from known chat-capable
					// families and stays conservative where unsure.
					const chatCapable = OpenAIProvider.isChatCapable(id);
					return {
						id,
						name: id,
						// Input context is not reported by the list endpoint.
						contextWindow: 0,
						supportsTools: chatCapable,
						supportsStreaming: chatCapable,
						supportsVision: /^(gpt-4o|gpt-4\.1|gpt-5|gpt-6|o[0-9])/.test(id),
					};
				});

			return models.length > 0 ? models : OpenAIProvider.fallbackModels;
		} catch {
			// Network error / bad JSON — the static list keeps the UI working.
			return OpenAIProvider.fallbackModels;
		}
	}

	/** True for families known to accept chat completions (incl. tool calls). */
	private static isChatCapable(id: string): boolean {
		return /^(chatgpt|gpt-3\.5-turbo|gpt-4|gpt-5|gpt-6|o[0-9])/.test(id);
	}

	async *generate(request: AIRequest): AsyncIterable<AIEvent> {
		if (!this.accessToken) {
			yield { type: "error", message: "OpenAI not authenticated" };
			return;
		}

		const model = request.model || "gpt-6-luna";
		const url = "https://api.openai.com/v1/chat/completions";

		const messages = request.messages.map((m: ChatMessage) => ({
			role: m.role,
			content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
		}));

		if (request.systemPrompt) {
			messages.unshift({ role: "system", content: request.systemPrompt });
		}

		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.accessToken}`,
				},
				body: JSON.stringify({
					model,
					messages,
					stream: true,
				}),
				signal: request.signal,
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(`OpenAI API error (${res.status}): ${errText}`);
			}

			if (!res.body) {
				throw new Error("Response body missing");
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(":")) continue;
					if (trimmed.startsWith("data:")) {
						const jsonStr = trimmed.slice(5).trim();
						if (jsonStr === "[DONE]") continue;

						try {
							const data = JSON.parse(jsonStr);
							const delta = data.choices?.[0]?.delta?.content;
							if (delta) {
								yield { type: "text_delta", delta };
							}
						} catch (e) {
							// Ignore incomplete chunk parse errors
						}
					}
				}
			}

			yield { type: "done" };
		} catch (err: any) {
			yield { type: "error", message: err.message || String(err) };
		}
	}
}
