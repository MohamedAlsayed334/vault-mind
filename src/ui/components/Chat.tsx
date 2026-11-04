import React, { useState, useRef, useEffect } from "react";
import type VaultMindPlugin from "@/main";
import { useAgent } from "@/ui/hooks/useAgent";
import { MessageBubble } from "@/ui/components/Message";
import type { ChatMessage } from "@/core/types";

export interface ChatProps {
	plugin: VaultMindPlugin;
}

export const Chat: React.FC<ChatProps> = ({ plugin }) => {
	const [input, setInput] = useState("");
	const { messages, status, sendMessage, cancel } = useAgent(plugin);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, status]);

	const handleSend = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || status === "running") return;
		sendMessage(input);
		setInput("");
	};

	return (
		<div className="vault-mind-chat" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px" }}>
			<div className="vault-mind-messages" style={{ flex: 1, overflowY: "auto", marginBottom: "10px" }}>
				{messages.map((msg: ChatMessage, idx: number) => (
					<MessageBubble key={idx} message={msg} />
				))}
				{status === "running" && (
					<div style={{ fontStyle: "italic", opacity: 0.7, padding: "4px 8px" }}>Thinking...</div>
				)}
				<div ref={messagesEndRef} />
			</div>
			<form onSubmit={handleSend} style={{ display: "flex", gap: "8px" }}>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask about your vault..."
					disabled={status === "running"}
					style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid var(--background-modifier-border)" }}
				/>
				{status === "running" ? (
					<button type="button" onClick={cancel} style={{ padding: "8px 12px" }}>Stop</button>
				) : (
					<button type="submit" style={{ padding: "8px 12px" }}>Send</button>
				)}
			</form>
		</div>
	);
};
