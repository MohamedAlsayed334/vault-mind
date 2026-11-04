import type { ChatMessage, ContentBlock, ToolDefinition } from "@/core/types";

export interface GeminiFunctionCall {
	name: string;
	args: Record<string, unknown>;
}

export interface GeminiStreamChunk {
	text?: string;
	functionCall?: GeminiFunctionCall;
}

export class GeminiClient {
	private apiKey?: string;

	setApiKey(apiKey: string) {
		this.apiKey = apiKey;
	}

	async *streamGenerateContent(params: {
		model: string;
		messages: ChatMessage[];
		tools?: ToolDefinition[];
		systemPrompt?: string;
		signal?: AbortSignal;
	}): AsyncIterable<GeminiStreamChunk> {
		if (!this.apiKey) {
			throw new Error("API key not set");
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

		const body: Record<string, unknown> = {
			contents: params.messages.map((msg) => ({
				role: this.roleFor(msg),
				parts: this.partsFor(msg.content),
			})),
		};

		if (params.systemPrompt) {
			body.system_instruction = {
				parts: [{ text: params.systemPrompt }],
			};
		}

		if (params.tools && params.tools.length > 0) {
			body.tools = [
				{
					functionDeclarations: params.tools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema,
					})),
				},
			];
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
							const parts = data.candidates?.[0]?.content?.parts;
							if (Array.isArray(parts)) {
								for (const part of parts) {
									if (typeof part.text === "string" && part.text.length > 0) {
										yield { text: part.text };
									}
									if (part.functionCall) {
										yield {
											functionCall: {
												name: part.functionCall.name,
												args: part.functionCall.args ?? {},
											},
										};
									}
								}
							}
						} catch {
							// Ignore parse errors for incomplete chunks
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	private roleFor(msg: ChatMessage): "model" | "user" {
		return msg.role === "assistant" ? "model" : "user";
	}

	/** Map a message's content into Gemini parts (text / functionCall / functionResponse). */
	private partsFor(content: ChatMessage["content"]): Array<Record<string, unknown>> {
		if (typeof content === "string") {
			return [{ text: content }];
		}

		const parts: Array<Record<string, unknown>> = [];
		for (const block of content as ContentBlock[]) {
			switch (block.type) {
				case "text":
					parts.push({ text: block.text });
					break;
				case "tool_use":
					parts.push({
						functionCall: {
							name: block.name,
							args: (block.input as Record<string, unknown>) ?? {},
						},
					});
					break;
				case "tool_result":
					parts.push({
						functionResponse: {
							name: block.name,
							response: { result: block.content },
						},
					});
					break;
				default:
					break;
			}
		}
		return parts.length > 0 ? parts : [{ text: "" }];
	}
}
