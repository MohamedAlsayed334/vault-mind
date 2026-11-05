import { ItemView, WorkspaceLeaf } from "obsidian";
import type VaultCompassPlugin from "@/main";
import { Root, createRoot } from "react-dom/client";
import { Chat } from "@/ui/components/Chat";
import React from "react";

export const VIEW_TYPE_VAULT_COMPASS = "vault-compass-chat-view";

export class ChatView extends ItemView {
	plugin: VaultCompassPlugin;
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultCompassPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_COMPASS;
	}

	getDisplayText(): string {
		return "Vault Compass Chat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		// this.contentEl is the view's scrollable content area; it already has the
		// full height of the leaf. Style classes (chat.css) keep the height chain
		// intact: contentEl (flex column) -> mount -> Chat (both flex:1, min-height:0)
		// so the composer stays pinned at the bottom.
		const container = this.contentEl;
		container.empty();
		container.addClass("vault-compass-chat-container");

		const mountPoint = container.createDiv("vault-compass-chat-mount");
		this.root = createRoot(mountPoint);
		this.root.render(React.createElement(Chat, { plugin: this.plugin }));
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}
}
