# AGENTS.md — Vault Mind

Read this file fully before touching any other file in this repo.
It is the authoritative guide for every AI agent (Claude, Copilot, OpenCode, Cursor, etc.) working here.

---

## What this project is

Vault Mind is an **Obsidian plugin** built as a **modular monolith**.
Everything runs inside Obsidian — no backend, no external server, no native binaries.
It is an **AI agent**, not just a chat interface: it has a reasoning loop, vault tool execution,
provider abstraction, and a streaming event system.

Targets: **desktop and mobile** (`isDesktopOnly: false` in manifest.json).

---

## Non-negotiable rules

### 1. Never import from `"obsidian"` outside `src/obsidian/`
Core modules (`core/`, `tools/`, `context/`, `providers/`, `auth/`, `memory/`, `storage/`) must
stay Obsidian-agnostic. All Obsidian API calls go through the adapters in `src/obsidian/`.
This keeps the engine unit-testable and guarantees mobile compatibility.

### 2. Never use Node.js built-ins
No `fs`, `path`, `http`, `child_process`, `os`, `crypto`, etc.
The bundle targets `platform: "browser"` in esbuild. Use `app.vault.adapter` or `VaultAdapter`
for all file I/O. If you think you need a Node module, you're wrong — find the Obsidian API equivalent.

### 3. Never expose auth tokens to the model
Tokens live in `TokenStore` only. `AIRequest` carries messages and tool definitions — never credentials.
Never log tokens. Never put them in `data.json`.

### 4. Validate every tool argument with Zod before execution
Every tool in `src/tools/` must define a Zod schema and call `schema.safeParse(args)` as the
first thing in `execute()`. Return `{ success: false, error: ... }` on validation failure.

### 5. Write and destructive tools require approval
Tools with `permissionLevel: "write"` or `"destructive"` must go through the `approval_required`
event in `AgentOrchestrator`. Never bypass the approval gate.

### 6. One logical change per commit
Never mix features, fixes, and refactors in the same commit. Follow the git commit format below.

### 7. No backend, no LangChain, no vector DB (yet)
Do not add a backend server. Do not add LangChain or LangGraph. Do not add SQLite or a vector DB.
We have a custom agent loop. Use native Obsidian vault search first. Add complexity only when
there is clear evidence it is needed.

---

## Project structure

```
vault-mind/
├── manifest.json              # Obsidian plugin manifest (isDesktopOnly: false)
├── versions.json              # Min Obsidian version per plugin version
├── package.json               # deps: React, Zod, Zustand, Vitest, esbuild
├── tsconfig.json              # strict TS, path alias @/* -> src/*
├── esbuild.config.mjs         # dev watch + production build, platform: browser
├── AGENTS.md                  # you are here
├── ARCHITECTURE.md            # full system design and data flow
└── src/
    ├── main.ts                # Plugin entry — wires everything, registers commands
    ├── core/
    │   ├── types.ts           # ALL shared types — single source of truth
    │   └── AgentOrchestrator.ts  # Agent loop: think -> tool -> approve -> execute -> repeat
    ├── providers/
    │   └── base/
    │       ├── AIProvider.ts       # Interface every provider implements
    │       └── ProviderRegistry.ts # Register/retrieve providers by id
    ├── auth/                  # TODO: AuthManager.ts, TokenStore.ts
    ├── tools/
    │   ├── ToolRegistry.ts    # Register tools, expose JSON Schema defs to model
    │   └── vault/
    │       ├── ReadNote.ts    # read_note — permissionLevel: read
    │       ├── SearchVault.ts # search_vault — TODO
    │       ├── CreateNote.ts  # create_note — TODO (write)
    │       ├── EditNote.ts    # edit_note — TODO (write, patch-based)
    │       └── MoveNote.ts    # move_note — TODO (write)
    ├── context/               # TODO: ContextEngine.ts, ContextBuilder.ts, VaultSearch.ts
    ├── memory/                # TODO: MemoryManager.ts, SessionStore.ts
    ├── obsidian/
    │   ├── VaultAdapter.ts    # All vault read/write — only file touching vault API
    │   ├── EditorAdapter.ts   # TODO: active editor, selection, cursor
    │   └── WorkspaceAdapter.ts # TODO: views, sidebars, commands
    ├── storage/               # TODO: StorageAdapter.ts, PluginStorage.ts
    ├── ui/
    │   ├── views/             # Obsidian ItemView subclasses
    │   ├── components/        # React components
    │   ├── hooks/             # React hooks
    │   └── styles/            # CSS modules
    └── utils/
```

---

## Key interfaces — do not change signatures without updating all implementations

### AIProvider (`src/providers/base/AIProvider.ts`)
```ts
interface AIProvider {
  readonly id: string
  readonly name: string
  readonly capabilities: ProviderCapabilities
  authenticate(method: 'api_key' | 'oauth', credential?: string): Promise<void>
  getAuthState(): AuthState
  logout(): Promise<void>
  getModels(): Promise<ModelInfo[]>
  generate(request: AIRequest): AsyncIterable<AIEvent>
}
```

