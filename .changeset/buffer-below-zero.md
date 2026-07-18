---
"pixi-reels": minor
---

Add: `bufferSymbols({ above, below })`. asymmetric buffer rows, including `below: 0` for tumble-only reel sets. A pure tumble never scrolls the strip, so the below-window cells exist only to be hidden by the mask; dropping them means nothing can ever peek out under the grid. Requires `.tumble(...)` on the builder (validated at `build()`); strip spins (`spin({ mode: 'standard' })`) and `nudge()` throw on such a set because both move symbols through the below-window buffer. The number form keeps its exact legacy behavior (symmetric count, minimum 1 with a clamp warning).
