# Spec 0001 — Milestone 0.1.1: Polish & Reliability

## Context

Real-vault testing against live provider keys revealed a cluster of rough edges that
undermine user trust before the agent loop itself is ever exercised. When a Gemini or
OpenAI key is wrong or a model is deprecated, the raw HTTP response body — sometimes
hundreds of characters of JSON — surfaces verbatim as the headline of a chat error
bubble; the friendly error contract from CONTEXT.md is not yet enforced at the
rendering layer. Separately, the settings panel silently treats model listing failure
as a success: `getModels()` swallows every error and returns the built-in fallback
list, so a user with a wrong key still sees a green ✓ after clicking "Fetch models",
giving a false signal that the connection is working. On the composer, the Stop button
CSS has a hover contrast problem: the rest state uses `--text-error` text on a
translucent error background, and the hover state switches to `--background-modifier-error-hover`
background — the combination can render the Stop icon invisible in certain Obsidian
themes. Milestone 0.1.1 patches each of these gaps without introducing new agent
capabilities, keeping the diff small and reviewable before the milestone-0.2 work
(vault context, EditNote, and session persistence) begins.

> **Note on current implementation state:** `src/core/ProviderError.ts` already exists
> and exports `ProviderError`, `ErrorCode`, `classify`, and `isAbortError`. Both
> providers already import and use `ProviderError`; `AIEvent` and `AgentEvent` already
> carry the optional `code` and `cause` fields. The icon-only SVG buttons are already
> present in `Chat.tsx` and the CSS hover contrast is already corrected in `chat.css`.
> As a result, Tickets 001–004 are primarily about the **remaining gaps** listed in
> each ticket's implementation notes — not full green-field builds.

## Goals

- Users with an invalid or expired API key see a single, plain-English sentence in
  chat explaining what went wrong and what to do next, never a raw JSON blob.
- Users whose selected model has been retired see a clear "model no longer available"
  message with a prompt to open Settings and fetch the current list.
- Clicking "Fetch models" with a wrong key shows an amber warning (⚠) indicating
  degradation, not a green ✓ that implies success.
- The Stop button's hover state keeps the icon visible regardless of Obsidian theme.
- The Send and Stop buttons are icon-only with accessible `aria-label` attributes.
- The plugin version is bumped to 0.1.1 in `manifest.json` and `versions.json`.

## Out of scope

- **OAuth authentication** for OpenAI or Google — deferred to a future milestone.
- **Session persistence** — `MemoryManager` and `StorageAdapter` are not part of this
  milestone.
- **Diff preview** for EditNote — the write tool is not built in this milestone.
- **Mobile smoke test** — platform-specific testing is deferred until core features
  are stable on desktop.
- **Context engine / vault search** — `ContextEngine` and `VaultSearch` are out of scope.

---

## Changes

### 1. Icon-only composer buttons

**Problem:** The Stop button hover state risks rendering the icon invisible. The base
`.vault-compass-btn--stop` rule uses `--background-modifier-error` background with
`--text-error` text; the `:hover` rule switches the background to
`--background-modifier-error-hover` without also switching the text color away from
`--text-error`, creating a potential low-contrast pair in themes where both resolve to
nearby hues. Additionally, as of the current code, the Send and Stop buttons already
render as icon-only SVG buttons — the spec tasks here are to verify/harden the CSS
contrast rule and confirm all acceptance criteria hold.

**Solution:** Ensure `.vault-compass-btn--stop:hover` pairs `--background-modifier-error-hover`
with an explicit contrasting foreground (`--text-on-accent` or equivalent), not
`--text-error`. Confirm inline SVG paper-plane (Send) and filled square (Stop) are
present with no text nodes. Confirm `aria-label` and `title` attributes.

**Acceptance criteria:**
- Send button renders an SVG icon with no visible text, `aria-label="Send"`, `title="Send message"`
- Stop button renders an SVG icon with no visible text, `aria-label="Stop"`, `title="Stop generating"`
- Hovering Stop never makes the icon invisible in Obsidian default (light and dark) theme
- Enter sends; Shift+Enter inserts a newline; both behaviors are unchanged
- Textarea is disabled while `busy === true`; Send button disabled when input is empty

