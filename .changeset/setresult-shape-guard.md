---
'pixi-reels': patch
---

Fix: `setResult()` and `initialFrame()` now reject a plain `string[][]` with a message that names the fix. Previously the value reached a spread of `target.visible` deep in the frame pipeline and threw `TypeError: target.visible is not iterable` -- after the reels were already moving, so the spin promise never settled and the reel spun forever with no usable clue.
