# ADR 023: A reel set grows by building real reels, and an expansion is one round

## Status: Accepted, implemented on `feat/infinite-reels`

## Context

"Infinity reels" games land a base board, then grow it sideways: while the win
still runs into the last reel the server adds another, and the round ends on a
board of whatever width the server decided. On MultiWays reels that is millions
of ways. The engine fixed the reel count at `build()`: every per-reel array, the
viewport, the mask rects and the pool capacity were sized from it, and nothing
could add a reel afterwards.

Three shapes were on the table:

1. **No engine change.** Chain one-reel sets in user code. It works today, but
   each set has its own pool, speed state and skip handling, spotlight and win
   lines cannot span sets, and a big symbol cannot straddle two of them.
2. **Chain inside `setResult()`.** Accept more columns than reels and append
   the extra reels within the same spin. One promise, but the steps the
   mechanic is about - pan to the new reel, land it, show the ways, then the
   next - have nowhere to happen.
3. **Grow the set, then spin the new reels.** Add reels to the live set and
   run each step as a spin of only those reels.

## Decision

**Grow the set with real reels.** The builder's reel construction became a
factory the set keeps (`ReelFactory`), so `addReels()` builds a reel exactly
the way `build()` built the first ones: same geometry, symbols, pool, axis,
curve, drive and mask. A per-reel builder array extends with its last entry.
The set's reel array is shared by the spin controller and the spotlight, so
they see new reels without being told; the few things sized from the count
(each reel's `reelCount`, viewport, mask rects, pool capacity, a group layout)
are re-synced in one place. `removeReels()` is the inverse and gives the memory
back.

No virtualization. A reel is a handful of symbols; a board of sixty reels is
cheap, and `removeReels()` at the end of the round bounds a session. Mapping
logical to physical reels would touch every reel-indexed API for a board size
no game reaches.

**An expansion is a chain of held spins that count as one round.** `expand()`
adds a step's reels, spins with every earlier reel held, hands the step its
columns, awaits the landing and the game's hooks, and repeats. Two things
change for those spins, both internal to the controller:

- **They continue the round.** The skip stage and a boosted speed carry over
  instead of resetting, so a press in one step slams it and turbos the rest,
  exactly what `skipSpin()` does to the rest of any round. Pin turns and
  `'eval'` pins are not spent per step.
- **They stagger by place, not index.** Start and stop delays count a reel's
  position among the reels that spin, so reel 40 does not wait forty delays.

`holdReels` spins keep the index stagger they always had.

**Validate the whole expansion before the first reel exists.** Columns, buffer
counts, MultiWays shapes and big-symbol fit are checked up front, so a bad
result throws on an untouched board. A step that a big symbol would straddle is
widened to take the block whole; the plan walks the columns the way the
big-symbol coordinator does, so a replayed block is read as one.

**The shape comes from the result.** A column's `visible.length` is its reel's
cell count: MultiWays applies it with `setShape()` for the step, a jagged set
builds the reel at that height (never taller than the tallest reel, which would
move every reel on the board).

**Win math stays out (ADR 007).** The pay-ways evaluator the recipes use lives
in `@pixi-reels/cheats/ways` beside the other server stand-ins. The library
only draws: `WinLines` in `pixi-reels/debug` strokes the cells it is handed.

## Consequences

- New public API: `addReels()`, `removeReels()`, `expand()`, and the events
  `reels:added`, `reels:removed`, `expand:start`, `expand:step`,
  `expand:stepLanded`, `expand:complete`. Additive.
- `Reel.reelCount` became a getter that follows the board.
- Destroying one reel of a live set used to destroy the views of symbols it had
  released to the shared pool. Harmless on a full teardown, fatal on a partial
  one; `Reel.destroy()` now detaches them.
- `curveFocus('set')` keeps converging on the build-time board centre after the
  board grows.
- A press between steps (while a hook runs) finds the engine idle. A game that
  wants it to mean "fast-forward" aborts the expansion's `signal`, which lands
  everything left in one step.
