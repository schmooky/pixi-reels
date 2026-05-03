---
'pixi-reels': patch
---

Fix and harden a handful of follow-ups from the per-reel-geometry / MultiWays / big-symbols PR:

- `Reel.reshape()` now keeps `_reelHeight` in sync with the new geometry so the field doesn't go stale after a reshape. Previously a direct external call left `reelHeight` reporting the construction-time value. The method is also marked `@internal` in JSDoc — `ReelSet.setShape()` is the supported entry point.
- `ReelSetBuilder.maskStrategy()` now validates its argument synchronously: passing `null`, `undefined`, or an object missing `build()` / `update()` methods throws with a grep-able error instead of crashing later inside `ReelViewport`.
- Added a comment in `SpinController.skip()` documenting the reshape-on-skip contract — pin overlays migrate instantly on slam-stop regardless of `pinMigrationDuration`, and the rationale (overlays are destroyed at land anyway).

No new public API; behaviour for existing well-formed callers is unchanged.
