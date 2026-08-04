---
"pixi-reels": patch
---

Fix: `movePin` placed the flight symbol at the source cell's bare reel-local Y, dropping the reel's container offset and mixing the masked (reel-local) vs unmasked (viewport-space) coordinate conventions. Route flight placement through `_pinOverlayCellY` so it agrees with pin overlays on any layout with a nonzero reel offset. No API change.
