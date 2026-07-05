---
"pixi-reels": minor
---

Add: `HorizontalReel` + `HorizontalReelBuilder` — a single one-row, sideways reel
for the "these symbols pay this round" banner above the reels. It reuses the
engine's own contract, so there is nothing incompatible to learn: `spin()`
returns a promise, `setResult(symbols)` takes the same `ColumnTarget[]` as
`ReelSet` (one entry — this reel is a single column), and the promise resolves
with the engine's `SpinResult`. `skipSpin()`, `isSpinning`, and the `spin:start`
/ `spin:complete` events all mirror `ReelSet`. `cascade(winners, newIds?)` runs
a real tumble one row wide: the winning symbols are removed, the survivors
collapse to close the gaps, and new symbols slide in from the feed side to
refill. Built on the shared symbol pool / `TickerRef` / `EventEmitter`
primitives, cleaned up via `destroy()`.
