# Vault Compass

Vault Compass is an Obsidian plugin that acts as an AI agent: it reasons over user requests, executes vault tools, and streams results back to the user — all inside Obsidian with no backend server.

## Language

### Settings & provider setup

**Connection check**:
A one-shot test that verifies the currently configured key is accepted by the provider. Surfaces as the "Test connection" button in the plugin settings and reports success or failure without making a real agent request.
_Avoid_: ping, health check, key validation

**Model listing**:
The act of fetching the set of models available under the user's current key from the provider's own API. Used to populate the model selector in settings; falls back to the built-in fallback list when it fails.
_Avoid_: model fetch, model discovery

**Built-in fallback list**:
A hardcoded, static set of well-known model identifiers bundled with the plugin. It is shown when model listing is unavailable so the user can still select a model without a live API call.
_Avoid_: default models, hardcoded models, static list

### Chat UI

**Composer**:
The input area at the bottom of the chat panel where the user types a message. It consists of an auto-resizing textarea and a send/stop button that toggles based on agent state.
_Avoid_: input box, text field, chat input

**Friendly error**:
A mapped, human-readable error message shown to the user when something goes wrong. The raw response from the provider is treated as the cause and is never the headline; the friendly error gives an actionable description instead.
_Avoid_: error message, user-facing error, toast

### Agent loop

**Approval gate**:
The mandatory pause before any tool that can write to or destructively modify the vault is allowed to execute. The agent loop halts and presents the pending action to the user, who must explicitly approve or reject it before the loop continues.
_Avoid_: confirmation dialog, permission check, write guard

**Vault context**:
The content of the active note and/or the current editor selection, assembled and injected into the system prompt at the start of each agent run. It gives the model situational awareness of what the user is looking at without requiring the user to paste content manually.
_Avoid_: context window, note context, active note

**Session**:
The agent's persisted message history for a conversation, including all tool-use invocations and tool-result blocks that the model needs to reason correctly across turns. The session is distinct from the display messages shown in the chat panel, which are a simplified view for the user.
_Avoid_: conversation, chat history, message log
