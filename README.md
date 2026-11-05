# Vault Compass

Vault Compass brings AI-assisted note work into Obsidian. Chat about the note you have open, search your vault, and request edits while keeping control of every change.

## Features

- Chat with Google Gemini or OpenAI using your own API key.
- Automatically include the active note and selected text as context.
- Search notes and request note edits through the chat.
- Review and explicitly approve or reject every proposed write before it changes your vault.
- Stream responses in an Obsidian sidebar on desktop and mobile.

## Install

Vault Compass is currently installed manually; it is not yet available through the Community Plugins browser.

1. Download the release files `main.js`, `styles.css`, `manifest.json`, and `versions.json`.
2. In your vault, create `.obsidian/plugins/vault-compass/` and put those files there.
3. In Obsidian, open **Settings → Community plugins**, enable community plugins if prompted, and enable **Vault Compass**.
4. Open **Settings → Vault Compass**, choose Gemini or OpenAI, enter an API key, and choose a model.
5. Open the chat from the Vault Compass ribbon icon or the **Open Vault Compass** command.

OAuth sign-in is not available yet. An API key from the selected provider is required.

## Privacy and security

- Vault Compass has no backend server. Chat requests go directly to the AI provider you select.
- The active note and selected text may be sent to that provider as context. Do not use the plugin with content you are not willing to share with that provider; review the provider's privacy and retention policies.
- API keys are kept in Obsidian's browser storage, not encrypted secret storage. Someone with access to your vault data and operating-system account may be able to read them. Keys are not stored in plugin `data.json`.
- The Gemini API key is sent in a request header, not in the URL.
- Any tool that writes to your vault requires your explicit approval. Rejecting a proposal leaves the note unchanged.

## Current limitations

- Google and OpenAI OAuth are not implemented; API keys are required.
- The approval card does not yet provide a visual diff preview.
- Chat sessions are not persisted between plugin sessions.
- Mobile behavior still needs a manual smoke test, including provider streaming compatibility.

See [the roadmap](docs/ROADMAP.md) for planned work and [the testing guide](docs/TESTING.md) for manual verification details.
