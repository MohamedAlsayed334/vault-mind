import { describe, it, expect } from "vitest";
import { GeminiProvider } from "./GeminiProvider";

describe("GeminiProvider", () => {
	it("should initialize with correct id and name", () => {
		const provider = new GeminiProvider();
		expect(provider.id).toBe("gemini");
		expect(provider.name).toBe("Google Gemini");
		expect(provider.capabilities.streaming).toBe(true);
	});

	it("should return correct models", async () => {
		const provider = new GeminiProvider();
		const models = await provider.getModels();
		expect(models.length).toBe(2);
		expect(models[0].id).toBe("gemini-2.0-flash");
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
