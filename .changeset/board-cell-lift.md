---
'pixi-reels': minor
---

Add: `BoardGrid.lift(cell)` / `HoldAndWinBoard.lift(cell)` - draw one cell's lifted art in front of every other cell's until the returned release is called, for a symbol whose one-shot must not be overlapped by a neighbour's art.

Promotion is a second render layer rather than a bigger `zIndex`, so it is a separate channel from the at-rest order: `refreshCellZIndex()` keeps ordering the lifted cell underneath the lift - and the board keeps calling it on every `place` and every landing - while the release restores the cell's place exactly, recomputing nothing. Writing `zIndex` by hand cannot express this: any landing mid-animation drops the cell back into the pack.

Lifts are reference-counted per cell, releases are idempotent, and `liftedCells` reports what is up. `reset()` and `destroy()` drop every outstanding lift; `respin()` deliberately does not, so a presentation may span one. The lift covers the art the engine hoists out of a cell for a symbol registered `unmask: true`; a masked cell is clipped to itself and cannot overlap a neighbour, so lifting one is a documented no-op.

Add: `BoardGrid.dim({ except, amount, fade })` / `HoldAndWinBoard.dim(...)` - push every cell but the named ones into the background for a beat, the partner of `lift()`. One rectangle per dimmed cell, drawn above the cells' lifted art and below anything lifted, so a lifted cell stays out in front of the dim. It fades in and back out over `fade` ms (`DEFAULT_DIM_FADE_MS`, 180) off the board's own ticker, and an interrupted fade resumes from what is on screen over the proportional share of the duration, so nothing jumps; `fade: 0` cuts. Only one dim at a time is meaningful, so a second call throws instead of silently replacing the first.

Add: `ReelSet.promote(positions)` - raise symbols above the mask and above every other symbol, with no dim, no `playWin()` and nothing to await, which previously meant asking `spotlight.show()` for a whole presentation and switching every part of it off. Views attach to the new `ReelViewport.promotedLayer` instead of being reparented, so nothing moves and nothing has to be put back. A swap under a promoted symbol ends that symbol's promotion, so the layer never holds a view the pool has taken back.

Add: `HoldAndWinBoard.refreshCellZIndex()` - already public on `BoardGrid` but unreachable from the board a game holds, which left a resolver depending on state the library does not watch with no way to say "ask me again".

A consumer that calls none of these sees no behaviour change.
