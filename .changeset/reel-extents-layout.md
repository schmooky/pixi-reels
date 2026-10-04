---
'pixi-reels': patch
---

Fix: a reel on a set that is not MultiWays lays its cells out at its share of a `reelExtents()` box. The builder sized each cell to fit the box but gave every reel the symbol size as the pitch its strip moves on, and such a reel never reshapes when it lands: a 4-cell reel in a 300px box drew 75px cells 100px apart, the last past the bottom of its mask, and `getCellBounds()` reported them there. The spin pitch is now the reel's own cell, spinning and landed. A set without `reelExtents()` keeps the symbol size exactly, instead of re-deriving it from the reel's height, which could drift by a bit (`111.65` came back as `111.65000000000002`).
