---
"pixi-reels": patch
---

Fix: pin migration on a MultiWays reshape now resolves cell collisions deterministically. When two pins clamp onto the same row, the topmost keeps the cell and the other is expired (with `pin:expired` reason `'collision'`) and its overlay released — previously the second silently overwrote the first in the pin map and orphaned an overlay. Pin-overlay Y is also computed through a single helper so placement agrees across reshape.
