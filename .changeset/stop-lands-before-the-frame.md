---
'pixi-reels': patch
---

Fix: an animated stop now lands in the tick its last target symbol arrives. The landing ran in a promise callback after PixiJS had drawn that frame, so every reel showed its result up to a frame of travel past rest (half a cell at the default speed) before snapping back. A step that returns `ctx.until()` now ends in the tick its predicate holds.
