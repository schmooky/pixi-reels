# pixi-reels

## 0.3.0

### Minor Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`28551ca`](https://github.com/schmooky/pixi-reels/commit/28551ca72e6cbc1e95984cf1b35e71bdb5f18d22) Thanks [@schmooky](https://github.com/schmooky)! - Add: per-reel geometry, MultiWays, big symbols, and expanding wilds.

  - **Per-reel static shape (pyramids):** `builder.visibleRowsPerReel([3, 5, 5, 5, 3])`, optional `reelPixelHeights`, `reelAnchor: 'top' | 'center' | 'bottom'`. Reels can now have non-uniform row counts at build time.
  - **MultiWays (per-spin row variation):** `builder.multiways({ minRows, maxRows, reelPixelHeight })` plus `reelSet.setShape(rowsPerReel)` mid-spin. A new `AdjustPhase` (inserted only when `.multiways(...)` is called) reshapes reels between SPIN and STOP. Pin migration follows: pins gain a frozen `originRow` and migrate back toward it on each reshape.
  - **Big symbols (`N×M` blocks):** `register('bonus', SymbolClass, { size: { w: 2, h: 2 } })`. The result grid stays `string[][]` — the engine paints OCCUPIED across the block. `getSymbolFootprint(col, row)` resolves any cell to the anchor.
  - **Expanding wilds:** unchanged from the existing pin API; reaffirmed via tests as a degenerate big-symbol case.

  New events: `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated`. They only fire on MultiWays slots — non-MultiWays event surfaces are unchanged.

  New runtime: `reelSet.setShape()`, `reelSet.getSymbolFootprint()`, `reelSet.getVisibleGrid()`, `reelSet.isMultiWaysSlot`. New builder fluents: `.visibleRowsPerReel()`, `.reelPixelHeights()`, `.reelAnchor()`, `.multiways()`, `.pinMigrationDuration()`, `.pinMigrationEase()`. Pin gains optional `originRow`.

  AdjustPhase animates the reshape: every visible symbol tweens its height + Y from the old shape to the new one over `pinMigrationDuration` ms with the configurable `pinMigrationEase`. Pin overlays tween in lock-step so a sticky wild visibly slides to its migrated row. Set `pinMigrationDuration(0)` for an instant snap.

  Constraints: big symbols and MultiWays are mutually exclusive per slot in v1. Cascade mode + MultiWays throws at build.

  **Breaking** (debug-only, not protected by semver but called out): `DebugSnapshot.visibleRows` widens from `number` to `number[]` so jagged shapes are representable. Adapt downstream code that deep-reads the snapshot.

### Patch Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`4b22c00`](https://github.com/schmooky/pixi-reels/commit/4b22c00b0f5733d141de1fee4ed8bf515cc2a513) Thanks [@schmooky](https://github.com/schmooky)! - Fix and harden a handful of follow-ups from the per-reel-geometry / MultiWays / big-symbols PR:

  - `Reel.reshape()` now keeps `_reelHeight` in sync with the new geometry so the field doesn't go stale after a reshape. Previously a direct external call left `reelHeight` reporting the construction-time value. The method is also marked `@internal` in JSDoc — `ReelSet.setShape()` is the supported entry point.
  - `ReelSetBuilder.maskStrategy()` now validates its argument synchronously: passing `null`, `undefined`, or an object missing `build()` / `update()` methods throws with a grep-able error instead of crashing later inside `ReelViewport`.
  - Added a comment in `SpinController.skip()` documenting the reshape-on-skip contract — pin overlays migrate instantly on slam-stop regardless of `pinMigrationDuration`, and the rationale (overlays are destroyed at land anyway).

  No new public API; behaviour for existing well-formed callers is unchanged.

## 0.2.0

### Minor Changes

- [`3fd806a`](https://github.com/schmooky/pixi-reels/commit/3fd806a31d76be5fc6ac7ff8e23852814c542e1a) - Backfill for three engine PRs merged without changesets after `0.1.0`:

  - Cascade drop-in mechanic and anticipation recipe ([#51](https://github.com/schmooky/pixi-reels/issues/51)).
  - Engine primitives: `CellPin`, `movePin`, and `reelSet.frame` exposure ([#52](https://github.com/schmooky/pixi-reels/issues/52)).
  - `ReelSet.getCellBounds` for overlays, paylines, and hit areas ([#53](https://github.com/schmooky/pixi-reels/issues/53)).

  All three are additive, so this bundles them into a single minor bump.

- [`555c9f0`](https://github.com/schmooky/pixi-reels/commit/555c9f007d749a8e2329a53dc17208fc94d7b5f3) - Add: `WinPresenter` — a minimal win-presentation layer that animates winning cells and fires events. Paylines, cluster pops, scatter splashes all use the same shape. The library never draws lines or overlays; user code does that by reacting to events.

  - `WinPresenter.show(wins: Win[])` — animates each win's cells, one by one. `stagger: 0` flashes simultaneously, `stagger > 0` sweeps left-to-right in cell order.
  - `Win` — one shape: `{ cells: SymbolPosition[]; value?: number; kind?: string; id?: number }`. Covers paylines, clusters, cascade pops, scatters.
  - `dimLosers` (default 0.35 alpha) fades non-winning cells during each win; restored on `win:end`.
  - `symbolAnim`: `'win'` (default, calls `playWin()`), a named spine animation, or `(symbol, cell, win) => Promise<void>` for a custom callback.
  - Events fire on `ReelSet.events`: `win:start` (full list), `win:group` (per-win), `win:symbol` (per-cell), `win:end` (`complete` / `aborted`). Subscribe with `reelSet.getCellBounds` to draw any overlay you want.
  - Cascades: call `presenter.show([{ cells: winners }])` from `runCascade`'s `onWinnersVanish` hook — same API.
  - Helper: `sortByValueDesc` exported for convenience.
  - Types: `Win`, `SymbolPosition` (canonicalised to `config/types`, re-exported from events).
  - Reels now have an explicit `container.zIndex = reelIndex` so the viewport's sorted `maskedContainer` draws reels deterministically — same order as before, but callers can flip it for bottom-left diagonal overflow.

  No existing API is changed or removed.

### Patch Changes

- [`7792142`](https://github.com/schmooky/pixi-reels/commit/779214217bb341cfb66f2db74616b2e8608893b9) - Fix: Two `AnimatedSpriteSymbol` bugs that only manifest on symbols with non-trivial win animations:

  - `resize()` now positions the sprite according to its configured anchor, so `anchor: { x: 0.5, y: 0.5 }` renders the symbol centred in its cell instead of with its centre pinned to the cell's top-left corner (which clipped three quarters of the symbol under the reel mask). `anchor: (0, 0)` — the prior default and only combination that worked — is unchanged.
  - `playWin()` now returns the animation to frame 0 (`gotoAndStop(0)`) when the sequence completes, so the idle visible state settles on the neutral base frame. Previously the sprite held its last animation frame indefinitely — fine for symmetric pulses that happen to end where they started, a visible glitch for anything else (AI-generated or keyframe sequences that end mid-action).
