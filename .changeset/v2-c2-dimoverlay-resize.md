---
"pixi-reels": patch
---

Fix: `ReelViewport.updateMaskSize` now resizes the dim overlay. A viewport resize (e.g. a MultiWays reshape growing the tallest reel) no longer leaves the spotlight dimming a stale rectangle.
