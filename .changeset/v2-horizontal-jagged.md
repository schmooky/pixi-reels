---
'pixi-reels': major
---

Add: `orientation('horizontal')` now supports pyramids, MultiWays, and big symbols. The uniform-only guard at `build()` is gone, so every layout the engine offers works on either axis.

`Reel` stores its cell size axis-relative (`cellMain` along the strip, `cellCross` across it) and projects back to screen `(width, height)` whenever art is resized. A jagged horizontal set therefore varies cell WIDTH where a vertical one varies height, from the same arithmetic. New accessors: `Reel.cellMain`, `.cellCross`, `.mainGap`, `.crossGap`.

Breaking, beyond the v2 rename already listed:

- `reelExtents([...])` and `multiways({ reelExtent })` are MAIN-axis extents (pixel height for vertical, pixel width for horizontal). They were always the vertical reading; the name now means the same thing on both axes.
- `getBlockBounds` projects through the axis. `size.reels` spans the cross axis and `size.cells` the main axis in every orientation, so the screen width and height a block maps to invert under horizontal. The method name and return shape do not move.
- `PinOverlayTween` (part of `AdjustPhaseConfig`) is axis-relative: `cellWidth`/`oldCellHeight`/`newCellHeight`/`fromY`/`toY`/`x` become `cellCross`/`oldCellMain`/`newCellMain`/`fromMain`/`toMain`/`cross`.

Fixed along the way: MultiWays reshape derived its new cell size and its pin-overlay slot pitch from `symbolGap.y` unconditionally. On a horizontal set that is the CROSS gap, so reshaped reels came out the wrong length. Both now read the reel's own main gap (ADR 016 section 6.6).
