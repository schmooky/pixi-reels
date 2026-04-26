# Per-reel geometry, MultiWays, big symbols, expanding wilds

Implements [discussion #58](https://github.com/schmooky/pixi-reels/discussions/58) — four view-layer mechanics that can't be expressed in pixi-reels today, designed and shipped together because they all touch the same invariants (grid layout, frame length, symbol size, cell bounds, mask geometry).

## What's new

| Feature | Builder API | Runtime API | Surfaces |
|---|---|---|---|
| **Per-reel static shape (pyramid)** | `.visibleRowsPerReel([3,5,5,5,3])`, `.reelAnchor()`, `.reelPixelHeights()` | — | jagged layouts at build time |
| **MultiWays** (per-spin row variation) | `.multiways({ minRows, maxRows, reelPixelHeight })`, `.adjustDuration()`, `.adjustEase()` | `reelSet.setShape(rowsPerReel)`, `reelSet.isMultiWaysSlot` | `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated` |
| **Big symbols (N×M)** | `.symbolData({ id: { size: { w, h } } })` | `reelSet.getSymbolFootprint(col, row)`, `reelSet.getVisibleGrid()` | server still sends `string[][]` |
| **Expanding wilds** | unchanged — `pin(col, row, 'wild', { turns: 'eval' })` | unchanged | `pin:placed`, `pin:expired` |

Plus a new internal phase (`AdjustPhase`, MultiWays-only) and an internal `MaskStrategy` interface (v1 ships per-reel `RectMaskStrategy`, future shape-mask strategy can swap in).

## Decisions from Section 19 review

The design doc had eight open questions. Both reviewers (`@hendrikpern`, `@MajorTahm`) responded; this PR encodes the consensus:

| # | Decision | Where it lives |
|---|---|---|
| 19.1 | Cascade + MultiWays deferred to v2 — throws at build | `ReelSetBuilder._validate()` |
| 19.2 | AdjustPhase fires on StopPhase entry (after `setResult`) | `SpinController._startReel()` |
| 19.3 | OCCUPIED stub is a singleton-ish internal placeholder, not pooled | `Reel.OccupiedStub` |
| 19.4 | `MaskStrategy` is internal in v1, interface ready for public exposure later | `ReelViewport` |
| 19.5 | **AdjustPhase only inserted when `.multiways()` is called** | `ReelSetBuilder.build()` registers `'adjust'` factory only for MultiWays slots |
| 19.6 | `reelPixelHeights` wins over `reelAnchor` when both set | `ReelSetBuilder.build()` |
| 19.7 | `adjustDuration` is independent of `stopDelay` | `AdjustPhase` constructor |
| 19.8 | `DebugSnapshot.visibleRows: number → number[]` shipped under minor bump, called out in changeset | `.changeset/per-reel-geometry-big-symbols.md` |

Section 19.5 is the most architecturally significant: the original design proposed always inserting AdjustPhase as a no-op zero-skip on non-MultiWays slots. The reviewers asked to skip that entirely so non-MultiWays event surfaces stay unchanged — that's how it ships.

## Mutual exclusivity (game-design guardrails)

Three combinations throw at build:

- **MultiWays + cascade mode** — niche; raise an issue if needed
- **MultiWays + big symbols** — "what's a 2×2 on a 2-row reel?" is a design question, not an engine question
- **MultiWays + visibleRowsPerReel** — both declare per-reel row counts; they contradict

These are surfaced in the `/guides/per-reel-geometry/` guide as a constraint matrix and explained in the "why these reject each other" section.

## Architecture highlights

### Pin migration (`originRow`)

A pin's `originRow` is frozen at placement. On every reshape, the pin migrates to `min(originRow, newRows - 1)`. Clamps when shape shrinks; restores to origin when it grows back. **No wander** — a pin at origin row 4 cycling through shapes `7 → 3 → 7 → 5 → 7` always returns to row 4 when the shape allows.

Migration runs eagerly inside `setShape()` rather than lazily inside `AdjustPhase`. This was the trickiest correctness issue in the implementation: `setResult()` calls `_applyPinsToGrid()` which uses `pin.row` to index into the new (smaller) result grid — if migration runs later, the pin is silently dropped because `pin.row` is out of bounds for the shrunk shape. Fixed by migrating at `setShape` time so `setResult` sees the migrated rows.

### MultiWays mask

`RectMaskStrategy` draws **one rect per reel** into a single PixiJS mask Graphics — the union of those rects forms the clip shape. Pyramid layouts clip cleanly without buffer-row peek, MultiWays clips per-reel-pixel-height boxes, and uniform layouts get the equivalent of a single bounding rect.

Originally specced as a single bounding-box rect (with "pyramid peek" expected to be hidden by frame art); upgraded to per-reel rects mid-implementation when the peek issue surfaced visually in testing. Keeps the v1 mask interface trivial; doesn't preclude a future stencil/shape strategy.

### AdjustPhase tween scope

`adjustDuration` + `adjustEase` control **pin-overlay** migration only. The underlying reel cells snap instantly because the reel is still spinning at full speed during AdjustPhase — tweening individual cell symbols would fight the spinning motion layer. Pin overlays live in the unmasked container, don't move with the reel motion, and are the one element that visibly migrates between cells.

This was attempted with full cell tweening first; broke on visible spin frames. Scope walked back. Documented in the recipe.

### Big-symbol coordinator

Cross-reel OCCUPIED painting runs in `SpinController._tryBeginStopSequence` ahead of per-reel `FrameBuilder.build()`. Per-reel frame building stays per-reel and context-free. Validation (`block exceeds reel height`, `block exceeds reel count`) throws fail-fast at `setResult()`.

The OCCUPIED sentinel never crosses the public API. `Reel.getVisibleSymbols()` resolves intra-reel OCCUPIED to the anchor's id; `ReelSet.getVisibleGrid()` additionally resolves cross-reel OCCUPIED via `getSymbolFootprint`. So a 2×2 bonus reads as four `'bonus'` cells from any consumer surface.

## Naming: MultiWays (not Megaways)

"Megaways" is Big Time Gaming's trademark. The mechanic itself — per-spin row variation — is generic. The library uses **MultiWays** as the open-source name, lowercase `multiways` for identifiers and slugs.

## Recipes added

- `/recipes/pyramid-shape/` — static `3-5-5-5-3`
- `/recipes/multiways/` — per-spin reshape with custom Graphics card symbols (7 8 9 10 J Q K A)
- `/recipes/multiways-card-symbols/` — same mechanic, focuses on the custom-symbol pattern
- `/recipes/sticky-wild-multiways/` — pin migration in action with a yellow `WILD` cell
- `/recipes/big-symbols/` — single 2×2 bonus
- `/recipes/big-symbols-mxn/` — every shape: 1×3, 2×2, 3×3, 2×4

## Docs

- `/guides/per-reel-geometry/` — mechanics guide covering all three layouts and the constraint matrix
- `docs/adr/012-per-reel-geometry-and-adjust-phase.md` — ADR for the geometry layer + AdjustPhase
- `docs/adr/013-big-symbols-via-registration.md` — ADR for the registration-based big-symbol approach
- `docs/recipes/spine-multiways-ready.md` — Spine skeleton contract for reshape-safe symbols
- `.changeset/per-reel-geometry-big-symbols.md` — minor bump

## Tests

**+27 unit tests across 6 new files**, all passing alongside the existing 168:

| File | Coverage |
|---|---|
| `perReelShape.test.ts` | pyramid layouts, getCellBounds offsetY, validation |
| `multiwaysReshape.test.ts` | `setShape()` events + bounds, `Reel.reshape()`, AdjustPhase under skip |
| `bigSymbols.test.ts` | 2×2 anchor + OCCUPIED, `getSymbolFootprint`, block overflow, MultiWays + big-symbol rejection |
| `pinMigration.test.ts` | `originRow` defaults, clamp + restore, overlay reposition |
| `expandingWild.test.ts` | 1×3 column fill via eval pins |
| `validation.test.ts` | every throw path: shape mismatches, mutual exclusivity rules |

Total: **196 / 196 pass**. Lint clean. Lib build clean. All 4 examples build. Site builds (75 pages).

## Breaking notes

`DebugSnapshot.visibleRows` widens from `number` to `number[]`. The snapshot is debug-only and not protected by semver, but adapt anywhere that deep-reads it. Called out in the changeset under "Breaking".

## Out of scope (deferred backlog)

- Stencil/shape mask strategy (v2 — current rect-union is enough for pyramid + MultiWays + uniform)
- Per-reel X offsets / irregular column spacing (`offsetY` pattern extends cleanly when needed)
- Animated tween on cell-resize (current scope: pin overlays only)
- Big symbols on MultiWays (game-design guardrail, not engine)
- Cascade + MultiWays
- Big symbols during spin scroll (only at landing in v1)
- Big symbols from random fill (only target frames place them)
- Pool shrink on MultiWays collapse (high-water mark)

## Test plan

- [x] `pnpm typecheck` — green
- [x] `pnpm --filter pixi-reels test` — 196 / 196 pass
- [x] `pnpm check:lint` — green
- [x] `pnpm --filter pixi-reels build` — green (`dist/index.js` 73.86 kB → 18.93 kB gzip)
- [x] `pnpm examples:build` — all 4 examples build
- [x] `pnpm --filter @pixi-reels/site build` — 75 pages
- [x] Browser preview: pyramid renders `[3,5,5,5,3]` with no buffer peek
- [x] Browser preview: MultiWays reshapes from `[7,7,7,7,7,7]` through varied shapes; cells snap, pin overlays tween
- [x] Browser preview: sticky wild on MultiWays — clamp + restore demonstrated across `[5] → [3] → [7] → [4]` cycle
- [x] Browser preview: big symbols — 2×2, 3×3, 1×3, 2×4 all land correctly
- [x] Browser preview: card symbols (PIXI.Graphics) render at exact cell sizes across all MultiWays shapes
