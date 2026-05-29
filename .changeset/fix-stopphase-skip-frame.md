---
"pixi-reels": patch
---

Fix: `StopPhase.onSkip()` now places the full target frame (buffers included) instead of slicing to the visible window. A direct `skip()` previously dropped `bufferAbove` / `bufferBelow` targets — e.g. a big symbol's tail parked above the visible area — and landed the wrong frame.
