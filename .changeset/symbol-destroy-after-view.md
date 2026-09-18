---
'pixi-reels': patch
---

Fix: `ReelSet.destroy()` no longer throws when a pooled `CardSymbol` is disposed after its reel. A released symbol's view stays a child of the reel container, so `Reel.destroy()` had already destroyed it by the time the symbol pool disposed the symbol, and `CardSymbol.stopAnimation()` reset the scale of a label that no longer had one. `ReelSymbol.destroy()` now skips `stopAnimation()` and `onDeactivate()` for a symbol whose view is already destroyed; `onDestroy()` still runs.
