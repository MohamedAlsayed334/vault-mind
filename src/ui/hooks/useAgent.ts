import { useCallback, useRef, useState } from "react";
import type VaultMindPlugin from "@/main";
import type { AgentSession, ChatMessage } from "@/core/types";
import { AgentOrchestrator } from "@/core/AgentOrchestrator";

export interface PendingApproval {
	tool: string;
	args: unknown;
	resolve: (approved: boolean) => void;
}

type AgentStatus = "idle" | "running" | "waiting_approval" | "error";

export function useAgent(plugin: VaultMindPlugin) {
	// Display messages only. The agent's real history (incl. tool blocks) lives in the session.
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<AgentStatus>("idle");
	const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const pendingApprovalRef = useRef<PendingApproval | null>(null);
	const sessionRef = useRef<AgentSession | null>(null);

	const pushMessage = useCallback((message: ChatMessage) => {
		setMessages((prev) => [...prev, message]);
	}, []);

	const updateLastAssistant = useCallback((content: string) => {
		setMessages((prev) => {
			const next = [...prev];
			if (next.length > 0 && next[next.length - 1].role === "assistant") {
				next[next.length - 1] = { role: "assistant", content };
			} else {
				next.push({ role: "assistant", content });
			}
			return next;
		});
	}, []);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!plugin.settings) return;

			const providerId = plugin.settings.selectedProviderId || "gemini";
			let provider;
			try {
				provider = plugin.providerRegistry.get(providerId);
			} catch {
				pushMessage({ role: "assistant", content: "Error: No AI provider registered." });
				setStatus("error");
				return;
			}

			const key = plugin.tokenStore.get(providerId);
			if (!key) {
				pushMessage({
					role: "assistant",
					content: `Error: No API key configured for ${provider.name}. Add one in Settings → Vault Mind.`,
				});
				setStatus("error");
				return;
			}
			await provider.authenticate("api_key", key);

			// Session persists across sends so the agent has full conversation history.
			if (!sessionRef.current) {
				sessionRef.current = {
					id: Date.now().toString(),
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
					status: "idle",
				};
			}
			const session = sessionRef.current;

			// Vault context → system prompt (active note + selection)
			let systemPrompt: string | undefined;
			try {
				const context = await plugin.contextBuilder.buildContext();
				systemPrompt = plugin.contextBuilder.injectSystemPrompt(context);
			} catch {
				// Context is best-effort; chat still works without it
			}

			// Optimistic user bubble (orchestrator pushes the message into session history itself)
			pushMessage({ role: "user", content: text });
			setStatus("running");

			const orchestrator = new AgentOrchestrator(provider, plugin.toolRegistry, plugin.vaultAdapter);
			const controller = new AbortController();
			abortRef.current = controller;

			let assistantContent = "";

			const flush = () => {
				assistantContent = "";
			};

			try {
				const stream = orchestrator.run(text, session, controller.signal, {
					model: plugin.settings.selectedModel,
					systemPrompt,
				});

				for await (const event of stream) {
					switch (event.type) {
						case "response":
							assistantContent += event.content;
							updateLastAssistant(assistantContent);
							break;

						case "tool_started":
							flush();
							pushMessage({ role: "assistant", content: `⚙ Using tool: ${event.tool}` });
							break;

						case "approval_required": {
							setStatus("waiting_approval");
							// Once-only resolver: resolving twice (e.g. cancel racing a click)
							// must not double-fire the orchestrator's resolver.
							let resolved = false;
							const oneTimeResolve = (approved: boolean) => {
								if (resolved) return;
								resolved = true;
								event.resolve(approved);
							};
							const pending: PendingApproval = {
								tool: event.tool,
								args: event.args,
								resolve: (approved: boolean) => {
									pendingApprovalRef.current = null;
									setPendingApproval(null);
									setStatus("running");
									oneTimeResolve(approved);
								},
							};
							// Ref mirrors the state so cancel() can reach the resolver
							// without waiting for a re-render.
							pendingApprovalRef.current = pending;
							setPendingApproval(pending);
							break;
						}

						case "error":
							flush();
							pushMessage({ role: "assistant", content: `Error: ${event.message}` });
							setStatus("error");
							break;

						case "done":
							flush();
							setStatus("idle");
							break;

						default:
							break;
					}
				}
			} catch (err: unknown) {
				if (!controller.signal.aborted) {
					const message = err instanceof Error ? err.message : String(err);
					pushMessage({ role: "assistant", content: `Error: ${message}` });
					setStatus("error");
				}
			} finally {
				abortRef.current = null;
				session.updatedAt = Date.now();
				setStatus((current) => (current === "running" ? "idle" : current));
			}
		},
		[plugin, pushMessage, updateLastAssistant],
	);

	const cancel = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		// Unblock the orchestrator: it awaits the resolver even though the
		// provider stream was aborted — resolving false lets the loop finish.
		const pending = pendingApprovalRef.current;
		if (pending) {
			pendingApprovalRef.current = null;
			setPendingApproval(null);
			pending.resolve(false);
		}
		setStatus("idle");
	}, []);

	const resolveApproval = useCallback((approved: boolean) => {
		setPendingApproval((pending) => {
			if (pending) {
				pendingApprovalRef.current = null;
				pending.resolve(approved);
			}
			return null;
		});
	}, []);

	return { messages, status, pendingApproval, sendMessage, cancel, resolveApproval };
}
