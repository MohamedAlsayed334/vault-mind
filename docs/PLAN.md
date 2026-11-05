# Vault Compass — V1 Development Plan

This is the single source of truth for building V1.
Any AI agent working on this must read AGENTS.md and ARCHITECTURE.md first,
then use this file to know what to build next and in what order.

---

## What V1 is

A working Obsidian plugin where the user can:
1. Open a chat sidebar
2. Talk to an AI about their vault
3. Ask the AI to edit a note
4. See the proposed change and approve it
5. Have the edit applied to the actual note

That is the complete V1. Nothing more.

---

## Stack (already decided, do not change)

- Language: TypeScript
- Build: esbuild (platform: browser — no Node built-ins ever)
- UI: React 18 + CSS modules
- Validation: Zod
- UI state: Zustand
- Tests: Vitest
- Obsidian min version: 1.4.0
- Targets: desktop + mobile

---

## Repo state right now

Scaffold is done. These files exist:

```
src/main.ts                          plugin entry, wires everything
src/core/types.ts                    all shared types
src/core/AgentOrchestrator.ts        agent loop skeleton
src/providers/base/AIProvider.ts     provider interface
src/providers/base/ProviderRegistry.ts
src/obsidian/VaultAdapter.ts         vault read/write adapter
src/tools/ToolRegistry.ts            tool registry
src/tools/vault/ReadNote.ts          first tool (read only)
```

Everything else is TODO.

---

## Phases

### Phase 1 — Gemini provider (API key only)
**Goal:** Claude can call Gemini and get a response back.
**No UI yet. Test by writing a quick script or unit test.**

Files to create:
```
src/providers/gemini/GeminiClient.ts
src/providers/gemini/GeminiProvider.ts
```

GeminiProvider must implement AIProvider interface exactly.

