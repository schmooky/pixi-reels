---
"pixi-reels": minor
---

Add: staggered / sequential anticipation so teasing reels build tension one after another instead of all slowing down at once.

`setAnticipation(reelIndices, stagger?)` now takes a second argument controlling when each reel BEGINS its slow-down (offsets are by tease-order, not raw reel index):

- `0` (default) — every anticipation reel starts slowing together (unchanged behaviour).
- `number` — reel at tease-order `k` starts `k * stagger` ms after the first.
- `number[]` — explicit per-tease-order offset in ms.
- `'sequential'` — each reel waits until the previous anticipation reel has fully landed before it starts.

Add: progressive slow-down. Pass `setAnticipation(reels, { stagger, slowdown })` where `slowdown` (`{ from, to, holdFrom, holdTo }`) interpolates across the tease sequence, so each successive reel decelerates to a lower speed and/or holds longer than the last — the escalating "each reel crawls slower than the one before" build-up. Omit it for the previous flat 30%-and-hold tease.

Add: `duration` override — `setAnticipation(reels, { duration })` sets the tease hold in ms regardless of the active speed profile, so anticipation keeps playing in Turbo / SuperTurbo (whose profiles use `anticipationDelay: 0` and previously skipped it entirely).

Add: `anticipation:reel` (`{ reelIndex, order, total }`) and `anticipation:reelEnd` (`{ reelIndex }`) events — a dedicated per-reel tease start/end signal so games can drive tension SFX, pitch ramps (`order / (total - 1)`), and escalating visuals without re-deriving the tease set from `spin:stopping`. Fired only for reels that actually tease.

Add: `anticipationForScatters(grid, { symbol, trigger, mode })` — derive the tease reel list straight from a result grid (`grid` is the same `ColumnTarget[]` you pass to `setResult`). Anticipation begins on the reel after the `trigger`-th scatter; `mode: 'all-remaining'` teases every following reel, `'scatter-only'` teases only reels that actually hold the symbol (so a 3-scatter result doesn't slow the empty reels).

Fix: after an anticipation tease the reel now carries its slow speed into the stop and crawls onto its landing frame, instead of snapping back to full spin speed and doing a fast re-spin into position.

`spin:stopping` now fires when a reel actually begins slowing (after its stagger offset), so tease SFX/VFX can sync to the real start. The stagger and slowdown reset at the start of every `spin()`.

Also: `setStopDelays(null)` / `setDropOrder(null)` now CLEAR a per-reel stop-delay override and restore the default `i * speed.stopDelay` stagger — distinct from passing all-zeros (which lands every reel simultaneously).
