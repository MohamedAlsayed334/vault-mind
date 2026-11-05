# ARCHITECTURE.md — Vault Compass

Full system design. Read AGENTS.md first for rules and constraints.

---

## Pattern: Modular Monolith

Everything runs inside the Obsidian plugin process. No backend. No external server.
Modules have clear boundaries and interfaces but share one process and one bundle.

---

## Data flow

```
User input (chat / command / editor selection)
        |
        v
   [ UI Layer ]
   React sidebar, approval modals, diff viewer
        |
        v
   [ AgentOrchestrator ]  src/core/AgentOrchestrator.ts
   - Receives user message
   - Builds AIRequest from session messages + tool definitions
   - Calls provider.generate() -> streams AIEvents
   - On tool_call: validate -> check permission ->
     emit approval_required if write/destructive ->
     execute tool -> feed result back -> loop
   - On no tool_call: done
        |
   -----+---------------------
   |                         |
   v                         v
[ Provider Layer ]      [ Tool System ]
  AIProvider interface    ToolRegistry
  GeminiProvider          read_note
  OpenAIProvider          search_vault
                          create_note
                          edit_note (patch-based)
                          move_note
                               |
                               v
                        [ VaultAdapter ]
                        src/obsidian/VaultAdapter.ts
                        Only file touching Obsidian APIs
                               |
                               v
                        Obsidian vault / editor
```

---

## Modules

### src/core/
- **types.ts** — single source of truth for all shared types: AIEvent, AgentEvent,
  ChatMessage, ContentBlock, ToolDefinition, ToolResult, AuthState, PlatformCapabilities.
  Nothing imports types from anywhere else.
- **AgentOrchestrator.ts** — the agent loop. Stateless except for approval listeners.
  Receives a session, runs until done or max iterations. Yields AgentEvent stream.

