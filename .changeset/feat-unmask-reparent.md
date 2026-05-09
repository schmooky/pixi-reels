---
'pixi-reels': minor
---

Make `SymbolData.unmask: true` actually re-parent the symbol view to `viewport.unmaskedContainer`.

Until now the `unmask` flag on `SymbolData` was accepted by the builder but never read by the engine — symbols always landed inside the reel's masked container regardless of the flag. With this change, every code path that places a symbol into the reel — `_setupSymbolPositions`, `_replaceSymbol` (both stub-install and stub-replace branches and the regular swap), and `reshape` — consults `_symbolsData[id].unmask` and parents the view to `viewport.unmaskedContainer` when set.

When unmasked, the engine sets the view's X to `reel.container.x` and adds `reel.container.y` to the view's Y so the at-rest cell position aligns with the reel column (since `unmaskedContainer` sits at viewport-local 0,0).

Documented limitation in `SymbolData.unmask` JSDoc: `ReelMotion` writes `view.y` in reel-local coords every frame, so an unmasked symbol on the strip will appear shifted vertically by `reel.container.y` while the reel is spinning. Treat `unmask: true` as a *landed-state* flag — it is correct at rest and during static frames, but not designed to stay visually accurate while the reel is spinning. For mid-spin "stays visible above mask" overlays, use a cell pin instead.
