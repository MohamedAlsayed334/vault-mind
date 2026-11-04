import { z } from "zod";
import type { ToolResult, PermissionLevel } from "@/core/types";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";
import { VaultSearch } from "@/context/VaultSearch";

export const SearchVaultInputSchema = z.object({
	query: z.string().min(1, "Query cannot be empty"),
	limit: z.number().optional().default(5),
});

export const SearchVaultTool = {
	name: "search_vault",
	description: "Search the vault for markdown notes matching a keyword query.",
	permissionLevel: "read" as PermissionLevel,
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string", description: "Keyword query to search for" },
			limit: { type: "number", description: "Max results to return (default 5)" },
		},
		required: ["query"],
	},

	async execute(args: unknown, vault: VaultAdapter): Promise<ToolResult> {
		const parsed = SearchVaultInputSchema.safeParse(args);
		if (!parsed.success) {
			return { success: false, error: parsed.error.message };
		}

		const { query, limit } = parsed.data;
		try {
			const searcher = new VaultSearch(vault);
			const results = await searcher.search(query, limit);
			return { success: true, data: results };
		} catch (err: any) {
			return { success: false, error: err.message || String(err) };
		}
	},
};
