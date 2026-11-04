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

## Still open (tracked in the plan)

- OpenAI tool-calling mapping (provider currently text-only).
- OAuth end-to-end (PKCE flow, callback handler, token exchange) for OpenAI and Google — placeholder controls have been removed until then.
- Stylesheet for the chat UI (inline styles for now).
- Manual verification in a real Obsidian vault (desktop first, then mobile) — see [TESTING.md](./TESTING.md).
- Streaming fallback via `requestUrl` when CORS blocks `fetch` on mobile.
