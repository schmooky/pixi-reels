---
'pixi-reels': minor
---

Add: big-symbol anchors can now sit in bufferAbove or bufferBelow. The classic UK fruit-machine landing — a 1xH wild lands with most of it hidden above the visible window, only the bottom cell ("the tail") shows at row 0 — works end-to-end through `setResult`, `refill`, and `nudge`.

`_coordinateBigSymbols` now iterates the full strip range (`-bufferAbove` to `visibleRows + bufferBelow`) and validates against strip capacity instead of just visible. Anchors at any strip slot are accepted as long as the block fits end-to-end. Pass an anchor at `bufferAbove[i]` via the explicit `ColumnTarget` form (`{ visible: [...], bufferAbove: [...] }`) or via the legacy `frame[col][-1]` negative-index form; the coordinator paints OCCUPIED stubs at the rest of the block's cells (in buffer, visible, or buffer-below as needed).

The validation error message changed: `exceeds reel height` was visible-only; now reads `extends past the bottom of the strip` with the exact computed values. The new check is more permissive — a 1x4 block on a 3-visible-row reel with 1 bufferBelow is now LEGAL where it previously threw.

`getSymbolFootprint` may return a negative `anchor.row` for blocks anchored in bufferAbove. `getBlockBounds` handles this by computing pixel coordinates from the row offset directly rather than delegating to `getCellBounds` (which still rejects negative rows). Consumers reading `anchor.row` should accept negative values.

Live recipe: `/recipes/big-symbol-partial-land/`.
