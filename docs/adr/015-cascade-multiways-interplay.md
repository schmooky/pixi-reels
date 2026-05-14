# ADR 015: Cascade × MultiWays interplay

## Status: Accepted

## Context

[ADR 012:48](./012-per-reel-geometry-and-adjust-phase.md) deferred the cascade + multiways combination behind a build-time throw, calling it "niche." [Issue #74](https://github.com/schmooky/pixi-reels/issues/74) re-opens the combination: cascade-Megaways is a real product category (Bonanza Megaways by Big Time Gaming is the canonical example), and the deferral predates enough of the multiways infrastructure that the interplay is now mostly an event-ordering question, not a real engineering ask.

The throw lived at `ReelSetBuilder` validation: setting both `multiways(...)` and `cascade(...)` (or `spinningMode(new CascadeMode())`) failed at build. The deferral rationale was three-fold:

1. The fall-out animation in `DropStopPhase._beginFall` captures live views from `reel.visibleRows`/`reel.bufferAbove` — if those change mid-fall, the visual was undefined.
2. Mid-cascade reshape (i.e. `setShape()` called between cascade respins within a single round) has unclear semantics — does the survivor-fall continue under the old shape and the refill land under the new? Both? Neither?
3. Big symbols + multiways already throws; cascade + big symbols already throws under multiways. Lifting cascade + multiways without resolving the broader combinatorics felt fragile.

## Decision

The throw is lifted. Cascade + multiways is supported with one explicit constraint:

> **Shape changes apply at the start of a spin, not mid-chain.** `setShape(...)` is the call made between `spin({ mode: 'cascade' })` and `setResult(...)` — exactly the same window as on a non-cascade multiways slot. Within a single landed round, any post-landing `runCascade(...)` chain operates on the shape established by the spin that started it. Mid-chain reshape is not supported in v1.

This constraint matches how cascade-Megaways games actually work: ways-count is set per *round*, not per *cascade respin*. Lifting the throw without the constraint would re-introduce the (1)/(2) ambiguities from the original deferral.

### Phase chain

For `spin({ mode: 'cascade' })` on a multiways slot, the phase chain becomes:

```
DropStartPhase  →  SpinPhase  →  AdjustPhase  →  DropStopPhase
```

`AdjustPhase` insertion at `SpinController._startReel` is already mode-agnostic — it gates on `isMultiWaysSlot` alone, regardless of whether the start/stop phases are `Start/Stop` or `DropStart/DropStop`. The cascade phases read `reel.visibleRows` and `reel.bufferAbove` at runtime (not cached at construction), so the post-reshape geometry is automatically reflected in the fall-out and drop-in animations.

### What lifting the throw did not change

- Pin migration semantics are identical to the non-cascade multiways case — `setShape()` migrates pins to their new rows; `AdjustPhase` tweens overlays from the captured pre-reshape pose to the post-reshape cell.
- Big symbols + multiways still throws. Anchor coordinates don't have stable semantics under reshape; this is unchanged.
- `runCascade(...)` (the post-landing tumble helper in `examples/shared/cascadeLoop.ts`) was never gated by the throw and already worked on multiways grids in practice — its per-reel `visibleRows` reads are shape-aware. The change in this ADR only affects the cascade-mode *spin* path.

## Consequences

- The `ReelSetBuilder` validation has one fewer guardrail. `validation.test.ts` now asserts the combination *builds* instead of asserting it throws.
- ADR 012:48 is no longer current. That line should read "Cascade + MultiWays is supported via the per-chain shape rule documented in ADR 015."
- The `multiways-cascade` recipe demonstrates the combination end-to-end: random per-spin shape, cascade drop-in landing, optional `runCascade` chain on the landed grid.
- A future relaxation — allowing shape change mid-cascade-chain — is a non-breaking additive change. It needs the fall-out animation to capture pre-reshape views and `AdjustPhase` to run between fall and drop-in, neither of which is in v1.

## Alternatives considered

- **Allow shape change mid-cascade-chain.** Real engineering: `DropStopPhase._beginFall` would have to capture views *before* `AdjustPhase` runs, then `AdjustPhase` would run between fall and drop-in, then `DropStopPhase._beginDropIn` reads the post-reshape geometry. Doable but with subtle ordering tests. Rejected for v1 — commercial cascade-Megaways games do not exercise this path.
- **Allow the combination but throw if `setShape()` is called on a cascade-mode slot at all.** Strict but wrong — the recipe's whole point is per-spin shape variation. Rejected.
- **Keep the throw, ship a `runCascade`-based recipe only.** The recipe could exist without lifting the throw (multiways spin → `runCascade` chain). But that ducks the issue: studios who want cascade-mode drop-in landings on a multiways slot still couldn't use the engine. Rejected — the throw was the blocker.
