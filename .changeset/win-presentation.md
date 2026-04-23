---
"pixi-reels": minor
---

Add: `WinPresenter` — a minimal win-presentation layer that animates winning cells and fires events. Paylines, cluster pops, scatter splashes all use the same shape. The library never draws lines or overlays; user code does that by reacting to events.

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
