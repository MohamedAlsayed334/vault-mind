import type { AIProvider } from "@/providers/base/AIProvider";
import type { Tool, ToolRegistry } from "@/tools/ToolRegistry";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";
import type { AgentEvent, AgentSession, ContentBlock } from "./types";

const MAX_ITERATIONS = 20;

export interface OrchestratorOptions {
	/** Model id, e.g. "gemini-3.8-flash". Provider resolves a default when omitted. */
	model?: string;
	/** Assembled vault context injected as the system prompt. */
	systemPrompt?: string;
}

const REJECTED_RESULT = { success: false, error: "User rejected" };

export class AgentOrchestrator {
	constructor(
		private provider: AIProvider,
		private tools: ToolRegistry,
		private vault: VaultAdapter,
	) {}

	/**
	 * Run the agent loop for a user message.
	 * Yields AgentEvents so the UI can react in real time.
	 * Write/destructive tools are gated behind an approval_required event —
	 * the UI must call resolve(approved) to let the loop continue.
	 */
	async *run(
		userMessage: string,
		session: AgentSession,
		signal: AbortSignal,
		options: OrchestratorOptions = {},
	): AsyncIterable<AgentEvent> {
		session.messages.push({ role: "user", content: userMessage });
		session.status = "running";

		let iterations = 0;

		while (iterations < MAX_ITERATIONS) {
			if (signal.aborted) {
				yield { type: "error", message: "Cancelled" };
				return;
			}

			iterations++;
			yield { type: "thinking" };

			const stream = this.provider.generate({
				model: options.model || "default", // resolved by provider
				messages: session.messages,
				tools: this.tools.getDefinitions(),
				systemPrompt: options.systemPrompt,
				signal,
			});

			let assistantText = "";
			const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = [];			for await (const event of stream) {
				if (signal.aborted) return;

				if (event.type === "text_delta") {
					assistantText += event.delta;
					yield { type: "response", content: event.delta };
				}

				if (event.type === "tool_call") {
					pendingToolCalls.push({ id: event.id, name: event.name, args: event.arguments });
				}

				if (event.type === "error") {
					yield event;
					session.status = "error";
					return;
				}
			}

			// No tool call → agent is done
			if (pendingToolCalls.length === 0) {
				if (assistantText) {
					session.messages.push({ role: "assistant", content: assistantText });
				}
				session.status = "done";
				yield { type: "done" };
				return;
			}

			// The assistant's turn that contains the tool call(s)
			const assistantBlocks: ContentBlock[] = [];
			if (assistantText) {
				assistantBlocks.push({ type: "text", text: assistantText });
			}
			for (const call of pendingToolCalls) {
				assistantBlocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
			}
			session.messages.push({ role: "assistant", content: assistantBlocks });

			const resultBlocks: ContentBlock[] = [];

			for (const call of pendingToolCalls) {
				if (signal.aborted) return;

				let tool: Tool;
				try {
					tool = this.tools.get(call.name);
				} catch {
					resultBlocks.push({
						type: "tool_result",
						toolUseId: call.id,
						name: call.name,
						content: JSON.stringify({ success: false, error: `Unknown tool "${call.name}"` }),
					});
					continue;
				}

				yield { type: "tool_started", tool: call.name, args: call.args };

				// Approval gate for write/destructive tools.
				// The event carries the resolver; the UI decides and calls resolve(approved).
				if (tool.permissionLevel === "write" || tool.permissionLevel === "destructive") {
					let resolveApproval!: (approved: boolean) => void;
					const approval = new Promise<boolean>((resolve) => (resolveApproval = resolve));

					session.status = "waiting_approval";
					yield {
						type: "approval_required",
						tool: call.name,
						args: call.args,
						resolve: resolveApproval,
					};

					const approved = await approval;
					if (!approved) {
						resultBlocks.push({
							type: "tool_result",
							toolUseId: call.id,
							name: call.name,
							content: JSON.stringify(REJECTED_RESULT),
						});
						continue;
					}
				}

				session.status = "running";
				const result = await tool.execute(call.args, this.vault);
				yield { type: "tool_completed", tool: call.name, result };

				resultBlocks.push({
					type: "tool_result",
					toolUseId: call.id,
					name: call.name,
					content: JSON.stringify(result),
				});
			}

			session.messages.push({ role: "user", content: resultBlocks });
		}

		yield { type: "error", message: `Agent exceeded ${MAX_ITERATIONS} iterations` };
		session.status = "error";
	}
}
