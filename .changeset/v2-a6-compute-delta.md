---
"pixi-reels": patch
---

Refactor: rename `SpinningMode.computeDeltaY(symbolHeight, ...)` to `computeDelta(slotPitch, ...)`. The parameter was always the slot pitch (the caller passes `motion.slotHeight`); the name now matches. Returns signed travel along the reel's axis. The full-slot wrap-skip risk the old cap guarded (contract L7) is gone with the derive-from-index motion, so the cap is now only smoothing.
