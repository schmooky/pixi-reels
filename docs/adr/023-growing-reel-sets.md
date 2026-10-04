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
  instead of resetting, so a press in one step slams it and speeds up the rest,
  exactly what `skipSpin()` does to the rest of any round: turbo in standard
  mode, an instant landing for every later step in cascade mode, the way a
  press auto-slams a cascade's later refills. Pin turns and `'eval'` pins are
  not spent per step.
- **They stagger by place, not index.** Start and stop delays count a reel's
  position among the reels that spin, so reel 40 does not wait forty delays.
  A named drop order (`setDropOrder('ltr' | 'rtl' | 'all')`) counts the same
  way, so it covers reels added after it was set.

`holdReels` spins keep the index stagger they always had.

**Validate the whole expansion before the first reel exists.** Columns, symbol
ids, buffer counts, MultiWays shapes and big-symbol fit are checked up front, so
a bad result throws on an untouched board. A step that a big symbol would straddle is
widened to take the block whole; the plan walks the columns the way the
big-symbol coordinator does, so a replayed block is read as one.

**The shape comes from the result.** A column's `visible.length` is its reel's
cell count: MultiWays applies it with `setShape()` for the step, a jagged set
builds the reel at that height (never taller than the tallest reel, which would
move every reel on the board).

**Rows grow at rest, between steps.** `addRows()` / `removeRows()` change
every reel's row count at its own cell size, the board's height with it, and
the factory measures the tallest strip from the board as it is rather than
as the builder made it. They are allowed between `expand()` steps (in
`onStepLanded`) and nowhere a step is in flight: a step's columns were sized
for the board's height when it started. A column taller than the board is
therefore checked when its step starts, not up front. MultiWays is out: there
a reel's rows are its shape, set per spin. Both re-place every reel through the
big-symbol coordinator, so a block stays one block. A block already on the
board never makes them throw: one cut at the right edge by `removeReels()`
stays cut, and one that no longer fits a shorter strip is random-filled: no
slots lie under its overhang, which a reel travelling up would scroll into view.

**One reel's cells, at rest.** Symbols that split when they win change one
reel, not every reel: a 1x3 stack becoming six single cells, its reel growing
past the frame, or one symbol becoming two inside a reel that keeps its
height. `setColumn(reel, column, { height })` is the primitive: one reel shows
a column of any length. Under `height: 'grow'` (the default) the cells keep
their size and the board re-anchors around the reel through the builder's
`reelAnchor`, whose default `'center'` grows it both ways. Under `'keep'` the
reel keeps its height and its cells share it, the same reshape a MultiWays
landing does, so on MultiWays it is the default and the only mode, within
`[minCells, maxCells]`. `splitSymbol(reel, cell, ids)` builds the column for
the common case, from the symbol covering a cell (any symbol one reel wide)
and the server's ids, and moves the pins below it down with their symbols.
`resetColumns()` goes back to each reel's built or added cells and cell size.
Only new content is held to a landing's fit rule, so a reset never throws on a
board that is already on screen, and reels whose symbols do not change are not
re-placed, so their animations carry on. A block wider than one reel spans
reels that share one cell size and offset, so neither call touches a reel such
a block covers. A shared mask cannot clip reels of different heights, so the
builder now auto-picks one only for blocks wider than a reel, and `setColumn()`
warns once if one is in use.

**Win math stays out (ADR 007).** The pay-ways evaluator the recipes use lives
in `@pixi-reels/cheats/ways` beside the other server stand-ins. The library
only draws: `WinLines` in `pixi-reels/debug` strokes the cells it is handed.

## Consequences

- New public API: `addReels()`, `removeReels()`, `addRows()`, `removeRows()`,
  `setColumn()`, `splitSymbol()`, `resetColumns()`,
  `expand()`, `isExpanding`, and the events `reels:added`, `reels:removed`,
  `rows:added`, `rows:removed`, `column:set`, `expand:start`, `expand:stepAdded`,
  `expand:stepLanded`, `expand:complete`, `expand:end`. Additive.
- A fast-forward (an aborted `signal`) lands every reel still to come in one
  step at the board's height then, so it cannot cross a row that grows during
  the expansion.
- `Reel.reelCount` became a getter that follows the board.
- Destroying one reel of a live set used to destroy the views of symbols it had
  released to the shared pool, because a released view stayed parented to the
  reel. Harmless on a full teardown, fatal on a partial one. A release now
  detaches the view, and `Reel.destroy()` releases its live symbols to the pool
  instead of destroying them, so an animation still running on a removed reel
  stops with its symbol (`deactivate()`) rather than firing into a dead view.
- `curveFocus('set')` keeps converging on the build-time board centre after the
  board grows.
- A press between steps (while a hook runs) finds nothing spinning, so the
  round carries it: `skipSpin()` and `requestSkip()` queue it (`skip:queued`)
  and the next step fires it the moment it has its result. A game that wants
  a press to mean "fast-forward" aborts the expansion's `signal` instead,
  which lands everything left in one step.
