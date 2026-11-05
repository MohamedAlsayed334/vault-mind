# Testing guide

Automated checks cover core behavior but do not replace live verification in Obsidian. **Manual live Obsidian verification is still required**, including desktop approval flows and a separate mobile smoke test.

## Automated checks

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

## Install into a disposable test vault

Do not test note-editing tools against your real vault.

1. Run `npm run build`; it produces `main.js` and `styles.css`.
2. Create `<test-vault>/.obsidian/plugins/vault-compass/`.
3. Copy `main.js`, `styles.css`, `manifest.json`, and `versions.json` into that folder.
4. Enable Vault Compass under **Settings → Community plugins**. If it does not appear, reload or restart Obsidian and check the developer console.
5. In **Settings → Vault Compass**, select Gemini or OpenAI, enter an API key, and choose a model. OAuth is not available yet.

## Desktop checks

1. Open chat using the ribbon icon or **Open Vault Compass**. Ask about the active note and confirm the reply uses the note/selection context.
2. Ask a vault search question and check that relevant note names are returned.
3. Ask for an exact note edit. Confirm an approval card appears before any write. Reject first and verify the note is unchanged; repeat and approve, then verify only the intended text changed.
4. While streaming, click **Stop**. The run should stop and no later tool call should execute.
5. In a disposable configuration, test a deliberately invalid API key in chat. Confirm the error has a plain-language headline and actionable hint; raw provider details, if available, are behind a collapsed technical-details disclosure.
6. With the invalid key, use **Fetch models**. Confirm an amber degraded warning with a reason appears—not a green success indicator. **Test connection** should also show a friendly error rather than raw provider JSON.
7. Test a retired model ID and confirm the user is told the model is unavailable and prompted to refresh the model list.
8. Hover Stop in Obsidian's light and dark themes and verify its icon remains visible. Verify Send/Stop are icon-only and keyboard behavior remains Enter-to-send and Shift+Enter-for-newline.
9. Restart the vault and confirm model/settings persist. Confirm the API key is not present in plugin `data.json`.

Stop and report if any write occurs without explicit approval.

## Mobile smoke test

On a supported mobile Obsidian client, verify that the plugin loads, the sidebar opens, a provider request works, and write approval/rejection behaves safely. Confirm whether streaming works in the tested environment; a `requestUrl` streaming fallback is not currently implemented.

## Known limitations

- OAuth for Google and OpenAI is not available yet; API keys are required.
- The approval card does not yet show a visual diff; it shows proposed edit arguments.
- Chat session history is not persisted between sessions.
- Mobile behavior and streaming compatibility still require manual verification.
