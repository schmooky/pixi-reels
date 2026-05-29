---
"pixi-reels": patch
---

Fix: `StandardMode.computeDeltaY` now clamps displacement symmetrically (±half a symbol). The upward step-back in `StartPhase` (and large frame deltas) previously moved more than one slot per tick, skipping `ReelMotion`'s single-wrap-per-call invariant and desyncing the symbol array from the view. `Reel.update` also clamps pathological `deltaMs` spikes (backgrounded-tab refocus, non-Pixi tickers).
