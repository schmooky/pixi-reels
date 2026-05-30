---
"pixi-reels": patch
---

Fix: `ObjectPool` now guards against double-release (the same instance was pooled twice and then handed to two cells, silently aliasing one symbol) and against use after `destroy()` (`acquire` throws, `release` no-ops) so a late ticker/promise callback can't resurrect or leak the pool.
