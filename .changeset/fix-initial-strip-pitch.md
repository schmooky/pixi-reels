---
'pixi-reels': patch
---

Fix: a horizontal reel set laid out its initial strip with no gap between cells. `Reel._setupSymbolPositions` stepped by `spinCellSize + symbolGapY` -- the screen VERTICAL gap -- instead of the travel-axis gap. On a vertical set the two are the same value, so this was invisible; on a horizontal one the main gap is `symbolGapX`, so symbols touched until the first spin handed positions to `ReelMotion` (which projects correctly) and they silently snapped apart.
