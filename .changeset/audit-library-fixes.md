---
'pixi-reels': major
---

Fix: cascade grids are validated, the debug snapshot follows the travel axis, and `Gsap` is exportable.

**`refill()` and `runCascade()`'s `nextGrid` now validate their grid**, the same way `setResult()` always has: shape, v1 option keys, and buffer counts that fit the reels. They previously validated nothing, so a cascade grid still carrying a v1 `bufferAbove` reached `columnTargetToStrip`, came back `undefined`, and was silently random-filled on every stage of the chain -- the exact silent divergence the fail-loud guards exist to prevent. A `string[][]` grid threw a bare `TypeError` deep in the pipeline instead of naming the call. Errors name their own entry point, so a bad `nextGrid` says `runCascade(): nextGrid` rather than surfacing as a `refill()` failure two frames later.

The buffer-overflow message now reads `setResult()` rather than `setResult`, matching every other message from that call.

**`DebugReelSnapshot.allSymbols[].y` is now `.main`**, the coordinate along that reel's travel axis, and each reel reports its `orientation` and `direction`. The old field was hard-coded to `view.y`, so on a horizontal set every symbol reported a constant `0` -- no positional information at all, in the one orientation 2.0 exists to add. This is the surface agents are pointed at precisely because the canvas is opaque to them.

**`Gsap` is exported.** It is the second parameter of `driveGsapWithTicker`, the type of `ReelConfig.gsap`, and the return type of the `Reel.gsap` accessor, but it could not be named by a consumer.

**The v1 rename tables are no longer exported.** `CODEMOD_HINT`, `V1_BUILDER_METHODS`, `V1_OPTION_KEYS` and `V1_OPTION_VALUES` were public, which would have semver-locked 1.x migration scaffolding into all of 2.x. The guards still read them internally and every throw still names the replacement; nothing a consumer writes needs the table.

Fix: a `nudge()` on a jagged layout no longer displaces symbols that render above the mask. `ReelMotion.advance()` derives positions from the array index and writes them absolutely (it accumulated with `+=` in 1.x), which dropped the reel offset baked into any view lifted into `viewport.unmaskedContainer`. A nudge is the one path that moves the strip while the reel is at rest, so an `unmask: true` symbol on a pyramid reel jumped a full cell out of its column for the whole tween and snapped back at the end.
