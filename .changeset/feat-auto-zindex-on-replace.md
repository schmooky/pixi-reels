---
'pixi-reels': patch
---

Fix: `Reel._replaceSymbol` now sets the canonical zIndex inline on every symbol activation.

Previously the activate path set `view.zIndex = 0` and relied on a follow-up `refreshZIndex()` call to apply the real formula `(symbolData.zIndex ?? 0) * 100 + arrayIndex`. All current callers happen to call `refreshZIndex` after, but the contract was fragile: any future caller that swapped a single symbol via the activate path would see the wrong layering until the next motion-wrap.

A new private helper `_computeSymbolZIndex(symbolId, index)` centralizes the formula and is used by both `refreshZIndex` (full rescan) and `_replaceSymbol` (single-symbol activate). OCCUPIED stubs receive `arrayIndex` directly, matching what `refreshZIndex` would assign.

No public API change. The fix unblocks future single-symbol swap APIs (e.g. a public `setSymbolAt`) without forcing every caller to remember to `refreshZIndex` afterwards.
