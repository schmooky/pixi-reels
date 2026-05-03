# ADR 014: MaskStrategy is a public extension point

## Status: Accepted

## Context

ADR 012 introduced `MaskStrategy` as an **internal** seam inside `ReelViewport`. The original plan: ship two implementations (`RectMaskStrategy`, `SharedRectMaskStrategy`), keep the interface unexported, and only expose it later if a consumer asked for non-rectangular masks (curved frames, hexagonal grids, custom shaders).

That changed during PR review for the per-reel-geometry / MultiWays / big-symbols work:

- Big symbols + `symbolGap.x > 0` need `SharedRectMaskStrategy` to avoid clipping a cross-reel block at every column gap. The engine auto-picks it, but consumers wanted an explicit override knob without monkey-patching `ReelViewport`.
- Pyramid layouts and big-symbol slots have different correctness requirements (per-reel rects clip pyramid buffer-row peek; shared rect lets big symbols stay whole). Letting the consumer make that choice explicitly is cleaner than baking heuristics into the builder.
- A "non-rectangular masks come later" promise gets stale fast. Promoting the seam now means recipe authors can demo curved frames without forking the library.

ADR 012 noted this as deferred. This ADR records the decision to promote.

## Decision

`MaskStrategy` is now a **public** extension point:

- `MaskStrategy`, `RectMaskStrategy`, `SharedRectMaskStrategy`, and `ReelMaskRect` are exported from `pixi-reels`.
- `ReelSetBuilder.maskStrategy(strategy)` is the wiring point. It validates that `strategy` has both `build(...)` and `update(...)` methods (throws otherwise so plain-JS callers get a grep-able error instead of a deep `ReelViewport` crash).
- The auto-pick in the builder (`SharedRectMaskStrategy` when big symbols are registered AND `symbolGap.x > 0`) still runs, and only fires when the consumer didn't call `maskStrategy(...)` explicitly. Explicit always wins.
- The interface is small: `build(rects, totalWidth, totalHeight) → Graphics` and `update(graphics, rects, totalWidth, totalHeight) → void`. Custom strategies are free to draw any shape PixiJS supports — rounded rects, hex tiles, full-canvas filters.

## Consequences

- Consumers can implement non-rectangular masks without forking the library. The v1 stencil/shape-mask backlog item from ADR 012 collapses to "implement and ship as a third built-in strategy" rather than "promote the seam first."
- Public surface area grew by one interface and two classes. Keeping this small is the price of letting consumers extend safely.
- Future versions of `ReelViewport` are now constrained: `MaskStrategy.build`/`update` signatures are part of the public contract. Changes that break custom strategies need a major version bump.
- The auto-pick remains invisible to callers who don't care; the explicit knob is there for the ones who do.

## Alternatives considered

- **Keep it internal, add a `bigSymbolMaskMode: 'auto' | 'shared' | 'per-reel'` enum on the builder.** Solves the immediate big-symbol + gap case but gives no path for custom shapes. Rejected — same complexity, less generality.
- **Promote `MaskStrategy` only, keep both implementations internal.** Forces consumers to roll their own even for known cases. Rejected — `RectMaskStrategy` and `SharedRectMaskStrategy` cover the cases we want recipe authors to demonstrate.
- **Wait for v2 to expose this.** Defers a real consumer ask. Rejected — the surface is small enough to ship now.
