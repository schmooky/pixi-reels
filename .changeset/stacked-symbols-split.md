---
'pixi-reels': minor
---

Add: one reel can change its cells at rest, for symbols that split when they win: a 1x3 stack becoming six single cells with its reel growing past the frame, or one symbol becoming two inside a reel that keeps its height.

- `reelSet.setColumn(reel, column, { height })` shows a column of any length on one reel.
  - `height: 'grow'` (the default): the cells keep their size and the reel grows. The board re-centres around it (the builder's default `reelAnchor`), and the viewport and mask follow.
  - `height: 'keep'`: the reel keeps its height and its cells resize to share it. On MultiWays this is the default and the only mode, within `[minCells, maxCells]`.
- `reelSet.splitSymbol(reel, cell, ids, { height })` turns the symbol covering a cell into `ids`, one per cell. Any symbol one reel wide splits: a 1x1, or a stack in full view. The cells above and below keep their symbols, and pins below move down with their symbols. It returns where the new cells are, so they can be animated.
- `reelSet.resetColumns()` takes every reel back to the cells it was built or added with, at their size.
- A new `column:set` event fires for each change, and a new `SetColumnOptions` type names the options.
- All three work between `expand()` steps, so a stack on a reel the board grows by can split too. `setColumn()` and `splitSymbol()` throw on a reel that a big symbol wider than one reel covers, since the reels a block spans share one geometry.

Fix: the builder picks a shared mask only for big symbols wider than one reel. A 1xN stack never crosses a reel gap, and one shared rectangle cannot clip reels of different heights: a shorter reel showed its buffer cells. `setColumn()` warns once (`shared-mask-jagged`) if a shared mask is still in use.
