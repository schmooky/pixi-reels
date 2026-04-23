---
"pixi-reels": patch
---

Fix: `AnimatedSpriteSymbol.resize()` now positions the sprite according to its configured anchor, so `anchor: { x: 0.5, y: 0.5 }` renders the symbol centred in its cell instead of with its centre pinned to the cell's top-left corner (which clipped three quarters of the symbol under the reel mask). `anchor: (0, 0)` — the prior default and only combination that worked — is unchanged.
