# Ticket 003 — Friendly error rendering in chat and settings

Blocks: 004
Blocked by: 002

## Goal

Wire the `ErrorCode` → friendly sentence table into the chat bubble renderer and the
settings connection/fetch-models status strings. Create `src/core/errorMessages.ts`.
Update `useAgent.ts` to pass `code` and `cause` through to the display layer without
changing `AgentSession`. Update `Message.tsx` to render structured error bubbles.
Update `SettingsTab.tsx` to call `friendlyMessage` for the test-connection failure string.

## Spec reference

`docs/specs/0001-milestone-0.1.1.md` § "Friendly error layer — 2c, 2d, 2e"

## Current state

**`useAgent.ts`:** The `error` event handler pushes a plain string:
```ts
case "error":
  pushMessage({ role: "assistant", content: `Error: ${event.message}` });
```
`event.code` and `event.cause` are silently discarded.

**`Message.tsx`:** Detects errors by `text.startsWith("Error:")` and renders a plain
`vault-compass-error-line` span — no headline/hint split, no `<details>` disclosure.

**`SettingsTab.tsx`:** Test connection failure renders:
```ts
this.connectionStatus = `✗ ${errMessage(err)}`;
```
where `errMessage` returns the raw `.message` from the error, which may be a provider
JSON blob or the `ProviderError.message` (a terse internal string — acceptable, but
the friendly mapping is better here).

## Implementation notes

### Step 1 — `src/core/errorMessages.ts` (new file)

Location: `src/core/` so both providers (Ticket 002) and UI can import it without
crossing module-boundary rules. No Obsidian imports.

```ts
import type { ErrorCode } from "./ProviderError";

export interface FriendlyError {
  headline: string;
  hint: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
};

export function providerName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}

export function friendlyMessage(code: ErrorCode | undefined, providerId: string): FriendlyError {
  const p = providerName(providerId);
  switch (code) {
    case "invalid_key":
      return { headline: `Your API key was rejected by ${p}.`, hint: "Add a valid key in Settings → Vault Compass." };
    case "model_not_found":
      return { headline: "This model is no longer available.", hint: "Open Settings and use Fetch models to pick a current one." };
    case "rate_limited":
      return { headline: `Rate limited by ${p}.`, hint: "Wait a moment and try again." };
    case "quota_exceeded":
      return { headline: `You've hit ${p}'s quota or billing limit.`, hint: "Check your plan or billing at the provider." };
    case "server":
      return { headline: `${p} is having server trouble.`, hint: "Try again shortly." };
    case "network":
      return { headline: `Couldn't reach ${p}.`, hint: "Check your internet connection." };
    default:
      return { headline: `Something went wrong talking to ${p}.`, hint: "Show technical details below." };
  }
}
```

### Step 2 — Display message shape in `useAgent.ts`

Introduce a minimal discriminated union for display messages so `code` and `cause`
survive the journey from AgentEvent to `Message.tsx`. Do **not** change `AgentSession`
or `ChatMessage` from `src/core/types.ts`.

Option A (recommended — minimal surface change): add a parallel `errorMessages` state
bag alongside `messages`:
```ts
// In useAgent hook:
const [errorMeta, setErrorMeta] = useState<Map<number, { code?: ErrorCode; cause?: string; providerId?: string }>>(new Map());
```
Where the key is the index of the error message in `messages`. Pass `errorMeta` out of
the hook and into `MessageBubble` by index.

Option B: define a local `DisplayMessage` union:
```ts
type DisplayMessage =
  | { kind: "chat"; message: ChatMessage }
  | { kind: "error"; message: string; code?: ErrorCode; cause?: string; providerId?: string };
