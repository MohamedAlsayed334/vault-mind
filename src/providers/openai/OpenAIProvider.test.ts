import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIProvider } from "./OpenAIProvider";

const modelsResponse = (entries: object[]): Response =>
	new Response(JSON.stringify({ object: "list", data: entries }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

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
});
