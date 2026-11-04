import { z } from "zod";
import type { ToolResult, PermissionLevel } from "@/core/types";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";

export const EditNoteInputSchema = z.object({
	path: z.string().min(1, "Path cannot be empty"),
	old_text: z.string().min(1, "Old text cannot be empty"),
	new_text: z.string().min(1, "New text cannot be empty"),
});

export const EditNoteTool = {
	name: "edit_note",
	description: "Propose an edit to replace old_text with new_text in a note. Requires user approval.",
	permissionLevel: "write" as PermissionLevel,
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string", description: "Path of the note" },
			old_text: { type: "string", description: "Exact text to replace" },
			new_text: { type: "string", description: "New replacement text" },
		},
		required: ["path", "old_text", "new_text"],
	},

	async execute(args: unknown, vault: VaultAdapter): Promise<ToolResult> {
		const parsed = EditNoteInputSchema.safeParse(args);
		if (!parsed.success) {
			return { success: false, error: parsed.error.message };
		}

		const { path, old_text, new_text } = parsed.data;
		try {
			await vault.process(path, (content) => {
				if (!content.includes(old_text)) {
					throw new Error(`Old text not found in note ${path}`);
				}
				return content.replace(old_text, new_text);
			});
			return { success: true, data: { path, updated: true } };
		} catch (err: any) {
			return { success: false, error: err.message || String(err) };
		}
	},
};