Behavior:
- authenticate('api_key', key) stores the key in memory (no TokenStore yet, that's Phase 4)
- generate(request) calls https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
- Streams response via fetch + ReadableStream
- Falls back to requestUrl (Obsidian API, no streaming) if fetch fails (mobile CORS)
- Maps Gemini response format to AIEvent stream: text_delta, tool_call, done, error
- getModels() returns hardcoded list: gemini-2.0-flash, gemini-1.5-pro
- Default model: gemini-2.0-flash

Wire it up in main.ts:
```ts
this.providerRegistry.register(new GeminiProvider())
```

Done when: provider.generate() returns streamed text for a simple prompt.

---

### Phase 2 — Settings UI
**Goal:** User can enter their Gemini API key and select a model.

Files to create:
```
src/storage/PluginStorage.ts
src/ui/settings/SettingsTab.tsx  (extends Obsidian PluginSettingTab)
```

Settings stored in data.json via loadData/saveData (settings only, never tokens or history):
```ts
interface VaultCompassSettings {
  selectedProviderId: string   // 'gemini'
  selectedModel: string        // 'gemini-2.0-flash'
  geminiApiKey: string         // stored here for now, Phase 4 moves it to TokenStore
}
```

Wire up in main.ts: `this.addSettingTab(new SettingsTab(this.app, this))`

Done when: user enters API key in settings, plugin saves it, provider reads it on next call.

---

### Phase 3 — Chat UI
**Goal:** User can open a sidebar, type a message, and see the AI respond in real time.

Files to create:
```
src/ui/views/ChatView.ts          (Obsidian ItemView, mounts React)
src/ui/components/Chat.tsx        (message list + input)
src/ui/components/Message.tsx     (single message bubble)
src/ui/hooks/useAgent.ts          (drives agent loop, holds AbortController)
src/ui/store.ts                   (Zustand store: messages, status, session)
src/ui/styles/chat.css
```

ChatView registered in main.ts as a right-sidebar leaf.
Command added: "Open Vault Compass" to show the sidebar.

Chat behavior:
- User types message, hits Enter or Send
- useAgent calls AgentOrchestrator.run()
- Streams AgentEvents into Zustand store
- Chat renders messages in real time as text_delta events arrive
- Shows "thinking..." while agent is working
- Shows error message if something fails

No tool execution yet — if the agent tries to call a tool, show it in the UI but do nothing.

Done when: user opens sidebar, types "hello", sees streaming response from Gemini.

---

### Phase 4 — Vault context
**Goal:** AI knows about the current note and selected text automatically.

Files to create:
```
src/context/ContextBuilder.ts
```

Before sending to the agent, ContextBuilder assembles:
```ts
interface ContextPackage {
  currentNote: { path: string; content: string } | null
  selection: string | null
}
```

Inject as system prompt:
```
You are an AI assistant for Obsidian.
Current note: {path}
{content}
Selected text: {selection}
```

Trim content to 8000 chars max for now. Keep it simple.

Wire into useAgent.ts: build context, prepend as system message before sending.

Done when: user has a note open, asks "summarize this note", AI responds with actual content.

---

### Phase 5 — Edit tool + approval UI
**Goal:** AI can propose an edit to a note, user sees the diff, approves or rejects.

Files to create:
```
src/tools/vault/EditNote.ts
src/ui/components/ApprovalModal.tsx
src/ui/components/DiffViewer.tsx
```

EditNote tool:
- permissionLevel: 'write'
- Input schema: { path: string, old_text: string, new_text: string }
- Does NOT write immediately — fires approval_required event
- On approval: calls vault.process() to atomically replace old_text with new_text
- On rejection: returns { success: false, error: 'User rejected' }
- Zod validates: path non-empty, old_text non-empty, new_text non-empty

ApprovalModal:
- Triggered by approval_required AgentEvent
- Shows: which note, old text (red), new text (green)
- Two buttons: Approve / Reject
- Calls event.resolve(true/false)

Register EditNote in main.ts.

Done when: user asks "improve the first paragraph of this note", AI proposes edit,
user sees diff modal, clicks approve, note is updated.

---

### Phase 6 — Search tool
**Goal:** AI can search the vault for relevant notes.

Files to create:
```
src/tools/vault/SearchVault.ts
src/context/VaultSearch.ts
```

SearchVault tool:
- permissionLevel: 'read'
- Input schema: { query: string, limit?: number }
- Uses Obsidian MetadataCache + Vault.getMarkdownFiles()
- Simple keyword match on file name and content
- Returns array of { path, excerpt } — max 5 results, 200 chars per excerpt

Done when: user asks "do I have any notes about machine learning?",
AI calls search_vault, returns relevant note names.

---

### Phase 7 — OAuth auth (OpenAI + Google)
**Goal:** User can log in with their Google or OpenAI account — no API key needed.

Files to create:
```
src/auth/TokenStore.ts
src/auth/AuthManager.ts
src/auth/OAuthFlow.ts
src/providers/openai/OpenAIProvider.ts
```

TokenStore:
- Stores tokens in Obsidian's localStorage equivalent
- Never in data.json
- Never logged
- Has get(providerId), set(providerId, token), clear(providerId)

OAuthFlow (works on desktop + mobile):
1. Generate PKCE code_verifier + code_challenge
2. Build auth URL for the provider
3. window.open(authUrl) — opens browser
4. Register obsidian:// protocol handler to catch redirect
5. Exchange code for access_token + refresh_token
6. Store in TokenStore

For Google: use Google OAuth 2.0 endpoints
For OpenAI: use OpenAI OAuth endpoints

Update settings UI: show "Connect Google" / "Connect OpenAI" buttons alongside API key inputs.

Done when: user clicks "Connect Google", logs in in browser, comes back to Obsidian,
and can chat using their Google account quota — no API key needed.

---

## V1 is done when all 7 phases are complete.

The user can:
- Install the plugin
- Either paste an API key OR log in with Google/OpenAI
- Open the chat sidebar
- Ask questions about their vault
- Request edits with approval flow
- Search their notes

---

## Task handoff format

When one AI finishes a phase and hands off to the next, add a note here:

### Phase 1 — Status: DONE
### Phase 2 — Status: DONE
### Phase 3 — Status: DONE
### Phase 4 — Status: DONE
### Phase 5 — Status: DONE
### Phase 6 — Status: DONE
### Phase 7 — Status: DONE

Update status to IN PROGRESS when starting, DONE when complete.
If something was changed from the plan, note it here so the next AI knows.

---

## Rules reminder (full rules in AGENTS.md)

- Never import from "obsidian" outside src/obsidian/
- Never use Node.js built-ins
- Never expose tokens to the model
- Validate all tool args with Zod
- Write/destructive tools need approval
- One commit per logical change
- Commit format: feat(scope): summary

---

## Handoff notes (updated after the stabilization pass)

- Phases 1–7 are implemented, and the integration gaps found in review were fixed
  (for details, see [REVIEW.md](./REVIEW.md)).
- The Gemini provider now supports the full tool-call round trip, the approval
  gate is wired to the chat UI, the chat view + command are registered, tools are
  all registered, the context builder is wired in, and API keys live in the
  TokenStore instead of data.json.
- The remaining V1 acceptance test is **manual**: run the flow in a disposable
  Obsidian vault, following [TESTING.md](./TESTING.md).

---

## Phase 8 — Integration & stabilization (IN PROGRESS)

Fixed in this pass:

1. Typecheck + lint green (`skipLibCheck`, `@types/node`, unused imports, ESLint config)
2. Chat view, "Open Vault Compass" command and ribbon registered
3. All tools registered (read/search/edit)
4. Approval events connected to the chat UI — write tools cannot execute without approval
5. Context builder wired into every agent prompt
6. Gemini tool-call mapping + tool-result round trip
7. API keys moved out of data.json into TokenStore; placeholder OAuth controls removed
8. Tests for the agent loop, approval gate, unknown tools, and Gemini SSE/tool mapping
9. GitHub Actions CI for typecheck, lint, tests, and build
10. Docs folder: plan, review findings, testing guide

Remaining in this phase:

- [ ] Manual V1 acceptance test in a disposable desktop vault (see TESTING.md)
- [ ] Mobile smoke test
- [ ] OpenAI provider tool-call mapping (or explicitly keep it text-only)
- [ ] OAuth implemented end-to-end (or removed from the plan)
- [ ] Diff preview in the approval card
- [ ] Session persistence via StorageAdapter

V1 is "done" only after the manual acceptance test passes — automated checks are
necessary but not sufficient.

---

## Phase 8 round 2 — status (November 2026)

Round 1 (the stabilization pass) shipped the integration gaps listed above.
Round 2 was driven by a real-vault test done by the user plus an external
review, and shipped:

1. **Cancel-hang fix:** cancelling while an approval was pending aborted the
   stream but left the loop awaiting the resolver forever — `useAgent` now
   resolves the pending approval as `false` on cancel.
2. **Key not in URL:** the Gemini API key moved from the request URL query
   string into a request header.
3. **Unique tool IDs:** Gemini function-call IDs are now unique per invocation.
4. **Live model fetching:** Gemini and OpenAI fetch their model lists live
   (with rotated static fallbacks), and dead default model IDs stored in
   settings are migrated on load.
5. **Settings overhaul:** the settings tab is reorganized around the selected
   provider.
6. **OpenAI tool parity:** the OpenAI provider now maps tool calls (it was
   previously text-only).
7. **Chat UI redesign:** sticky bottom composer (textarea, Enter to send,
   Shift+Enter newline, auto-grow), message bubbles, muted tool chips, typing
   indicator, empty state with suggested prompts, and a redesigned approval
   card. Styles live in `src/ui/styles/chat.css`, emitted by esbuild as
   `styles.css`.

What remains (also on the review "still open" list):

- [ ] OAuth PKCE end-to-end for OpenAI and Google — next milestone
- [ ] Diff preview in the approval card (currently parsed argument fields)
- [ ] Mobile smoke test
- [ ] Session persistence via StorageAdapter
- [ ] Streaming fallback via `requestUrl` when CORS blocks `fetch` on mobile
- [ ] Final V1 acceptance run through [TESTING.md](./TESTING.md)
