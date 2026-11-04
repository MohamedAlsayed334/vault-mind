import { describe, it, expect, vi } from "vitest";
import { AgentOrchestrator, type OrchestratorOptions } from "./AgentOrchestrator";
import type { AIProvider } from "@/providers/base/AIProvider";
import type { ToolRegistry, Tool } from "@/tools/ToolRegistry";
import type { ToolResult, AgentEvent, ChatMessage, AIEvent } from "@/core/types";

class StreamingProvider implements AIProvider {
	readonly id = "fake";
	readonly name = "Fake";
	readonly capabilities = { streaming: true, toolCalling: true, vision: false, corsCompatible: true };

	/** Events yielded per generate() call — one turn per call. */
	public turns: AIEvent[][] = [];
	public requests: any[] = [];

	async *generate(request: any): AsyncIterable<AIEvent> {
		this.requests.push(request);
		const events = this.turns.shift() ?? [{ type: "done" }];
		for (const event of events) {
			yield event;
		}
	}

	async authenticate() {}
	getAuthState() {
		return { method: "api_key" as const, isAuthenticated: true };
	}
	async logout() {}
	async getModels() {
		return [];
	}
}

/** Minimal stand-in with the same surface as ToolRegistry (private member compat aside). */
class FakeToolRegistry {
	public tools = new Map<string, Tool>();
	register(tool: Tool) {
		this.tools.set(tool.name, tool);
	}
	get(name: string): Tool {
		if (!this.tools.has(name)) throw new Error(`Tool "${name}" not registered`);
		return this.tools.get(name)!;
	}
	getDefinitions() {
		return Array.from(this.tools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		}));
	}
	list() {
		return Array.from(this.tools.values());
	}
}

const session = () => ({
	id: "s1",
	createdAt: 0,
	updatedAt: 0,
	messages: [] as ChatMessage[],
	status: "idle" as const,
});

const noOptions: OrchestratorOptions = {};

function makeTool(name: string, permissionLevel: "read" | "write", execute: () => Promise<ToolResult>): Tool {
	return {
		name,
		description: "fake tool",
		permissionLevel,
		inputSchema: { type: "object" },
		execute,
	};
}

function makeToolCall(id: string, name: string, args: unknown): AIEvent {
	return { type: "tool_call", id, name, arguments: args } as AIEvent;
}

/** The tool-result block the orchestrator fed back to the provider, parsed as JSON. */
function toolResultFedBack(provider: StreamingProvider, callIndex = 1): any {
	const toolTurn = provider.requests[callIndex].messages.filter(
		(m: ChatMessage) => Array.isArray(m.content) && m.content[0]?.type === "tool_result",
	)[0];
	return JSON.parse(toolTurn.content[0].content);
}

/** Run the orchestrator, auto-resolving every approval event with the given answer. */
async function runWithApproval(gen: AsyncIterable<AgentEvent>, approved: boolean): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of gen) {
		events.push(event);
		if (event.type === "approval_required") {
			event.resolve(approved);
		}
	}
	return events;
}

function orchestratorWith(provider: AIProvider, registry: FakeToolRegistry) {
	return new AgentOrchestrator(provider, registry as unknown as ToolRegistry, {} as any);
}

