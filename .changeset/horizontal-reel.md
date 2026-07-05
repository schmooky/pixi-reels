---
"pixi-reels": minor
---

Add: `HorizontalReel` + `HorizontalReelBuilder` — a one-row, sideways reel for
the "these symbols pay this round" banner above the reels. It follows the same
spin contract as `ReelSet`: `spin()` starts it and returns a promise,
`setResult(ids)` hands it the round's paying symbols (a flat `string[]`, one per
visible cell) and triggers the stop, and the promise resolves on land.
`skipSpin()`, `isSpinning`, and the `spin:start` / `spin:complete` events all
mirror `ReelSet`. Travels `ltr` or `rtl` in either `scroll` (smooth) or
`cascade` (stepped) mode. Built on the shared symbol pool / `TickerRef` /
`EventEmitter` primitives, cleaned up via `destroy()`.
