---
'pixi-reels': minor
---

Add: one reel can change height at rest, for stacked symbols that split when they win (a 1x3 becoming six single cells, its reel growing past the frame).

- `reelSet.setColumn(reel, column)` shows a column of any length on one reel at its own cell size. The board re-centres around it (the builder's default `reelAnchor`), and the viewport and mask follow.
- `reelSet.splitBlock(reel, cell, ids)` turns the stack covering a cell (a big symbol one reel wide, two or more cells tall) into `ids`, one per cell. The reel grows by the difference, the cells above and below keep their symbols, and pins below move down with their symbols. It returns where the new cells are, so they can be animated.
- `reelSet.resetColumns()` takes every reel back to the cells it was built or added with.
- A new `column:set` event fires for each change.
- All three work between `expand()` steps, so a stack on a reel the board grows by can split too.

Fix: the builder picks a shared mask only for big symbols wider than one reel. A 1xN stack never crosses a reel gap, and one shared rectangle cannot clip reels of different heights: a shorter reel showed its buffer cells. `setColumn()` warns once (`shared-mask-jagged`) if a shared mask is still in use.
