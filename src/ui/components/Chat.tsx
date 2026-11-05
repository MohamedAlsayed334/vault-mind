import React, { useState, useRef, useEffect, useCallback } from "react";
import type VaultCompassPlugin from "@/main";
import { useAgent } from "@/ui/hooks/useAgent";
import { MessageBubble, isToolLine } from "@/ui/components/Message";
import { ApprovalModal } from "@/ui/components/ApprovalModal";
import type { ChatMessage } from "@/core/types";

export interface ChatProps {
	plugin: VaultCompassPlugin;
}

// ~6 rows of textarea before it stops growing (CSS max-height matches).
const TEXTAREA_MAX_HEIGHT_PX = 150;

const SUGGESTED_PROMPTS = [
	"Summarize my current note",
	"Improve the selected text",
	"Create a daily note outline",
];

function messageText(message: ChatMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? `[Tool Call: ${b.name}]` : ""))
		.join("\n");
}

export const Chat: React.FC<ChatProps> = ({ plugin }) => {
	const [input, setInput] = useState("");
	const { messages, status, pendingApproval, sendMessage, cancel, resolveApproval } = useAgent(plugin);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const busy = status === "running" || status === "waiting_approval";

	// Keep the newest message in view.
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [messages, status]);

	// Auto-resize the textarea up to ~6 rows.
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
	}, [input]);

	// While the agent is running and no streamed text exists yet, show a typing
	// indicator (covers initial thinking and tool activity bursts).
	const last = messages[messages.length - 1];
	const lastHasAssistantText =
		!!last && last.role === "assistant" && !isToolLine(messageText(last)) && messageText(last).trim().length > 0;
	const showTyping = status === "running" && !lastHasAssistantText;

	const handleSend = () => {
		if (!input.trim() || busy) return;
		sendMessage(input);
		setInput("");
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends, Shift+Enter inserts a newline — chat-standard behavior.
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const resizeTextarea = useCallback(() => {
		textareaRef.current?.focus();
	}, []);

	const handleUsePrompt = useCallback(
		(prompt: string) => {
			// Fill the composer without sending, so the user can review/edit first.
			setInput(prompt);
			resizeTextarea();
		},
		[resizeTextarea],
	);

	if (messages.length === 0 && !busy && !pendingApproval) {
		return (
			<div className="vault-compass-chat">
				<EmptyState onUsePrompt={handleUsePrompt} />
				<ComposerForm
					className="vault-compass-composer"
					input={input}
					setInput={setInput}
					textareaRef={textareaRef}
					onKeyDown={handleKeyDown}
					busy={busy}
					onSend={handleSend}
					onCancel={cancel}
				/>
			</div>
		);
	}

	const statusLabel =
		status === "running" && !showTyping
			? null
			: status === "waiting_approval"
				? "Waiting for your approval..."
				: null;

	return (
		<div className="vault-compass-chat">
			<div className="vault-compass-messages">
				{messages.map((msg: ChatMessage, idx: number) => (
					<MessageBubble key={idx} message={msg} />
				))}
				{showTyping && !pendingApproval && <TypingIndicator />}
				{statusLabel && !pendingApproval && (
					<div className="vault-compass-msg vault-compass-msg--assistant">
						<span style={{ fontStyle: "italic", opacity: 0.7 }}>{statusLabel}</span>
					</div>
				)}
				{pendingApproval && (
					<ApprovalModal toolName={pendingApproval.tool} args={pendingApproval.args} onResolve={resolveApproval} />
				)}
				<div ref={messagesEndRef} />
			</div>
			<ComposerForm
				className="vault-compass-composer"
				input={input}
				setInput={setInput}
				textareaRef={textareaRef}
				onKeyDown={handleKeyDown}
				busy={busy}
				onSend={handleSend}
				onCancel={cancel}
			/>
		</div>
	);
};

const TypingIndicator: React.FC = () => (
	<div className="vault-compass-msg vault-compass-msg--assistant">
		<div className="vault-compass-typing" aria-label="Vault Compass is responding">
			<span className="vault-compass-typing-dot" />
			<span className="vault-compass-typing-dot" />
			<span className="vault-compass-typing-dot" />
		</div>
	</div>
);

const EmptyState: React.FC<{ onUsePrompt: (prompt: string) => void }> = ({ onUsePrompt }) => (
	<div className="vault-compass-empty">
		<h2 className="vault-compass-empty__title">Vault Compass</h2>
		<p className="vault-compass-empty__desc">
			Your AI agent for Obsidian. It reads context from the current note and selection, and can edit
			your notes — every write requires your approval first.
		</p>
		<div className="vault-compass-empty__prompts">
			{SUGGESTED_PROMPTS.map((prompt) => (
				<button key={prompt} type="button" className="vault-compass-empty__prompt" onClick={() => onUsePrompt(prompt)}>
					{prompt}
				</button>
			))}
		</div>
	</div>
);

interface ComposerProps {
	className: string;
	input: string;
	setInput: React.Dispatch<React.SetStateAction<string>>;
	textareaRef: React.RefObject<HTMLTextAreaElement>;
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	busy: boolean;
	onSend: () => void;
	onCancel: () => void;
}

// Inline SVG icons keep the buttons icon-only with no extra dependency,
// and a fixed viewBox means nothing clips regardless of theme font metrics.
const SendIcon = (
	<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
		<path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
	</svg>
);

const StopIcon = (
	<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
		<rect x="6" y="6" width="12" height="12" rx="1.5" />
	</svg>
);

function ComposerForm({ className, input, setInput, textareaRef, onKeyDown, busy, onSend, onCancel }: ComposerProps) {
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSend();
			}}
			className={className}
		>
			<textarea
				ref={textareaRef}
				rows={1}
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder="Ask about your vault…  (Enter to send, Shift+Enter for a new line)"
				disabled={busy}
				aria-label="Message Vault Compass"
				className="vault-compass-textarea"
				style={{ height: "auto" }}
			/>
			{busy ? (
				<button
					type="button"
					onClick={onCancel}
					className="vault-compass-btn vault-compass-btn--icon vault-compass-btn--stop"
					title="Stop generating"
					aria-label="Stop"
				>
					{StopIcon}
				</button>
			) : (
				<button
					type="submit"
					disabled={!input.trim()}
					className="vault-compass-btn vault-compass-btn--icon vault-compass-btn--primary"
					title="Send message"
					aria-label="Send"
				>
					{SendIcon}
				</button>
			)}
		</form>
	);
}
