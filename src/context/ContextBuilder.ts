import { App } from "obsidian";

export interface ContextPackage {
	currentNote: { path: string; content: string } | null;
	selection: string | null;
}

export class ContextBuilder {
	constructor(private app: App) {}

	async buildContext(): Promise<ContextPackage> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return { currentNote: null, selection: null };
		}

		let content = await this.app.vault.read(activeFile);
		if (content.length > 8000) {
			content = content.slice(0, 8000) + "\n... (truncated)";
		}

		let selection: string | null = null;
		const activeView = this.app.workspace.getActiveViewOfType(this.app.workspace.getLeavesOfType("markdown")[0]?.view as any);
		if (activeView && (activeView as any).editor) {
			const editor = (activeView as any).editor;
			const selectedText = editor.getSelection();
			if (selectedText) {
				selection = selectedText;
			}
		}

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
