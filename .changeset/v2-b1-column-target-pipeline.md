---
'pixi-reels': major
---

Remove: the internal negative-index buffer encoding. `ColumnTarget` is now carried unchanged from `setResult()` / `initialFrame()` all the way down to the reel, so no stage of the pipeline materializes `arr[-1]` string properties on an array any more.

What this changes for consumers:

- `Reel.placeSymbols(target)` takes a `ColumnTarget` instead of a `string[]`. Wrap a visible-only array as `{ visible: ids }`.
- `Reel.placeStrip(frame)` is new: it lands a full strip frame (index `0` = furthest buffer-above cell), which is the shape `FrameBuilder.build` returns. Custom stop/cascade phases should use this.
- `FrameContext.targetSymbols?: string[]` becomes `FrameContext.target?: ColumnTarget`. Middleware reads it with the new `getTargetSlot(target, row)` helper, or materializes it with `columnTargetToStrip(target, bufferAbove)`.
- `FrameBuilder.build` / `.buildAll` take `ColumnTarget` / `ColumnTarget[]` in the target position.
- `columnTargetToArray` is gone. `getTargetSlot`, `setTargetSlot`, `columnTargetToStrip` and `cloneColumnTarget` are exported in its place.
- `refill()` now validates a column against `visible.length` rather than the materialized array length, so a refill grid may carry `bufferAbove` / `bufferBelow` entries. Previously a `bufferBelow` entry made the column look too long and threw.
