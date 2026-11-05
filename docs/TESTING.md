# Vault Compass — Testing Guide

How to verify the plugin locally. Everything below assumes the automated checks
already pass:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

## 1. Install into a disposable test vault

**Use a separate Obsidian test vault. Do not test note-editing tools against your real vault.**

1. Run `npm run build`. This produces `main.js` and `styles.css` in the repository root.
2. Create the plugin directory inside the test vault:
   `.obsidian/plugins/vault-compass/`
3. Copy these files from the repository root into that directory:
   - `main.js`
   - `styles.css`
   - `manifest.json`
   - `versions.json`
4. Open the test vault in Obsidian → **Settings → Community plugins**.
   Enable "Restricted mode" off if needed, reload plugins, and enable **Vault Compass**.
5. If it does not appear, restart Obsidian and check the developer console
   (`Ctrl+Shift+I` on desktop) for errors.

## 2. Configure

1. Open **Settings → Vault Compass**.
2. Choose the provider (Gemini recommended; OpenAI is API key-only and text-only for now).
3. Enter your Gemini API key. It is stored in the vault's browser storage
   (`TokenStore`), **not** in `data.json`.
4. Select a model (default: Gemini 2.0 Flash).

## 3. Smoke test the chat

1. Click the Vault Compass ribbon icon (or run the command **Open Vault Compass**
   from the command palette). The chat sidebar opens.
2. Open any note in the vault, then ask:

   > What note am I currently looking at? Summarize it.

3. Expected: the reply names the correct note. Watch the developer console if it
   fails — check that the API request went out and no CORS error appears.

## 4. Test read/search tools (no approval needed)

1. With several notes in the vault, ask:

   > Do I have any notes about [topic]?

2. Expected: an assistant bubble `⚙ Using tool: search_vault` appears, then the
   answer cites note names.

## 5. Test the write-approval gate (the critical flow)

1. Open a note that contains a specific sentence you can identify.
2. Ask:

   > Replace "[exact sentence]" with "[new sentence]" in this note.

3. Expected sequence:
   - An approval card appears in the chat showing the tool (`edit_note`) and its
     arguments as JSON — **before** anything is written.
   - The input stays disabled while waiting.
4. Click **Reject** first:
   - The note must remain unchanged.
   - The agent should acknowledge the rejection.
5. Send the same request again and click **Approve**:
   - The note is updated atomically.
   - Verify **only the intended text changed** (undo history should show exactly one change).

**If a write ever happens without the approval card appearing, stop and report it —
that means the approval gate is bypassed.**

## 6. Test cancellation

While the agent is streaming, click **Stop**. The stream should end, the status
should return to idle, and no tool call should execute afterwards.

## 7. Test settings persistence

1. Set your API key and model, then fully close and reopen the vault.
2. The model selection must persist (settings); the API key field must still
   show the key (browser storage).
3. Confirm `data.json` in the plugin folder does **not** contain the API key.

## 8. Mobile checklist (after desktop passes)

- The plugin loads and the sidebar opens (no Node-only code — check for build
  errors mentioning `fs`, `path`, etc.).
- Streaming works; if Gemini rejects browser-origin requests, fetch fails and
  you'll see an error event (the `requestUrl` fallback is not implemented yet).

## Known limitations

- No chat history persistence between sessions (pure in-memory).
- No diff preview in the approval card yet — arguments are shown as JSON.
- OAuth sign-in is disabled until implemented end-to-end.
- OpenAI provider is text-only (no tool calls yet).
