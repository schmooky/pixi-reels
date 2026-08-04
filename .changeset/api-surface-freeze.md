---
'pixi-reels': major
---

Fix: three public members no longer re-expose classes the package deliberately hides, and `HoldAndWinBoardConfig` is now exported.

`RandomSymbolProvider`, `StopSequencer` and `ReelMotion` were hidden from the package entry in 1.0.0 (PR #140). Three public members were still typed with them -- `Reel.motion`, `Reel.stopSequencer`, `FrameBuilder.randomProvider` -- which put those classes back into `dist/core/Reel.d.ts` and would have semver-locked them into all of 2.x. All three are now `@internal`, so `stripInternal` keeps them out of the published types. Nothing is lost: reel geometry is on `ReelSet.getCellBounds()` / `getBlockBounds()` and `Reel.cellMain` / `.extent` / `.mainOffset`, landing is driven by `setResult()` / `slamStop()`, and symbol weights are configured via `builder.weights({...})`.

`HoldAndWinBoardConfig` is now exported. The board's own export block promises that a fork can "copy HoldAndWinBoard + HoldAndWinState, repoint their imports at `pixi-reels`, and everything they reach for is public" -- but the config the constructor takes was not, so the first line of a forked board could not be typed.

A new `check:api-surface` guard fails the build on any public member typed with a `src/` type no entry point exports, so this cannot silently regress. Constructor parameters are reported separately and waived by name: tagging a constructor `@internal` strips the whole signature and leaves consumers an implicit zero-arg `new Reel()` that typechecks and then throws, which is worse than the leak.

Fix: `destroySymbols()` now names the reel and cell when a visible cell has no symbol. The coordinate range check already passed at that point, so a miss means the strip is short or holed -- a reel torn down or reshaped while a cascade was in flight. It previously surfaced as `Cannot read properties of undefined (reading 'view')` from inside an `Array.map`, naming neither the cell nor the reel.
