import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiClient } from "./GeminiClient";

/** Encode SSE data lines as a ReadableStream, as a real fetch response would. */
function sseResponse(events: object[]): Response {
	const encoder = new TextEncoder();
	const chunks = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const textChunk = {
	candidates: [{ content: { parts: [{ text: "hello" }], role: "model" } }],
};

const functionCallChunk = {
	candidates: [
		{
			content: {
				parts: [{ functionCall: { name: "read_note", args: { path: "a.md" } } }],
				role: "model",
			},
		},
	],
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("GeminiClient", () => {
	it("throws when no API key is set", async () => {
		const client = new GeminiClient();
		await expect(async () => {
			for await (const _ of client.streamGenerateContent({ model: "gemini-2.0-flash", messages: [] })) {
				// consume
			}
		}).rejects.toThrow("API key not set");
	});

	it("streams text deltas from the SSE response", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([textChunk, textChunk]));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const chunks = [];
		for await (const chunk of client.streamGenerateContent({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: "hi" }],
		})) {
			chunks.push(chunk);
		}

		expect(chunks.map((c) => c.text)).toEqual(["hello", "hello"]);
	});

	it("streams functionCall chunks as tool calls", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([functionCallChunk]));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const chunks = [];
		for await (const chunk of client.streamGenerateContent({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: "read note a" }],
		})) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual([
			{ functionCall: { name: "read_note", args: { path: "a.md" } } },
		]);
	});

	it("sends the API key via the x-goog-api-key header, not the URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([textChunk]));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("secret-key-123");

		for await (const _ of client.streamGenerateContent({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: "hi" }],
		})) {
			// consume
		}

		const [url, init] = fetchMock.mock.calls[0];
		expect(init.headers["x-goog-api-key"]).toBe("secret-key-123");
		expect(String(url)).not.toContain("secret-key-123");
	});

	it("sends tool definitions as functionDeclarations", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for await (const _ of client.streamGenerateContent({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: "hi" }],
			tools: [
				{
					name: "read_note",
					description: "Read a note",
					inputSchema: { type: "object", properties: { path: { type: "string" } } },
				},
			],
		})) {
			// consume
		}

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.tools[0].functionDeclarations[0]).toEqual({
			name: "read_note",
			description: "Read a note",
			parameters: { type: "object", properties: { path: { type: "string" } } },
		});
	});

	it("maps tool_use and tool_result blocks into Gemini functionCall/functionResponse parts", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for await (const _ of client.streamGenerateContent({
			model: "gemini-2.0-flash",
			messages: [
				{ role: "user", content: "read it" },
				{
					role: "assistant",
					content: [
						{ type: "tool_use", id: "call-1", name: "read_note", input: { path: "a.md" } },
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							toolUseId: "call-1",
							name: "read_note",
							content: "note body",
						},
					],
				},
			],
		})) {
			// consume
		}

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.contents).toEqual([
			{ role: "user", parts: [{ text: "read it" }] },
			{
				role: "model",
				parts: [{ functionCall: { name: "read_note", args: { path: "a.md" } } }],
			},
			{
				role: "user",
				parts: [{ functionResponse: { name: "read_note", response: { result: "note body" } } }],
			},
		]);
	});

	it("surfaces HTTP errors as thrown messages", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("quota exceeded", { status: 429 }));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		await expect(async () => {
			for await (const _ of client.streamGenerateContent({
				model: "gemini-2.0-flash",
				messages: [{ role: "user", content: "hi" }],
			})) {
				// consume
			}
		}).rejects.toThrow("Gemini API error (429)");
	});
});
