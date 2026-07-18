---
"pixi-reels": patch
---

Fix: re-mask lifted `unmask` symbols through the cascade refill path. A pure `refill()` never passes through `StartPhase` (strip spins) or `notifySpinStart` (tumble fall), so a symbol with `unmask: true` arriving via drop-in stayed parented in `viewport.unmaskedContainer` and rendered its whole above-viewport approach outside the reel mask. floating over the page before landing. `CascadePlacePhase` and `CascadeDropInPhase` now call `reel.beginMotion()` on entry (idempotent, same rule as `StartPhase._launch`); `notifyLanded` re-lifts once the refill settles.
