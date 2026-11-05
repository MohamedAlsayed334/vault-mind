import React from "react";

export interface ApprovalModalProps {
	toolName: string;
	args: any;
	onResolve: (approved: boolean) => void;
}

/** Human-friendly header names; the raw id stays visible as a subtitle. */
const TOOL_LABELS: Record<string, string> = {
	read_note: "Read Note",
	search_vault: "Search Vault",
	edit_note: "Edit Note",
	create_note: "Create Note",
	move_note: "Move Note",
};

function humanize(toolName: string): string {
	return TOOL_LABELS[toolName] ?? toolName;
}

function isPrimitive(v: unknown): boolean {
	return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * Renders argument fields. Special-cases edit_note (old_text/new_text as code
 * blocks with a first-occurrence hint); everything else falls back to one row
 * per simple field, or formatted JSON for complex values.
 */
function ArgumentFields({ toolName, args }: { toolName: string; args: any }) {
	if (toolName === "edit_note" && args && isPrimitive(args.old_text) && isPrimitive(args.new_text)) {
		return (
			<>
				<span className="vault-mind-approval__label">Note</span>
				<span className="vault-mind-approval__value">{String(args.path)}</span>
				<span className="vault-mind-approval__label" style={{ marginTop: "var(--size-2-2)" }}>
					Replace (first occurrence only)
				</span>
				<pre className="vault-mind-approval__code">{String(args.old_text)}</pre>
				{args.old_text !== args.new_text && (
					<>
						<span className="vault-mind-approval__label">With</span>
						<pre className="vault-mind-approval__code">{String(args.new_text)}</pre>
					</>
				)}
				<p className="vault-mind-approval__hint">
					If this text appears more than once in the note, only the <b>first</b> occurrence is replaced.
				</p>
			</>
		);
	}

	if (!args || typeof args !== "object") {
		return <pre className="vault-mind-approval__code">{JSON.stringify(args, null, 2)}</pre>;
	}

	const entries = Object.entries(args).filter(([, v]) => isPrimitive(v));
	const complex = Object.entries(args).filter(([, v]) => !isPrimitive(v));

	return (
		<>
			{entries.map(([key, value]) => (
				<div key={key}>
					<span className="vault-mind-approval__label">{key}</span>
					<span className="vault-mind-approval__value">
						{typeof value === "string" && value.length > 64 ? <pre className="vault-mind-approval__code">{value}</pre> : String(value)}
					</span>
				</div>
			))}
			{complex.length > 0 && (
				<pre className="vault-mind-approval__code">{JSON.stringify(Object.fromEntries(complex), null, 2)}</pre>
			)}
		</>
	);
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ toolName, args, onResolve }) => {
	return (
		<div className="vault-mind-approval">
			<div className="vault-mind-approval__title">
				<span className="vault-mind-approval__tool">{humanize(toolName)}</span>
				<span className="vault-mind-approval__id">{toolName}</span>
			</div>
			<p className="vault-mind-approval__hint">This tool can change your vault — approve or reject below.</p>
			<ArgumentFields toolName={toolName} args={args} />
			<div className="vault-mind-approval__actions">
				<button type="button" onClick={() => onResolve(false)} className="vault-mind-btn" title="Reject this action">
					Reject
				</button>
				<button
					type="button"
					onClick={() => onResolve(true)}
					className="vault-mind-btn vault-mind-btn--primary"
					title="Approve and run"
				>
					Approve
				</button>
			</div>
		</div>
	);
};
