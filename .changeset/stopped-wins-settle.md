---
'pixi-reels': patch
---

Fix: `CardSymbol` and `SpriteSymbol` settle a pending `playWin()` when `stopAnimation()` cuts the win short (a recycle, a spotlight hide, `removeReels()`), as `AnimatedSpriteSymbol` and the Spine symbols already did, so an `await` on it, or a `WinPresenter.show()`, no longer hangs. `CardSymbol` also kills the rest of its win timeline and its two fill calls, which used to fire into a symbol that had moved on or been destroyed. A second `playWin()` settles the first.
