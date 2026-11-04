import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultMindPlugin from "@/main";

export class SettingsTab extends PluginSettingTab {
	plugin: VaultMindPlugin;

	constructor(app: App, plugin: VaultMindPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Mind Settings" });

		new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Enter your Google Gemini API key.")
			.addText((text) =>
				text
					.setPlaceholder("AIzaSy...")
					.setValue(this.plugin.settings?.geminiApiKey || "")
					.onChange(async (value) => {
						if (this.plugin.settings) {
							this.plugin.settings.geminiApiKey = value;
							await this.plugin.saveSettings(this.plugin.settings);
						}
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Select the Gemini model to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("gemini-2.0-flash", "Gemini 2.0 Flash")
					.addOption("gemini-1.5-pro", "Gemini 1.5 Pro")
					.setValue(this.plugin.settings?.selectedModel || "gemini-2.0-flash")
					.onChange(async (value) => {
						if (this.plugin.settings) {
							this.plugin.settings.selectedModel = value;
							await this.plugin.saveSettings(this.plugin.settings);
						}
					})
			);
	}
}