### Tool (`src/tools/ToolRegistry.ts`)
```ts
interface Tool {
  name: string
  description: string
  permissionLevel: 'read' | 'write' | 'destructive'
  inputSchema: Record<string, unknown>  // JSON Schema
  execute(args: unknown, vault: VaultAdapter): Promise<ToolResult>
}
```

### AgentEvent (`src/core/types.ts`)
```ts
type AgentEvent =
  | { type: 'thinking' }
  | { type: 'tool_started'; tool: string; args: unknown }
  | { type: 'tool_completed'; tool: string; result: ToolResult }
  | { type: 'approval_required'; tool: string; args: unknown; resolve: (approved: boolean) => void }
  | { type: 'response'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
```

### AIEvent (`src/core/types.ts`)
```ts
type AIEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_result'; id: string; result: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string }
```

---

## Auth approach

| Provider   | OAuth (no key needed)       | API key |
|------------|-----------------------------|---------|
| OpenAI     | YES — browser OAuth PKCE    | YES     |
| Google     | YES — browser OAuth PKCE    | YES     |
| Anthropic  | NO — bans reported, skip    | YES     |
| Ollama     | NO — local only             | YES (URL)|
| OpenRouter | NO                          | YES     |

OAuth uses `registerObsidianProtocolHandler` to catch the redirect — no loopback server,
works on mobile. Tokens stored in `TokenStore`, never in `data.json`, never logged.

---

## Platform constraints

- `isDesktopOnly: false` — every feature must work on mobile unless explicitly desktop-only.
- Never use `Platform.isDesktop` to gate core features. Gate only optional extras.
- Streaming: try `fetch` first; fall back to `requestUrl` (no streaming) when CORS blocks.
- All file I/O through `VaultAdapter`. Never call `app.vault` outside `src/obsidian/`.

---

## How to add a new tool

1. Create `src/tools/vault/YourTool.ts`
2. Define a Zod schema for the input
3. Export a `Tool` object with `name`, `description`, `permissionLevel`, `inputSchema`, `execute`
4. Register it in `src/main.ts`: `this.toolRegistry.register(YourTool)`
5. If `permissionLevel` is `write` or `destructive`, the approval gate handles it automatically

---

## How to add a new provider

1. Create `src/providers/yourprovider/YourProvider.ts`
2. Implement the `AIProvider` interface fully
3. Handle both `api_key` and `oauth` in `authenticate()` (or throw for unsupported methods)
4. Set `capabilities.corsCompatible` correctly — test on mobile
5. Register in `src/main.ts`: `this.providerRegistry.register(new YourProvider())`

---

## Git commit format

Format: `<type>(<scope>): <summary>`

Types: `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf` · `style` · `build` · `ci` · `revert`

Scope: `core` · `providers` · `auth` · `tools` · `context` · `obsidian` · `ui` · `storage` · `memory`

Rules:
- Imperative mood, lowercase start, no trailing period, max 72 chars
- One logical change per commit
- Body optional: what and why, not how
- Breaking changes: `feat!:` + `BREAKING CHANGE:` footer
- Reference issues: `Closes #42`
- Never commit: `main.js`, `node_modules/`, secrets, unrelated changes

Examples:
```
feat(providers): add Gemini API key provider with streaming
fix(tools): validate path before read_note execution
refactor(core): extract approval flow into AgentOrchestrator method
chore: add eslint config
docs: update AGENTS.md with tool registration guide
```

---

## Development workflow

```bash
npm install
npm run dev        # esbuild watch mode
npm run build      # production bundle -> main.js
npm run typecheck  # tsc --noEmit (run before every commit)
npm run lint       # eslint
npm run test       # vitest
```

Testing in Obsidian: copy `main.js` + `manifest.json` into
`.obsidian/plugins/vault-mind/` in a test vault, then reload plugins.

---

## Current milestone

**Milestone 1 — Prove the full stack works:**
Select text in a note -> ask AI to improve it -> AI proposes edit -> user approves -> edit applied.

Validates: provider -> agent loop -> context -> tool execution -> UI approval flow.

**Status:** scaffold complete. Next task -> Gemini API key provider (`src/providers/gemini/`).

**Build order:**
1. `src/providers/gemini/GeminiProvider.ts` — API key, streaming, tool calling
2. `src/ui/` — sidebar chat view (React)
3. `src/tools/vault/EditNote.ts` — patch-based edit with diff preview
4. `src/auth/` — OAuth flow for OpenAI and Google
5. `src/context/` — context assembly and vault search
6. `src/memory/` — session persistence

---

## What NOT to do

- Do not add a backend server
- Do not add LangChain or LangGraph
- Do not add SQLite or a vector DB yet
- Do not add a provider without implementing the full `AIProvider` interface
- Do not write sessions or history to `data.json` — use separate files via `StorageAdapter`
- Do not add Node.js imports
- Do not import from `"obsidian"` outside `src/obsidian/`
- Do not skip the approval gate for write/destructive tools
- Do not store or log auth tokens anywhere outside `TokenStore`
