---
"pixi-reels": patch
---

Fix: `enableDebug(reelSet, key?)` now registers each reel set under a per-instance key on `window.__PIXI_REELS_DEBUG_INSTANCES` instead of letting multiple reel sets clobber the single `window.__PIXI_REELS_DEBUG` global (which still points at the most recently enabled instance for convenience).
