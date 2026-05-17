---
"pixi-reels": minor
---

Cascade DX pass: collapse ~30 lines of slot orchestration to ~3 with a canonical detect → destroy → refill chain, retire the legacy `examples/shared/cascadeLoop.ts` helper, and align every recipe / example / doc onto the new API.

**`reelSet.destroySymbols(cells, opts?)`** — the canonical "fade out winners" step. Defers to each symbol's `playDestroy()` so subclasses (Spine, particles) get art-appropriate disintegration without the spin handler caring. Bumps each view's zIndex so destroys aren't clipped, alternates rotation by column for cohesive cluster pops, optional viewport dim. Replaces ~10 lines of duplicated `destroyWinners` helpers in every cascade recipe.

**`reelSet.runCascade({ detectWinners, nextGrid, onCascade?, pauseAfterDestroyMs?, maxChain?, destroyOptions?, signal? })`** — the canonical cascade chain orchestration. Loops detect → destroy → pause → refill until `detectWinners` returns `[]`. Caller supplies the game-rules callbacks; the library owns the timing. Both callbacks may be `async`. Pass `signal: AbortSignal` for caller-driven cancellation (the right shape for "player tapped slam between refills," where `reelSet.skip()` is a no-op because the engine is idle).

**`cascade:complete`** event — fires once after `runCascade` exits, with `{ chainLength, totalWinners, finalGrid, wasSkipped }`. Single hook for "the round is over."

**`cascade:place:done`** payload now includes `isInitial: boolean` and `winnerRows: readonly number[]` so decoration listeners can tell new arrivals from survivors sliding into a hole.

Also exports the named option / result types — `DestroySymbolsOptions`, `RunCascadeOptions`, `RunCascadeResult` — so apps can pass typed config objects around or extend them in adapter layers.

Non-breaking for the library API. Removed the legacy `examples/shared/cascadeLoop.ts` helper (`runCascade(reelSet, stages, opts)`, `tumbleToGrid`, `diffCells`) since every recipe + example + integration test has been migrated to the new `reelSet.runCascade` / `reelSet.destroySymbols` / `reelSet.refill` surface. Site recipes (`cascade-6x5`, `spin-then-cascade`, `multiways-cascade`, `cascade-winpresenter`, `remove-symbol`) and React recipe components (`RemoveSymbolRecipe`, `CascadeStarterRecipe`) all use the new API; the `cascade-tumble` and `pyramid-cascade` examples were rewritten the same way.

New guide `your-first-cascade.mdx` walks a tutorial through the canonical API end-to-end. `cascades.mdx` documents the two-moments mental model, the `pauseAfterDestroyMs` / `destroyOptions` / `signal` knobs on `runCascade`, and the choice between `refill()` and `runCascade()`.
