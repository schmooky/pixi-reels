---
"pixi-reels": patch
---

Fix: `Reel.destroy()` now emits `'destroyed'` before `removeAllListeners()` (so listeners actually receive it) and destroys each symbol's view instead of releasing live symbols back into the shared pool and then destroying their views out from under it (which handed a destroyed view to the next `acquire()`).
