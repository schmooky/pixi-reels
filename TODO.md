# TODO

Deferred follow-ups from the per-reel-geometry / MultiWays / big-symbols PR (#60). Not blockers; each is independently addressable in a follow-up.

## Library

### Pool & memory

- [ ] **`maxPoolPerKey` is a global constant** (currently `20`). For a 6×7 MultiWays with reshape churn, peak demand can hit ~54 instances per symbol id. Expose as a builder option (`.poolCapacity(50)`) or auto-derive from `reelCount * maxRows + bufferTotal`. Today the pool quietly grows beyond the cap; surfacing the knob makes overflow predictable.
- [ ] **`bufferSymbols` is global, not per-reel.** Pyramid layouts overallocate on short reels. Not a bug — just memory. A per-reel form (`.bufferSymbolsPerReel([...])`) would tighten short reels.
- [ ] **`OccupiedStub` array on `Reel` only grows.** Stubs are reused via `if (!stub.view.parent) return stub` but never released. Bounded by max-ever-concurrent OCCUPIED cells; consider an LRU shrink or just leaving it (we documented in `OccupiedStub` JSDoc).
- [ ] **`SymbolFactory.size(symbolId)` debug accessor.** Today there's no way to inspect pool churn during MultiWays reshape. A debug-only count would help diagnose thrashing.

### API hygiene

- [ ] **`Reel.reshape()` has no guard rails.** Anyone can call it on a non-MultiWays reel and get a confusing partial state. Either throw if `!_isMultiWaysSlot` is set on the reel (requires plumbing), or at least mark `@internal` and document that direct calls are discouraged.
- [ ] **`Reel.reshape()` doesn't update `_reelHeight`.** For static pyramids (where `reelHeight = visibleRows * symbolHeight` at construction), a direct `reel.reshape()` call leaves `_reelHeight` stale. Latent bug if anyone calls it externally on a non-MultiWays slot.
- [ ] **`Reel.setOccupancy()` and `Reel.getAnchorRow()` are public.** Both are internal helpers used by `ReelSet`'s cross-reel resolver. They leak in TS autocomplete. Privatize via the hooks pattern.
- [ ] **`consumeTargetShape` is misleadingly named.** It reads but doesn't clear; clearing is `clearTargetShape`. Rename to `peekTargetShape` or `getTargetShape`.
- [ ] **`PinOverlayTween` is exported as a public type.** Consumers don't construct these directly; only `SpinController` does. Mark `@internal` or move the type adjacent to `AdjustPhase` without re-exporting.
- [ ] **`refreshPinOverlaysForReel` iterates all overlays** and filters by `pin.col === reelIndex`. O(P) for total pins. Fine in practice; consider keying overlays by reel index for O(K) where K = pins on this reel.

### Mask strategy

- [ ] **`MaskStrategy` was specced as "internal in v1, ready to expose"** in ADR 012. We promoted it to public mid-PR per maintainer request. Add an addendum to ADR 012 (or new ADR 014) recording the upgrade.
- [ ] **`SharedRectMaskStrategy` has no end-to-end visual test.** The unit test only verifies the strategy is wired; what's actually drawn on the canvas is hand-verified in the browser. A canvas-pixel test (or a screenshot regression test) would catch regressions.
- [ ] **`builder.maskStrategy(null)` is not validated.** TS catches it for typed callers, but JS callers get a runtime error later at viewport construction.

### Phase orchestration

- [ ] **`SpinController.skip()` duplicates the AdjustPhase orchestration logic.** Both `_runAdjustForReel` and the skip path compute `targetSymbolHeight`, call `migratePinsForReel`, call `reel.reshape`, call `refreshPinOverlaysForReel`. Two implementations of the same flow. Extract a shared `_commitReshape(reelIndex)` helper.
- [ ] **AdjustPhase skips `adjust:*` events when there's no work; the skip path always fires them when reshape happens.** Inconsistent — a consumer counting `adjust:start` to track "spin reshapes" gets different counts depending on whether the user pressed skip. Decide on one rule.
- [ ] **`AdjustPhase` is closer to a synchronous orchestration step than a true phase** (no animation, no per-frame update). Consider folding it into `SpinController` and removing from `PhaseFactory`.
- [ ] **Skip path with pins but no shape change** — currently doesn't migrate or refresh, but pin overlays are destroyed at land anyway. Cosmetic only. Worth a comment.

### Pin semantics

- [ ] **No "lock pin, never migrate" option.** `originRow` says "where I want to live"; clamping is the only response to a smaller shape. Users wanting "this pin is at row 2 forever, even if the shape grows" have to update `originRow` manually. Add `noMigrate?: boolean` to `CellPinOptions` or document the manual pattern.
- [ ] **Missing test for `pin:placed` payload's `originRow`.** Added the JSDoc; an event-payload assertion would lock in the contract.
- [ ] **`pin()` called during a reshape window is undefined behaviour.** What if a user calls `pin()` mid-AdjustPhase via an event handler? Behaviour is consistent (the new pin gets `originRow = row` at the moment, which is the new shape's row), but undocumented.

### MultiWays edge cases

- [ ] **`setShape([sameAsCurrentShape])` still emits `shape:changed` and runs the migration loop.** All no-ops, but for large reel counts this is wasted work + an extra event. Add a fast-path: skip if shape unchanged.
- [ ] **`pinMigrationDuration` doesn't apply to skip path.** Skip never tweens, even if duration > 0. Expected for skip semantics, but undocumented in the recipe.
- [ ] **`bufferSymbols: 1` may be too small for very large MultiWays** (`maxRows: 10+`). Reels can wrap with too few buffer symbols visible. Worth empirical testing or an auto-derived default.

## Site / docs

- [ ] **Pyramid recipe uses prototype-symbols sprites; MultiWays recipes use card Graphics symbols.** Inconsistent visual language. Pick one approach and apply to all per-reel-geometry recipes, or document the difference.
- [ ] **No `getBlockBounds` recipe.** The API now exists; a tiny recipe showing block-outline drawing would help discoverability.
- [ ] **Recipe `expanding-wild-pin` predates this PR.** Cross-link to `/guides/per-reel-geometry/` from there too — it's part of the layout-level mechanics family.

## Future v2 backlog (already noted in design doc but worth tracking)

- [ ] **Stencil/shape mask** for non-rectangular layouts (curved frames, hex grids). Interface is in place; just needs a strategy implementation.
- [ ] **Per-reel X offsets** / irregular column spacing. Same `offsetY` pattern applied to X.
- [ ] **Animated cell-resize tween on MultiWays reshape.** Current scope: pin overlays only. The cell tween was attempted in this PR but reverted because it fights the spinning motion layer.
- [ ] **Big symbols on MultiWays.** Game-design guardrail today; a v2 might expose explicit truncation/skip strategies.
- [ ] **Cascade + MultiWays.** Niche combination; build-time throw today.
- [ ] **Big symbols during spin scroll.** Currently only place at landing.
- [ ] **Big symbols from random fill.** Today's `weight: 0` requirement reflects this; v2 frame middleware could place blocks during scroll.
- [ ] **Pool shrink on MultiWays collapse.** High-water mark today.
