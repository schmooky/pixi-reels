---
"pixi-reels": minor
---

Add: round- and chain-scoped cascade lifecycle events so HUDs and audio buses can hook a cascade round without polling `isSpinning` (which oscillates between refills).

New events on `reelSet.events`:

- `cascade:round:start` — `{ initialGrid }`. Fired once at the top of `runCascade(...)`, before the first `detectWinners` call. The canonical "a cascade round is now in flight" signal.
- `cascade:round:end` — `RunCascadeResult` (`{ chainLength, totalWinners, finalGrid, wasSkipped }`). Mirror of `cascade:round:start` — carries the round summary. Replaces what used to be `cascade:complete`.
- `cascade:chain:start` — `{ chain, winners, currentGrid }`. Fired inside `runCascade(...)` after `detectWinners` returns winners, before `destroySymbols` runs. `chain` is 1-indexed.
- `cascade:chain:end` — `{ chain, winners, nextGrid }`. Mirror of `chain:start` — fired after the refill drop-in settles, before the loop iterates to the next `detectWinners`.
- `cascade:destroy:start` / `cascade:destroy:end` — `{ cells }`. Fired around every `destroySymbols(...)` call (both direct and inside `runCascade`). Empty-batch calls do not emit. Use these to cue a shatter SFX, dim a HUD, or capture pre-destroy grids for replay logging — without overriding the cascade loop.

Event ordering per `runCascade()` call:

1. `cascade:round:start`
2. For each chain stage with winners: `cascade:chain:start` → `cascade:destroy:start` → (destroy tweens) → `cascade:destroy:end` → `onCascade` callback → pause → refill (`cascade:place:end` + `cascade:dropIn:*` per reel) → `cascade:chain:end`
3. `cascade:round:end`

Every cascade event now uses a consistent three-part `cascade:<scope>:<step>` taxonomy.
