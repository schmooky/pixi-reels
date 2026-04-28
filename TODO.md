# TODO

Deferred follow-ups from the per-reel-geometry / MultiWays / big-symbols PR (#60). Not blockers; each is independently addressable in a follow-up.

## Library

### Pool & memory

- [ ] **`maxPoolPerKey` is a global constant** (currently `20`). For a 6×7 MultiWays with reshape churn, peak demand can hit ~54 instances per symbol id. Expose as a builder option (`.poolCapacity(50)`) or auto-derive from `reelCount * maxRows + bufferTotal`. Today the pool quietly grows beyond the cap; surfacing the knob makes overflow predictable.
- [ ] **`bufferSymbols` is global, not per-reel.** Pyramid layouts overallocate on short reels. Not a bug — just memory. A per-reel form (`.bufferSymbolsPerReel([...])`) would tighten short reels.
- [ ] **`OccupiedStub` array on `Reel` only grows.** Stubs are reused via `if (!stub.view.parent) return stub` but never released. Bounded by max-ever-concurrent OCCUPIED cells; consider an LRU shrink or just leaving it (we documented in `OccupiedStub` JSDoc).
- [ ] **`SymbolFactory.size(symbolId)` debug accessor.** Today there's no way to inspect pool churn during MultiWays reshape. A debug-only count would help diagnose thrashing.

### API hygiene

- [x] ~~**`Reel.reshape()` has no guard rails.**~~ Resolved — JSDoc now marks the method `@internal`, calls out direct external calls as unsupported, and points readers at `ReelSet.setShape()` instead.
- [x] ~~**`Reel.reshape()` doesn't update `_reelHeight`.**~~ Resolved — `_reelHeight` is now recomputed from `(newVisibleRows * newSymbolHeight + (newVisibleRows - 1) * gapY)` at the end of `reshape()`. For MultiWays this equals the fixed `multiways.reelPixelHeight` by construction; for non-MultiWays it matches what the builder would have set.
- [x] ~~**`Reel.setOccupancy()` and `Reel.getAnchorRow()` are public.**~~ Resolved — privatized as `_setOccupancy` / `_getAnchorRow` in commit `070220d`.
- [x] ~~**`consumeTargetShape` is misleadingly named.**~~ Resolved — renamed to `_peekTargetShape` in commit `070220d`.
- [x] ~~**`PinOverlayTween` is exported as a public type.**~~ Resolved — no longer re-exported from `index.ts` (a `// Note: ... intentionally not re-exported` comment marks the boundary).
- [ ] **`refreshPinOverlaysForReel` iterates all overlays** and filters by `pin.col === reelIndex`. O(P) for total pins. Fine in practice; consider keying overlays by reel index for O(K) where K = pins on this reel.

### Mask strategy

- [x] ~~**`MaskStrategy` was specced as "internal in v1, ready to expose"** in ADR 012.~~ Resolved — ADR 014 ("MaskStrategy is a public extension point") records the promotion and the constraints it puts on future viewport changes.
- [ ] **`SharedRectMaskStrategy` has no end-to-end visual test.** The unit test only verifies the strategy is wired; what's actually drawn on the canvas is hand-verified in the browser. A canvas-pixel test (or a screenshot regression test) would catch regressions. **(Out of scope for this pass — needs new test infra.)**
- [x] ~~**`builder.maskStrategy(null)` is not validated.**~~ Resolved — `maskStrategy()` now throws synchronously with a grep-able message when the argument is missing or doesn't have `build()` / `update()` methods.

### Phase orchestration

- [x] ~~**`SpinController.skip()` duplicates the AdjustPhase orchestration logic.**~~ Resolved — both paths now route through `SpinController._applyReshape` (commit `07020d` "deduplicate skip path"). The shared helper is the single source of truth for emit `adjust:start` → `reel.reshape` → refresh overlays → emit `adjust:complete`.
- [x] ~~**AdjustPhase skips `adjust:*` events when there's no work; the skip path always fires them when reshape happens.** Inconsistent~~ Resolved — `_applyReshape` is the single emitter for both paths, and it short-circuits (no events) when `targetRows === fromRows && targetCellH === reel.symbolHeight`. Both code paths now follow the same rule.
- [ ] **`AdjustPhase` is closer to a synchronous orchestration step than a true phase** (no animation, no per-frame update). Consider folding it into `SpinController` and removing from `PhaseFactory`. **(Architectural — deferred; deserves its own PR + ADR.)**
- [x] ~~**Skip path with pins but no shape change** — currently doesn't migrate or refresh~~ Resolved — added an explanatory comment in `SpinController.skip()` describing the rationale (overlays are destroyed at land anyway; `pinMigrationDuration` doesn't apply to skip by design).

