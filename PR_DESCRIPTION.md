# Per-reel geometry, MultiWays, big symbols, expanding wilds

Implements [discussion #58](https://github.com/schmooky/pixi-reels/discussions/58) — four view-layer mechanics that can't be expressed in pixi-reels today, designed and shipped together because they all touch the same invariants (grid layout, frame length, symbol size, cell bounds, mask geometry).

PR: [#60](https://github.com/schmooky/pixi-reels/pull/60) · branch: `feat/per-reel-geometry-big-symbols-megaways`

## What's new

| Feature | Builder API | Runtime API | Surfaces |
|---|---|---|---|
| **Per-reel static shape (pyramid)** | `.visibleRowsPerReel([3,5,5,5,3])`, `.reelAnchor()`, `.reelPixelHeights()` | — | jagged layouts at build time |
| **MultiWays** (per-spin row variation) | `.multiways({ minRows, maxRows, reelPixelHeight })`, `.pinMigrationDuration()`, `.pinMigrationEase()` | `reelSet.setShape(rowsPerReel)`, `reelSet.isMultiWaysSlot` | `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated` |
| **Big symbols (NxM)** | `.symbolData({ id: { size: { w, h } } })` | `reelSet.getSymbolFootprint(col, row)`, `reelSet.getVisibleGrid()`, `reelSet.getBlockBounds(col, row)` | server still sends `string[][]` |
| **Expanding wilds** | unchanged — `pin(col, row, 'wild', { turns: 'eval' })` | unchanged | `pin:placed`, `pin:expired` |

Plus a new internal phase (`AdjustPhase`, MultiWays-only) and a public `MaskStrategy` interface (`RectMaskStrategy` per-reel default, `SharedRectMaskStrategy` for big symbols + horizontal gap; auto-picked at build).

## Decisions from discussion 19 review

The design doc had eight open questions. Both reviewers (`@hendrikpern`, `@MajorTahm`) responded; this PR encodes the consensus:

| # | Decision | Where it lives |
|---|---|---|
| 19.1 | Cascade + MultiWays deferred to v2 — throws at build | `ReelSetBuilder._validate()` |
| 19.2 | AdjustPhase fires on StopPhase entry (after `setResult`) | `SpinController._startReel()` |
| 19.3 | OCCUPIED stub is a singleton-ish internal placeholder, not pooled | `Reel.OccupiedStub` |
| 19.4 | `MaskStrategy` is now public; ships with `RectMaskStrategy` + `SharedRectMaskStrategy` | `ReelViewport.ts`, exported from `index.ts` |
| 19.5 | **AdjustPhase only inserted when `.multiways()` is called**; auto-skips when no reshape AND no pin overlays | `ReelSetBuilder.build()` registers `'adjust'` factory only for MultiWays slots; `SpinController._runAdjustForReel` early-returns |
| 19.6 | `reelPixelHeights` wins over `reelAnchor` when both set | `ReelSetBuilder.build()` |
| 19.7 | `pinMigrationDuration` is independent of `stopDelay` | `AdjustPhase` constructor |
| 19.8 | `DebugSnapshot.visibleRows: number -> number[]` shipped under minor bump, called out in changeset | `.changeset/per-reel-geometry-big-symbols.md` |

## Mutual exclusivity (game-design guardrails)

Three combinations throw at build with named errors:

- **MultiWays + cascade mode** — niche; raise an issue if needed
- **MultiWays + big symbols** — "what's a 2x2 on a 2-row reel?" is a design question, not an engine question
- **MultiWays + visibleRowsPerReel** — both declare per-reel row counts; they contradict
- **Big symbols with non-zero weight** — big symbols may only land via target frames, not random fill (v1)

Surfaced in the new `/guides/big-symbols/` and `/guides/multiways/` pages as a constraint matrix and explained in the "why these reject each other" sections.

## Architecture highlights

### Pin migration (`originRow` + `migration` policy)

A pin's `originRow` is frozen at placement. Pins gain a `migration: 'origin' | 'frozen'` policy:

- **`origin` (default)** — clamps to `min(originRow, newRows - 1)` on every reshape. A pin at origin row 4 cycling through `7 -> 3 -> 7 -> 5 -> 7` always returns to row 4 when the shape allows. **No wander.**
- **`frozen`** — pin clamps once when shape shrinks but never restores. Useful for walking-wild-on-MultiWays where the pin should keep its visited cell across reshapes.

Migration runs eagerly inside `setShape()` rather than lazily inside `AdjustPhase`. This was the trickiest correctness issue: `setResult()` calls `_applyPinsToGrid()` which uses `pin.row` to index into the new (smaller) result grid — if migration runs later, the pin is silently dropped because `pin.row` is out of bounds for the shrunk shape. Fixed by migrating at `setShape` time so `setResult` sees the migrated rows.

### Mask strategy auto-pick

`RectMaskStrategy` draws **one rect per reel** into a single PixiJS mask Graphics — the union of those rects forms the clip shape. Pyramid layouts clip cleanly without buffer-row peek; MultiWays clips per-reel-pixel-height boxes; uniform layouts get the equivalent of a single bounding rect.

`SharedRectMaskStrategy` draws a single bounding-box rect across all reels. Required for big symbols when `symbolGap.x > 0`, because a 2x2 anchor straddling a column gap would otherwise be clipped at the gap. The builder auto-picks `SharedRectMaskStrategy` when big symbols are registered AND there's a horizontal gap; opt out with `.maskStrategy(new RectMaskStrategy())`.

Originally specced as a single bounding-box rect (with "pyramid peek" expected to be hidden by frame art); upgraded to per-reel rects mid-implementation when the peek issue surfaced visually in testing. Promoted to public API on review feedback (#19.4).

### AdjustPhase tween scope

`pinMigrationDuration` + `pinMigrationEase` control **pin-overlay** migration only. The underlying reel cells snap instantly because the reel is still spinning at full speed during AdjustPhase — tweening individual cell symbols would fight the spinning motion layer. Pin overlays live in the unmasked container, don't move with the reel motion, and are the one element that visibly migrates between cells.

Shared `_applyReshape` helper inside `SpinController` deduplicates the AdjustPhase path and the `skip()` path so geometry commits stay identical on slam-stop. Dedicated tests for both paths.

### Big-symbol coordinator + gap-inclusive sizing

Cross-reel OCCUPIED painting runs in `SpinController._tryBeginStopSequence` ahead of per-reel `FrameBuilder.build()`. Per-reel frame building stays per-reel and context-free. Validation (`block exceeds reel height`, `block exceeds reel count`) throws fail-fast at `setResult()`.

The OCCUPIED sentinel never crosses the public API. `Reel.getVisibleSymbols()` resolves intra-reel OCCUPIED to the anchor's id; `ReelSet.getVisibleGrid()` additionally resolves cross-reel OCCUPIED via `getSymbolFootprint`. So a 2x2 bonus reads as four `'bonus'` cells from any consumer surface.

**Block sizing includes inter-cell gaps.** A 2x2 block on a `(cellW=80, cellH=80, gapX=4, gapY=4)` layout covers `2*80 + 1*4 = 164px` wide, not 160. Both `Reel._finalizeFrame` and `ReelSet.getBlockBounds` add `(w-1)*gapX` horizontally and `(h-1)*gapY` vertically — without it, anchor symbols leave thin uncovered strips at the gap rows/cols.

## Naming: MultiWays (not Megaways)

"Megaways" is Big Time Gaming's trademark. The mechanic itself — per-spin row variation — is generic. The library uses **MultiWays** as the open-source name, lowercase `multiways` for identifiers and slugs. The `.visibleSymbols(n)` builder fluent is preserved as an alias for `.visibleRows(n)` so existing code keeps compiling.

## CardSymbol: shared debug primitive

`examples/shared/CardSymbol.ts` is a flat `PIXI.Graphics` rectangle plus centered `Text` (Roboto Condensed) that scales crisply at any cell size. Used across all geometry recipes so cells visually fill their space across MultiWays reshapes and big-symbol blocks without needing pre-rendered atlas assets.

The `CardSymbol` class is **explicitly debug-only** — `/recipes/card-symbol-debug/` documents this and points production users at `SpriteSymbol` / `AnimatedSpriteSymbol` / `SpineSymbol`. It lives in `examples/shared/` (not the library proper) for that reason: it's prototyping scaffolding, not library API.

Site-wide Roboto Condensed font loads via Google Fonts in `Base.astro` so card recipes render with consistent type even on plain pages.

## Recipes added (grouped by topic)

The `/recipes/` index now groups by topic:

**Pyramid layouts**
- `/recipes/pyramid-shape/` — static `3-5-5-5-3` with CardSymbol

**MultiWays**
- `/recipes/multiways/` — per-spin reshape with prototype atlas symbols
- `/recipes/multiways-card-symbols/` — same mechanic with CardSymbol (cells visually fill space)
- `/recipes/sticky-wild-multiways/` — pin migration in action with a yellow `WILD` cell
- `/recipes/card-symbol-debug/` — explainer page for CardSymbol as debug-only primitive

**Big symbols**
- `/recipes/big-symbols/` — single 2x2 bonus with CardSymbol
- `/recipes/big-symbols-mxn/` — every shape (1x3, 2x2, 3x3, 2x4) on one reelset

## Docs

The original combined geometry guide is now split into three focused pages:

- `/guides/per-reel-geometry/` — pyramid layouts, `reelAnchor`, per-reel pixel heights
- `/guides/multiways/` — per-spin reshape, AdjustPhase, pin migration policies
- `/guides/big-symbols/` — NxM blocks, OCCUPIED sentinel, mask strategy, gap-inclusive sizing

Plus `.changeset/per-reel-geometry-big-symbols.md` for the minor bump. ADRs and Spine recipe contract were dropped during scope-trimming.

## Tests

**212 / 212 pass** across 25 test files. New coverage:

| File | Coverage |
|---|---|
| `perReelShape.test.ts` | pyramid layouts, getCellBounds offsetY, validation |
| `multiwaysReshape.test.ts` | `setShape()` events + bounds, `Reel.reshape()`, AdjustPhase under skip |
| `bigSymbols.test.ts` | 2x2 anchor + OCCUPIED, `getSymbolFootprint`, `getBlockBounds`, block overflow, MultiWays + big-symbol rejection |
| `pinMigration.test.ts` | `originRow` defaults, `origin`/`frozen` policies, clamp + restore, overlay reposition |
| `expandingWild.test.ts` | 1x3 column fill via eval pins |
| `validation.test.ts` | every throw path: shape mismatches, mutual exclusivity rules |
| `maskStrategy.test.ts` | `RectMaskStrategy` per-reel rects, `SharedRectMaskStrategy` bounding rect, auto-pick logic |

Lint clean. Lib build clean (`dist/index.js` 78.31 kB / 20.13 kB gzip). All examples build. Site builds 78 pages.

## Breaking notes

`DebugSnapshot.visibleRows` widens from `number` to `number[]`. The snapshot is debug-only and not protected by semver, but adapt anywhere that deep-reads it. Called out in the changeset under "Breaking".

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

## Test plan

- [x] `pnpm --filter pixi-reels typecheck` — green
- [x] `pnpm --filter pixi-reels test` — 212 / 212 pass
- [x] `pnpm check:lint` — green
- [x] `pnpm --filter pixi-reels build` — green (`dist/index.js` 78.31 kB / 20.13 kB gzip)
- [x] `pnpm --filter site build` — 78 pages
- [x] Browser preview: pyramid renders `[3,5,5,5,3]` with no buffer peek
- [x] Browser preview: MultiWays reshapes from `[7,7,7,7,7,7]` through varied shapes; cells snap, pin overlays tween
- [x] Browser preview: sticky wild on MultiWays — clamp + restore demonstrated across `[5] -> [3] -> [7] -> [4]` cycle
- [x] Browser preview: big symbols — 2x2, 3x3, 1x3, 2x4 all land correctly with no uncovered gap strips
- [x] Browser preview: card symbols (PIXI.Graphics + Roboto Condensed) render at exact cell sizes across all MultiWays shapes
