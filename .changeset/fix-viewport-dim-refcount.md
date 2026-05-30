---
"pixi-reels": patch
---

Fix: `ReelViewport` dim overlay is now reference-counted. The spotlight and cascade `destroySymbols({ dim })` share one overlay; an overlapping pair no longer hides the dim out from under the other (flicker / lost dim in cascade+win sequences). The overlay hides only when the last consumer releases it.
