---
'pixi-reels': patch
---

Fix: the auto-picked mask strategy's console notice names the gap it actually keyed on. The auto-pick has read the CROSS-axis gap since `orientation()` landed, but the message still said `symbolGap.x > 0` verbatim -- so on a horizontal set it pointed at the main-axis knob, and turning that one did nothing to the behaviour being explained. It now reads `symbolGap.x` on a vertical set and `symbolGap.y` on a horizontal one.
