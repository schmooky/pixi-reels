---
'pixi-reels': major
---

Add: a `pixi-reels/debug` subpath drawn with `pixi-silk` (smooth, exact vector graphics), with a spin timeline, a metrics plaque, a phase-aware hud, `SpinMetrics`, `DebugPlaque` and `roundRectPath`. Move: `debugOverlay` and `OVERLAY_LABEL` from `pixi-reels` to `pixi-reels/debug`. Remove: `showMask()` and `overlay()` from the `enableDebug()` window hook. Breaking only for code that imports the overlay or calls those two; `debugSnapshot`, `debugGrid`, the frame recorder and `enableDebug` stay where they were.

**Opt in with one import.** `pixi-silk` is an optional peer dependency, like the Spine runtime: install it next to `pixi-reels` (`pnpm add -D pixi-silk`) and import from `pixi-reels/debug`. A build that never imports the subpath never needs it, and the main entry no longer carries any drawing code for debugging.

```ts
import { debugOverlay } from 'pixi-reels/debug';

const overlay = debugOverlay(reelSet, { layers: 'all', live: true, ticker: app.ticker });
```

**The overlay is drawn with pixi-silk.** Every layer (`mask`, `cells`, `buffers`, `thresholds`, `axis`, `feed`, `bounds`, `blocks`, `pins`) is a `SilkGraphics`, so outlines, dashes and arrows stay exact at the scale the reel set is fitted to instead of faceting or crawling. Layer objects keep their `pixi-reels:debugOverlay:<layer>` labels.

**New layers.** `metrics` is a plaque under the mask with the current round: its length, time to the first stop, the landing order and the largest gap between landings, every tease window, the last skip press (mode, reels, time), how many symbols the pool had to build, event count, fps, pins, spotlight, wins and cascade chains. `timeline` is a panel beside it: every reel's phases for the round on one time axis, colored like `PhaseCardSymbol`, with the reel's speed traced on top, a tick where it was asked to stop, a dot where it landed, and a dashed line at every skip press. `hud` is now one plaque with a phase swatch and a speed meter per reel row. `describe()` also returns the `round` the panels show.

**`SpinMetrics`.** The recorder behind those panels, usable on its own: `new SpinMetrics(reelSet, { ticker })` keeps the last rounds (`current`, `rounds`, `totals`, `snapshot()`), each with per-reel phase spans, stop, landing and settle times, tease windows, skip presses and, given a ticker, a speed trace. Pass one to `debugOverlay(reelSet, { metrics })` and the panels show the rounds from before the overlay existed.

**`DebugPlaque`.** Rows of monospace text on a smooth rounded plate, with optional title, swatches (legends) and meters, sized from the character count so it is exact and cheap enough to update every frame. `plaque.text = '...'` works like a `Text`. Every readout on the docs site's recipes now uses it.

**`__PIXI_REELS_DEBUG.metrics()`.** `enableDebug()` records rounds from the moment it is called, and `metrics()` hands them back as plain JSON, so an agent can ask how long a tease lasted or which reel landed last without a canvas.

**Removed from the window hook.** `showMask(enabled)` drew with plain `Graphics` into the masked container, under the spotlight; `debugOverlay(reelSet, { layers: ['mask'] })` draws the same mask box and per-reel rects above everything. `overlay(options)` is `debugOverlay(reelSet, options)` from `pixi-reels/debug`.
