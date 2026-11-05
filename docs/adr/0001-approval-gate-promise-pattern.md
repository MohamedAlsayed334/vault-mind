# Approval gate uses a Promise resolver carried inside the AgentEvent stream

The agent loop is an async generator: it yields events and the UI consumes them. When a write or destructive tool is requested, the loop needs to pause and wait for the user's decision before continuing. Rather than adding a separate side-channel (a shared ref, an event emitter, a pause/resume queue), the `approval_required` event carries the Promise resolver directly as a field. The UI captures the resolver from the event, wires it to the approve/reject buttons, and when the user acts, calls it — which unblocks the `await` already suspended inside the generator.

## Considered options

**Option A — resolver in the event (chosen).** The generator creates a `new Promise`, keeps the `await` alive, and yields the resolver to the UI via the event. No coordination surface outside the stream itself.

**Option B — shared mutable ref / external queue.** The orchestrator writes a pending-approval record to a shared object; the UI polls or subscribes to it and signals back through a separate channel. This requires the orchestrator to hold a reference to external state and introduces coordination across the boundary.

**Option C — pause/resume with AbortController.** Abort the stream on approval-needed and re-run the orchestrator from a saved checkpoint when the user decides. Requires serialising and replaying partial state; the tool-call context (IDs, already-accumulated result blocks) would have to be restored exactly.

## Consequences

- **The generator stays suspended** across the approval wait. All local variables — the current iteration, the pending tool-call list, the already-accumulated result blocks — remain live in the closure. Nothing needs to be serialised or replayed.
- **The resolver is consumed exactly once.** `useAgent` wraps it in a one-time guard so that a cancel racing a button click cannot double-fire the orchestrator.
- **Cancel must unblock the generator.** Because the generator is awaiting the Promise, aborting the `AbortController` alone does not free it. `cancel()` in `useAgent` explicitly calls `pending.resolve(false)` to let the loop reach its next abort-check and exit cleanly.
- **The resolver leaks into the UI layer.** The `approval_required` event is part of the public `AgentEvent` type, which means the UI-layer callback is typed into the core event union. This is a deliberate coupling: the alternative (a side-channel) would be a larger surface with the same coupling, just less visible.