describe("AgentOrchestrator", () => {
	it("completes on a plain text response without tool calls", async () => {
		const provider = new StreamingProvider();
		provider.turns = [[{ type: "text_delta", delta: "hello" }, { type: "done" }]];
		const orchestrator = orchestratorWith(provider, new FakeToolRegistry());

		const events = await runWithApproval(
			orchestrator.run("hi", session(), new AbortController().signal, noOptions),
			true,
		);

		expect(events.map((e) => e.type)).toEqual(["thinking", "response", "done"]);
	});

	it("passes model and system prompt to the provider request", async () => {
		const provider = new StreamingProvider();
		provider.turns = [[{ type: "text_delta", delta: "ok" }, { type: "done" }]];
		const orchestrator = orchestratorWith(provider, new FakeToolRegistry());

		await runWithApproval(
			orchestrator.run("summarize", session(), new AbortController().signal, {
				model: "gemini-2.0-flash",
				systemPrompt: "note content",
			}),
			true,
		);

		expect(provider.requests[0].model).toBe("gemini-2.0-flash");
		expect(provider.requests[0].systemPrompt).toBe("note content");
	});

	it("executes a read tool without approval and feeds the result back", async () => {
		const provider = new StreamingProvider();
		provider.turns = [
			[makeToolCall("call-1", "read_note", { path: "a.md" })],
			[{ type: "text_delta", delta: "contents were..." }, { type: "done" }],
		];
		const registry = new FakeToolRegistry();
		const execute = vi.fn(async (): Promise<ToolResult> => ({ success: true, data: "note body" }));
		registry.register(makeTool("read_note", "read", execute));
		const orchestrator = orchestratorWith(provider, registry);

		const events = await runWithApproval(
			orchestrator.run("read a.md", session(), new AbortController().signal, noOptions),
			true,
		);

		const types = events.map((e) => e.type);
		expect(types).toContain("tool_started");
		expect(types).not.toContain("approval_required"); // read tools bypass the gate
		expect(types).toContain("tool_completed");
		expect(types).toContain("done");
		expect(execute).toHaveBeenCalledWith({ path: "a.md" }, expect.anything());

		expect(toolResultFedBack(provider)).toEqual({ success: true, data: "note body" });
	});

	it("requires approval for write tools and executes only when approved", async () => {
		const provider = new StreamingProvider();
		provider.turns = [
			[makeToolCall("call-2", "edit_note", { path: "a.md", old_text: "x", new_text: "y" })],
			[{ type: "text_delta", delta: "edit applied" }, { type: "done" }],
		];
		const registry = new FakeToolRegistry();
		const execute = vi.fn(async (): Promise<ToolResult> => ({ success: true, data: "updated" }));
		registry.register(makeTool("edit_note", "write", execute));
		const orchestrator = orchestratorWith(provider, registry);

		const events = await runWithApproval(
			orchestrator.run("edit a.md", session(), new AbortController().signal, noOptions),
			true,
		);

		expect(events.map((e) => e.type)).toContain("approval_required");
		expect(execute).toHaveBeenCalledTimes(1);
		expect(events.at(-1)?.type).toBe("done");
	});

	it("does NOT execute a write tool when approval is rejected", async () => {
		const provider = new StreamingProvider();
		provider.turns = [
			[makeToolCall("call-3", "edit_note", { path: "a.md", old_text: "x", new_text: "y" })],
			[{ type: "text_delta", delta: "ok, not edited" }, { type: "done" }],
		];
		const registry = new FakeToolRegistry();
		const execute = vi.fn(async (): Promise<ToolResult> => ({ success: true }));
		registry.register(makeTool("edit_note", "write", execute));
		const orchestrator = orchestratorWith(provider, registry);

		const events = await runWithApproval(
			orchestrator.run("edit a.md", session(), new AbortController().signal, noOptions),
			false,
		);

		expect(execute).not.toHaveBeenCalled();
		expect(events.map((e) => e.type)).toContain("approval_required");
		expect(events.at(-1)?.type).toBe("done");

		expect(toolResultFedBack(provider).error).toBe("User rejected");
	});

	it("reports an unknown tool as a failed tool result instead of crashing", async () => {
		const provider = new StreamingProvider();
		provider.turns = [
			[makeToolCall("call-4", "does_not_exist", {})],
			[{ type: "text_delta", delta: "understood" }, { type: "done" }],
		];
		const orchestrator = orchestratorWith(provider, new FakeToolRegistry());

		const events = await runWithApproval(
			orchestrator.run("go", session(), new AbortController().signal, noOptions),
			true,
		);

		expect(events.map((e) => e.type)).toContain("done");
		expect(toolResultFedBack(provider).success).toBe(false);
	});

	it("returns an error event when the abort signal triggers before the loop", async () => {
		const provider = new StreamingProvider();
		provider.turns = [[{ type: "text_delta", delta: "should not be reached" }, { type: "done" }]];
		const orchestrator = orchestratorWith(provider, new FakeToolRegistry());

		const controller = new AbortController();
		controller.abort();

		const events = await runWithApproval(
			orchestrator.run("go", session(), controller.signal, noOptions),
			true,
		);

		expect(provider.requests).toHaveLength(0);
		expect(events.at(-1)?.type).toBe("error");
	});
});
