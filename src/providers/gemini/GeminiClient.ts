import type { ChatMessage } from "@/core/types";

export interface GeminiStreamChunk {
	text?: string;
}

export class GeminiClient {
	private apiKey?: string;

	setApiKey(apiKey: string) {
		this.apiKey = apiKey;
	}

	async *streamGenerateContent(params: {
		model: string;
		messages: ChatMessage[];
		systemPrompt?: string;
		signal?: AbortSignal;
	}): AsyncIterable<GeminiStreamChunk> {
		if (!this.apiKey) {
			throw new Error("API key not set");
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

		const contents = params.messages.map((msg) => ({
			role: msg.role === "assistant" ? "model" : "user",
			parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
		}));

		const body: any = { contents };

		if (params.systemPrompt) {
			body.system_instruction = {
				parts: [{ text: params.systemPrompt }],
			};
		}

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: params.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Gemini API error (${response.status}): ${errorText}`);
		}

		if (!response.body) {
			throw new Error("Response body is missing");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
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
							const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
							if (text) {
								yield { text };
							}
						} catch (e) {
							// Ignore parse errors for incomplete chunks
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}
