import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiClient } from "./GeminiClient";
import { ProviderError, isAbortError } from "../../core/ProviderError";

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
			for await (const _ of client.streamGenerateContent({ model: "gemini-3.8-flash", messages: [] })) {
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
			model: "gemini-3.8-flash",
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
			model: "gemini-3.8-flash",
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
			model: "gemini-3.8-flash",
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
			model: "gemini-3.8-flash",
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
			model: "gemini-3.8-flash",
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

	it("throws a coded ProviderError on HTTP errors, preserving the raw body as cause", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("quota exceeded, check your billing", { status: 429 }));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const err = (await asyncThrows(async () => {
			for await (const _ of client.streamGenerateContent({
				model: "gemini-3.8-flash",
				messages: [{ role: "user", content: "hi" }],
			})) {
				// consume
			}
		})) as ProviderError;
		expect(err).toBeInstanceOf(ProviderError);
		expect(err.message).toBe("Gemini rejected the request (429)");
		expect(err.code).toBe("quota_exceeded");
		expect(err.cause).toBe("quota exceeded, check your billing");
		expect(err.modelId).toBe("gemini-3.8-flash");
	});

	it("maps a 404 on a retired model to model_not_found with the real body as cause", async () => {
		// Real production body captured from Gemini's retirement of gemini-2.0-flash.
		const body =
			'{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available...","status":"NOT_FOUND"}}';
		const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const err = (await asyncThrows(async () => {
			for await (const _ of client.streamGenerateContent({
				model: "gemini-2.0-flash",
				messages: [{ role: "user", content: "hi" }],
			})) {
				// consume
			}
		})) as ProviderError;
		expect(err).toBeInstanceOf(ProviderError);
		expect(err.code).toBe("model_not_found");
		expect(err.message).toBe("Gemini rejected the request (404)");
		expect(err.cause).toBe(body);
	});

	it("classifies fetch network failures as network errors", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const err = (await asyncThrows(async () => {
			for await (const _ of client.streamGenerateContent({
				model: "gemini-3.8-flash",
				messages: [{ role: "user", content: "hi" }],
			})) {
				// consume
			}
		})) as ProviderError;
		expect(err).toBeInstanceOf(ProviderError);
		expect(err.code).toBe("network");
		expect(err.cause).toBe("Failed to fetch");
	});

	it("rethrows user aborts unchanged so they never surface as errors", async () => {
		const abortError = new Error("The operation was aborted");
		abortError.name = "AbortError";
		const fetchMock = vi.fn().mockRejectedValue(abortError);
		vi.stubGlobal("fetch", fetchMock);

		const client = new GeminiClient();
		client.setApiKey("test-key");

		const err = (await asyncThrows(async () => {
			for await (const _ of client.streamGenerateContent({
				model: "gemini-3.8-flash",
				messages: [{ role: "user", content: "hi" }],
			})) {
				// consume
			}
		})) as Error;
		expect(isAbortError(err)).toBe(true);
	});
});

/** Consume the async iterable and return the rejection it ended with. */
async function asyncThrows(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (err) {
		return err;
	}
	throw new Error("Expected the iterable to throw, but it completed");
}
