# Vault Compass roadmap

This roadmap describes planned outcomes. A milestone is complete only when its acceptance criteria can be verified; planned work is not evidence that a feature exists today. Shipped evidence is recorded in [STATUS.md](STATUS.md).

## Version ladder

- **0.1.1 — Polish:** improve reliability and user-facing error handling, plus icon-button accessibility and release metadata.
- **0.2.0 — OAuth:** implement OAuth PKCE for Google and OpenAI while keeping API keys as an alternative.
- **1.0.0 — Stable:** announce Vault Compass as a stable public release after the core experience, platform support, and documentation meet their release criteria.

## 0.1.1 — Polish

Acceptance criteria:

- Provider failures render actionable friendly errors rather than raw response bodies as the headline.
- Failed model listing is clearly shown as degraded with an amber warning and reason; it is not reported as a successful fetch.
- Send and Stop are accessible icon-only controls, and the Stop icon remains visible on hover in light and dark themes.
- `manifest.json` and `versions.json` identify version 0.1.1 and the manifest's minimum Obsidian version.
- Automated typecheck, lint, tests, and production build pass; live Obsidian checks remain separately recorded in STATUS.

## 0.2.0 — OAuth PKCE

Implement Google and OpenAI OAuth using PKCE and Obsidian's protocol handler, without a loopback server.

Acceptance criteria:

- For each provider, the plugin starts an authorization request with PKCE and receives the redirect through Obsidian's registered protocol handler.
- Tokens are held in `TokenStore` only: they are not put in plugin settings, `data.json`, model requests, logs, or chat history.
- API-key authentication remains available as an alternative for both providers.
- A user can authenticate with each provider, select an available model, exchange chat messages, and complete an `edit_note` request only after explicitly approving it—without pasting an API key.
- Invalid, cancelled, expired, and successful authorization paths have automated coverage and understandable UI feedback.

## 1.0.0 — Stable public release

Acceptance criteria:

- The documented install, provider setup, chat, vault search, and approved-edit flows pass in a clean desktop test vault.
- A mobile smoke test covers installation/loading, chat, provider connectivity, and approval-gated editing on a supported mobile Obsidian client.
- The approval UI presents a clear before/after diff for proposed edits, and rejection leaves the note unchanged.
- Session persistence survives a plugin/Obsidian restart without putting conversation history or tokens in `data.json`.
- Provider streaming has a verified fallback for environments where browser `fetch` streaming is unavailable, or the limitation is explicitly bounded and tested.
- Release documentation accurately states supported providers, privacy behavior, prerequisites, and remaining limitations; automated checks and production build pass.

## Open work

The following items are not implied to be implemented by appearing here:

- OAuth PKCE for Google and OpenAI (0.2.0).
- Visual diff preview in the edit approval card (1.0.0 target).
- Manual mobile smoke test.
- Session persistence.
- Streaming fallback for mobile/CORS environments.
- Final manual desktop acceptance run; see [TESTING.md](TESTING.md).
