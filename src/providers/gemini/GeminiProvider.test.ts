import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiProvider } from "./GeminiProvider";

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

const dualFunctionCallChunk = {
	candidates: [
		{
			content: {
				parts: [
					{ functionCall: { name: "read_note", args: { path: "a.md" } } },
					{ functionCall: { name: "read_note", args: { path: "b.md" } } },
				],
				role: "model",
			},
		},
	],
};

describe("GeminiProvider", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should initialize with correct id and name", () => {
		const provider = new GeminiProvider();
		expect(provider.id).toBe("gemini");
		expect(provider.name).toBe("Google Gemini");
		expect(provider.capabilities.streaming).toBe(true);
	});

	it("returns the static fallback list without an API key", async () => {
		const provider = new GeminiProvider();
		const models = await provider.getModels();
		expect(models).toEqual(GeminiProvider.fallbackModels);
		expect(models.length).toBe(3);
		expect(models[0].id).toBe("gemini-3.8-flash");
	});

	it("fetches live models and maps them to ModelInfo", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					models: [
						{
							name: "models/gemini-live-x",
							displayName: "Gemini Live X",
							inputTokenLimit: 1048576,
							supportedGenerationMethods: ["generateContent", "countTokens"],
						},
						{
							// Not chat-capable — must be filtered out
							name: "models/text-embedding-x",
							supportedGenerationMethods: ["embedContent"],
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider();
		await provider.authenticate("api_key", "test-key");

		const models = await provider.getModels();
		expect(models).toEqual([
			{
				id: "gemini-live-x",
				name: "Gemini Live X",
				contextWindow: 1048576,
				supportsTools: true,
				supportsStreaming: true,
				supportsVision: true,
			},
		]);
	});

	it("sends the models fetch key via the x-goog-api-key header, not the URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ models: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider();
		await provider.authenticate("api_key", "secret-key-123");

		await provider.getModels();

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models");
		expect(init.headers["x-goog-api-key"]).toBe("secret-key-123");
	});

	it("falls back to the static list on a non-200 response", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider();
		await provider.authenticate("api_key", "test-key");

		const models = await provider.getModels();
		expect(models).toEqual(GeminiProvider.fallbackModels);
	});

	it("falls back to the static list on malformed body or network failure", async () => {
		// 200 but not JSON
		const htmlResponse = new Response("<html>not json</html>", { status: 200 });
		let fetchMock = vi.fn().mockResolvedValue(htmlResponse);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider();
		await provider.authenticate("api_key", "test-key");

		let models = await provider.getModels();
		expect(models).toEqual(GeminiProvider.fallbackModels);

		// 200 JSON but missing the models array
		fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ unexpected: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		models = await provider.getModels();
		expect(models).toEqual(GeminiProvider.fallbackModels);

		// Network error
		fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
		vi.stubGlobal("fetch", fetchMock);

		models = await provider.getModels();
		expect(models).toEqual(GeminiProvider.fallbackModels);
	});


	it("should yield unique tool_call ids even for repeated tool names", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([dualFunctionCallChunk]));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider();
		await provider.authenticate("api_key", "test-key");

		const events = [];
		for await (const event of provider.generate({
			model: "gemini-3.8-flash",
			messages: [{ role: "user", content: "read both" }],
		})) {
			events.push(event);
		}

		const toolCalls = events.filter((e) => e.type === "tool_call");
		expect(toolCalls).toHaveLength(2);
		expect(toolCalls[0].name).toBe("read_note");
		expect(toolCalls[1].name).toBe("read_note");
		// The id must not be the function name — the orchestrator keys history
		// blocks by it, so two calls of the same tool need distinct ids.
		expect(toolCalls[0].id).not.toBe(toolCalls[1].id);
		expect(toolCalls[0].id).not.toBe("read_note");
	});

	it("should track auth state correctly", async () => {
		const provider = new GeminiProvider();
		expect(provider.getAuthState().isAuthenticated).toBe(false);

		await provider.authenticate("api_key", "test-key");
		expect(provider.getAuthState().isAuthenticated).toBe(true);

		await provider.logout();
		expect(provider.getAuthState().isAuthenticated).toBe(false);
	});
});
