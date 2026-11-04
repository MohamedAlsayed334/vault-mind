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

		const provider = this.plugin.providerRegistry.has(this.plugin.settings.selectedProviderId)
			? this.plugin.providerRegistry.get(this.plugin.settings.selectedProviderId)
			: null;

		// Provider selection
		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Which AI provider to use for the chat.")
			.addDropdown((dropdown) => {
				for (const p of this.plugin.providerRegistry.list()) {
					dropdown.addOption(p.id, p.name);
				}
				return dropdown
					.setValue(this.plugin.settings.selectedProviderId)
					.onChange(async (value) => {
						this.plugin.settings.selectedProviderId = value;
						await this.plugin.storage.saveSettings(this.plugin.settings);
						this.display(); // re-render for the selected provider's key field
					});
			});

		if (provider?.id === "gemini") {
			new Setting(containerEl)
				.setName("Gemini API key")
				.setDesc("Key for the selected Google Gemini model. Stored locally in the vault's browser storage, never in data.json.")
				.addText((text) =>
					text
						.setPlaceholder("AIzaSy...")
						.setValue(this.plugin.tokenStore.get("gemini") || "")
						.onChange(async (value) => {
							if (value) {
								this.plugin.tokenStore.set("gemini", value);
							} else {
								this.plugin.tokenStore.clear("gemini");
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
						.setValue(this.plugin.settings.selectedModel)
						.onChange(async (value) => {
							this.plugin.settings.selectedModel = value;
							await this.plugin.storage.saveSettings(this.plugin.settings);
						})
				);
		} else if (provider?.id === "openai") {
			new Setting(containerEl)
				.setName("OpenAI API key")
				.setDesc("Key for OpenAI models. Stored locally in the vault's browser storage, never in data.json.")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.tokenStore.get("openai") || "")
						.onChange(async (value) => {
							if (value) {
								this.plugin.tokenStore.set("openai", value);
							} else {
								this.plugin.tokenStore.clear("openai");
							}
						})
				);
		}

		// OAuth is planned but not implemented end-to-end yet. Do not show placeholder login controls.
		containerEl.createEl("p", {
			text: "OAuth sign-in (OpenAI / Google) is not available yet. Use an API key for now.",
			cls: "setting-item-description",
		});
	}
}
