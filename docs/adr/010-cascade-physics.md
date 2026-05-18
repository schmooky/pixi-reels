# ADR 010: Cascade physics — per-survivor fall distance

## Status: Accepted (load-bearing)

## Context

The original `@g-slots/reels` library (which pixi-reels was forked from) handles a cascade drop by tweening every symbol in a column to its final grid position. That's fast to write and broadly "works," but it violates a basic visual expectation: **a survivor symbol that has no cleared slots below its original row should not move**. In the naive implementation, every cell in the column animates on every cascade, and the trained eye reads that as a reel respin, not a cascade.

We hit this exact bug twice in the demo build (scatter-triggers-fs and cascade-multiplier), and users complained both times.

## Decision

**`reelSet.refill({ winners, grid })` computes per-survivor fall distance from the winner list. Cells whose computed fall distance is zero are never touched.** No animation job is created for them, their `view.y` is not mutated, they sit on the grid unchanged. The algorithm is exported as `computeDropOffsets(visibleRows, winnerRows)` so consumers can validate server-side gravity sims offline.

### The algorithm, per column

Let `V` = visible rows, `winnerRows` = rows of the column that were removed (ascending), `nonWinnerRows` = surviving rows in order, `winCount = winnerRows.length`.

After `reel.placeSymbols(visible)` puts the new symbols at their correct final grid positions, walk final row `R` from 0 to `V - 1`:

| Condition on R | Kind | Pre-drop offset (slots above target) |
|---|---|---|
| `R < winCount` | New symbol filling a cleared top slot | `R + 1` (staggered entrance: row 0 from 1 slot up, row 1 from 2, …) |
| `R >= winCount` | Survivor from original row `nonWinnerRows[R - winCount]` | `R - originalRow` — **zero means: do not touch this cell.** |

The tween runs through `CascadeDropInPhase` with the builder's configured `dropIn` ease and stagger.

### Why a grid-diff is a trap for pattern cascades

A naive "diff the two grids and call everything changed a winner" approach gives the right answer when the only changed cells are new symbols falling from above *and the survivors never slide past cleared slots*. But with a winner at the bottom of a column, survivors slide down; every row's symbol id changes; the diff reports every row as a "winner"; the refill animates every cell as a new arrival from above. Visually: a reel respin, not a cascade.

**Rule**: the library's public API takes a `Cell[]` of **match winners**, not a diff. Inside `reelSet.runCascade({ detectWinners, nextGrid })`, your `detectWinners` callback returns the cells your game rules consider winners — never a diff of two grids.

## Consequences

### Positive

- Cascade demos look correct. The visual matches the player's expectation.
- The invariant is enforced by targeted tests in `tests/unit/runCascade.test.ts` and `tests/unit/cascadeAlgorithm.test.ts` — covering top-winner, bottom-winner, middle-winner, and stacked-top-winners cases. A naive implementation fails those tests immediately.
- `runCascade`'s API stays simple: two callbacks (`detectWinners`, `nextGrid`), the library owns the timing.

### Negative

- Cheat-engine cascade sequences (`cascadeSequence`, `cascadingStages`) must be physically valid or the demo authoring is more fiddly. The `/recipes/remove-symbol/` page documents the trap and shows the correct pattern.
- Adopters sometimes want "just respin the whole column" for a particular mechanic. Nothing stops them — they use `reelSet.spin() + setResult()` instead of `refill()`. The library has both.

## Verification

```ts
import { computeDropOffsets } from 'pixi-reels';

// Winner at the middle of a 5-row column. Survivors above should fall 1,
// survivors below should not move at all.
const offsets = computeDropOffsets(5, [2]);
expect(offsets.find(o => o.row === 0)?.offsetRows).toBe(1); // new top
expect(offsets.find(o => o.row === 1)?.offsetRows).toBe(1); // survivor row 0 → 1
expect(offsets.find(o => o.row === 2)?.offsetRows).toBe(1); // survivor row 1 → 2
expect(offsets.find(o => o.row === 3)?.offsetRows).toBe(0); // survivor row 3, no move
expect(offsets.find(o => o.row === 4)?.offsetRows).toBe(0); // survivor row 4, no move
```
