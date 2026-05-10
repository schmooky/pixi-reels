---
'pixi-reels': minor
---

Add `Reel.setSymbolAt(visibleRow, symbolId)` and `ReelSet.setSymbolAt(col, row, symbolId)` — public API for swapping a single visible cell's symbol identity in place at rest.

Useful for live presentation effects that don't fit the `setResult` / `placeSymbols` flow:

- converting a symbol to a wild after a cascade pop,
- swapping to a sticky variant after a win is paid out.

The method funnels into the same internal activate path as the rest of the engine, so the swapped-in symbol gets its proper parent (masked vs unmasked container), `zIndex`, and visual reset for free — no follow-up `refreshZIndex` required.

Validation (all guards fail loud):
- throws if the reel is in motion (`speed !== 0` or `isStopping`) — a mid-spin swap would be overwritten by the next wrap/stop frame anyway.
- throws if `visibleRow` is not an integer in `[0, visibleRows)`.
- throws if `symbolId` is not registered.
- throws if the target row is a non-anchor cell of a big-symbol block.
- throws if the target row currently holds the anchor of a big-symbol block — big blocks span multiple cells (and possibly reels) and require `placeSymbols` plus the cross-reel OCCUPIED coordinator.
- throws if `symbolId` itself is a big symbol — same reason.
- `ReelSet.setSymbolAt` additionally throws if the cell currently has an active pin; call `unpin(col, row)` first to overwrite.

Emits `symbol:created` on the per-reel event bus, matching motion-driven swaps.
