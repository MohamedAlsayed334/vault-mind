import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultCompassPlugin from "@/main";
import type { AIProvider } from "@/providers/base/AIProvider";
import type { ModelInfo } from "@/core/types";
import { GeminiProvider } from "@/providers/gemini/GeminiProvider";
import { OpenAIProvider } from "@/providers/openai/OpenAIProvider";

/**
 * Settings built around the selected provider:
 * API key → fetch models → pick model → test connection, with a visible
 * "Saved" confirmation on every persisted change.
 */
export class SettingsTab extends PluginSettingTab {
	plugin: VaultCompassPlugin;

	// Component-scoped state, never persisted. The fetched model list lives
	// only as long as this tab instance — the fallback list is used otherwise.
	private fetchedModels: ModelInfo[] = [];
	private fetchedForProvider = "";
	private fetchStatus = "";
	private connectionStatus = "";
	private savedEl: HTMLElement | null = null;
	private savedTimer: number | null = null;

	constructor(app: App, plugin: VaultCompassPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Compass Settings" });

		// Transient save confirmation — shown on every persisted change.
		this.savedEl = containerEl.createEl("p", { cls: "setting-item-description" });
		this.savedEl.style.display = "none";

		const provider = this.plugin.providerRegistry.has(this.plugin.settings.selectedProviderId)
			? this.plugin.providerRegistry.get(this.plugin.settings.selectedProviderId)
			: null;

		this.displayProviderSetting();

		if (provider) {
			this.displayApiKeySetting(provider);
			this.displayFetchModelsSetting(provider);
			this.displayModelSetting(provider);
			this.displayTestConnectionSetting(provider);
		}
		// OAuth is planned but not implemented end-to-end yet. Do not show placeholder login controls.
		containerEl.createEl("p", {
			text: "OAuth sign-in (OpenAI / Google) is not available yet. Use an API key for now.",
			cls: "setting-item-description",
		});
	}

	private displayProviderSetting(): void {
		new Setting(this.containerEl)
			.setName("Provider")
			.setDesc("Which AI provider to use for the chat.")
			.addDropdown((dropdown) => {
				for (const p of this.plugin.providerRegistry.list()) {
					dropdown.addOption(p.id, p.name);
				}
				return dropdown
					.setValue(this.plugin.settings.selectedProviderId)
					.onChange(async (value) => {
						if (value !== this.plugin.settings.selectedProviderId) {
							this.plugin.settings.selectedProviderId = value;
							await this.plugin.storage.saveSettings(this.plugin.settings);
							// The fetched list belongs to the previous provider.
							this.fetchedModels = [];
							this.fetchedForProvider = "";
							this.fetchStatus = "";
							this.connectionStatus = "";
							this.showSaved();
							this.display(); // re-render for the selected provider's section
						}
					});
			});
	}

	private displayApiKeySetting(provider: AIProvider): void {
		new Setting(this.containerEl)
			.setName(`${provider.name} API key`)
			.setDesc("Key for the selected provider. Stored locally in the vault's browser storage, never in data.json.")
			.addText((text) =>
				text
					.setPlaceholder(provider.id === "gemini" ? "AIzaSy..." : "sk-...")
					.setValue(this.plugin.tokenStore.get(provider.id) || "")
					.onChange(async (value) => {
						if (value) {
							this.plugin.tokenStore.set(provider.id, value);
						} else {
							this.plugin.tokenStore.clear(provider.id);
						}
						this.showSaved();
					})
			);
	}

	private displayFetchModelsSetting(provider: AIProvider): void {
		const setting = new Setting(this.containerEl)
			.setName("Fetch models")
			.setDesc("Load the live model list from the provider. Falls back to the built-in list on any failure.")
			.addButton((button) =>
				button.setButtonText("Fetch models").onClick(async () => {
					const key = this.plugin.tokenStore.get(provider.id);
					if (!key) {
						this.fetchStatus = "✗ No API key set";
						this.display();
						return;
					}
					setButtonBusy(true);
					try {
						// Make sure the provider instance holds the current key
						// (this is also how the chat flow authenticates).
						await provider.authenticate("api_key", key);
						const models = await provider.getModels();
						this.fetchedModels = models;
						this.fetchedForProvider = provider.id;
						this.fetchStatus = `✓ Loaded ${models.length} models`;
					} catch (err) {
						this.fetchedModels = this.modelsFor(provider.id);
						this.fetchedForProvider = provider.id;
						this.fetchStatus = `✗ ${errMessage(err)} — using the built-in list`;
					}
					setButtonBusy(false);
					this.display(); // re-render to repopulate the model dropdown
				})
			);

		const statusEl = setting.controlEl.createEl("span", { cls: "setting-item-description" });
		setStatusUnderline(statusEl, this.fetchStatus);
		statusEl.setText(this.fetchStatus);

		const button = setting.controlEl.querySelector("button");
		const setButtonBusy = (busy: boolean) => {
			if (button) {
				(button as HTMLButtonElement).disabled = busy;
				button.setText(busy ? "Loading…" : "Fetch models");
			}
		};
	}

