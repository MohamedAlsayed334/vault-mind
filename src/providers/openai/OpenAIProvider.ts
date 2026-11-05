import type { AIRequest, AIEvent, ModelInfo, ModelListResult, ProviderCapabilities, AuthState, ContentBlock } from "@/core/types";
import type { AIProvider } from "@/providers/base/AIProvider";
import { ProviderError, classify, isAbortError } from "@/core/ProviderError";

export class OpenAIProvider implements AIProvider {
	readonly id = "openai";
	readonly name = "OpenAI";
	readonly capabilities: ProviderCapabilities = {
		streaming: true,
		toolCalling: true,
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
			// This probe hits the models LIST endpoint: a 404 here is a URL/deploy
			// problem, not a missing model, so no modelRequest hint is passed.
			const body = await res.text().catch(() => undefined);
			throw new ProviderError(classify(res.status, body), `OpenAI rejected the request (${res.status})`, {
				cause: body,
				providerId: "openai",
			});
		}
		const data = await res.json().catch(() => null);
		if (!data || !Array.isArray(data.data)) {
			throw new ProviderError("unknown", "Unexpected response from OpenAI models endpoint", {
				providerId: "openai",
			});
		}
	}

	async getModels(): Promise<ModelListResult> {
		if (!this.accessToken) {
			return { models: OpenAIProvider.fallbackModels, degraded: false };
		}

		try {
			const res = await fetch("https://api.openai.com/v1/models", {
				method: "GET",
				headers: { Authorization: `Bearer ${this.accessToken}` },
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				return { models: OpenAIProvider.fallbackModels, degraded: true, reason: openaiModelsFailureReason(classify(res.status, body)) };
			}

			const data = await res.json();
			const entries = data?.data;
			if (!Array.isArray(entries)) {
				return { models: OpenAIProvider.fallbackModels, degraded: true, reason: "Couldn't load models from OpenAI. Using the built-in model list." };
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

			return { models: models.length > 0 ? models : OpenAIProvider.fallbackModels, degraded: false };
		} catch (err) {
			// Network error / bad JSON — the static list keeps the UI working.
			const reason = err instanceof TypeError
				? "Couldn't reach OpenAI. Check your internet connection. Using the built-in model list."
				: "Couldn't load models from OpenAI. Using the built-in model list.";
			return { models: OpenAIProvider.fallbackModels, degraded: true, reason };
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

		const body: Record<string, unknown> = {
			model,
			messages: this.messagesFor(request),
			stream: true,
		};

		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools.map((tool) => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				},
			}));
		}

		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.accessToken}`,
				},
				body: JSON.stringify(body),
				signal: request.signal,
			});

			if (!res.ok) {
				const errText = await res.text();
				// This IS a generate call, so a model id is in play: 404 → model_not_found.
				throw new ProviderError(classify(res.status, errText, { modelRequest: true }), `OpenAI rejected the request (${res.status})`, {
					cause: errText,
					providerId: this.id,
					modelId: model,
				});
			}

			if (!res.body) {
				throw new Error("Response body missing");
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			// OpenAI streams a single call as many index-keyed fragments
			// (id / name / argument slices). Accumulate per call index and
			// yield complete calls once the stream closes.
			const pendingCalls = new Map<number, { id: string; name: string; arguments: string }>();

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
							const delta = data.choices?.[0]?.delta;
							if (typeof delta?.content === "string" && delta.content) {
								yield { type: "text_delta", delta: delta.content };
							}
							if (Array.isArray(delta?.tool_calls)) {
								for (const tc of delta.tool_calls) {
									const index = typeof tc.index === "number" ? tc.index : 0;
									const entry = pendingCalls.get(index) ?? { id: "", name: "", arguments: "" };
									if (typeof tc.id === "string" && tc.id) entry.id = tc.id;
									if (typeof tc.function?.name === "string" && tc.function.name) {
										entry.name = tc.function.name;
									}
									if (typeof tc.function?.arguments === "string") {
										entry.arguments += tc.function.arguments;
									}
									pendingCalls.set(index, entry);
								}
							}
						} catch {
							// Ignore incomplete chunk parse errors
						}
					}
				}
			}

			for (const call of pendingCalls.values()) {
				// Mirror Gemini: yield a parsed arguments object; when the model
				// produced invalid JSON the orchestrator still needs the raw
				// payload, so pass the string through as-is.
				let args: unknown;
				try {
					args = call.arguments ? JSON.parse(call.arguments) : {};
				} catch {
					args = call.arguments;
				}
				yield { type: "tool_call", id: call.id, name: call.name, arguments: args };
			}

			yield { type: "done" };
		} catch (err: unknown) {
			// User-driven abort: fetch rejects with an AbortError the orchestrator
			// intentionally swallows (it returns on signal.aborted before handling
			// events). Yield a quiet "Cancelled" so the shape is unchanged and no
			// scary error ever surfaces in chat.
			if (isAbortError(err)) {
				yield { type: "error", message: "Cancelled" };
				return;
			}
			if (err instanceof ProviderError) {
				yield { type: "error", message: err.message, code: err.code, cause: err.cause };
				return;
			}
			if (err instanceof TypeError) {
				// "Failed to fetch" and friends — a genuine network failure.
				yield {
					type: "error",
					message: "Couldn't connect to OpenAI",
					code: "network",
					cause: err.message,
				};
				return;
			}
			yield { type: "error", message: err instanceof Error ? err.message : String(err) };
		}
	}

	/** Map session history into the OpenAI chat-completions wire format. */
	private messagesFor(request: AIRequest): Array<Record<string, unknown>> {
		const messages: Array<Record<string, unknown>> = [];
		if (request.systemPrompt) {
			messages.push({ role: "system", content: request.systemPrompt });
		}

		for (const msg of request.messages) {
			if (typeof msg.content === "string") {
				messages.push({ role: msg.role, content: msg.content });
				continue;
			}

			const blocks = msg.content as ContentBlock[];
			const toolResults = blocks.filter((b) => b.type === "tool_result");
			const toolUses = blocks.filter((b) => b.type === "tool_use");
			const images = blocks.filter((b) => b.type === "image");
			const text =
				blocks
					.filter((b) => b.type === "text")
					.map((b) => (b as { text: string }).text)
					.join("\n") || null;

			// The orchestrator hands tool results back inside a user turn;
			// OpenAI requires each as its own role:"tool" message keyed by
			// tool_call_id, in call order.
			if (toolResults.length > 0) {
				for (const result of toolResults as Array<Extract<ContentBlock, { type: "tool_result" }>>) {
					messages.push({
						role: "tool",
						tool_call_id: result.toolUseId,
						content: result.content,
					});
				}
				if (text) {
					messages.push({ role: "user", content: text });
				}
				continue;
			}

			// The assistant turn that issued the calls carries its text (or
			// null when it only called tools) plus the tool_calls array.
			if (toolUses.length > 0) {
				messages.push({
					role: msg.role,
					content: text,
					tool_calls: (toolUses as Array<Extract<ContentBlock, { type: "tool_use" }>>).map((use) => ({
						id: use.id,
						type: "function",
						function: {
							name: use.name,
							arguments: JSON.stringify(use.input ?? {}),
						},
					})),
				});
				continue;
			}

			// Plain multimodal turn: images become content parts.
			if (images.length > 0 && msg.role !== "assistant") {
				const parts: Array<Record<string, unknown>> = [];
				if (text) parts.push({ type: "text", text });
				for (const image of images as Array<Extract<ContentBlock, { type: "image" }>>) {
					parts.push({ type: "image_url", image_url: { url: image.url } });
				}
				messages.push({ role: msg.role, content: parts.length > 0 ? parts : null });
				continue;
			}

			messages.push({ role: msg.role, content: text ?? "" });
		}

		return messages;
	}
}

function openaiModelsFailureReason(code: string): string {
	const headline: Record<string, string> = {
		invalid_key: "Your OpenAI API key was rejected.",
		rate_limited: "OpenAI is rate limited.",
		quota_exceeded: "You've hit OpenAI's quota or billing limit.",
		server: "OpenAI is having server trouble.",
		unknown: "Something went wrong while loading models from OpenAI.",
	};
	return `${headline[code] ?? headline.unknown} Using the built-in model list.`;
}