---

### 2. Friendly error layer

**Problem:** Three surfaces render errors poorly:

1. **Chat bubbles** — `useAgent.ts` pushes `Error: ${event.message}` as the assistant
   content string when an `error` AgentEvent arrives. `Message.tsx` checks only
   `text.startsWith("Error:")` and renders a plain `vault-compass-error-line` span
   with the full content — which includes raw provider JSON when that is what
   `event.message` contained.

2. **Fetch models button** — both `GeminiProvider.getModels()` and
   `OpenAIProvider.getModels()` swallow every failure and return the built-in fallback
   list silently. The `SettingsTab` catch branch writes
   `✗ ${errMessage(err)} — using the built-in list`, but because `getModels()` never
   throws, the catch branch is **never reached**; the UI always shows green ✓.

3. **Test connection** — `checkConnection()` does throw correctly, but
   `SettingsTab.displayTestConnectionSetting()` renders the raw `err.message` string,
   which may still contain provider-formatted error text.

**Solution:**

#### 2a. `ProviderError` / `src/core/ProviderError.ts` (already exists — verify/extend)

`ProviderError`, `ErrorCode`, `classify`, and `isAbortError` are already implemented.
Verify that:
- `classify(400, body)` correctly matches Gemini's `API_KEY_INVALID` body pattern
- `classify(404, body, { modelRequest: true })` → `model_not_found`
- `classify(429, quota-body)` → `quota_exceeded`; `classify(429, plain-body)` → `rate_limited`
- `classify(5xx)` → `server`
- Network `TypeError` path is handled in callers (providers already do this)
- `isAbortError` correctly identifies `AbortError` from both `Error` and `DOMException`

No changes required to `ProviderError.ts` itself unless gaps are found in testing.

#### 2b. Provider `getModels()` degradation signal

Both `GeminiProvider.getModels()` and `OpenAIProvider.getModels()` must change their
return type from `Promise<ModelInfo[]>` to
`Promise<{ models: ModelInfo[]; degraded: boolean; reason?: string }>`.

On **success**: `{ models: fetchedList, degraded: false }`
On **failure** (non-200 or network error): `{ models: fallbackModels, degraded: true, reason: friendlySentence(classify(status, body), providerId) }`
When no key is configured: `{ models: fallbackModels, degraded: false }` (not an error — expected state)

All callers (currently only `SettingsTab.displayFetchModelsSetting`) must be updated
to destructure the new return shape.

#### 2c. `src/ui/utils/errorMessages.ts` (new file)

Create a pure utility (no Obsidian imports) that maps `(ErrorCode, providerId)` to a
`{ headline: string; hint: string }` pair.

| Code | Friendly headline | Actionable hint |
|---|---|---|
| `invalid_key` | "Your API key was rejected by {Provider}." | "Add a valid key in Settings → Vault Compass." |
| `model_not_found` | "This model is no longer available." | "Open Settings and use Fetch models to pick a current one." |
| `rate_limited` | "Rate limited by {Provider}." | "Wait a moment and try again." |
| `quota_exceeded` | "You've hit {Provider}'s quota or billing limit." | "Check your plan or billing at the provider." |
| `server` | "{Provider} is having server trouble." | "Try again shortly." |
| `network` | "Couldn't reach {Provider}." | "Check your internet connection." |
| `unknown` | "Something went wrong talking to {Provider}." | "Show technical details below." |

`{Provider}` is substituted with the human name of the provider (e.g. "Google Gemini",
"OpenAI"). A helper `providerName(providerId: string): string` maps known IDs to
display names, falling back to the raw ID.

#### 2d. Chat error rendering (`Message.tsx` + `useAgent.ts`)

`useAgent.ts` currently pushes error events as plain strings:
```ts
pushMessage({ role: "assistant", content: `Error: ${event.message}` });
```

