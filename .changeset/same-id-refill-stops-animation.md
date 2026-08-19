---
"pixi-reels": patch
---

Reset the symbol's animation pose on a same-id refill. Reusing the instance without `deactivate()`/`activate()` left it parked on the final frame of its last one-shot win, so a refilled cell could hold a symbol and draw nothing.
