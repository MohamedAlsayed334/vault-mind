import React from "react";

export interface ApprovalModalProps {
	toolName: string;
	args: any;
	onResolve: (approved: boolean) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ toolName, args, onResolve }) => {
	return (
		<div
			style={{
				padding: "12px",
				background: "var(--background-modifier-error)",
				borderRadius: "6px",
				margin: "8px 0",
				color: "var(--text-error)",
			}}
		>
			<div style={{ fontWeight: "bold", marginBottom: "6px" }}>Approval Required for tool: {toolName}</div>
			<pre style={{ fontSize: "0.85em", background: "rgba(0,0,0,0.1)", padding: "6px", borderRadius: "4px" }}>
				{JSON.stringify(args, null, 2)}
			</pre>
			<div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
				<button onClick={() => onResolve(true)} style={{ padding: "4px 12px" }}>Approve</button>
				<button onClick={() => onResolve(false)} style={{ padding: "4px 12px" }}>Reject</button>
			</div>
		</div>
	);
};
