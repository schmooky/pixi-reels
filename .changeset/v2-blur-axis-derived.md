---
'pixi-reels': major
---

Fix: `StaticSpinSymbol`'s motion blur now smears along the strip on a horizontal set.

`MotionBlurOptions.axis` defaulted to `'y'` and its docs told you to pass `{ axis: 'x' }` "for a `HorizontalReel`" - a class 2.0.0 deletes. So a horizontal set using `StaticSpinSymbol` smeared vertically, across the direction of travel, with no type error and no throw. The axis now defaults to the owning set's orientation (ADR 016 section 5); an explicit `blur.axis` still wins, for art that wants a deliberate cross-smear.

`ReelSymbol` gains a protected `this.mainAxis` (`'x'` or `'y'`), bound by `SymbolFactory` at create time, for the few effects that genuinely follow travel. `resize(width, height)` stays screen-space.
