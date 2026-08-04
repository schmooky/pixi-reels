---
'pixi-reels': patch
---

Perf: `build()` no longer constructs and discards an `OffsetCalculator`.

The instance was never read, but its constructor runs `_compute()`, so every
`ReelSetBuilder.build()` was laying out a full per-reel/per-cell offset table
and throwing it away. Confirmed it contains no `throw`, so it was not doubling
as a validator. Also drops an unused local in `StartPhase`. No behaviour change.
