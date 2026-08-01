---
'pixi-reels': major
---

Change: `MaskStrategy.build` / `.update` take a single `MaskContext` (`{ rects, width, height, axis }`) instead of positional arguments, and every strategy must declare `readonly version = MASK_STRATEGY_VERSION`.

Only affects custom strategies; `RectMaskStrategy` and `SharedRectMaskStrategy` are unchanged to use.

A `ReelMaskRect` is screen-space, so which of its four numbers runs along the strip depends on the orientation: a vertical set puts the strip on `y`/`height`, a horizontal one on `x`/`width`. A strategy written for v1 receives an identically-shaped struct with transposed meaning and no compile error - and handed a `MaskContext` it would read `rects` as an object, find no `.length`, and quietly draw a full-bleed rect that clips nothing. `maskStrategy()` now throws by name on any strategy that does not declare version 2. `MaskContext` and `MASK_STRATEGY_VERSION` are exported.
