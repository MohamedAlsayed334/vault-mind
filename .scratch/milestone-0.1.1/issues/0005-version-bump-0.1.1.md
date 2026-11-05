# Ticket 005 — Bump version to 0.1.1

Blocks: nothing
Blocked by: 001, 002, 003, 004

## Goal

Version bump only. No code changes. All acceptance criteria for Tickets 001–004 must
pass before this commit is made.

## Spec reference

`docs/specs/0001-milestone-0.1.1.md` § "Version bump"

## Implementation notes

**`manifest.json`**
```json
"version": "0.1.1"
```
(was `"0.1.0"`)

**`versions.json`**
```json
{
  "0.1.0": "1.4.0",
  "0.1.1": "1.4.0"
}
```
The `minAppVersion` for 0.1.1 matches the existing entry for 0.1.0 (`"1.4.0"`)
because this milestone introduces no new Obsidian API surface.

**Commit message:**
```
chore: bump version to 0.1.1
```

This must be the **last commit** of the milestone — made only after all prior tickets
are merged and all gates below pass.

## Acceptance

- `manifest.json` → `"version": "0.1.1"`
- `versions.json` → has entry `"0.1.1": "1.4.0"`
- `npm run typecheck` → zero errors
- `npm run lint` → zero errors
- `npm run test` → all tests pass, count ≥ 67
- `npm run build` → `main.js` + `styles.css` produced without error
