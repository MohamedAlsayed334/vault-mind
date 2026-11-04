import { useState, useCallback } from "react";
import type VaultMindPlugin from "@/main";
import type { ChatMessage } from "@/core/types";
import { AgentOrchestrator } from "@/core/AgentOrchestrator";

export function useAgent(plugin: VaultMindPlugin) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<"idle" | "running" | "waiting_approval" | "done" | "error">("idle");
	const [abortController, setAbortController] = useState<AbortController | null>(null);

	const sendMessage = useCallback(
		async (text: string) => {
			const provider = plugin.providerRegistry.get(plugin.settings?.selectedProviderId || "gemini");
			if (!provider) {
				setMessages((prev) => [...prev, { role: "assistant", content: "Error: No AI provider registered." }]);
				return;
			}

			// Configure provider api key from settings if present
			if (plugin.settings?.geminiApiKey) {
				await provider.authenticate("api_key", plugin.settings.geminiApiKey);
			}

			const orchestrator = new AgentOrchestrator(provider, plugin.toolRegistry, plugin.vaultAdapter);
			const controller = new AbortController();
			setAbortController(controller);

			const session = {
				id: Date.now().toString(),
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messages: [...messages],
				status: "running" as const,
			};

			// Optimistically add user message
			const newMessages = [...messages, { role: "user" as const, content: text }];
			setMessages(newMessages);
			session.messages = newMessages;
			setStatus("running");

			try {
				const stream = orchestrator.run(text, session, controller.signal);
				let assistantContent = "";

				for await (const event of stream) {
					if (event.type === "response") {
						assistantContent += event.content;
						setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
					} else if (event.type === "error") {
						setMessages([...newMessages, { role: "assistant", content: `Error: ${event.message}` }]);
						setStatus("error");
						break;
					} else if (event.type === "done") {
						setStatus("idle");
					}
				}
			} catch (err: any) {
				if (!controller.signal.aborted) {
					setMessages([...newMessages, { role: "assistant", content: `Error: ${err.message || String(err)}` }]);
					setStatus("error");
				}
			} finally {
				setAbortController(null);
			}
		},
		[plugin, messages]
	);

	const cancel = useCallback(() => {
		if (abortController) {
			abortController.abort();
			setAbortController(null);
			setStatus("idle");
		}
	}, [abortController]);

	return { messages, status, sendMessage, cancel };
}
