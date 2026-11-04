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

	async getModels(): Promise<ModelInfo[]> {
		return [
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
