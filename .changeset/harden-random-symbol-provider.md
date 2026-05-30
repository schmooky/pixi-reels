---
"pixi-reels": patch
---

Fix: `RandomSymbolProvider` now fails loud instead of degrading silently — it throws on an empty symbol set or an all-zero total weight (which previously returned `undefined` or ignored weights), and `updateWeights()` drops exclusions referencing symbols no longer present so stale game-mode exclusions don't linger.
