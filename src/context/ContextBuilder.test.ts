import { describe, it, expect } from "vitest";
import { ContextBuilder } from "./ContextBuilder";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";

describe("ContextBuilder", () => {
	it("builds context with current note and selection", async () => {
		const vault = {
			getActiveFile: () => ({ path: "notes/plan.md" }),
			read: async () => "line 1\nline 2",
			getSelection: () => "line 2",
		} as unknown as VaultAdapter;

		const builder = new ContextBuilder(vault);
		const context = await builder.buildContext();

		expect(context.currentNote?.path).toBe("notes/plan.md");
		expect(context.selection).toBe("line 2");
	});

	it("returns empty context when no active file", async () => {
		const vault = {
			getActiveFile: () => null,
			read: async () => "",
			getSelection: () => "",
		} as unknown as VaultAdapter;

		const builder = new ContextBuilder(vault);
		const context = await builder.buildContext();
		expect(context.currentNote).toBeNull();
		expect(context.selection).toBeNull();
	});

	it("truncates long note content", async () => {
		const vault = {
			getActiveFile: () => ({ path: "big.md" }),
			read: async () => "x".repeat(10000),
			getSelection: () => "",
		} as unknown as VaultAdapter;

		const builder = new ContextBuilder(vault);
		const context = await builder.buildContext();
		expect(context.currentNote?.content.length).toBe(8000 + "\n... (truncated)".length);
	});

	it("injects note and selection into the system prompt", async () => {
		const vault = {
			getActiveFile: () => ({ path: "notes/a.md" }),
			read: async () => "content here",
			getSelection: () => "selected snippet",
		} as unknown as VaultAdapter;

		const builder = new ContextBuilder(vault);
		const prompt = builder.injectSystemPrompt(await builder.buildContext());

		expect(prompt).toContain("Current note: notes/a.md");
		expect(prompt).toContain("content here");
		expect(prompt).toContain("Selected text: selected snippet");
	});
});
