---
"pixi-reels": minor
---

Add: `debugOverlay(reelSet, { layers, live, ticker })` - a layered visual debug overlay for the static / at-rest layers (`mask`, `cells`, `buffers`, `bounds`, `blocks`, `pins`, `hud`). It draws into a `Container` added to the `ReelSet` itself, so it renders above the viewport (including the spotlight container) rather than under it like `showMask`. The handle exposes `setLayers(...)`, `redraw()` and `destroy()`, implements `Disposable`, pools its `Graphics`/`Text` (never recreated per frame), and when `live: true` drives per-frame redraw of the live layers through `TickerRef` (default `Ticker.shared`, override via `ticker`). Static layers only redraw on `shape:changed` / `adjust:complete`. Also reachable as `__PIXI_REELS_DEBUG.overlay(...)`. Dev-only, same caveat as `enableDebug`: it reads internals, is not semver-protected, and must not reach a production bundle. The axis / feed / thresholds layers arrive with A11b once `ReelAxis` is wired through `Reel`.
