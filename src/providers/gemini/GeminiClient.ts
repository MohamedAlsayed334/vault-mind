import type { AIRequest, AIEvent, ChatMessage, ContentBlock } from "@/core/types";

export interface GeminiFallbackResponse {
  text: string;
  functionCalls?: Array<{ id?: string; name: string; args: unknown }>;
}

export type GeminiFallback = (
  model: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<GeminiFallbackResponse>;

type GeminiPart = Record<string, unknown>;
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiClient {
  constructor(private readonly fallback?: GeminiFallback) {}

  async *generate(request: AIRequest, apiKey: string): AsyncIterable<AIEvent> {
    const model = request.model || "gemini-3.8-flash";
    const body = this.buildRequest(request);
    const url = `${API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Gemini API ${response.status}: ${detail || response.statusText}`);
      }
      if (!response.body) throw new Error("Gemini response has no stream body");

      yield* this.readSse(response.body, request.signal);
      return;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Gemini API ")) {
        yield { type: "error", message: error.message };
        return;
      }
      if (request.signal?.aborted) {
        yield { type: "error", message: "Request cancelled" };
        return;
      }
      if (!this.fallback) {
        yield { type: "error", message: this.toMessage(error) };
        return;
      }
      // Obsidian requestUrl fallback handles mobile environments where fetch/CORS fails.
      try {
        const result = await this.fallback(model, apiKey, body, request.signal);
        if (result.text) yield { type: "text_delta", delta: result.text };
        for (const call of result.functionCalls ?? []) {
          yield { type: "tool_call", id: call.id ?? crypto.randomUUID(), name: call.name, arguments: call.args };
        }
        yield { type: "done" };
      } catch (fallbackError) {
        yield { type: "error", message: this.toMessage(fallbackError) };
      }
    }
  }

  private buildRequest(request: AIRequest): Record<string, unknown> {
    const contents: GeminiContent[] = [];
    const toolNames = new Map<string, string>();
    for (const message of request.messages) {
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "tool_use") toolNames.set(block.id, block.name);
        }
      }
    }
    for (const message of request.messages) {
      const parts = this.messageParts(message, toolNames);
      if (!parts.length) continue;
      const role = message.role === "assistant" ? "model" : "user";
      contents.push({ role, parts });
    }

    const tools = request.tools?.length
      ? [{ functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        })) }]
      : undefined;

    return {
      contents,
      ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
      ...(tools ? { tools } : {}),
    };
  }

  private messageParts(message: ChatMessage, toolNames: Map<string, string>): GeminiPart[] {
    if (typeof message.content === "string") return message.content ? [{ text: message.content }] : [];
    const parts: GeminiPart[] = [];
    for (const block of message.content as ContentBlock[]) {
      if (block.type === "text") parts.push({ text: block.text });
      else if (block.type === "tool_use") {
        parts.push({ functionCall: { name: block.name, args: block.input } });
      } else if (block.type === "tool_result") {
        parts.push({ functionResponse: { name: toolNames.get(block.toolUseId) ?? block.toolUseId, response: { result: block.content } } });
      }
    }
    return parts;
  }

  private async *readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncIterable<AIEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          yield { type: "error", message: "Request cancelled" };
          return;
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const eventText of events) {
          const data = eventText.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
          if (!data || data === "[DONE]") continue;
          let parsed: any;
          try { parsed = JSON.parse(data); } catch { continue; }
          const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (typeof part.text === "string" && part.text) yield { type: "text_delta", delta: part.text };
            if (part.functionCall?.name) {
              const call = part.functionCall;
              yield { type: "tool_call", id: call.id ?? crypto.randomUUID(), name: call.name, arguments: call.args ?? {} };
            }
          }
          if (parsed?.error?.message) yield { type: "error", message: parsed.error.message };
        }
      }
      yield { type: "done" };
    } finally {
      reader.releaseLock();
    }
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
