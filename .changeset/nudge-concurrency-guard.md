---
"pixi-reels": patch
---

Fix: throw on a concurrent `spin()`, `setResult()`, `pin()`, or `setShape()` call while `nudge()` is in flight, instead of leaving the behavior undefined.
