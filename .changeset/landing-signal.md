---
"pixi-reels": minor
---

Add: the landing frame as a signal, and a say for the symbol in what it plays there.

- `spin:reelLanding` (`reelIndex, symbols`) fires the frame a reel is on its result: strip snapped, every visible symbol told it landed, the bounce not yet started. `spin:reelLanded` still fires when the reel is fully at rest, a whole `bounceDuration` later on an animated stop and in the same tick on a slam. The new event fires on every landing path (animated stop, slam, each cascade refill stage), always after the `onReelLanded()` loop, so a listener that takes a landed symbol's track over finds the engine's own landing already set. Each `Reel` raises the per-reel `landing` event it is bridged from.
- `ReelSymbol.onReelLanded(ctx)` now receives a `ReelLandingContext` - `reelIndex`, `reelCount`, `cell`, `visibleCells`, `symbolId` - so an override can play a different beat, or none, on a particular reel. Overrides written as `onReelLanded()` keep compiling.
- `SpineReelSymbol`'s `autoPlayLanding` accepts a function of that context returning `true` (the landing one-shot), `false` (nothing) or an animation name to play as the landing beat on this reel and cell instead.
- `ReelSymbol.landing` exposes the landing beat a symbol started on land (reported by subclasses through the new `trackLanding(promise)`), kept until the reel moves again or the symbol is pooled, so a presenter can sequence after it instead of stomping it.
- `HoldAndWinBuilder.lockAnimation` uses it: `'win'` now waits for the coin's own landing beat before the celebration (before, a Spine coin's landing never showed under the default lock), `'landing'` no longer replays one the symbol already started, and the mode may be a function of the coin - `(coin) => coin.id === 'collector' ? 'win' : 'landing'` (`HwLockAnimationRule`).
