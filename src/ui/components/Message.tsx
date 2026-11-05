import React from "react";
import type { ChatMessage } from "@/core/types";

export interface MessageBubbleProps {
	message: ChatMessage;
}

const TOOL_MARKER = "⚙ Using tool:";

/** Text of a message, flattening content blocks (tool blocks become inline markers). */
function messageText(message: ChatMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? `[Tool Call: ${b.name}]` : ""))
		.join("\n");
}

/** Tool activity lines pushed by useAgent ("⚙ Using tool: X") render as muted chips. */
export function isToolLine(text: string): boolean {
	return text.startsWith(TOOL_MARKER);
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
	const isUser = message.role === "user";
	const text = messageText(message);

	// Compact chip row for tool activity — not a full chat bubble.
	if (!isUser && isToolLine(text)) {
		return (
			<div className="vault-mind-msg vault-mind-msg--assistant">
				<span className="vault-mind-tool-chip">{text}</span>
			</div>
		);
	}

	// Errors: small plain line, no bubble.
	if (!isUser && text.startsWith("Error:")) {
		return (
			<div className="vault-mind-msg vault-mind-msg--assistant">
				<span className="vault-mind-error-line">{text}</span>
			</div>
		);
	}

	return (
		<div className={`vault-mind-msg ${isUser ? "vault-mind-msg--user" : "vault-mind-msg--assistant"}`}>
			<div className={`vault-mind-bubble ${isUser ? "vault-mind-bubble--user" : "vault-mind-bubble--assistant"}`}>
				{text}
			</div>
		</div>
	);
};
