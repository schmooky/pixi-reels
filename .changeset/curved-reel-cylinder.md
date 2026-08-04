---
'pixi-reels': minor
---

Add: reel curvature by perspective projection. `builder.curve(0.45)` projects the whole set onto a drum, `builder.curvePerReel([...])` gives each reel its own camera, and `reelSet.setCurve(...)` re-projects at runtime for tuning. `amount` is how far round the drum the window sees; `depth` is how strong the perspective is, capped below the angle at which cells would fold back over each other.

Cells become real TRAPEZOIDS, not scaled rectangles: the edge that has rotated further away is genuinely narrower, and the art keystones with it. A `Container` transform is affine and cannot express that, so the engine hands each symbol a projected quad through the new `ReelSymbol.applyCellQuad()`. `SpriteSymbol` and `AnimatedSpriteSymbol` draw it with a PixiJS `PerspectiveMesh` at no extra render pass, since their content is already a texture; anything else (Spine, composite containers) falls back to the closest affine fit, a UNIFORM scale so art is never distorted along one axis. `PerspectiveCell` is exported for custom texture-backed symbols.

`builder.curveFocus('reel' | 'set-lean' | 'set')` picks where the camera stands across the strip. `'reel'` (default) puts one dead ahead of each reel, so every reel is its own drum; `'set'` puts a single camera in front of the middle of the board, so receding cells also lean IN toward the centre and the grid reads as one wide cylinder; `'set-lean'` is halfway. A leaning set auto-selects `SharedRectMaskStrategy`, since the overhang crosses each reel's own column.

Art that does not fill its cell is handled: symbols report their real footprint through the new `ReelSymbol.cellInset`, derived automatically from an atlas frame's trim, so a small symbol is projected where it actually sits instead of being inflated to the cell's edges.

The projection never touches a view's `position`, so landing, wrapping, cascades, big symbols and MultiWays reshapes are unaffected, and the visible cells still fill the window exactly. `getCellBounds()` / `getBlockBounds()` report the projected cell's bounding box so paylines follow the curve. A set with no `curve()` builds no curve object and is unchanged.

Also fixes `ReelSymbol.playDestroy()` compensating its pivot move by the raw offset instead of the offset times scale, which made a scaled symbol jump on the first frame of the destroy animation.
