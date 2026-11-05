# Project status

This file records shipped work and verification evidence. Planned work is tracked in [ROADMAP.md](ROADMAP.md); manual verification is not claimed unless evidence is recorded here.

## Milestone 0.1.1 — polish

### Shipped

- Provider errors have friendly, actionable user-facing messages with technical details available separately.
- Model-list failures report degraded status with an amber warning instead of appearing successful.
- Send and Stop controls are icon-only and accessible; Stop hover contrast is hardened.
- Gemini sends its API key in a request header rather than the URL. API keys are stored in browser-side TokenStore rather than plugin `data.json`.
- Review fixes also cover approval cancellation, unique Gemini tool-call IDs, live model listing, selected-provider settings, and OpenAI tool-call mapping.

Historical review findings and their resolutions from the former `docs/REVIEW.md` are incorporated here; the obsolete issue-by-issue duplicate list is intentionally not retained.

### Verification

- Automated checks and production build are run for this milestone before release; final command results and test count are recorded in the delivery report/commit context.
- **Pending:** manual verification in a disposable live Obsidian test vault, including friendly errors, degraded model-list warning, approval/rejection behavior, and light/dark Stop hover. See [TESTING.md](TESTING.md).
- **Pending:** mobile smoke test.

Automated checks do not substitute for either pending manual check. Do not treat this milestone as manually verified.

## Earlier integration and review history

The initial stabilization pass resolved issues that had left the chat unreachable, tools unregistered, approval events disconnected, active-note context unwired, Gemini tool calls unmapped, duplicate user prompts, API keys persisted in `data.json`, placeholder OAuth controls exposed, and typecheck/lint/CI coverage incomplete. Tests were added for the agent loop, approval/rejection, unknown tools, cancellation, and Gemini streaming/tool mapping. A subsequent review fixed cancellation while approval was pending, moved the Gemini key out of the URL, made tool-call IDs unique, refreshed model discovery and provider settings, added OpenAI tool mapping, and redesigned the chat composer and approval card.

These fixes were documented in the former PLAN handoff notes and REVIEW findings. Remaining work is listed in [ROADMAP.md](ROADMAP.md), not presented as shipped here.
