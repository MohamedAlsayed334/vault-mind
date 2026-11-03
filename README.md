# Vault Mind

An AI agent for Obsidian. Not just a chat plugin — a full agent that can read, write, and reason across your vault.

## Features (roadmap)

- [ ] Chat with your vault
- [ ] Apply edits to notes with one click
- [ ] Agent loop with tool use (read, search, create, edit notes)
- [ ] Subscription login (OpenAI, Google) — no API key required
- [ ] API key support (Gemini, OpenAI, OpenRouter, Anthropic, Ollama)
- [ ] Semantic vault search (RAG)
- [ ] MCP integration
- [ ] Mobile + desktop

## Development

```bash
npm install
npm run dev
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/vault-mind/` folder.

## Architecture

Modular monolith. Everything runs inside Obsidian. Modules:

- `core/` — Agent orchestrator, types, event bus
- `providers/` — AI provider adapters (Gemini, OpenAI, …)
- `tools/` — Vault tools the agent can call
- `context/` — Context assembly and vault search
- `obsidian/` — Vault/editor/workspace adapters (only place Obsidian APIs are used)
- `auth/` — OAuth and API key auth
- `storage/` — Conversation and session persistence
- `ui/` — React interface

## Auth approach

| Provider | Subscription (no key) | API key |
|---|---|---|
| OpenAI | ✅ OAuth flow | ✅ |
| Google Gemini | ✅ OAuth flow | ✅ |
| Anthropic | ⚠️ Accounts at risk — key only | ✅ |
| Others | ❌ | ✅ |
