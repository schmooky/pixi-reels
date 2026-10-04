---
'pixi-reels': patch
---

Fix: big symbols stay whole wherever the engine places symbols outside a landing. A big symbol in the builder's `initialFrame()` or in `addReels({ initialFrame })` now gets its whole block, as in `setResult()` (it used to get no stubs, draw at one cell and leave its neighbours reported under it), and a block that does not fit throws before anything is built. `pin()` and `movePin()` at rest no longer turn the stubs of a block that shares the reel into extra anchors. A pin on a cell of a big symbol replaces the block, so the pin shows at once, and a big symbol pinned at rest has to fit, as in a landing.
