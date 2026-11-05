import { Plugin, Platform, WorkspaceLeaf } from "obsidian";
import { ProviderRegistry } from "@/providers/base/ProviderRegistry";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { VaultAdapter } from "@/obsidian/VaultAdapter";
import { ContextBuilder } from "@/context/ContextBuilder";
import { ReadNoteTool } from "@/tools/vault/ReadNote";
import { EditNoteTool } from "@/tools/vault/EditNote";
import { SearchVaultTool } from "@/tools/vault/SearchVault";
import { GeminiProvider } from "@/providers/gemini/GeminiProvider";
import { OpenAIProvider } from "@/providers/openai/OpenAIProvider";
import { PluginStorage, type VaultCompassSettings } from "@/storage/PluginStorage";
import { TokenStore } from "@/auth/TokenStore";
import { SettingsTab } from "@/ui/settings/SettingsTab";
import { ChatView, VIEW_TYPE_VAULT_COMPASS } from "@/ui/views/ChatView";
import type { PlatformCapabilities } from "@/core/types";

export default class VaultCompassPlugin extends Plugin {
	providerRegistry!: ProviderRegistry;
	toolRegistry!: ToolRegistry;
	vaultAdapter!: VaultAdapter;
	contextBuilder!: ContextBuilder;
	tokenStore!: TokenStore;
	platform!: PlatformCapabilities;
	settings!: VaultCompassSettings;
	storage!: PluginStorage;

	async onload() {
		this.tokenStore = new TokenStore();
		this.storage = new PluginStorage(this, this.tokenStore);
		this.settings = await this.storage.loadSettings();

		this.platform = {
			isMobile: Platform.isMobile,
			canStream: true, // determined per-provider at runtime
			canRunLocalServer: Platform.isDesktop,
		};

		// Core adapters
		this.vaultAdapter = new VaultAdapter(this.app);
		this.contextBuilder = new ContextBuilder(this.vaultAdapter);

		// Registries
		this.providerRegistry = new ProviderRegistry();
		this.toolRegistry = new ToolRegistry();

		// Register built-in vault tools (write tools go through the approval gate automatically)
		this.toolRegistry.register(ReadNoteTool);
		this.toolRegistry.register(EditNoteTool);
		this.toolRegistry.register(SearchVaultTool);

		// Register providers
		this.providerRegistry.register(new GeminiProvider());
		this.providerRegistry.register(new OpenAIProvider());

		// UI
		this.registerView(VIEW_TYPE_VAULT_COMPASS, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addRibbonIcon("message-square", "Open Vault Compass", () => this.activateChatView());
		this.addCommand({
			id: "open-vault-compass",
			name: "Open Vault Compass",
			callback: () => this.activateChatView(),
		});

		console.log("Vault Compass loaded");
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_VAULT_COMPASS);
		console.log("Vault Compass unloaded");
	}

	/** Open (or reveal) the chat sidebar. */
	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_VAULT_COMPASS)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false)!;
			await leaf.setViewState({ type: VIEW_TYPE_VAULT_COMPASS, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
