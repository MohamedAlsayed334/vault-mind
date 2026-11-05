import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIProvider } from "./OpenAIProvider";
import type { ChatMessage, AIEvent } from "../../core/types";

const modelsResponse = (entries: object[]): Response =>
	new Response(JSON.stringify({ object: "list", data: entries }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

/** Encode SSE data lines as a ReadableStream, as a real fetch response would. */
function sseResponse(events: object[]): Response {
	const encoder = new TextEncoder();
	const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(body));
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(provider: OpenAIProvider, messages: ChatMessage[], tools?: unknown): Promise<AIEvent[]> {
	const events: AIEvent[] = [];
	for await (const event of provider.generate({
		model: "gpt-6-luna",
		messages,
		// The wire format is what matters here; ToolDefinition is structurally identical.
		tools: tools as never,
	})) {
		events.push(event);
	}
	return events;
}

describe("OpenAIProvider", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should initialize with correct id and name", () => {
		const provider = new OpenAIProvider();
		expect(provider.id).toBe("openai");
		expect(provider.name).toBe("OpenAI");
		expect(provider.capabilities.streaming).toBe(true);
	});

	it("returns the static fallback list without an API key", async () => {
		const provider = new OpenAIProvider();
		const models = await provider.getModels();
		expect(models).toEqual(OpenAIProvider.fallbackModels);
		expect(models.length).toBe(2);
		expect(models[0].id).toBe("gpt-6.1-sol");
	});

	it("fetches live models and maps them to ModelInfo", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			modelsResponse([
				{ object: "model", id: "gpt-6-luna", owned_by: "openai" },
				// Non-chat families must be marked conservatively unable
				{ object: "model", id: "text-embedding-3-small", owned_by: "openai" },
				{ object: "model", id: "dall-e-3", owned_by: "openai" },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const models = await provider.getModels();
		expect(models).toEqual([
			{
				id: "gpt-6-luna",
				name: "gpt-6-luna",
				contextWindow: 0,
				supportsTools: true,
				supportsStreaming: true,
				supportsVision: true,
			},
			{
				id: "text-embedding-3-small",
				name: "text-embedding-3-small",
				contextWindow: 0,
				supportsTools: false,
				supportsStreaming: false,
				supportsVision: false,
			},
			{
				id: "dall-e-3",
				name: "dall-e-3",
				contextWindow: 0,
				supportsTools: false,
				supportsStreaming: false,
				supportsVision: false,
			},
		]);
	});

	it("sends the models fetch key via the Authorization header", async () => {
		const fetchMock = vi.fn().mockResolvedValue(modelsResponse([{ id: "gpt-6-luna" }]));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "secret-key-123");

		await provider.getModels();

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://api.openai.com/v1/models");
		expect(init.headers.Authorization).toBe("Bearer secret-key-123");
	});

	it("falls back to the static list on a non-200 response", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const models = await provider.getModels();
		expect(models).toEqual(OpenAIProvider.fallbackModels);
	});

	it("falls back to the static list on malformed body or network failure", async () => {
		// 200 but not JSON
		let fetchMock = vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		let models = await provider.getModels();
		expect(models).toEqual(OpenAIProvider.fallbackModels);

		// 200 JSON but missing the data array
		fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ unexpected: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		models = await provider.getModels();
		expect(models).toEqual(OpenAIProvider.fallbackModels);

		// Network error
		fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
		vi.stubGlobal("fetch", fetchMock);

		models = await provider.getModels();
		expect(models).toEqual(OpenAIProvider.fallbackModels);
	});

	it("should track auth state correctly", async () => {
		const provider = new OpenAIProvider();
		expect(provider.getAuthState().isAuthenticated).toBe(false);

		await provider.authenticate("api_key", "test-key");
		expect(provider.getAuthState().isAuthenticated).toBe(true);

		await provider.logout();
		expect(provider.getAuthState().isAuthenticated).toBe(false);
	});

	it("reports toolCalling capability now that the mapping exists", () => {
		const provider = new OpenAIProvider();
		expect(provider.capabilities.toolCalling).toBe(true);
	});

	it("streams plain text deltas without tool calls", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{ choices: [{ delta: { content: "Hel" } }] },
				{ choices: [{ delta: { content: "lo" } }] },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "hi" }], [
			{ name: "read_note", description: "Read a note", inputSchema: { type: "object" } },
		]);

		expect(events).toEqual([
			{ type: "text_delta", delta: "Hel" },
			{ type: "text_delta", delta: "lo" },
			{ type: "done" },
		]);
	});

	it("sends tools in OpenAI function format and history in wire format", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ choices: [{ delta: { content: "ok" } }] }]));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		await collect(
			provider,
			[
				{ role: "user", content: "read a.md" },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Reading it now." },
						{ type: "tool_use", id: "call-1", name: "read_note", input: { path: "a.md" } },
						{ type: "tool_use", id: "call-2", name: "search_vault", input: { query: "a" } },
					],
				},
				{
					role: "user",
					content: [
						{ type: "tool_result", toolUseId: "call-1", name: "read_note", content: "note body" },
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							toolUseId: "call-2",
							name: "search_vault",
							content: "match text",
						},
					],
				},
			],
			[{ name: "read_note", description: "Read a note", inputSchema: { type: "object" } }],
		);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.tools[0]).toEqual({
			type: "function",
			function: {
				name: "read_note",
				description: "Read a note",
				parameters: { type: "object" },
			},
		});
		expect(body.messages).toEqual([
			{ role: "user", content: "read a.md" },
			{
				role: "assistant",
				content: "Reading it now.",
				tool_calls: [
					{
						id: "call-1",
						type: "function",
						function: { name: "read_note", arguments: JSON.stringify({ path: "a.md" }) },
					},
					{
						id: "call-2",
						type: "function",
						function: { name: "search_vault", arguments: JSON.stringify({ query: "a" }) },
					},
				],
			},
			// The orchestrator's user-wrapped tool results become role:"tool" turns
			{ role: "tool", tool_call_id: "call-1", content: "note body" },
			{ role: "tool", tool_call_id: "call-2", content: "match text" },
		]);
	});

	it("injects the system prompt before the session history", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse([{ choices: [{ delta: { content: "ok" } }] }]));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		for await (const _ of provider.generate({
			model: "gpt-6-luna",
			messages: [{ role: "user", content: "hi" }],
			systemPrompt: "vault context",
		})) {
			// consume
		}

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.messages[0]).toEqual({ role: "system", content: "vault context" });
		expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
	});

	it("accumulates a fragmented multi-chunk tool call into one complete event", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				// First fragment carries the id, the name, and the start of the args
				{
					choices: [
						{
							delta: {
								tool_calls: [{ index: 0, id: "call-9", function: { name: "read_note", arguments: '{"pa' } }],
							},
						},
					],
				},
				// Middle fragments append argument slices as they arrive
				{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th": ' } }] } }] },
				{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.md"}' } }] } }] },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "read a.md" }]);

		expect(events).toEqual([
			{
				type: "tool_call",
				id: "call-9",
				name: "read_note",
				arguments: { path: "a.md" },
			},
			{ type: "done" },
		]);
	});

	it("yields multiple interleaved tool calls in index order", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, id: "call-a", function: { name: "read_note", arguments: '{"pa' } },
									{ index: 1, id: "call-b", function: { name: "search_vault" } },
								],
							},
						},
					],
				},
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, function: { arguments: 'th": "a.md"}' } },
									{ index: 1, function: { arguments: '{"query":"note"}' } },
								],
							},
						},
					],
				},
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "go" }]);
		const toolCalls = events.filter((e) => e.type === "tool_call");

		expect(toolCalls).toEqual([
			{ type: "tool_call", id: "call-a", name: "read_note", arguments: { path: "a.md" } },
			{ type: "tool_call", id: "call-b", name: "search_vault", arguments: { query: "note" } },
		]);
	});

	it("passes raw argument string through when the model emits invalid JSON arguments", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, id: "call-x", function: { name: "read_note", arguments: '{"path": ' } },
								],
							},
						},
					],
				},
				{ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'not json' } }] } }] },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "read" }]);
		expect(events[0]).toEqual({
			type: "tool_call",
			id: "call-x",
			name: "read_note",
			arguments: '{"path": not json',
		});
	});

	it("ignores malformed SSE lines without breaking the stream", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {broken json\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'));
				controller.close();
			},
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
			new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		));

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "hi" }]);
		expect(events).toEqual([{ type: "text_delta", delta: "ok" }, { type: "done" }]);
	});

	it("surfaces HTTP errors from chat completions as error events", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));

		const provider = new OpenAIProvider();
		await provider.authenticate("api_key", "test-key");

		const events = await collect(provider, [{ role: "user", content: "hi" }]);
		expect(events[0].type).toBe("error");
		expect(events.at(-1)?.type).toBe("error");
	});

	it("errors when generating without authentication", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider();
		const events = await collect(provider, [{ role: "user", content: "hi" }]);

		expect(events).toEqual([{ type: "error", message: "OpenAI not authenticated" }]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
