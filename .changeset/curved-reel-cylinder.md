---
'pixi-reels': minor
---

Add: reel curvature. `builder.curve(0.45)` projects the set onto a drum, `builder.curvePerReel([...])` gives each reel its own camera, and `reelSet.setCurve(...)` re-projects at runtime for tuning. `amount` is how far round the drum the window sees; `depth` is how strong the perspective is, capped below the angle at which cells would fold back over each other. A set with no `curve()` builds no curve object and is unchanged.

**The cell facing the camera is drawn at 1:1** - authored size, both axes, no keystone - and everything else bends around it. That has a consequence worth planning for: a drum whose middle is 1:1 cannot also reach the window edges. Its ends fall short, the buffer cells fill that band compressed as they curve away, and you frame or mask it the way a real cabinet's bezel does. Normalizing to the window edges instead would magnify the main axis at the centre while leaving the cross axis alone, i.e. a visibly stretched middle row.

**Two ways to draw it.**

`curveMode('symbol')` (default) projects each cell on its own - crisp, free, and a real keystone, but only for content that IS a texture, because a `Container` transform is affine. The engine hands each symbol a projected quad through the new `ReelSymbol.applyCellQuad()`; `SpriteSymbol` and `AnimatedSpriteSymbol` draw it through a PixiJS `PerspectiveMesh` at no extra render pass. Everything else (Spine, `Graphics`, composite subtrees) takes the closest affine fit: a UNIFORM scale sized to fit inside the projected footprint, so art is never distorted along one axis and no cell overlaps its neighbour. `PerspectiveCell` and `canProjectTexture()` are exported for custom texture-backed symbols.

`curveMode('warp')` + `renderer(app.renderer)` bends the whole reel instead - each reel is rendered to a texture and drawn through a mesh whose VERTICES are displaced by the projection. Spine, atlas art, text and composites all bend, no symbol cooperates, and because the bend is on the rendered reel rather than in each cell, the spin, the stop bounce and cascade falls travel ALONG the curve instead of translating flat. Costs one render pass per reel per frame plus one resample; `build()` throws without a renderer.

KNOWN LIMITATION (`'symbol'` mode only): an ATLAS sub-frame does not take the mesh path. The mesh addresses its source with plain 0..1 UVs and remapping them onto the frame has not produced a correct draw, so `canProjectTexture()` refuses those and the symbol takes the affine fit - correct, but not keystoned. That is most production art. `'warp'` has no such limit, since a render texture owns its whole source.

`builder.curveFocus('reel' | 'set-lean' | 'set')` picks where the camera stands across the strip: one per reel (default, five separate drums), one on the middle of the board (receding cells lean IN and the grid reads as one wide cylinder), or halfway. Anything but `'reel'` auto-selects `SharedRectMaskStrategy`, since the lean crosses each reel's own column.

`builder.curveBleed(px)` gives the warp texture room across the strip for art wider than its cell - an overflowing mystery or scatter plate - so the overhang is captured, warped with everything else, and hangs over its neighbours instead of being sliced at the texture edge. `MaskContext` gains a matching `bleed` so `SharedRectMaskStrategy` stops clipping it back to the board, which mattered most at the outermost reels where the overhang leaves the board entirely. Defaults to `0`; the field is read defensively so a `MaskContext` built before it existed still yields a valid mask.

`ReelSet.getCellQuad(reel, cell)` returns the four corners a curved cell is actually drawn on, or `null` when flat - `getCellBounds()` has to return a rectangle and widens to the trapezoid's bounding box. Outline with the quad, hit-test with the box. The debug overlay's `cells` and `buffers` layers use it, so the overlay shows the projection rather than a box around it.

Art that does not fill its cell reports its real footprint through the new `ReelSymbol.cellInset`, derived automatically from an atlas frame's trim, so a small symbol is projected where it actually sits instead of being inflated to the cell's edges.

The projection never touches a view's `position`, so landing, wrapping, cascades, big symbols and MultiWays reshapes are unaffected.

Also fixes `ReelSymbol.playDestroy()` compensating its pivot move by the raw offset instead of the offset times scale, which made a scaled symbol jump on the first frame of the destroy animation.
