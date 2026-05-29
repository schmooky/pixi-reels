---
"pixi-reels": minor
---

Add: the symbol recycle pool now auto-sizes its per-id capacity to the whole strip (every visible + buffer cell, floored at 20), eliminating destroy/recreate churn on large and MultiWays grids. A new `ReelSetBuilder.poolCapacity(n)` override is available for memory-constrained or unusually swap-heavy deployments.