```
Replace `useState<ChatMessage[]>` with `useState<DisplayMessage[]>`. This is cleaner
but changes the hook's return type — update `Chat.tsx` to match.

**Either option is acceptable.** Option B is cleaner and is preferred if the diff is
kept reviewable. The spec allows either approach as long as `AgentSession` is unchanged.

**Key behavior changes in `useAgent.ts`:**

1. The `"Cancelled"` error from Stop: when `event.message === "Cancelled"` **and**
   `event.code === undefined`, silently drop the event — push nothing to `messages`.
   This matches the abort semantics: Stop produces no visible bubble.

2. Coded errors: push with `code` and `cause` preserved.

3. Uncoded errors (e.g. "No AI provider registered"): push as before — no code, no
   `<details>` disclosure needed.

### Step 3 — `Message.tsx` structured error rendering

Add a new rendering branch for error display messages. The current `startsWith("Error:")`
heuristic stays as a fallback for uncoded legacy strings, but coded errors render as:

```tsx
function ErrorBubble({ headline, hint, cause }: { headline: string; hint: string; cause?: string }) {
  return (
    <div className="vault-compass-msg vault-compass-msg--assistant">
      <div className="vault-compass-error">
        <span className="vault-compass-error__headline">{headline}</span>
        <span className="vault-compass-error__hint">{hint}</span>
        {cause && (
          <details>
            <summary>Show technical details</summary>
            <code className="vault-compass-error__cause">{cause}</code>
          </details>
        )}
      </div>
    </div>
  );
}
```

If the display message shape (Option B) is chosen, `MessageBubble` receives a
`DisplayMessage` and renders `ErrorBubble` for `kind === "error"` with
`friendlyMessage(msg.code, msg.providerId ?? "")`.

### Step 4 — CSS additions in `chat.css`

Append to `src/ui/styles/chat.css`:

```css
/* ─── Friendly error block ─────────────────────────────────────────────────── */

.vault-compass-error {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-1);
  padding: var(--size-2-2) 0;
}

.vault-compass-error__headline {
  color: var(--text-error);
  font-weight: var(--font-semibold);
  font-size: var(--font-ui-small);
}

.vault-compass-error__hint {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}

.vault-compass-error details > summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  margin-top: var(--size-2-1);
}

.vault-compass-error__cause {
  display: block;
  margin-top: var(--size-2-1);
  padding: var(--size-2-2);
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
}
```

### Step 5 — `SettingsTab.tsx` test connection update

```ts
// In displayTestConnectionSetting catch block:
import { friendlyMessage } from "@/core/errorMessages";
import { ProviderError } from "@/core/ProviderError";

} catch (err) {
  const code = err instanceof ProviderError ? err.code : undefined;
  const { headline } = friendlyMessage(code, provider.id);
  this.connectionStatus = `✗ ${headline}`;
}
```

## Tests

**`src/core/errorMessages.test.ts`** (new file, relative imports):
- `friendlyMessage("invalid_key", "gemini")` → headline contains "Google Gemini", hint contains "Settings"
- `friendlyMessage("model_not_found", "openai")` → headline = "This model is no longer available."
- `friendlyMessage("rate_limited", "openai")` → headline contains "OpenAI"
- `friendlyMessage("quota_exceeded", "gemini")` → headline contains "quota or billing"
- `friendlyMessage("server", "gemini")` → headline contains "server trouble"
- `friendlyMessage("network", "openai")` → headline contains "Couldn't reach"
- `friendlyMessage("unknown", "gemini")` → headline contains "Something went wrong"
- `friendlyMessage(undefined, "gemini")` → falls back to unknown copy (no crash)
- `providerName("gemini")` → `"Google Gemini"`
- `providerName("openai")` → `"OpenAI"`
- `providerName("some-unknown-id")` → `"some-unknown-id"` (passthrough)

**`useAgent.ts` behavior** — no vitest coverage required (the hook requires a React
render environment); document the "Cancelled" suppression in a code comment instead.

## Acceptance

- `src/core/errorMessages.ts` exists and exports `friendlyMessage` + `providerName`
- All `errorMessages.test.ts` tests pass
- No raw JSON appears as the headline of any chat error bubble (verify manually)
- Coded error messages render with headline, hint, and `<details>` block
- Uncoded legacy error strings still render (graceful fallback)
- User Stop → no error bubble (verify manually with the Stop button mid-stream)
- Settings test connection with wrong key → friendly sentence (not raw provider text)
- `npm run typecheck` → zero errors
- `npm run lint` → zero errors
- `npm run test` test count ≥ 67
