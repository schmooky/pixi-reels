---
'pixi-reels': minor
---

Add `ReelSetBuilder.gsap(instance)` for explicit GSAP dependency injection.

The engine internally drives every tween, timeline, and `delayedCall` through a single bound `gsap` instance. By default that is the `gsap` resolved at the engine's own module path — fine for the common case where bundler `dedupe` collapses both the engine's and the consumer's `'gsap'` to one module instance.

In setups where two `gsap` instances exist at runtime (symlinked workspaces, npm-link, misconfigured `dedupe`), tweens started by the engine live on a different root timeline than the one the consumer drives — animations stall, double-fire, or freeze on hidden tabs. Calling `.gsap(myGsap)` in the builder rebinds the engine to the consumer's instance:

```ts
import { gsap } from 'gsap';

const reelSet = new ReelSetBuilder()
  .reels(5).visibleRows(3).symbolSize(200, 200)
  .symbols(...)
  .ticker(app.ticker)
  .gsap(gsap)         // ensure engine and app share one instance
  .build();
```

Internally this is implemented via a tiny `getGsap()`/`setGsap()` shim in `utils/gsapRef.ts`. Every internal animation site now reads through `getGsap()` instead of importing `'gsap'` directly. A regression-guard test asserts no runtime `gsap.timeline(`/`gsap.to(`/`gsap.delayedCall(` calls outside the shim itself.

No behavioural change for consumers who don't call `.gsap()`.
