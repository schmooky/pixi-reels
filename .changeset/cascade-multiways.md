---
'pixi-reels': minor
---

Add: cascade + multiways combination. `ReelSetBuilder.multiways(...)` can now be paired with `.cascade(...)` or `spinningMode(new CascadeMode())` — the build-time throw added in ADR 012 is lifted. `AdjustPhase` runs between `SpinPhase` and `DropStopPhase` so the new shape commits before the drop-in fills it. Shape changes apply per-spin only; mid-cascade-chain reshape is unsupported (see ADR 015). Closes #74.
