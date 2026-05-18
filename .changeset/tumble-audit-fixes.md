---
"pixi-reels": patch
---

Fix five audit-discovered defects in the tumble-cascade pipeline:

- `CascadeFallPhase` / `CascadeDropInPhase` now emit their `:end` events on skip. Previously a slam mid-fall (or mid-drop, mid-gravity) killed the timeline without firing the paired `cascade:fall:end` / `cascade:dropIn:end` / `cascade:gravity:end`, so any HUD or audio bus pairing `:start` / `:end` to track in-flight cascade work drifted out of balance on every slam. The pre-fall delay window (where `:start` has not yet fired) still skips silently, so no unpaired `:end` is emitted.

- `runCascade({ gravityHold })` now invokes the per-cascade builder at the **gravity-end boundary** as documented, not at refill-start. Side effects in the builder (e.g. `multiplier.bumpTo(chain + 1); return multiplier.done`) now line up with the gravity-end beat the player sees. To support this, `refill({ gravityHold })` accepts a factory `() => Promise<void>` in addition to a bare `Promise<void>` — pass a factory when the side effect of starting the promise should fire at gravity-end; pass a bare promise when you already hold an in-flight handle.

- `runCascade({ pauseAfterDestroyMs })` wait is now cancellable via `signal`. Previously an abort during the pause ran the setTimeout to completion before the loop exited — up to `pauseAfterDestroyMs` of dead air between slam intent and exit. Now the wait races against `signal.aborted` and unblocks within a microtask.

- A new `cascade:gravity:error` event surfaces user-supplied `gravityHold` / `onGravityComplete` rejections (or throws). The engine still slams to recover so the refill promise settles, but the original rejection reason is no longer silently swallowed — listen on the event to forward the error to your own logger / alarm. The console.error log was also tightened to identify the likely culprit.

- `movePin` `onFlightCreated` / `onFlightCompleted` hook throws now log via `console.error` instead of being silently swallowed. The animation still continues (a throwing hook MUST NOT leak a flight symbol or leave the pin map out of sync) but the bug is no longer invisible.

Also clarifies the `skip()` documentation: `skip()` THROWS before `setResult()` arrives. The docstring on `requestSkip()` and `skipStage` now notes that queued-pre-`setResult` requests do not advance `skipStage` until the slam fires.
