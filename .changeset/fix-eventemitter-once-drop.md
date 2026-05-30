---
"pixi-reels": patch
---

Fix: `EventEmitter` no longer drops a persistent `on()` listener when the same handler reference is also registered via `once()`. `emit` now removes the fired `once` entry by identity instead of by `(fn, context)`, which previously deleted every listener sharing that function reference.
