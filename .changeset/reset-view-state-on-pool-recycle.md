---
'pixi-reels': patch
---

`ReelSymbol.activate()` and `ReelSymbol.deactivate()` now both reset the container's `alpha`, `scale`, `rotation`, `filters`, and `zIndex`. Previously a subclass that decorated `view` from a spin-lifecycle hook (e.g. attaching a `BlurFilter` in `onReelSpinStart`) had to remember to undo every property on its own — and any path that skipped a hook (a buffer cell that exited spin without `onReelSpinEnd`, a slam-stop that bypassed the lifecycle) left a recycled symbol carrying stale state into its next life. The most visible symptom was a "blurred" cell appearing after a cascade refill once a symbol had been pooled mid-spin.

`ReelSymbol.destroy()` now inlines the lifecycle hooks (`stopAnimation`, `onDeactivate`) instead of going through `deactivate()`, so it doesn't try to reset transform / filter state on a view that was already torn down by a parent `container.destroy({ children: true })`.

The same-id early-return path inside `Reel._setSymbolAt` bypasses the deactivate/activate cycle, so the matching reset has been added there too.

No public API change. Subclasses that already cleared their own filter / transform state continue to work and just do a few redundant assignments.
