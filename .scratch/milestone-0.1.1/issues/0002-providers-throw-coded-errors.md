# Ticket 002 — Provider getModels() degradation signal

Blocks: 003
Blocked by: 001

## Goal

Change `getModels()` on both `GeminiProvider` and `OpenAIProvider` to return a
degradation-aware shape `{ models, degraded, reason? }` instead of a bare `ModelInfo[]`.
Update `SettingsTab` to consume the new shape. Verify that existing generate() error
handling already satisfies the spec (it does — no changes required there).

## Spec reference

`docs/specs/0001-milestone-0.1.1.md` § "Friendly error layer — 2b"

## Current state

Both providers' `getModels()` currently have this pattern:

```ts
async getModels(): Promise<ModelInfo[]> {
  if (!this.apiKey) return FallbackModels;    // ← silent, no degradation signal
  try {
    const res = await fetch(...);
    if (!res.ok) return FallbackModels;       // ← failure swallowed silently
    // ... parse and return live list
  } catch {
    return FallbackModels;                    // ← failure swallowed silently
  }
}
```

`SettingsTab.displayFetchModelsSetting` has a `catch` branch that writes
`✗ ${errMessage(err)} — using the built-in list` — but because `getModels()` **never
throws**, this catch branch is unreachable. The user always sees green ✓ even on failure.

## Implementation notes

### New return type

Define the shape in `src/core/types.ts` (or inline in both providers — prefer types.ts
for single-source-of-truth):

```ts
export interface ModelsResult {
  models: ModelInfo[];
  /** True when the returned list is the built-in fallback, not the live provider list. */
  degraded: boolean;
  /** Human-readable reason for degradation, suitable for display in settings UI. */
  reason?: string;
}
```

Change both providers' `getModels()` signatures to `Promise<ModelsResult>`.

### Return rules

| Condition | Return value |
|---|---|
| No API key configured | `{ models: fallbackModels, degraded: false }` — expected state, not an error |
| Fetch succeeds, list parsed | `{ models: liveList, degraded: false }` |
| Fetch returns non-200 | `{ models: fallbackModels, degraded: true, reason: friendlySentence }` |
| Fetch throws (network) | `{ models: fallbackModels, degraded: true, reason: friendlySentence }` |
| Parse succeeds but list is empty | `{ models: fallbackModels, degraded: false }` — provider returned an empty list, not an error |

For the `reason` string in degraded cases, call the `friendlyMessage` helper from
`src/ui/utils/errorMessages.ts` (which is introduced in Ticket 003). To avoid a
circular dependency (`providers/` → `ui/utils/`), extract just the headline string
inline, or move `friendlyMessage` to `src/core/errorMessages.ts` (no Obsidian import
needed — it is pure TypeScript). **Preferred approach:** put `errorMessages.ts` in
`src/core/` so both providers and UI can import it without crossing the
`src/obsidian/` boundary rule.

### Generate() — no changes needed

Both providers already:
1. Throw `ProviderError` at the HTTP failure site in `GeminiClient.ts` and
   `OpenAIProvider.generate()`
2. Catch `ProviderError` and yield `{ type: "error", message, code, cause }` in the
   `generate()` catch block
3. Catch `TypeError` (network) and yield a coded network error
4. Use `isAbortError` before any error classification

Verify this is correct and add a comment referencing the spec if the code lacks one.
Do NOT refactor the generate error handling.

### SettingsTab changes

`displayFetchModelsSetting`:
```ts
// Before:
const models = await provider.getModels();
this.fetchedModels = models;
this.fetchStatus = `✓ Loaded ${models.length} models`;

// After:
const result = await provider.getModels();
this.fetchedModels = result.models;
this.fetchedForProvider = provider.id;
if (result.degraded) {
  this.fetchStatus = `⚠ ${result.reason ?? "Using built-in model list"}`;
} else {
  this.fetchStatus = `✓ Loaded ${result.models.length} models`;
}
```

The outer `try/catch` in `displayFetchModelsSetting` is now only a safety net (the
method itself should not throw). Remove the catch-branch's fallback model assignment
and status assignment — they are dead code after this change. Keep the `try/catch`
wrapper but simplify the catch to log a console.warn (never surface a raw error from
this catch branch).

**Update `setStatusUnderline`** in `SettingsTab.tsx` to handle `⚠`:
```ts
function setStatusUnderline(el: HTMLElement, status: string): void {
  el.style.color = status.startsWith("✓")
    ? "var(--text-success)"
    : status.startsWith("⚠")
      ? "var(--color-orange)"   // amber — Obsidian theme variable
      : status.startsWith("✗")
        ? "var(--text-error)"
        : "var(--text-muted)";
}
```

Note: `--color-orange` may not exist in all Obsidian themes; use
`"hsl(37 95% 50%)"` as a fallback or check the Obsidian CSS variable docs. Acceptable
alternative: use a CSS class rather than an inline style.

### AIProvider interface

Update `src/providers/base/AIProvider.ts` to reflect the new signature:
```ts
getModels(): Promise<ModelsResult>;
```

This is a breaking change to the interface — both implementing classes must be updated
in the same commit.

## Tests

File: `src/providers/gemini/GeminiProvider.test.ts` (extend existing)
File: `src/providers/openai/OpenAIProvider.test.ts` (extend existing)

New test cases for `getModels()`:

**GeminiProvider:**
- `getModels()` with no key → `{ degraded: false, models: fallbackModels }`
- `getModels()` with valid key, server returns 200 with well-formed body → `{ degraded: false, models: [...] }`
- `getModels()` with valid key, server returns 401 → `{ degraded: true, models: fallbackModels, reason: <string> }`
- `getModels()` with valid key, fetch throws TypeError → `{ degraded: true, models: fallbackModels, reason: <string> }`

**OpenAIProvider:** same four cases.

**Update existing tests** that assert `getModels()` returns a bare `ModelInfo[]`:
- Change assertions to destructure `.models` from the result
- Add `expect(result.degraded).toBe(false)` for success cases
- Add `expect(result.degraded).toBe(true)` for failure cases

## Acceptance

- `getModels()` never throws (all errors are captured as `degraded: true`)
- `getModels()` with wrong key → `{ degraded: true }` with a non-empty `reason`
- `SettingsTab` shows ⚠ in amber when `degraded === true`
- `SettingsTab` shows ✓ in green when `degraded === false` and models loaded
- `AIProvider` interface updated; `typecheck` passes
- All existing + new tests pass; count ≥ 67
