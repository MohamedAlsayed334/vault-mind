import { ItemView, WorkspaceLeaf } from "obsidian";
import type VaultMindPlugin from "@/main";
import { Root, createRoot } from "react-dom/client";
import { Chat } from "@/ui/components/Chat";
import React from "react";

export const VIEW_TYPE_VAULT_MIND = "vault-mind-chat-view";

export class ChatView extends ItemView {
	plugin: VaultMindPlugin;
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultMindPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_MIND;
	}

	getDisplayText(): string {
		return "Vault Mind Chat";
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
		container.addClass("vault-mind-chat-container");

		const mountPoint = container.createDiv("vault-mind-chat-mount");
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
