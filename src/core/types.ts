import type { ErrorCode } from "./ProviderError";

// ─── Provider types ──────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  /** false on mobile for providers that reject browser-origin fetch */
  corsCompatible: boolean;
}

export type AIRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  signal?: AbortSignal;
};

export type AIEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; id: string; result: unknown }
  | { type: "done" }
  | { type: "error"; message: string; code?: ErrorCode; cause?: string };

// ─── Chat types ───────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: MessageRole;
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; url: string; mediaType: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; name: string; content: string };

// ─── Tool types ───────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type PermissionLevel = "read" | "write" | "destructive";

// ─── Agent types ──────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_started"; tool: string; args: unknown }
  | { type: "tool_completed"; tool: string; result: ToolResult }
  | { type: "approval_required"; tool: string; args: unknown; resolve: (approved: boolean) => void }
  | { type: "response"; content: string }
  | { type: "error"; message: string; code?: ErrorCode; cause?: string }
  | { type: "done" };

export interface AgentSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  status: "idle" | "running" | "waiting_approval" | "done" | "error";
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export type AuthMethod = "api_key" | "oauth";

export interface AuthState {
  method: AuthMethod;
  isAuthenticated: boolean;
  /** Never expose this to the model */
  token?: string;
  expiresAt?: number;
}

// ─── Platform ─────────────────────────────────────────────────────────────────

export interface PlatformCapabilities {
  isMobile: boolean;
  canStream: boolean;
  /** Desktop only — loopback OAuth redirect */
  canRunLocalServer: boolean;
}
