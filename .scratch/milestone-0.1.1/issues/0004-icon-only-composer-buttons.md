# Ticket 004 — Icon-only Send/Stop buttons and CSS hover contrast fix

Blocks: 005
Blocked by: nothing (independent of error layer)

## Goal

Confirm that the icon-only Send/Stop button implementation already in `Chat.tsx`
satisfies all acceptance criteria. Fix any remaining CSS hover contrast issue in
`chat.css`. No new npm dependencies.

## Spec reference

`docs/specs/0001-milestone-0.1.1.md` § "Icon-only composer buttons"

## Current state

**`Chat.tsx`** already has icon-only SVG buttons:
- `SendIcon`: paper-plane SVG (`<path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />`)
- `StopIcon`: filled square with rounded corners (`<rect x="6" y="6" width="12" height="12" rx="1.5" />`)
- Both SVGs have `aria-hidden="true" focusable="false"` on the `<svg>` element
- Send button: `className="vault-compass-btn vault-compass-btn--icon vault-compass-btn--primary"`,
  `aria-label="Send"`, `title="Send message"`
- Stop button: `className="vault-compass-btn vault-compass-btn--icon vault-compass-btn--stop"`,
  `aria-label="Stop"`, `title="Stop generating"`

**`chat.css`** already has:
```css
.vault-compass-btn--icon { width: 32px; height: 32px; min-width: 32px; min-height: 32px;
  padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.vault-compass-btn--icon svg { width: 14px; height: 14px; fill: currentColor; display: block; pointer-events: none; }
.vault-compass-btn--stop { background: var(--background-modifier-error);
  border-color: var(--background-modifier-error); color: var(--text-error); }
.vault-compass-btn--stop:hover { background: var(--background-modifier-error-hover); color: var(--text-on-accent); }
```

The hover rule pairs `--background-modifier-error-hover` with `--text-on-accent` —
this is the correct contrast-safe pairing. No `!important` is used.

## Implementation notes

This ticket is primarily **verification and documentation** of work already done, with
targeted fixes only if gaps are found during acceptance testing.

### Checklist to verify

1. **No text nodes in buttons** — confirm `ComposerForm` renders no text content
   inside the Send or Stop `<button>` elements (only the JSX SVG constant).

2. **`aria-label` present** — `aria-label="Send"` on the submit button,
   `aria-label="Stop"` on the cancel button. Both are present in current code.

3. **`title` present** — `title="Send message"` and `title="Stop generating"`.
   Both are present in current code.

4. **Hover contrast** — manually test in Obsidian default light and dark themes:
   - Hover Send: icon remains clearly visible (accent background, on-accent text)
   - Hover Stop: icon remains clearly visible (`--background-modifier-error-hover`
     background, `--text-on-accent` text)

5. **Keyboard behavior** — `Enter` in the textarea triggers `handleSend()` (via
   `handleKeyDown`). `Shift+Enter` does not trigger send (guarded by `!e.shiftKey`).
   These behaviors are present and unchanged.

6. **Disabled state** — Send button: `disabled={!input.trim()}` (cannot send empty).
   Textarea: `disabled={busy}`. Stop button appears only when `busy === true`.
   These are correct.

### If a contrast gap is found during testing

The only known theoretical gap: in a custom theme where `--text-on-accent` is not
defined (falls back to unset), the Stop hover icon might be invisible. Mitigate by
adding an explicit fallback:

```css
.vault-compass-btn--stop:hover {
  background: var(--background-modifier-error-hover, hsl(0 72% 42%));
  color: var(--text-on-accent, #fff);
}
```

Similarly for the primary (Send) button:
```css
.vault-compass-btn--primary {
  background: var(--interactive-accent);
  border-color: var(--interactive-accent);
  color: var(--text-on-accent, #fff);
}
.vault-compass-btn--primary:hover:not(:disabled) {
  background: var(--interactive-accent-hover);
  color: var(--text-on-accent, #fff);
}
```

Add these fallback values only if testing reveals the gap. Do not add them
speculatively.

### No new dependencies

The SVG icons are inline JSX constants. Do not add `lucide-react`, `heroicons`, or
any other icon library.

## Tests

No automated tests required for this ticket — the changes are purely visual. Manual
acceptance is the gate. The existing typecheck and lint checks confirm JSX is valid.

## Acceptance

- Send button: icon-only, no visible text, `aria-label="Send"` present
- Stop button: icon-only, no visible text, `aria-label="Stop"` present
- Hovering Stop never makes the icon invisible in Obsidian default light theme
- Hovering Stop never makes the icon invisible in Obsidian default dark theme
- `Enter` sends a message; `Shift+Enter` adds a newline (unchanged)
- `npm run typecheck` → zero errors
- `npm run lint` → zero errors
- `npm run build` → succeeds
