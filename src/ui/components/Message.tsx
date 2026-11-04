import React from "react";
import type { ChatMessage } from "@/core/types";

export interface MessageBubbleProps {
	message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
	const isUser = message.role === "user";
	const contentStr =
		typeof message.content === "string"
			? message.content
			: message.content
					.map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? `[Tool Call: ${b.name}]` : ""))
					.join("\n");

	return (
		<div
			style={{
				marginBottom: "12px",
				display: "flex",
				flexDirection: "column",
				alignItems: isUser ? "flex-end" : "flex-start",
			}}
		>
			<div
				style={{
					maxWidth: "85%",
					padding: "8px 12px",
					borderRadius: "8px",
					background: isUser ? "var(--interactive-accent)" : "var(--background-secondary)",
					color: isUser ? "var(--text-on-accent)" : "var(--text-normal)",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					fontSize: "0.95em",
				}}
			>
				{contentStr}
			</div>
		</div>
	);
};
