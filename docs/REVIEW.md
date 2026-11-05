# Vault Mind — Code Review (November 2026)

A review of the state after Phases 1–7, followed by the stabilization pass that
fixed the findings. This file records what was found, what was fixed, and what
remains open.

---

## Findings and their status

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 1 | Critical | `main.ts` never registered the chat view, the "Open Vault Mind" command, or a ribbon icon — the chat UI was unreachable from Obsidian | ✅ Fixed |
| 2 | Critical | `main.ts` registered only `ReadNoteTool`; edit and search tools were never available to the agent | ✅ Fixed |
| 3 | Critical | `AgentOrchestrator` waited for approval through a listener list nobody subscribed to, so write tools could hang forever | ✅ Fixed — the orchestrator now yields an `approval_required` AgentEvent and the chat UI resolves it (Approve/Reject buttons) |
| 4 | Critical | `ContextBuilder` was not connected to the chat flow, and its selection logic (`getActiveViewOfType(...)`) was broken | ✅ Fixed — rebuilt on `VaultAdapter`, wired into `useAgent` so every prompt carries the active note + selection as the system prompt |
| 5 | Critical | `GeminiProvider` never mapped Gemini `functionCall` parts or supported `functionDeclarations`, so the agent could not use tools | ✅ Fixed — GeminiClient sends `tools[].functionDeclarations`, streams `functionCall` chunks as `tool_call` events, and maps `tool_use`/`tool_result` blocks to `functionCall`/`functionResponse` parts |
| 6 | High | `SettingsTab` called `plugin.saveSettings()`, a method that does not exist — compile-time error | ✅ Fixed |
| 7 | High | `SettingsTab` imported `AuthManager` and `OAuthFlow` unused/broken — lint/typecheck failure | ✅ Fixed |
| 8 | High | `useAgent` added the user message optimistically while `AgentOrchestrator.run()` pushed it again — the model saw the prompt twice | ✅ Fixed — the orchestrator is the single source of truth for session history; the hook keeps display messages separate |
| 9 | High | Gemini API key was persisted in plugin settings (`data.json`) | ✅ Fixed — keys are stored in `TokenStore` only; a migration on load moves any legacy `data.json` key out and strips it |
| 10 | High | OpenAI "Connect" button used a placeholder OAuth client ID and no callback/token exchange — non-functional sign-in | ✅ Disabled — replaced with an API-key field and an explicit note that OAuth is not available yet |
| 11 | High | ESLint had no configuration file; `npm run lint` crashed | ✅ Fixed — added `.eslintrc.cjs` |
| 12 | High | `tsc` failed with dozens of errors from `node_modules` typings and unused imports | ✅ Fixed — `skipLibCheck: true`, `@types/node` dev dependency, lib bumped to ES2022, unused imports removed |
| 13 | High | OpenAI provider advertised `toolCalling: true` without implementing tool-call mapping | ✅ Corrected — capability set to `false` with a code comment until the mapping is implemented |
| 14 | High | Orchestrator resolved `model: "default"` and ignored the user's selected model and system prompt | ✅ Fixed — `run()` accepts `OrchestratorOptions { model, systemPrompt }`; the hook passes the selected model and assembled context |
| 15 | Medium | Unknown tool names crashed the loop (`tools.get` throws) | ✅ Fixed — reported back to the model as a failed `tool_result` |
| 16 | Medium | Approved/rejected edit results were fed back correctly, but the `tool_result` block lacked the tool `name` needed for Gemini `functionResponse` | ✅ Fixed — `ContentBlock` `tool_result` now carries `name` |
| 17 | Medium | No CI running typecheck/lint/test/build on every push/PR | ✅ Fixed — `.github/workflows/ci.yml` |
| 18 | Medium | Tests were mostly initialization checks; nothing covered the agent loop, tool execution, approval, or Gemini tool-call mapping | ✅ Improved — new tests for `AgentOrchestrator` (7 cases incl. approval execute/reject, unknown tool, abort) and `GeminiClient` (6 cases incl. SSE streaming, function calls, request mapping, HTTP errors) |

## Round 2 — findings from the real-vault test (November 2026)

After shipping the fixes above, the plugin was tested in a real Obsidian vault
by the user and re-examined in an external review. The findings and their
status:

| Issue | Status |
|-------|--------|
| Cancel during a pending approval hung the loop forever — the stream aborted but the orchestrator kept awaiting the approval resolver | ✅ Fixed — `useAgent.cancel()` now resolves the pending approval as `false` while aborting the stream (`refactor` in `1abfd20`) |
| Gemini API key was sent in the request URL query string — it leaked into logs/history | ✅ Fixed — the key now travels in a request header |
| Gemini tool-call IDs were reused between invocations, confusing the tool-result round trip | ✅ Fixed — unique IDs per invocation |
| Hardcoded fallback model lists went stale (rotated/dead models) and produced 404s | ✅ Fixed — fallback lists rotated to current model IDs, models fetched live from the providers, and stale default model IDs in settings are migrated on load |
| Settings UX: the provider picker paid no attention to which provider was selected | ✅ Fixed — settings are reorganized around the selected provider |
| OpenAI provider had no tool-call mapping (was listed as a gap) | ✅ Now implemented — OpenAI tool calling is mapped for agent-loop parity (was previously "text-only") |
| localStorage trade-off was described inaccurately in the README (it read as if keys were safely sandboxed) | ✅ Fixed — README now states plainly that API keys live in the vault's browser storage, not in encrypted secret storage |
| Chat UI: the message input rendered at the top of the pane and the overall look was bare (Send/Stop only) | ✅ Fixed — sticky bottom composer over a proper height chain (`flex` + `min-height: 0`), message bubbles, tool chips, typing indicator, empty state with suggested prompts, redesigned approval card; styles moved out of inline attributes into `src/ui/styles/chat.css` (emitted as `styles.css`) |

See [PLAN.md](./PLAN.md) — "Phase 8 round 2" — for what shipped in that round
and what remains.

## Still open (tracked in the plan)

- OAuth end-to-end (PKCE flow, callback handler, token exchange) for OpenAI and Google — this is next milestone work.
- Diff preview in the approval card (the card now shows parsed argument fields; a real diff view is still pending).
- Mobile smoke test.
- Streaming fallback via `requestUrl` when CORS blocks `fetch` on mobile.
- Session persistence via StorageAdapter.
- Manual verification in a real Obsidian vault (desktop first, then mobile) — see [TESTING.md](./TESTING.md).
