---
"pixi-reels": minor
---

Round-aware slam-stop: single-press `skip()` with side effects, new `slamStop()`, new `skipStage`.

`ReelSet.skip()` is now round-aware. A "round" is one `spin()` plus all its `refill()`s, until the next `spin()`. The first press of `skip()` in a round slams the current drop AND applies a round-scoped side effect:

- **Standard mode**: boosts the active speed profile to the fastest registered one (emits `skip:boosted`). The speed takes effect on the NEXT spin (mid-spin speed switching is not supported by phases). Boost persists across `refill()` calls and is restored on the next `spin()` — unless the app changed speed manually between rounds, in which case the manual choice is preserved.
- **Cascade/tumble mode**: flags the round so every subsequent `refill()` auto-slams with no animation. One press ends a multi-drop cascade.

Subsequent `skip()` presses in the same round each slam the current drop. The universal `if (isSpinning) reelSet.skip()` button pattern across recipes now always lands the spin on a single press, while still benefiting from the boost / auto-slam side effect.

Breaking:
- `skip()` no longer needs two presses to slam — single press lands the drop. Callers that already relied on `skip()` slamming work as before. Callers expecting a *non-slamming* "boost only" press should use `reelSet.setSpeed('superTurbo')` directly.
- `skip()` THROWS if called before `setResult()` arrives (no result to land on — pre-result slam would land on random spin-buffer state). Use `requestSkip()` for the deferred-slam pattern, or wrap `skip()` in `try { ... } catch {}` and route to `requestSkip()` in the catch. Refill paths take a result at entry, so this guard only fires in the initial-spin pre-`setResult` window.
- `requestSkip()` bypasses staging entirely and slams when `setResult()` arrives.
- The test harness `spinAndLand()` was migrated to `slamStop()` to keep its semantics explicit.

Added:
- `ReelSet.slamStop()` — always slams, no side effects.
- `ReelSet.skipStage` — `0 | 1 | 2` getter; `0` until the first press, `2` after. (`1` is reserved for forward compat.)
- `skip:boosted` event — `{ previous, current }: SpeedProfile`. Fires only on standard-mode boost; cascade auto-slam doesn't emit it.
- `ReelSymbol.playDestroy(opts?)` — `opts.direction: 1 | -1` for coherent rotation (e.g. `w.reel % 2 === 0 ? 1 : -1`), `opts.delay: number` (seconds) for per-winner stagger, and `opts.signal: AbortSignal` so a mid-destroy abort can snap to the destroyed pose without waiting for the full ~300 ms tween. Default direction stays random for back-compat.
