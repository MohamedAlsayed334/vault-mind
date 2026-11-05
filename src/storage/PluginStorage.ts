import { Plugin } from "obsidian";
import { TokenStore } from "@/auth/TokenStore";

export interface VaultCompassSettings {
	selectedProviderId: string;
	selectedModel: string;
}

export const DEFAULT_SETTINGS: VaultCompassSettings = {
	selectedProviderId: "gemini",
	selectedModel: "gemini-3.8-flash",
};

/**
 * Model ids Google has shut down — they 404 in production
 * (e.g. the 2.0 family died on June 1, 2026; the 1.5 family long before).
 * Reset on load so users of old builds don't send requests to dead models.
 */
const DEAD_MODEL_IDS: string[] = [
	"gemini-1.5-pro",
	"gemini-1.5-pro-002",
	"gemini-1.5-flash",
	"gemini-1.5-flash-002",
	"gemini-1.5-flash-8b",
	"gemini-2.0-flash",
	"gemini-2.0-flash-001",
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash-lite-001",
];

/**
 * Settings (non-sensitive) live in data.json.
 * API keys / tokens never persist here — they are moved to TokenStore on load.
 */
export class PluginStorage {
	constructor(private plugin: Plugin, private tokenStore: TokenStore) {}

	async loadSettings(): Promise<VaultCompassSettings> {
		const data = (await this.plugin.loadData()) as (VaultCompassSettings & { geminiApiKey?: string }) | null;

		// Migration: older builds stored the API key in data.json. Move it to the TokenStore
		// and strip it from disk permanently.
		if (data && typeof data.geminiApiKey === "string" && data.geminiApiKey.length > 0) {
			this.tokenStore.set("gemini", data.geminiApiKey);
			delete data.geminiApiKey;
			await this.plugin.saveData(data);
		}

		const settings = Object.assign({}, DEFAULT_SETTINGS, data);
		delete (settings as { geminiApiKey?: string }).geminiApiKey;

		// Migration: dead default model ids (shut-down models) must not be sent
		// to the API — reset to the current default.
		if (DEAD_MODEL_IDS.includes(settings.selectedModel)) {
			settings.selectedModel = DEFAULT_SETTINGS.selectedModel;
		}
		return settings;
	}

	async saveSettings(settings: VaultCompassSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}
}