	private displayModelSetting(provider: AIProvider): void {
		const models = this.modelsFor(provider.id);
		const options = new Map(models.map((m) => [m.id, m.name]));
		// Keep the persisted selection selectable even if it is not in the list.
		const current = this.plugin.settings.selectedModel;
		if (current && !options.has(current)) {
			options.set(current, `${current} (current)`);
		}

		const setting = new Setting(this.containerEl)
			.setName("Model")
			.setDesc(`Select the ${provider.name} model to use.`)
			.addDropdown((dropdown) => {
				for (const [id, name] of options) {
					dropdown.addOption(id, name);
				}
				return dropdown.setValue(current || [...options.keys()][0] || "").onChange(async (value) => {
					this.plugin.settings.selectedModel = value;
					await this.plugin.storage.saveSettings(this.plugin.settings);
					this.showSaved();
				});
			});

		if (models.length === 0) {
			const statusEl = setting.controlEl.createEl("span", { cls: "setting-item-description" });
			statusEl.setText("No models loaded — pick a key and fetch the list above.");
		}
	}

	private displayTestConnectionSetting(provider: AIProvider): void {
		const setting = new Setting(this.containerEl)
			.setName("Test connection")
			.setDesc("Send a minimal request to verify the key works.")
			.addButton((button) =>
				button.setButtonText("Test connection").onClick(async () => {
					const key = this.plugin.tokenStore.get(provider.id);
					if (!key) {
						this.connectionStatus = "✗ No API key set";
						statusEl.setText(this.connectionStatus);
						return;
					}
					this.connectionStatus = "Testing…";
					statusEl.setText(this.connectionStatus);
					setButtonBusy(true);
					try {
						if (provider.id === "gemini") {
							await GeminiProvider.checkConnection(key);
						} else if (provider.id === "openai") {
							await OpenAIProvider.checkConnection(key);
						} else {
							throw new Error(`No connection probe for ${provider.name}`);
						}
						this.connectionStatus = `✓ Connected as ${provider.name}`;
					} catch (err) {
						this.connectionStatus = `✗ ${errMessage(err)}`;
					}
					setButtonBusy(false);
					setStatusUnderline(statusEl, this.connectionStatus);
					statusEl.setText(this.connectionStatus);
				})
			);

		const statusEl = setting.controlEl.createEl("span", { cls: "setting-item-description" });
		setStatusUnderline(statusEl, this.connectionStatus);
		statusEl.setText(this.connectionStatus);

		const button = setting.controlEl.querySelector("button");
		const setButtonBusy = (busy: boolean) => {
			if (button) {
				(button as HTMLButtonElement).disabled = busy;
				button.setText(busy ? "Testing…" : "Test connection");
			}
		};
	}

	/** Live models for this provider when fetched, else the built-in list. */
	private modelsFor(providerId: string): ModelInfo[] {
		if (this.fetchedForProvider === providerId && this.fetchedModels.length > 0) {
			return this.fetchedModels;
		}
		if (providerId === "gemini") return GeminiProvider.fallbackModels;
		if (providerId === "openai") return OpenAIProvider.fallbackModels;
		return [];
	}

	private showSaved(): void {
		if (!this.savedEl) return;
		this.savedEl.setText("✓ Saved");
		this.savedEl.style.display = "";
		this.savedEl.style.color = "var(--text-success)";
		if (this.savedTimer !== null) {
			window.clearTimeout(this.savedTimer);
		}
		this.savedTimer = window.setTimeout(() => {
			if (this.savedEl) {
				this.savedEl.style.display = "none";
			}
			this.savedTimer = null;
		}, 2000);
	}
}

function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function setStatusUnderline(el: HTMLElement, status: string): void {
	el.style.color = status.startsWith("✓")
		? "var(--text-success)"
		: status.startsWith("✗")
			? "var(--text-error)"
			: "var(--text-muted)";
}
