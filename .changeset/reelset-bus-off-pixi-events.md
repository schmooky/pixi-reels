---
'pixi-reels': patch
---

Fix: a `runCascade()`, `refill()` or `expand()` that settled after its reel set was destroyed threw `this._events.off is not a function` instead of resolving. `ReelSet` kept its typed bus in a field that shadowed the PixiJS Container's own listener store; it now lives under its own name, so `destroy()` no longer breaks that cleanup.
