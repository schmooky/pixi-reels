---
"pixi-reels": minor
---

Add: rectangular Hold & Win cells and per-axis gaps. `HoldAndWinBuilder.cellSize` takes `{ width, height }` as well as a number, and its options accept `columnGap` / `rowGap` beside the uniform `gap`. `BoardGrid` gains the same (`cellSize: number | { width, height }`, `columnGap`, `rowGap`) and exposes `cellWidth`, `cellHeight`, `columnGap`, `rowGap`; `cellSize` and `gap` remain as deprecated aliases. `cellChrome` / `chrome` callbacks now receive `(graphics, width, height)` - a square-board callback that reads one size argument keeps working. `HoldAndWinBuilder.cellMask(factory)` / `BoardGrid` option `mask` supply each cell's mask strategy, for example a `RoundedRectMaskStrategy` so rounded cell corners match a rounded frame.
