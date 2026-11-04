import type { VaultAdapter } from "@/obsidian/VaultAdapter";

export interface SearchResult {
	path: string;
	excerpt: string;
}

export class VaultSearch {
	constructor(private vault: VaultAdapter) {}

	async search(query: string, limit: number = 5): Promise<SearchResult[]> {
		const files = this.vault.listFiles();
		const results: SearchResult[] = [];
		const lowerQuery = query.toLowerCase();

		for (const file of files) {
			if (results.length >= limit) break;
			const content = await this.vault.read(file.path);
			const lowerContent = content.toLowerCase();

			if (file.path.toLowerCase().includes(lowerQuery) || lowerContent.includes(lowerQuery)) {
				const idx = lowerContent.indexOf(lowerQuery);
				const start = Math.max(0, idx - 80);
				const end = Math.min(content.length, start + 200);
				const excerpt = content.slice(start, end).replace(/\n/g, " ");

				results.push({
					path: file.path,
					excerpt: excerpt.trim() || file.path,
				});
			}
		}

		return results;
	}
}
