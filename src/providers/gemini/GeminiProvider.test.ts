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

	it("should return correct models", async () => {
		const provider = new GeminiProvider();
		const models = await provider.getModels();
		expect(models.length).toBe(3);
		expect(models[0].id).toBe("gemini-3.8-flash");
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
