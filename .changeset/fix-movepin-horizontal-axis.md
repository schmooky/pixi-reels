---
'pixi-reels': patch
---

Fix: `movePin()` flew the symbol to the wrong place on a horizontal reel set. It read `_pinOverlayCellMain` (a travel-axis coordinate, which is `x` when `orientation('horizontal')`) straight into `.y`, and the reel's main offset into `.x`. Both are numbers, so nothing threw. Now routed through `axis.toScreen`, like every other pin-overlay site.

Fix: `setShape()`'s parameter and the `shape:changed` payload label are `cellsPerReel`, not the v1 `rowsPerReel`. The old name shipped in the `.d.ts` and in two runtime error messages.

Fix: the big-symbol split error printed `anchor + h + distance` while the predicate tested `anchor + h - 1 + distance`, so the number in the message was one off from the one that failed.
