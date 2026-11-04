import { Plugin } from "obsidian";
import { TokenStore } from "@/auth/TokenStore";

export interface VaultMindSettings {
	selectedProviderId: string;
	selectedModel: string;
}

export const DEFAULT_SETTINGS: VaultMindSettings = {
	selectedProviderId: "gemini",
	selectedModel: "gemini-3.8-flash",
};

/**
 * Settings (non-sensitive) live in data.json.
 * API keys / tokens never persist here — they are moved to TokenStore on load.
 */
export class PluginStorage {
	constructor(private plugin: Plugin, private tokenStore: TokenStore) {}

	async loadSettings(): Promise<VaultMindSettings> {
		const data = (await this.plugin.loadData()) as (VaultMindSettings & { geminiApiKey?: string }) | null;

		// Migration: older builds stored the API key in data.json. Move it to the TokenStore
		// and strip it from disk permanently.
		if (data && typeof data.geminiApiKey === "string" && data.geminiApiKey.length > 0) {
			this.tokenStore.set("gemini", data.geminiApiKey);
			delete data.geminiApiKey;
			await this.plugin.saveData(data);
		}

		const settings = Object.assign({}, DEFAULT_SETTINGS, data);
		delete (settings as { geminiApiKey?: string }).geminiApiKey;
		return settings;
	}

	async saveSettings(settings: VaultMindSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}
}
