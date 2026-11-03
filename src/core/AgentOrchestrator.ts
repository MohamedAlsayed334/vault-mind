import type { AIProvider } from "@/providers/base/AIProvider";
import type { ToolRegistry } from "@/tools/ToolRegistry";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";
import type { AgentEvent, AgentSession, ChatMessage } from "./types";

const MAX_ITERATIONS = 20;

export class AgentOrchestrator {
  constructor(
    private provider: AIProvider,
    private tools: ToolRegistry,
    private vault: VaultAdapter,
  ) {}

  /**
   * Run the agent loop for a user message.
   * Yields AgentEvents so the UI can react in real time.
   */
  async *run(
    userMessage: string,
    session: AgentSession,
    signal: AbortSignal,
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
        model: "default", // resolved by provider
        messages: session.messages,
        tools: this.tools.getDefinitions(),
        signal,
      });

      let assistantText = "";
      let pendingToolCall: { id: string; name: string; args: unknown } | null = null;

      for await (const event of stream) {
        if (signal.aborted) return;

        if (event.type === "text_delta") {
          assistantText += event.delta;
          yield { type: "response", content: event.delta };
        }

        if (event.type === "tool_call") {
          pendingToolCall = { id: event.id, name: event.name, args: event.arguments };
        }

        if (event.type === "error") {
          yield event;
          session.status = "error";
          return;
        }
      }

      // No tool call → agent is done
      if (!pendingToolCall) {
        if (assistantText) {
          session.messages.push({ role: "assistant", content: assistantText });
        }
        session.status = "done";
        yield { type: "done" };
        return;
      }

      // Tool call — check permission and get approval if needed
      const tool = this.tools.get(pendingToolCall.name);
      yield { type: "tool_started", tool: pendingToolCall.name, args: pendingToolCall.args };

      if (tool.permissionLevel === "destructive" || tool.permissionLevel === "write") {
        const approved = await new Promise<boolean>((resolve) => {
          session.status = "waiting_approval";
          // The UI will call resolve via the event
          this.emitApproval(pendingToolCall!.name, pendingToolCall!.args, resolve);
        });

        if (!approved) {
          yield { type: "tool_completed", tool: pendingToolCall.name, result: { success: false, error: "User rejected" } };
          session.status = "done";
          yield { type: "done" };
          return;
        }
      }

      session.status = "running";
      const result = await tool.execute(pendingToolCall.args, this.vault);
      yield { type: "tool_completed", tool: pendingToolCall.name, result };

      // Feed result back into the conversation
      session.messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id: pendingToolCall.id, name: pendingToolCall.name, input: pendingToolCall.args }],
      });
      session.messages.push({
        role: "user",
        content: [{ type: "tool_result", toolUseId: pendingToolCall.id, content: JSON.stringify(result) }],
      });
    }

    yield { type: "error", message: `Agent exceeded ${MAX_ITERATIONS} iterations` };
    session.status = "error";
  }

  private approvalListeners: Array<(name: string, args: unknown, resolve: (v: boolean) => void) => void> = [];

  onApprovalRequired(cb: (name: string, args: unknown, resolve: (v: boolean) => void) => void) {
    this.approvalListeners.push(cb);
  }

  private emitApproval(name: string, args: unknown, resolve: (v: boolean) => void) {
    for (const cb of this.approvalListeners) cb(name, args, resolve);
  }
}
