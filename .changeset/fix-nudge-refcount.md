---
"pixi-reels": patch
---

Fix: the "nudge in flight" guard that blocks `spin()` / `setResult()` / `pin()` is now reference-counted. With parallel nudges across reels, the first to settle no longer clears the guard early and lets a later call race a still-live nudge (which could tear a frame or desync a pin).
