---
'pixi-reels': major
---

Change: gsap is held per reel set instead of in a module global.

v1's `utils/gsapRef.ts` stored one instance process-wide, and its own docstring admitted "the last `setGsap` call wins" - so building a second `ReelSet` silently moved the first one's tweens onto a different timeline. Harmless for a single-set game; a real footgun for a composed stage. `builder.gsap(instance)` now binds that set only, captured at `build()`.

- `driveGsapWithTicker(ticker)` takes the instance as a second argument: `driveGsapWithTicker(ticker, myGsap)`. Pass the same one you gave the builder; omit it only if you never called `.gsap(...)`.
- Custom `ReelSymbol` subclasses should animate on the new protected `this.gsap`, which `SymbolFactory` binds to the owning set. An imported `gsap` still works when your app and the engine resolve to the same module; `this.gsap` is correct either way.
- `Reel.gsap` is exposed for custom phases (`this._reel.gsap`).
- The internal `setGsap` / `getGsap` helpers are gone, replaced by `DEFAULT_GSAP` and the `Gsap` type.

Nothing changes for a single-set game that never calls `.gsap(...)`.
