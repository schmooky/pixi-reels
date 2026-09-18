---
'pixi-reels': minor
---

Add: a phase-authoring contract, so a phase written on `ReelPhase` can land a reel without a cast. `pixi-reels` invites custom phases (`PhaseFactory.register`, `ReelPhase` exported as the base class) and then hid every method those phases need behind `@internal`; the library's own recipe called them under `@ts-nocheck`.

- `ReelPhase.land(cells?)` (protected) brings the reel to rest on the frame it shows and announces the landing: drive halted, strip snapped to the grid, `onReelSpinEnd()` then `onReelLanded()` on the symbols, unmask symbols lifted, `spin:reelLanding` raised. It is what `StopPhase` does between its spin-out and its bounce, and the only way a phase lands a reel.
- `ReelPhase.bounce(options?)` (protected) plays the landing overshoot and returns a `ReelBounce` (`done` promise, `cancel()`), carrying lifted unmask views along the way as `StopPhase` always had to by hand. Defaults come from the phase's profile; `BounceOptions` (`distance`, `duration`, `ease`) override them per call. `StopPhase` now lands and bounces through both helpers.
- `Reel.placeStrip()`, `Reel.beginMotion()`, `Reel.notifySpinStart()` and `Reel.forceSpeed()` are public, documented as the phase contract and present in the published typings. `haltDrive`, `snapToGrid`, `notifySpinEnd`, `notifyLanded` and `offsetLiftedViews` stay internal: `land()` and `bounce()` cover them.
- `ReelPhase<TConfig, TProfile extends SpeedProfile = SpeedProfile>`: a phase that carries its own timing on the speed profile (`interface InstantProfile extends SpeedProfile { slideMs: number }`) declares it, and `this._speed` is typed to see the extra fields. `PhaseFactory.register` / `registerFactory` infer the profile from the class, so the registration needs no cast either. The manager already handed every phase the registered profile instance by reference; this makes that first-class.

A consumer that writes no custom phase sees no change.