The `AgentEvent { type: "error" }` already carries optional `code?: ErrorCode` and
`cause?: string`. The error event must be passed to the display layer with these
fields preserved. Introduce a new display message variant — either a discriminated
union extending `ChatMessage` or a parallel `ErrorMessage` state bag — that carries
`{ isError: true; code?: ErrorCode; cause?: string; providerId?: string }`. Keep
`AgentSession` unchanged.

`Message.tsx` renders `isError` messages as a structured block:

```html
<div class="vault-compass-error">
  <span class="vault-compass-error__headline">{headline}</span>
  <span class="vault-compass-error__hint">{hint}</span>
  <details>
    <summary>Show technical details</summary>
    <code class="vault-compass-error__cause">{cause || message}</code>
  </details>
</div>
```

If `code` is absent (legacy error shape or unknown), fall back to rendering the raw
message in the headline with no hint and no `<details>` block.

User abort (Stop button) produces `event.message === "Cancelled"` with no `code`.
This must render as **nothing** — no error bubble, no headline. The `cancel()` path
in `useAgent.ts` already sets status to `"idle"` immediately; the `"Cancelled"`
event that the provider yields is a no-op signal to keep the shape consistent. The
hook must silently drop `event.message === "Cancelled"` messages from the display
queue.

#### 2e. Settings friendly errors

**Fetch models:** After the `getModels()` return type change (§2b), `SettingsTab`
reads `{ models, degraded, reason }` and shows:
- `degraded === false`: green ✓ with model count
- `degraded === true`: amber ⚠ with the `reason` string

**Test connection:** The `catch` branch in `displayTestConnectionSetting` currently
calls `errMessage(err)` (raw message). Replace with:
```ts
const code = err instanceof ProviderError ? err.code : "unknown";
const { headline } = friendlyMessage(code, provider.id);
this.connectionStatus = `✗ ${headline}`;
```

**CSS addition** (`chat.css` or a separate `settings.css` if one is introduced):
```css
.vault-compass-error { /* error block in chat */ }
.vault-compass-error__headline { color: var(--text-error); font-weight: var(--font-semibold); }
.vault-compass-error__hint { color: var(--text-muted); font-size: var(--font-ui-small); }
.vault-compass-error__cause { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); white-space: pre-wrap; word-break: break-word; }
details > summary { cursor: pointer; color: var(--text-muted); font-size: var(--font-ui-small); }
```

**Acceptance criteria:**
- No raw JSON or stack trace ever appears as the headline of a chat error bubble
- Wrong key → `invalid_key` friendly error in chat with correct headline and hint
- Retired model → `model_not_found` friendly error in chat
- Fetch models with wrong key → amber ⚠ with friendly reason, NOT green ✓
- `<details>` disclosure is present on coded errors and contains the raw cause text
- User Stop (abort) → no error message of any kind appears in chat
- Test connection with wrong key → friendly headline, not raw provider JSON

---

### 3. Version bump

`manifest.json` `version` field: `"0.1.0"` → `"0.1.1"`
`versions.json`: add entry `"0.1.1": "1.4.0"` (preserving `minAppVersion` from manifest)

This commit is the last commit of the milestone — after all acceptance criteria pass.

---

## Verification

**Manual test script:** `docs/TESTING.md` (to be updated as part of this milestone).

**Automated gates — all must pass before the version bump commit:**
```
npm run typecheck   # tsc --noEmit: zero errors
npm run lint        # eslint: zero errors/warnings
npm run test        # vitest: all 67 tests pass, test count must not decrease
npm run build       # esbuild: produces main.js + styles.css without error
```

**Key manual test cases:**
1. Configure a deliberately wrong API key → send a chat message → verify friendly error
   bubble with correct headline, hint, and collapsed `<details>` with raw cause.
2. With wrong key → click "Fetch models" → verify amber ⚠, not green ✓.
3. With wrong key → click "Test connection" → verify friendly sentence, not raw JSON.
4. With correct key and a deprecated model id → send a chat message → verify
   `model_not_found` friendly error.
5. During streaming → click Stop → verify no error bubble appears.
6. Hover the Stop button in both Obsidian light and dark themes → verify icon remains
   visible.
7. `npm run build` succeeds and the installed plugin loads without console errors.
