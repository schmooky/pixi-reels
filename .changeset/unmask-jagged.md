---
"pixi-reels": minor
---

Add: `symbolData` `unmask: true` now works on jagged / pyramid layouts (reels with a non-zero `offsetY`). Previously the builder threw at config time, because the motion layer writes bare reel-local Y and would drop the reel offset from a lifted view on every snap. Since unmask is now an at-rest presentation (a view is only lifted while the reel is stopped), `Reel._syncUnmaskedViewOffsets()` re-bakes `container.y` after each absolute `motion.snapToGrid()`, and the frequent mid-spin snaps never touch a lifted view. The `unmask + pyramid layout is not supported` build-time throw is removed.
