# Vault Mind

Vault Mind is an Obsidian plugin for AI-assisted note work: an agent with a reasoning loop, vault tool execution (read / search / edit), and an approval gate for every write. Desktop + mobile.

The V1 implementation phases (1–8) are recorded in [docs/PLAN.md](./docs/PLAN.md). Phases 1–7 are implemented and the integration gaps found in the November 2026 review have been fixed — see [docs/REVIEW.md](./docs/REVIEW.md).

## What works now

- Chat sidebar (ribbon icon or **Open Vault Mind** command) with streaming responses
- Agent loop with tool calling: `read_note`, `search_vault`, `edit_note`
- Approval gate: `edit_note` shows an Approve/Reject card and never writes without explicit approval
- Vault context: the active note and your current selection are included automatically
- Gemini provider with API key and full tool-call round trip; OpenAI provider (API key, text-only for now)
- API keys stored in browser-side `TokenStore`, never in `data.json` (legacy keys are migrated out automatically)
- Automated checks: typecheck, ESLint, Vitest (agent loop, approval gate, Gemini SSE/tool mapping), production build — all wired into GitHub Actions CI

## Requirements

- Node.js 20 or newer
- npm
- Obsidian desktop for the first manual test (test mobile separately)
- A Gemini API key

## Install dependencies and run checks

From the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The production build creates `main.js` in the repository root. For development, use:

```bash
npm run dev
```

This starts esbuild watch mode.

## Install into a test vault

**Use a separate Obsidian test vault. Do not test note-editing tools against your real vault.**

1. Run `npm run build`.
2. Create the plugin directory inside the test vault: `.obsidian/plugins/vault-mind/`
3. Copy these files from the repository root into that directory:
   - `main.js`
   - `manifest.json`
   - `versions.json`
4. In Obsidian, open **Settings → Community plugins** and enable Vault Mind. If it does not appear, restart Obsidian and check the developer console for errors.
5. Open **Settings → Vault Mind**, choose a provider, enter your API key, and pick a model.
6. Click the Vault Mind ribbon icon (or run **Open Vault Mind** from the command palette) to open the chat sidebar.

The full manual test script — chat smoke test, read/search tools, the write-approval gate, cancellation, persistence, and a mobile checklist — lives in [docs/TESTING.md](./docs/TESTING.md).

## Automated test coverage

- `AgentOrchestrator` — full loop, tool execution + result fed back, approval required and resolved, rejection prevents execution, unknown tools, abort handling, model/systemPrompt passthrough
- `GeminiClient` — SSE streaming, `functionCall` streaming, `functionDeclarations` sent, `tool_use`/`tool_result` → `functionCall`/`functionResponse` mapping, HTTP errors
- `ContextBuilder` — context assembly, truncation, prompt injection
- `TokenStore` / `GeminiProvider` — storage and auth-state basics

## Security notes

- Use a disposable/test vault for development.
- API keys are stored in the vault's browser storage (`TokenStore`). They are not written to `data.json`. Older versions did persist the Gemini key there — the plugin migrates and strips it on first load after upgrading.
- OAuth sign-in (OpenAI / Google) is disabled until implemented end-to-end; do not rely on any leftover scaffolding.
- Write tools are always gated behind an explicit Approve/Reject card. If a write ever happens without the card, report it as a bug.

## Architecture

Modular monolith; the plugin runs inside Obsidian:

- `core/` — shared types and agent orchestration
- `providers/` — Gemini/OpenAI provider adapters
- `tools/` — vault read/edit/search tools
- `context/` — current-note context and vault search
- `obsidian/` — Obsidian API adapter
- `auth/` — token storage and future OAuth
- `storage/` — plugin settings
- `ui/` — React components, hook, settings tab, and chat view

See [AGENTS.md](./AGENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md) and the [docs/](./docs) folder (plan, review findings, testing guide) before changing architecture or starting another phase.

## Next steps

1. Run the manual V1 acceptance test in a disposable desktop vault: open sidebar → ask about the active note → request an edit → reject (verify the note is unchanged) → approve (verify only the intended text changed).
2. Mobile smoke test.
3. Then: OpenAI tool calling, end-to-end OAuth or its removal, diff preview in the approval card, session persistence — tracked in [docs/PLAN.md](./docs/PLAN.md), Phase 8.
