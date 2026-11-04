import { describe, it, expect, vi } from "vitest";
import { PluginStorage, DEFAULT_SETTINGS } from "./PluginStorage";
import { TokenStore } from "../auth/TokenStore";

type PluginArg = ConstructorParameters<typeof PluginStorage>[0];

/** PluginStorage only uses loadData/saveData from the Obsidian Plugin. */
const fakePlugin = (data: unknown) =>
	({
		loadData: vi.fn(async () => data),
		saveData: vi.fn(),
	}) as unknown as PluginArg;

describe("PluginStorage", () => {
	it("resets a dead selectedModel to the current default on load", async () => {
		const storage = new PluginStorage(
			fakePlugin({ selectedModel: "gemini-2.0-flash", selectedProviderId: "gemini" }),
			new TokenStore(),
		);

		const settings = await storage.loadSettings();
		expect(settings.selectedModel).toBe(DEFAULT_SETTINGS.selectedModel);
	});

	it("keeps a live selectedModel untouched", async () => {
		const storage = new PluginStorage(
			fakePlugin({ selectedModel: "gemini-3.6-flash", selectedProviderId: "gemini" }),
			new TokenStore(),
		);

		const settings = await storage.loadSettings();
		expect(settings.selectedModel).toBe("gemini-3.6-flash");
	});
});
