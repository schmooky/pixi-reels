---
'@pixi-reels/kit': patch
---

Fix: the generic sticker symbols no longer speckle on phones. `loadGenericSymbols` picks the half-size copies whenever the cells come out under about 150 device pixels, which covers small 2x and 3x screens as well as 1x ones. Before, only screens under 1.5x got them.
