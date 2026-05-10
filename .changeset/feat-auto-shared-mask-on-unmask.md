---
'pixi-reels': minor
---

Auto-pick `SharedRectMaskStrategy` when any registered symbol has `unmask: true` and `symbolGap.x > 0`.

The default `RectMaskStrategy` draws one mask rect per reel, with the gaps between reels NOT clipped — fine in the common case. But when an `unmask: true` symbol renders above the reel mask, neighboring (still-masked) symbols on adjacent reels visibly clip at the column gap, and players see a half-cropped neighbor next to the unmasked overlay.

The auto-pick now triggers in either case:
- **big symbols** registered (`SymbolData.size` with `w > 1` or `h > 1`), or
- **unmasked symbols** registered (`SymbolData.unmask: true`),

provided the layout has a horizontal gap (`symbolGap.x > 0`). Explicit `.maskStrategy(...)` calls always win.

Console emits a one-line `console.info` hint identifying which condition triggered the auto-pick. Pairs with the existing big-symbol auto-pick — the same mechanism, broader trigger set.
