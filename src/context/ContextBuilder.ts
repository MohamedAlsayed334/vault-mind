import type { VaultAdapter } from "@/obsidian/VaultAdapter";

export interface ContextPackage {
	currentNote: { path: string; content: string } | null;
	selection: string | null;
}

const MAX_NOTE_CONTENT = 8000;

export class ContextBuilder {
	constructor(private vault: VaultAdapter) {}

	async buildContext(): Promise<ContextPackage> {
		const activeFile = this.vault.getActiveFile();
		if (!activeFile) {
			return { currentNote: null, selection: null };
		}

		let content = "";
		try {
			content = await this.vault.read(activeFile.path);
		} catch {
			return { currentNote: null, selection: null };
		}

		if (content.length > MAX_NOTE_CONTENT) {
			content = content.slice(0, MAX_NOTE_CONTENT) + "\n... (truncated)";
		}

		const selection = this.vault.getSelection() || null;

		return {
			currentNote: {
				path: activeFile.path,
				content,
			},
			selection,
		};
	}

	injectSystemPrompt(context: ContextPackage, baseSystemPrompt?: string): string {
		let prompt = baseSystemPrompt || "You are an AI assistant for Obsidian.";
		if (context.currentNote) {
			prompt += `\nCurrent note: ${context.currentNote.path}\n${context.currentNote.content}`;
		}
		if (context.selection) {
			prompt += `\nSelected text: ${context.selection}`;
		}
		return prompt;
	}
}
