# ADR 010: Cascade physics — per-survivor fall distance

## Status: Accepted (load-bearing)

## Context

The original `@g-slots/reels` library (which pixi-reels was forked from) handles a cascade drop by tweening every symbol in a column to its final grid position. That's fast to write and broadly "works," but it violates a basic visual expectation: **a survivor symbol that has no cleared slots below its original row should not move**. In the naive implementation, every cell in the column animates on every cascade, and the trained eye reads that as a reel respin, not a cascade.

We hit this exact bug twice in the demo build (scatter-triggers-fs and cascade-multiplier), and users complained both times.

## Decision

**`tumbleToGrid(reelSet, nextGrid, winners, opts)` computes per-survivor fall distance from the winner list. Cells whose computed fall distance is zero are never touched.** No animation job is created for them, their `view.y` is not mutated, they sit on the grid unchanged.

### The algorithm, per column

Let `V` = visible rows, `winnerRows` = rows of the column that were removed (ascending), `nonWinnerRows` = surviving rows in order, `winCount = winnerRows.length`.

After `reel.placeSymbols(nextGrid[r])` puts the new symbols at their correct final grid positions, walk final row `R` from 0 to `V - 1`:

| Condition on R | Kind | Pre-drop offset (slots above target) |
|---|---|---|
| `R < winCount` | New symbol filling a cleared top slot | `R + 1` (staggered entrance: row 0 from 1 slot up, row 1 from 2, …) |
| `R >= winCount` | Survivor from original row `nonWinnerRows[R - winCount]` | `R - originalRow` — **zero means: do not touch this cell.** |

The tween runs in one pass with `easeOutCubic`.

### Why `diffCells` is a trap for pattern cascades

`diffCells(prev, next)` returns cells whose symbol id changed. That's the right answer when the only changed cells are new symbols falling from above *and the survivors never slide past cleared slots*. But with a winner at the bottom of a column, survivors slide down; every row's symbol id changes; `diffCells` reports every row as a "winner"; `tumbleToGrid` treats survivors as new symbols falling from above; the whole column animates. Visually: a reel respin, not a cascade.

**Rule**: callers with a pattern cascade (match-3, scatter cluster, line match) must pass a semantic `winners` list derived from their match logic, not from `diffCells`. `runCascade` supports this via an explicit `winners: (prev, next) => Cell[]` option. The default is still `diffCells` for the gravity-clean common case.

## Consequences

### Positive

- Cascade demos look correct. The visual matches the player's expectation.
- The invariant is enforced by four targeted tests in `tests/integration/cascadeLoop.test.ts` — covering top-winner, bottom-winner, middle-winner, and stacked-top-winners cases. A naive implementation fails those tests immediately.
- `runCascade`'s API stays simple: array or `AsyncIterable` of stages, one callback each for vanish and landing.

### Negative

- The cheat-engine cascade sequences (`cascadeSequence`, `cascadingStages`) must be physically valid or the demo authoring is more fiddly. The `/recipes/remove-symbol/` page documents the trap and shows the correct pattern.
- Adopters sometimes want "just respin the whole column" for a particular mechanic. Nothing stops them — they use `reelSet.spin() + setResult()` instead of `tumbleToGrid`. The library has both.

## Verification

```ts
// Winner at the middle of a 5-row column. Survivors above should fall 1,
// survivors below should not move at all.
const h = createTestReelSet({ reels: 1, visibleRows: 5, symbolIds: ['a','b','c','d','e','x'] });
await h.spinAndLand([['a','b','c','d','e']]);

const movedRows: number[] = [];
await tumbleToGrid(h.reelSet, [['x','a','b','d','e']], [{ reel: 0, row: 2 }], {
  animate: async (_d, onFrame) => {
    for (let row = 0; row < 5; row++) {
      const y = h.reelSet.getReel(0).getSymbolAt(row).view.y;
      if (y < row * SLOT_HEIGHT - 0.5) movedRows.push(row);
    }
    onFrame(1);
  },
});
// Rows 0, 1, 2 animated. Rows 3, 4 are untouched.
expect(movedRows.sort()).toEqual([0, 1, 2]);
```
