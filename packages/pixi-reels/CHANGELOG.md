# pixi-reels

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
