---
'pixi-reels': minor
---

Add: `PhaseConstructor`, `PhaseCreatorFn`, `PinOverlayTween` and `TickerCallback` are now exported as types. Each appears in the signature of something already exported (`PhaseFactory.register`, `AdjustPhaseConfig.pinOverlays`, `TickerRef.add`), so a consumer could hold the value but never name it.

Fix: `ReelSymbol.onReelSpinStart`'s documented parameter name matches the signature again, and the `SymbolSpotlight` ADR link no longer points at a path that does not exist.
