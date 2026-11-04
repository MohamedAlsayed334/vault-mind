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
import { PluginStorage, type VaultMindSettings } from "@/storage/PluginStorage";
import { TokenStore } from "@/auth/TokenStore";
import { SettingsTab } from "@/ui/settings/SettingsTab";
import { ChatView, VIEW_TYPE_VAULT_MIND } from "@/ui/views/ChatView";
import type { PlatformCapabilities } from "@/core/types";

export default class VaultMindPlugin extends Plugin {
	providerRegistry!: ProviderRegistry;
	toolRegistry!: ToolRegistry;
	vaultAdapter!: VaultAdapter;
	contextBuilder!: ContextBuilder;
	tokenStore!: TokenStore;
	platform!: PlatformCapabilities;
	settings!: VaultMindSettings;
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
		this.registerView(VIEW_TYPE_VAULT_MIND, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addRibbonIcon("message-square", "Open Vault Mind", () => this.activateChatView());
		this.addCommand({
			id: "open-vault-mind",
			name: "Open Vault Mind",
			callback: () => this.activateChatView(),
		});

		console.log("Vault Mind loaded");
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_VAULT_MIND);
		console.log("Vault Mind unloaded");
	}

	/** Open (or reveal) the chat sidebar. */
	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_VAULT_MIND)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false)!;
			await leaf.setViewState({ type: VIEW_TYPE_VAULT_MIND, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
