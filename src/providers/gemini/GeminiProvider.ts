import type { AIRequest, AIEvent, ModelInfo, ModelListResult, ProviderCapabilities, AuthState } from "@/core/types";
import type { AIProvider } from "@/providers/base/AIProvider";
import { ProviderError, classify, isAbortError } from "@/core/ProviderError";
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

	/**
	 * Used as-is when the live models fetch fails (network error, non-200,
	 * malformed body) so the settings UI always has a usable list.
	 */
	static readonly fallbackModels: ModelInfo[] = [
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

	/**
	 * Minimal honest probe for the settings test-connection button. Unlike
	 * getModels() it reports failure instead of falling back silently, so a
	 * wrong key shows an error rather than a passing list.
	 */
	static async checkConnection(apiKey: string): Promise<void> {
		const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
			method: "GET",
			// Auth via header keeps the key out of URLs (which end up in logs/proxies).
			headers: { "x-goog-api-key": apiKey },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			// This probe hits the models LIST endpoint: a 404 here is a URL/deploy
			// problem, not a missing model, so no modelRequest hint is passed.
			const body = await res.text().catch(() => undefined);
			throw new ProviderError(classify(res.status, body), `Gemini rejected the request (${res.status})`, {
				cause: body,
				providerId: "gemini",
			});
		}
		const data = await res.json().catch(() => null);
		if (!data || !Array.isArray(data.models)) {
			throw new ProviderError("unknown", "Unexpected response from Gemini models endpoint", {
				providerId: "gemini",
			});
		}
	}

	async getModels(): Promise<ModelListResult> {
		if (!this.apiKey) {
			return { models: GeminiProvider.fallbackModels, degraded: false };
		}

		try {
			const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
				method: "GET",
				// Auth via header keeps the key out of URLs (which end up in logs/proxies).
				headers: { "x-goog-api-key": this.apiKey },
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				return { models: GeminiProvider.fallbackModels, degraded: true, reason: geminiModelsFailureReason(classify(res.status, body)) };
			}

			const data = await res.json();
			const entries = data?.models;
			if (!Array.isArray(entries)) {
				return { models: GeminiProvider.fallbackModels, degraded: true, reason: "Couldn't load models from Google Gemini. Using the built-in model list." };
			}

			const models = entries
				// Only entries that can actually answer a chat turn belong in the UI.
				.filter(
					(m) =>
						Array.isArray(m.supportedGenerationMethods) &&
						m.supportedGenerationMethods.includes("generateContent"),
				)
				.map((m): ModelInfo => {
					const id = typeof m.name === "string" ? m.name.replace(/^models\//, "") : "";
					const name = typeof m.displayName === "string" && m.displayName ? m.displayName : id;
					return {
						id,
						name,
						contextWindow: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : 0,
						// List metadata does not expose tool-calling or vision support;
						// generateContent models are function-calling capable in practice,
						// and Gemini models accept image input — same defaults as the
						// static list.
						supportsTools: true,
						supportsStreaming: true,
						supportsVision: true,
					};
				})
				.filter((m) => m.id.length > 0);

			return { models: models.length > 0 ? models : GeminiProvider.fallbackModels, degraded: false };
		} catch (err) {
			// Network error / bad JSON — the static list keeps the UI working.
			const reason = err instanceof TypeError
				? "Couldn't reach Google Gemini. Check your internet connection. Using the built-in model list."
				: "Couldn't load models from Google Gemini. Using the built-in model list.";
			return { models: GeminiProvider.fallbackModels, degraded: true, reason };
		}
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
					message: "Couldn't connect to Google Gemini",
					code: "network",
					cause: err.message,
				};
				return;
			}
			yield { type: "error", message: err instanceof Error ? err.message : String(err) };
		}
	}
}

function geminiModelsFailureReason(code: string): string {
	const headline: Record<string, string> = {
		invalid_key: "Your Google Gemini API key was rejected.",
		rate_limited: "Google Gemini is rate limited.",
		quota_exceeded: "You've hit Google Gemini's quota or billing limit.",
		server: "Google Gemini is having server trouble.",
		unknown: "Something went wrong while loading models from Google Gemini.",
	};
	return `${headline[code] ?? headline.unknown} Using the built-in model list.`;
}
