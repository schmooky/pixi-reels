# ADR 012: Per-reel geometry and the Adjust phase

## Status: Accepted (load-bearing)

## Context

The original engine assumed every reel had the same `visibleRows` and `symbolHeight`. That blocked four real-world layouts at once:

- **Static pyramids** like `3-5-5-5-3` — non-uniform row counts across reels, fixed at build time.
- **Megaways** — row count per reel varies *per spin*, driven by the server. Reel pixel height is fixed; cell height is derived as `reelPixelHeight / visibleRows[i]`.
- **Big symbols** — a single symbol occupying an `N×M` block of cells (2×2 bonus, 3×3 giant). Same uniform cell grid, different rendering.
- **Expanding wilds** — degenerate big symbols at `{w: 1, h: visibleRows}`, naturally subsumed by big-symbol support.

All four touch the same invariants (grid layout, symbol size, cell bounds, mask geometry) and adding them piecemeal would have meant fighting the same scalar assumptions multiple times.

## Decision

### Per-reel geometry

`Reel` gains four read-only fields the builder fills in once:

- `visibleRows: number` — mutable for Megaways via `Reel.reshape()`, immutable otherwise.
- `symbolHeight: number` — same mutability rule. During SPIN, equals `spinSymbolHeight` for non-Megaways slots. AdjustPhase mutates it for Megaways.
- `reelHeight: number` — pixel-box height, immutable.
- `offsetY: number` — Y offset relative to the viewport, immutable. Computed from `reelAnchor` (`'top' | 'center' | 'bottom'`).
- `spinSymbolHeight: number` — frozen at construction. Equals `config.grid.symbolHeight`.

`ReelGridConfig` gains `visibleRowsPerReel?: number[]`, `reelPixelHeights?: number[]`, `reelAnchor?`, and `megaways?: MegawaysConfig`. The scalar `visibleRows` and `symbolHeight` stay valid for uniform slots — additive only.

### The Adjust phase

A new `AdjustPhase` is inserted between `SpinPhase` and `StopPhase` **only when `builder.megaways(...)` is called**. Non-Megaways slots run the original `start → spin → stop` chain unchanged, so:

- `adjust:start`, `adjust:complete`, `pin:migrated`, `shape:changed` events never fire on non-Megaways slots — downstream consumers don't have to ignore phantom events.
- Pin migration is only relevant under reshape, which only happens for Megaways.
- The chain stays minimal for the common case.

`AdjustPhase` commits the new `visibleRows` and per-reel cell height, resizes existing symbols, reshapes the motion layer, and (later, optional) tweens pin overlays from old to new cell positions.

### Mask strategy

`MaskStrategy` is an internal interface in `ReelViewport`. v1 ships `RectMaskStrategy`, which draws one rectangle per reel into a single PixiJS mask Graphics — the union of those rects is the clip shape. Pyramid layouts clip cleanly without buffer-row peek because each reel has its own clip rect. Non-rectangular masks (curved frames, hexagonal grids) need a different strategy implementation — the interface is in place so the swap is one line.

## Consequences

- The frame builder is unchanged at the per-reel level. Cross-reel coordination (big-symbol OCCUPIED painting, Megaways shape) lives in `SpinController` ahead of per-reel `FrameBuilder.build()` calls.
- `DebugSnapshot.visibleRows` widens from `number` to `number[]`. Callers that deep-read the snapshot need to adapt — but the snapshot is debug-only and not protected by semver.
- Cascade + Megaways is rejected at build (`mode('cascade')` + `megaways()` throws). Combination is niche and was deferred.
- Big symbols + Megaways is rejected at build (registering `SymbolData.size > 1×1` on a `.megaways(...)` slot throws). Game-design guardrail more than an engine guardrail.

## Alternatives considered

- **Always insert AdjustPhase, zero-skip on non-Megaways.** Simpler chain, but emits phantom events and adds a wasted phase boundary to every spin. Rejected via maintainer review (discussion #58, section 19.5).
- **Push Megaways into a FrameBuilder middleware.** Doesn't work — reshape must mutate `Reel` and `ReelMotion` state, which sits below the frame layer.
- **Per-reel X offsets / irregular column spacing.** Deferred. The same `offsetY` pattern would extend cleanly to `offsetX` if a customer ever asks.
