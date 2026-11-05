# Ticket 001 — Verify and harden ProviderError class and classify helper

Blocks: 002, 003
Blocked by: nothing

## Goal

Confirm that `src/core/ProviderError.ts` satisfies the full spec contract and that
its vitest suite covers every code path. Extend tests where gaps exist. No UI changes.
No provider changes. No new exports required unless tests expose a gap.

## Spec reference

`docs/specs/0001-milestone-0.1.1.md` § "Friendly error layer — 2a"

## Current state

`src/core/ProviderError.ts` already exists and exports:
- `ErrorCode` (union type: 7 codes)
- `ProviderErrorOptions` (interface)
- `ProviderError extends Error` with `code`, `cause`, `providerId`, `modelId`
- `classify(status, body?, hint?)` static function
- `isAbortError(err)` guard function

Both providers already import and use all four exports. `AIEvent` and `AgentEvent`
in `src/core/types.ts` already carry `code?: ErrorCode; cause?: string`.

## Implementation notes

**Check for existing test file** — if `src/core/ProviderError.test.ts` does not exist,
create it. If it exists, extend it with any missing cases from the matrix below.

**`classify` test matrix** (every branch must have at least one test):

| Input | Expected code |
|---|---|
| `classify(401)` | `invalid_key` |
| `classify(401, "some body")` | `invalid_key` |
| `classify(400, "API_KEY_INVALID in body")` | `invalid_key` |
| `classify(400, "passphrase is wrong")` | `invalid_key` |
| `classify(400, "invalid api key supplied")` | `invalid_key` |
| `classify(400, "unrelated 400 error")` | `unknown` |
| `classify(400)` (no body) | `unknown` |
| `classify(404)` (no hint) | `unknown` |
| `classify(404, undefined, { modelRequest: false })` | `unknown` |
| `classify(404, undefined, { modelRequest: true })` | `model_not_found` |
| `classify(429, "rate limit exceeded")` | `rate_limited` |
| `classify(429, "quota exceeded for this month")` | `quota_exceeded` |
| `classify(429, "billing limit reached")` | `quota_exceeded` |
| `classify(429, "credit balance low")` | `quota_exceeded` |
| `classify(500)` | `server` |
| `classify(503)` | `server` |
| `classify(599)` | `server` |
| `classify(422)` | `unknown` |
| `classify(200)` | `unknown` (edge case — callers should not call classify on success) |

**`ProviderError` constructor tests:**
- `new ProviderError("invalid_key", "msg")` → `err.code === "invalid_key"`, `err.message === "msg"`, `err.name === "ProviderError"`, `err.cause === undefined`
- `new ProviderError("network", "msg", { cause: "raw body", providerId: "gemini", modelId: "gemini-3.8-flash" })` → all fields propagate correctly
- `err instanceof Error` → `true`

**`isAbortError` tests:**
- `new DOMException("Aborted", "AbortError")` → `true`
- `Object.assign(new Error("Aborted"), { name: "AbortError" })` → `true`
- `new TypeError("Failed to fetch")` → `false` (not an abort, though it is a network error)
- `new TypeError("The operation was aborted")` → `true` (defensive path)
- `new Error("some other error")` → `false`

**Abort path documentation note:** The spec requires that user aborts never reach
`classify`. Both providers already guard with `isAbortError(err)` before any
`ProviderError` construction. Document this invariant as a comment in
`ProviderError.ts` if it is not already present. No test is strictly required at the
orchestrator level (the providers' own tests cover the abort branch).

## Tests

File: `src/core/ProviderError.test.ts` (create or extend)
- Use relative imports (`../../core/ProviderError`) — the `@/` alias does not resolve
  in the vitest environment
- One `describe("classify", ...)` block, one `describe("ProviderError", ...)` block,
  one `describe("isAbortError", ...)` block
- Each row in the matrix above = one `it(...)` call

## Acceptance

- `src/core/ProviderError.test.ts` exists and all tests in it pass
- `npm run typecheck` → zero errors
- `npm run lint` → zero errors
- `npm run test` test count is equal to or greater than 67
