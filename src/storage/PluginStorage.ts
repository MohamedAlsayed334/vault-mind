import { Plugin } from "obsidian";

export interface VaultMindSettings {
	selectedProviderId: string;
	selectedModel: string;
	geminiApiKey: string;
}

export const DEFAULT_SETTINGS: VaultMindSettings = {
	selectedProviderId: "gemini",
	selectedModel: "gemini-2.0-flash",
	geminiApiKey: "",
};

export class PluginStorage {
	constructor(private plugin: Plugin) {}

	async loadSettings(): Promise<VaultMindSettings> {
		const data = await this.plugin.loadData();
		return Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(settings: VaultMindSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}
}
