# Per-reel geometry, MultiWays, big symbols, expanding wilds

Implements [discussion #58](https://github.com/schmooky/pixi-reels/discussions/58) — four view-layer mechanics that can't be expressed in pixi-reels today, designed and shipped together because they all touch the same invariants (grid layout, frame length, symbol size, cell bounds, mask geometry).

PR: [#60](https://github.com/schmooky/pixi-reels/pull/60) · branch: `feat/per-reel-geometry-big-symbols-megaways`

---

## Summary

| Mechanic | Builder API | Runtime API | New events |
|---|---|---|---|
| **Per-reel geometry** (pyramid, jagged) | `.visibleRowsPerReel([3,5,5,5,3])`, `.reelAnchor()`, `.reelPixelHeights()` | — | — |
| **MultiWays** (per-spin row variation) | `.multiways({ minRows, maxRows, reelPixelHeight })`, `.pinMigrationDuration()`, `.pinMigrationEase()` | `reelSet.setShape(rowsPerReel)`, `reelSet.isMultiWaysSlot` | `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated` |
| **Big symbols** (NxM blocks) | `.symbolData({ id: { size: { w, h } } })` | `reelSet.getSymbolFootprint`, `reelSet.getVisibleGrid`, `reelSet.getBlockBounds` | — |
| **Expanding wilds** | unchanged — `pin(col, row, 'wild', { turns: 'eval' })` | unchanged | unchanged |

Plus: a new internal phase (`AdjustPhase`, MultiWays-only), a new public `MaskStrategy` interface (`RectMaskStrategy` + `SharedRectMaskStrategy`, auto-picked at build), and a shared debug `CardSymbol` for prototyping.

---

## 1. Per-reel geometry (pyramid + jagged layouts)

### What's new

```ts
new ReelSetBuilder()
  .visibleRowsPerReel([3, 5, 5, 5, 3])  // pyramid
  .reelAnchor('center')                  // 'top' | 'center' | 'bottom'
  .reelPixelHeights([240, 400, 400, 400, 240])  // override layout pixels
```

Reels can have non-uniform row counts at build time. Each reel still has buffer rows above/below for spinning, but its visible window is independent.

### Architecture

- `Reel` gains `_offsetY`, `_reelHeight`, `_visibleRows`, `_bufferAbove`, `_bufferBelow` per-reel
- `ReelViewport` stores per-reel offsets and uses them when sizing the mask
- `ReelSet.getCellBounds(col, row)` returns the correct world coords for jagged layouts
- `RectMaskStrategy` draws **one rect per reel** (not a single bounding rect) to prevent buffer-row peek on shorter reels in pyramid layouts

### Decision wins

- `reelPixelHeights` overrides `reelAnchor` when both set (review #19.6)
- Validation throws on length mismatch with reel count

---

## 2. MultiWays (per-spin row variation)

### What's new

```ts
new ReelSetBuilder()
  .multiways({ minRows: 3, maxRows: 7, reelPixelHeight: 480 })
  .pinMigrationDuration(220)         // ms
  .pinMigrationEase('power2.out')    // GSAP ease
```

```ts
// During gameplay
reelSet.setShape([5, 7, 4, 6, 5, 3]);   // before setResult
reelSet.setResult(symbols);
await reelSet.spin();
```

### Architecture

- New `AdjustPhase` (StopPhase entry) reshapes reels between SPIN and STOP. Only inserted when `.multiways()` is called (review #19.5) — non-MultiWays slots get the original phase chain unchanged.
- `AdjustPhase` auto-skips when there's no reshape AND no pin overlays — zero work for spins that didn't change shape.
- `pinMigrationDuration` is independent of `stopDelay` (review #19.7).
- Shared `_applyReshape` helper inside `SpinController` deduplicates the AdjustPhase path and the `skip()` (slam-stop) path. Geometry commits stay identical regardless of which path runs.
- `setShape()` after `setResult()` throws fail-fast — pin migration relies on running before `_applyPinsToGrid()`.

### Pin migration

A pin's `originRow` is frozen at placement. Pins gain a `migration` policy:

- **`origin` (default)** — clamps to `min(originRow, newRows - 1)` on every reshape, restores when shape grows back. **No wander** — a pin at origin row 4 cycling through `7 -> 3 -> 7 -> 5 -> 7` always returns to row 4.
- **`frozen`** — clamps once when shape shrinks, never restores. Useful for walking-wild-on-MultiWays where the pin should keep its visited cell.

Migration runs eagerly inside `setShape()` rather than lazily inside `AdjustPhase`. This was the trickiest correctness issue: `setResult()` calls `_applyPinsToGrid()` which uses `pin.row` to index into the new (smaller) result grid. If migration ran later, pins were silently dropped because `pin.row` was out of bounds for the shrunk shape.

### AdjustPhase tween scope

`pinMigrationDuration` + `pinMigrationEase` control **pin-overlay** migration only. The underlying reel cells snap instantly because the reel is still spinning at full speed during AdjustPhase — tweening individual cell symbols would fight the spinning motion layer. Pin overlays live in the unmasked container, don't move with the reel motion, and are the one element that visibly migrates between cells.

---

## 3. Big symbols (NxM blocks)

### What's new

```ts
.symbols((r) => {
  r.register('bonus', BonusSymbol, { size: { w: 2, h: 2 } });
})
.symbolWeights({ '7': 10, '8': 10, /* ... */ bonus: 0 });   // big symbols MUST be weight 0
```

Server still sends `string[][]`. The engine paints OCCUPIED across the block automatically:

```ts
reelSet.setResult([
  ['7', '8', 'bonus', 'OCCUPIED', '9'],   // row 0: 'bonus' anchor + OCCUPIED tail
  ['Q', 'K', 'OCCUPIED', 'OCCUPIED', 'A'], // row 1: bonus continues
  ['J', '10', 'wild', 'A', 'K'],
]);
```

Consumer surfaces resolve OCCUPIED back to the anchor's id transparently:

```ts
reelSet.getVisibleGrid()
// → [['7','8','bonus','bonus','9'], ['Q','K','bonus','bonus','A'], ...]

reelSet.getSymbolFootprint(2, 0)
// → { anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } }

reelSet.getBlockBounds(2, 0)
// → { x, y, width: 2*cellW + 1*gapX, height: 2*cellH + 1*gapY }
```

### Architecture

- Cross-reel OCCUPIED painting runs in `SpinController._tryBeginStopSequence` ahead of per-reel `FrameBuilder.build()`. Per-reel frame building stays per-reel and context-free.
- The OCCUPIED sentinel never crosses the public API — `Reel.getVisibleSymbols()` resolves intra-reel, `ReelSet.getVisibleGrid()` resolves cross-reel.
- `OccupiedStub` is an internal singleton-like placeholder, allocated directly by `Reel`, not pooled (review #19.3).

### Block sizing includes inter-cell gaps

A 2x2 block on a `(cellW=80, cellH=80, gapX=4, gapY=4)` layout covers `2*80 + 1*4 = 164px` wide, not 160. Both `Reel._finalizeFrame` and `ReelSet.getBlockBounds` add `(w-1)*gapX` horizontally and `(h-1)*gapY` vertically. Without this, anchor symbols left thin uncovered strips at the gap rows/cols.

### Mask strategy auto-pick

When big symbols are registered AND `symbolGap.x > 0`, the builder auto-picks `SharedRectMaskStrategy` (single bounding rect) instead of `RectMaskStrategy` (per-reel). A 2x2 anchor straddling a column gap would otherwise be clipped at the gap. Opt out with `.maskStrategy(new RectMaskStrategy())`.

### Validation (fail-fast)

- Big symbols must have `weight: 0` (only land via target frames in v1)
- Block exceeding reel height or reel count throws at `setResult()`
- MultiWays + big symbols throws at build (mutual exclusivity)

---

## 4. Expanding wilds

Unchanged from existing pin API — confirmed via tests as a degenerate big-symbol case (NxM block painted via cell pins with `turns: 'eval'`).

```ts
reelSet.pin(2, 0, 'wild', { turns: 'eval' });   // expand reel 2 column
reelSet.pin(2, 1, 'wild', { turns: 'eval' });
reelSet.pin(2, 2, 'wild', { turns: 'eval' });
```

---

## Cross-cutting

### MaskStrategy (now public, review #19.4)

| Strategy | Use when |
|---|---|
| `RectMaskStrategy` | default — per-reel rects, prevents pyramid buffer peek |
| `SharedRectMaskStrategy` | big symbols + horizontal gap (auto-picked); custom shapes that span reels |

`MaskStrategy` interface is exported from `pixi-reels` so games can ship custom strategies (stencil/shape mask is the obvious v2 candidate).

### CardSymbol (debug-only prototyping primitive)

`examples/shared/CardSymbol.ts` is a flat `PIXI.Graphics` rectangle plus centered `Text` (Roboto Condensed) that scales crisply at any cell size. Used across all geometry recipes so cells visually fill their space across MultiWays reshapes and big-symbol blocks without needing pre-rendered atlas assets.

The class is **explicitly debug-only**. `/recipes/card-symbol-debug/` documents this and points production users at `SpriteSymbol` / `AnimatedSpriteSymbol` / `SpineSymbol`. It lives in `examples/shared/` (not the library proper) for that reason: it's prototyping scaffolding, not library API.

Site-wide Roboto Condensed loads via Google Fonts in `Base.astro` so card recipes render with consistent type even on plain pages.

### Naming: MultiWays (not Megaways)

"Megaways" is Big Time Gaming's trademark. The mechanic itself — per-spin row variation — is generic. The library uses **MultiWays** as the open-source name, lowercase `multiways` for identifiers. The `.visibleSymbols(n)` builder fluent is preserved as an alias for `.visibleRows(n)` so existing code keeps compiling.

### Mutual exclusivity (game-design guardrails)

Three combinations throw at build with named errors:

| Combination | Why it throws |
|---|---|
| MultiWays + cascade mode | Niche; raise an issue if needed (review #19.1) |
| MultiWays + big symbols | "What's a 2x2 on a 2-row reel?" is a design question, not an engine question |
| MultiWays + visibleRowsPerReel | Both declare per-reel row counts; they contradict |
| Big symbols with non-zero weight | Big symbols only land via target frames in v1, never random fill |

Surfaced in the `/guides/big-symbols/` and `/guides/multiways/` pages as a constraint matrix.

### Decisions from discussion 19 review

| # | Decision | Where it lives |
|---|---|---|
| 19.1 | Cascade + MultiWays deferred to v2 — throws at build | `ReelSetBuilder._validate()` |
| 19.2 | AdjustPhase fires on StopPhase entry (after `setResult`) | `SpinController._startReel()` |
| 19.3 | OCCUPIED stub is singleton-like internal, not pooled | `Reel.OccupiedStub` |
| 19.4 | `MaskStrategy` public; ships with two strategies | `ReelViewport.ts`, exported from `index.ts` |
| 19.5 | AdjustPhase only inserted on MultiWays slots; auto-skips when no reshape AND no pin overlays | `ReelSetBuilder.build()`, `SpinController._runAdjustForReel` |
| 19.6 | `reelPixelHeights` wins over `reelAnchor` when both set | `ReelSetBuilder.build()` |
| 19.7 | `pinMigrationDuration` independent of `stopDelay` | `AdjustPhase` constructor |
| 19.8 | `DebugSnapshot.visibleRows: number -> number[]` | Documented in changeset |

---

## Recipes (grouped by topic on `/recipes/`)

### Pyramid layouts
- `/recipes/pyramid-shape/` — static `[3,5,5,5,3]` with CardSymbol

### MultiWays
- `/recipes/multiways/` — per-spin reshape with prototype atlas symbols
- `/recipes/multiways-card-symbols/` — same mechanic with CardSymbol (cells visually fill space across reshapes)
- `/recipes/sticky-wild-multiways/` — pin migration in action with a `WILD` cell
- `/recipes/card-symbol-debug/` — explainer page: CardSymbol is debug-only, production uses Sprite/AnimatedSprite/Spine

### Big symbols
- `/recipes/big-symbols/` — single 2x2 bonus with CardSymbol + `SharedRectMaskStrategy`
- `/recipes/big-symbols-mxn/` — every shape (1x3, 2x2, 3x3, 2x4) on one reelset

---

## Docs

The original combined geometry guide is split into three focused pages:

- `/guides/per-reel-geometry/` — pyramid layouts, `reelAnchor`, per-reel pixel heights
- `/guides/multiways/` — per-spin reshape, AdjustPhase, pin migration policies
- `/guides/big-symbols/` — NxM blocks, OCCUPIED sentinel, mask strategy, gap-inclusive sizing

Plus `.changeset/per-reel-geometry-big-symbols.md` for the minor bump.

---

## Verification

### Tests — 212 / 212 pass across 25 files

| File | Coverage |
|---|---|
| `perReelShape.test.ts` | pyramid layouts, getCellBounds offsetY, validation |
| `multiwaysReshape.test.ts` | `setShape()` events + bounds, `Reel.reshape()`, AdjustPhase under skip |
| `bigSymbols.test.ts` | 2x2 anchor + OCCUPIED, `getSymbolFootprint`, `getBlockBounds`, block overflow, MultiWays + big-symbol rejection |
| `pinMigration.test.ts` | `originRow` defaults, `origin`/`frozen` policies, clamp + restore, overlay reposition |
| `expandingWild.test.ts` | 1x3 column fill via eval pins |
| `validation.test.ts` | every throw path |
| `maskStrategy.test.ts` | both strategies + auto-pick logic |

### Build

- `pnpm --filter pixi-reels typecheck` — green
- `pnpm --filter pixi-reels test` — 212 / 212
- `pnpm check:lint` — green
- `pnpm --filter pixi-reels build` — green (`dist/index.js` 78.31 kB / 20.13 kB gzip)
- `pnpm --filter site build` — 78 pages

### Manual QA (browser preview)

- Pyramid renders `[3,5,5,5,3]` with no buffer peek
- MultiWays reshapes from `[7,7,7,7,7,7]` through varied shapes; cells snap, pin overlays tween
- Sticky wild on MultiWays — clamp + restore demonstrated across `[5] -> [3] -> [7] -> [4]` cycle
- Big symbols — 2x2, 3x3, 1x3, 2x4 all land correctly with no uncovered gap strips
- CardSymbol (PIXI.Graphics + Roboto Condensed) renders at exact cell sizes across all MultiWays shapes

---

## Breaking notes

`DebugSnapshot.visibleRows` widens from `number` to `number[]`. The snapshot is debug-only and not protected by semver, but adapt anywhere that deep-reads it. Called out in the changeset under "Breaking".

---

## Out of scope (deferred to TODO.md)

- Stencil/shape mask strategy (current rect-union covers pyramid + MultiWays + big-symbol-with-gap)
- Per-reel X offsets / irregular column spacing
- Animated tween on cell-resize (current scope: pin overlays only)
- Big symbols on MultiWays (game-design guardrail, not engine)
- Cascade + MultiWays
- Big symbols during spin scroll (only at landing in v1)
- Big symbols from random fill (only target frames place them)
- Pool shrink on MultiWays collapse (high-water mark)
- Visual regression harness for mask strategies
