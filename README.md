# Vault Mind

Vault Mind is an Obsidian plugin project for AI-assisted note work. The V1 implementation phases (1–7) are recorded as complete in [PLAN.md](./PLAN.md), but **the current code still needs end-to-end integration and validation before it should be treated as a usable V1 or release**.

## Current implementation

Implemented modules include:

- Gemini provider using an API key
- OpenAI provider adapter
- Plugin settings storage and settings tab
- Chat UI components and agent hook
- Agent orchestration, context builder, vault read/edit/search tools
- OAuth-related PKCE/token-store scaffolding

Some modules are not yet connected end-to-end. In particular, the current plugin entry does not register the chat view/command or wire in edit/search tools and context. OAuth is **not ready for real sign-in** (the settings UI uses a placeholder client ID). Treat these as implementation status, not working user-facing features.

## Requirements

- Node.js 20 or newer
- npm
- Obsidian desktop for the first manual test (test mobile separately)
- A Gemini API key for provider/API testing

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
4. In Obsidian, open **Settings → Community plugins** and reload/enable Vault Mind. If it does not appear, restart Obsidian and check the developer console for errors.
5. Open **Settings → Vault Mind** and check that the settings tab loads.
6. Enter a Gemini API key and close/reopen the settings tab to verify that the setting persists.

Do not copy `styles.css`: the current build does not produce a standalone stylesheet.

### What you can test manually right now

- Plugin loading in a test vault
- Settings tab rendering
- Gemini key/model setting persistence
- Obsidian console errors during plugin startup

The current `main.ts` does not yet register a chat sidebar or “Open Vault Mind” command, so **you cannot currently perform a real chat/edit/search workflow from the plugin UI**. Provider unit tests are not a substitute for a live Gemini request.

## Automated test coverage

Current tests are small unit tests for provider initialization/auth state, token storage, and context-builder initialization. They do not yet cover:

- Gemini streaming/API error handling with mocked network responses
- OAuth callback and token exchange
- Agent tool-call loop and approval resolution
- Actual note editing and search behavior
- Obsidian UI lifecycle or desktop/mobile integration

Do not interpret a passing test suite as proof that the full V1 flow works.

## Security notes

- Use a disposable/test vault for development.
- Gemini API keys are currently saved in Obsidian plugin settings (`data.json`) as part of the early settings implementation. Do not share that file or commit it.
- OAuth login is scaffolding only; do not rely on it or enter credentials into a flow that has not been fully implemented.
- Keep destructive/write tool testing isolated until approval handling is connected and verified.

## Architecture

Modular monolith; the plugin runs inside Obsidian:

- `core/` — shared types and agent orchestration
- `providers/` — Gemini/OpenAI provider adapters
- `tools/` — vault read/edit/search tools
- `context/` — current-note context and vault search
- `obsidian/` — Obsidian API adapter
- `auth/` — OAuth/token scaffolding
- `storage/` — plugin settings
- `ui/` — React components, hook, and view

See [AGENTS.md](./AGENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [PLAN.md](./PLAN.md) before changing architecture or starting another implementation phase.

## Recommended next milestone: V1 integration and hardening

Before adding more features, finish and verify the full user journey:

1. Register the chat sidebar and “Open Vault Mind” command in `main.ts`.
2. Connect the chat hook to the selected model, current-note context, and provider settings.
3. Register read/search/edit tools; connect approval events to a real approval UI. Ensure write tools cannot execute without explicit approval.
4. Implement the Gemini provider’s actual tool-call mapping and tool-result round trip.
5. Either implement OAuth end-to-end with real provider credentials/callback/token exchange, or clearly disable/remove the placeholder OAuth controls until ready.
6. Add automated tests for provider streaming, agent tool calls/approval, vault tools, and settings; add CI for typecheck, lint, tests, and production build.
7. Test the complete flow in a disposable desktop vault, then separately test Obsidian mobile.

**V1 acceptance test:** open the sidebar → ask about the active note → verify relevant context is included → request a specific edit → inspect the proposed diff → approve → verify only the intended text changed. Rejecting the edit must leave the note unchanged.