### Pin semantics

- [x] ~~**No "lock pin, never migrate" option.**~~ Resolved — added `migration: 'origin' | 'frozen'` on `CellPinOptions` (commit `070220d`). `'frozen'` clamps without restoring and rewrites `originRow` on every clamp.
- [x] ~~**Missing test for `pin:placed` payload's `originRow`.**~~ Resolved — added two assertions in `pinMigration.test.ts`: one that `pin:placed` fires with `originRow` defaulting to the placement row, and one that the explicit `originRow` override flows through to the payload.
- [x] ~~**`pin()` called during a reshape window is undefined behaviour.**~~ Resolved — `CellPinOptions` JSDoc now documents the contract: mid-reshape `pin()` is allowed; `originRow` defaults to the post-reshape row; pass an explicit `originRow` to override.

### MultiWays edge cases

- [x] ~~**`setShape([sameAsCurrentShape])` still emits `shape:changed` and runs the migration loop.**~~ Resolved — `ReelSet.setShape` now early-returns when every reel's `visibleRows` already matches the requested shape, so no event fires and no migration loop runs.
- [x] ~~**`pinMigrationDuration` doesn't apply to skip path.**~~ Resolved — documented in both the [`multiways` recipe](apps/site/src/pages/recipes/multiways.mdx) ("Animation" section) and the [MultiWays guide](apps/site/src/pages/guides/multiways.mdx) ("Animation scope"), and reinforced by an inline comment in `SpinController.skip()`.
- [ ] **`bufferSymbols: 1` may be too small for very large MultiWays** (`maxRows: 10+`). Reels can wrap with too few buffer symbols visible. Worth empirical testing or an auto-derived default.

## Site / docs

- [ ] **Pyramid recipe uses prototype-symbols sprites; MultiWays recipes use card Graphics symbols.** Inconsistent visual language. Pick one approach and apply to all per-reel-geometry recipes, or document the difference. **(Design call — deferred.)**
- [x] ~~**No `getBlockBounds` recipe.**~~ Resolved — added [`/recipes/get-block-bounds/`](apps/site/src/pages/recipes/get-block-bounds.mdx) with an interactive demo that plants a 2×2 or 1×3 every spin and outlines the block on land.
- [x] ~~**Recipe `expanding-wild-pin` predates this PR.**~~ Resolved — added cross-links from `expanding-wild-pin` to both `/guides/per-reel-geometry/` and `/recipes/sticky-wild-multiways/`.

## Future v2 backlog (already noted in design doc but worth tracking)

- [ ] **Stencil/shape mask** for non-rectangular layouts (curved frames, hex grids). Interface is in place; just needs a strategy implementation.
- [ ] **Per-reel X offsets** / irregular column spacing. Same `offsetY` pattern applied to X.
- [ ] **Animated cell-resize tween on MultiWays reshape.** Current scope: pin overlays only. The cell tween was attempted in this PR but reverted because it fights the spinning motion layer.
- [ ] **Big symbols on MultiWays.** Game-design guardrail today; a v2 might expose explicit truncation/skip strategies.
- [ ] **Cascade + MultiWays.** Niche combination; build-time throw today.
- [ ] **Big symbols during spin scroll.** Currently only place at landing.
- [ ] **Big symbols from random fill.** Today's `weight: 0` requirement reflects this; v2 frame middleware could place blocks during scroll.
- [ ] **Pool shrink on MultiWays collapse.** High-water mark today.