### src/providers/
- **base/AIProvider.ts** — the interface. Every provider implements it identically.
- **base/ProviderRegistry.ts** — register and retrieve providers by string id.
- **gemini/** — Gemini API key + OAuth. Handles streaming via fetch, falls back to
  requestUrl on CORS failure. Maps Gemini tool call format to AIEvent.
- **openai/** — OpenAI API key + OAuth. Same streaming pattern.

### src/auth/
- **AuthManager.ts** — coordinates auth per provider. Knows which method to use.
- **TokenStore.ts** — stores tokens. Never in data.json. Uses Obsidian's secure storage
  if available; otherwise warns user about sync risk. Never logs tokens.

OAuth flow (desktop + mobile):
1. Build auth URL with PKCE challenge
2. window.open(authUrl) — user logs in in browser
3. Browser redirects to obsidian://vault-compass/oauth?code=...
4. registerObsidianProtocolHandler catches it
5. Exchange code for tokens
6. Store in TokenStore

### src/tools/
- **ToolRegistry.ts** — register tools, expose ToolDefinition[] to the model.
- **vault/ReadNote.ts** — permissionLevel: read. Reads note by path. Zod-validated.
- **vault/SearchVault.ts** — permissionLevel: read. Keyword search via MetadataCache.
- **vault/CreateNote.ts** — permissionLevel: write. Creates note, requires approval.
- **vault/EditNote.ts** — permissionLevel: write. Patch-based edit via vault.process(),
  never full-file rewrite. Shows diff in approval UI before applying.
- **vault/MoveNote.ts** — permissionLevel: write. Renames/moves via fileManager.renameFile.

### src/context/
- **ContextEngine.ts** — entry point. Given a user message, assembles a context package.
- **ContextBuilder.ts** — collects: current note, selection, explicitly mentioned notes,
  search results, backlinks. Trims to token budget.
- **VaultSearch.ts** — keyword search using MetadataCache and Vault.getMarkdownFiles().
  Phase 2: add embeddings + local vector index (desktop only).

### src/memory/
- **SessionStore.ts** — persists agent sessions as JSON files in plugin data folder.
  One file per session. Never in data.json.
- **MemoryManager.ts** — loads/saves sessions. Handles resuming interrupted runs.

### src/obsidian/
- **VaultAdapter.ts** — all vault I/O. read, write, process, create, delete,
  rename, createFolder, exists, listFiles, getActiveFile, getSelection.
- **EditorAdapter.ts** — active editor, cursor position, selection, applying patches.
- **WorkspaceAdapter.ts** — open/close views, register commands, show notices.

### src/storage/
- **StorageAdapter.ts** — interface: get(key), set(key, value), delete(key).
- **PluginStorage.ts** — implements using loadData/saveData. Settings only.

### src/ui/
- **views/ChatView.ts** — Obsidian ItemView. Opens in sidebar. Mounts React root.
- **components/Chat.tsx** — message list, input box, streaming response.
- **components/AgentActivity.tsx** — shows tool calls, thinking state, approval prompts.
- **components/DiffViewer.tsx** — shows proposed edit before approval.
- **hooks/useAgent.ts** — drives the agent loop, manages AbortController.
- **styles/** — CSS modules. Uses Obsidian CSS variables for theme compatibility.

---

## State management

| State | Where |
|---|---|
| UI state (messages, loading, input) | Zustand store or React state |
| Agent session (messages, status) | AgentSession object, persisted by SessionStore |
| Auth tokens | TokenStore |
| Plugin settings (selected model, provider) | PluginStorage -> data.json |
| Conversation history | JSON files in plugin data folder |

---

## Streaming architecture

```
provider.generate(request) -> AsyncIterable<AIEvent>
  |-- fetch() with ReadableStream (desktop + some mobile)
  |     body reader -> SSE lines -> AIEvent per chunk
  |
  `-- requestUrl() fallback (mobile CORS block)
        full response -> single text_delta -> done
```

The orchestrator consumes the stream and re-emits as AgentEvent to the UI.
The UI renders deltas incrementally.

---

## Token budget

```
Total context window (e.g. 128k tokens)
  |-- System prompt        ~500 tokens   fixed
  |-- Tool definitions     ~1000 tokens  fixed per session
  |-- Conversation history variable — trimmed oldest first
  `-- Context package      variable — current note, selection, search results
                           trimmed if over budget
```

ContextBuilder estimates tokens (char count / 4) and trims before sending.

---

## Security model

| Concern | Mitigation |
|---|---|
| AI modifies arbitrary files | Tools only access vault. Path validated by Zod. |
| Write/delete without warning | Approval gate for write + destructive tools |
| Token leakage | TokenStore only. Never in AIRequest. Never logged. |
| Prompt injection via note content | Note content treated as data, not instructions |
| Runaway agent | MAX_ITERATIONS = 20 hard cap + AbortSignal cancellation |
| Sync exposes tokens | Warn user. Use secure storage where available. |

---

## Build system

```
esbuild.config.mjs
  platform: "browser"      <- enforces no Node built-ins
  format: "cjs"            <- Obsidian plugin format
  bundle: true
  external: ["obsidian", "electron", ...builtins]
  jsx: "automatic"         <- React 18 JSX transform
  outfile: "main.js"
```

Dev:  npm run dev   -> watch mode, inline sourcemaps
Prod: npm run build -> minified, no sourcemaps

---

## Milestones

### M1 — Full stack proof (current)
Select text -> ask AI -> AI proposes edit -> approve -> applied.
Requires: GeminiProvider (API key) + ChatView + EditNote tool.

### M2 — Subscription auth
Google OAuth + OpenAI OAuth via obsidian:// protocol handler.
No CLI required. Works on mobile.

### M3 — Vault intelligence
SearchVault tool + ContextEngine auto-assembles relevant notes.
Agent can answer questions about the vault.

### M4 — Agent workflows
Multi-step tasks: "organize my ML notes into a roadmap".
Full tool suite: create, edit, move, search.

### M5 — Semantic search
Embeddings + local vector index (desktop). API-based embeddings (mobile).
Activated only after M3 proves keyword search is insufficient.
