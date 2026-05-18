---
"pixi-reels": minor
---

Add: chain- and destroy-scoped cascade lifecycle events so HUDs and audio buses can hook a cascade chain without polling `isSpinning` (which oscillates between refills).

New events on `reelSet.events`:

- `cascade:chain:start` — `{ chain, winners, currentGrid }`. Fired inside `runCascade(...)` after `detectWinners` returns winners, before `destroySymbols` runs. `chain` is 1-indexed.
- `cascade:chain:end` — `{ chain, winners, nextGrid }`. Mirror of `chain:start` — fired after the refill drop-in settles, before the loop iterates to the next `detectWinners`.
- `cascade:destroy:start` / `cascade:destroy:end` — `{ cells }`. Fired around every `destroySymbols(...)` call (both direct and inside `runCascade`). Empty-batch calls do not emit. Use these to cue a shatter SFX, dim a HUD, or capture pre-destroy grids for replay logging — without overriding the cascade loop.

Event ordering per `runCascade()` call (per stage with winners):

`cascade:chain:start` → `cascade:destroy:start` → (destroy tweens) → `cascade:destroy:end` → `onCascade` callback → pause → refill (`cascade:place:end` + `cascade:dropIn:*` per reel) → `cascade:chain:end`

The runCascade chain itself is delimited by the returned `Promise` — `await` the call to know when it's done and read the `RunCascadeResult` summary. There is intentionally no `cascade:round:*` event pair: "round" in slot UX is a bet→payout transaction (your concern, not the engine's), and the engine-level "press-spin → all-stopped" is already covered by `spin:start` / `spin:allLanded`.

Every cascade event uses a consistent three-part `cascade:<scope>:<step>` taxonomy.
