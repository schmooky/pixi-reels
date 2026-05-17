---
"pixi-reels": minor
---

Add `gravityHold: Promise<void>` to `refill()` and `runCascade()` so callers can gate the drop-in stage on an already-in-flight animation / SFX / network call without wrapping it in a callback.

```ts
// Single refill — pass the promise directly.
await reelSet.refill({
  winners,
  grid: next,
  mode: 'gravity-then-drop',
  gravityHoldMs: 150,                 // minimum wall-clock floor
  gravityHold: multiplierRoll.done,   // wait for the in-flight roll
});
```

`gravityHoldMs` and `gravityHold` race in **parallel** via `Promise.all` — whichever finishes LAST gates the drop-in. Pass both when you want a wall-clock floor under an animation that might finish quickly. `onGravityComplete` (the existing callback hook) still runs AFTER both resolve, so it can read post-hold state.

```ts
// Per-cascade — runCascade calls the builder once per stage.
await reelSet.runCascade({
  detectWinners, nextGrid,
  refillMode: 'gravity-then-drop',
  gravityHoldMs: 150,
  gravityHold: ({ chain, winners }) => {
    multiplier.bumpTo(chain + 1);
    return multiplier.done;             // each cascade waits for its own roll
  },
});
```

Site recipes: SPIN/SKIP button is now bigger (56x56 vs 40x40), vertically centered on the right edge of the canvas, and uses the `SkipForward` icon (lucide-react) instead of `Square` when active. Larger touch target, more obvious as the primary action.
