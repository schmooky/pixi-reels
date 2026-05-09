---
'pixi-reels': minor
---

Add `Reel.setSymbolAt(visibleRow, symbolId)` — public API for swapping a single visible cell's symbol identity in place.

Useful for live presentation effects that don't fit the `setResult` / `placeSymbols` flow:

- converting a symbol to a wild after a cascade pop,
- dropping in a "respin" symbol on a held reel,
- swapping to a sticky variant after a win is paid out.

The method funnels into the same internal activate path as the rest of the engine, so the swapped-in symbol gets its proper parent (masked vs unmasked container), `zIndex`, and visual reset for free — no follow-up `refreshZIndex` required.

Validation:
- throws if `visibleRow` is not an integer in `[0, visibleRows)`,
- throws if `symbolId` is not registered,
- throws if the target row is a non-anchor cell of a big-symbol block (you must swap the anchor row directly or rebuild the frame via `placeSymbols`).

Emits `symbol:created` on the per-reel event bus, matching motion-driven swaps.
