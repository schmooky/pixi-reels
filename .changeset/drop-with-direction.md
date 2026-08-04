---
'pixi-reels': major
---

Remove: `ReelAxis.withDirection()`, and with it the last trace of a per-spin direction override that never shipped.

The method had **zero call sites in `src`**. It existed only to serve ADR 016 section 3.5's `spin({ direction })` / `spin({ directionPerReel })`, which is not implemented and is absent from `SpinOptions`. Shipping it would have frozen a method into all of 2.x whose only justification was an unbuilt feature -- the same trap as exporting the v1 rename tables.

Direction is fixed at `build()`: `.direction(d)` and `.directionPerReel([...])`. Nothing else changes. The engine constructs one axis per reel via `reelAxis(orientation, direction)` and has never needed a sibling; if you were calling `withDirection` yourself, call `reelAxis(axis.orientation, d)` instead.

Implementing the per-spin override is a feature PR after 2.0, not a freeze rider: `Reel._axis` is `readonly` and is handed to `ReelMotion`, `ReelViewport`, and every phase at construction, so a per-spin flip needs a re-injection path through all of them, plus the mid-spin-throw guard and the section 3.4 "both buffers >= 1" validation that only per-spin overrides force. Re-adding the method then is additive -- consumers receive axes, they do not implement the interface. ADR 016 records this as decision 4 under Status, so it does not get re-proposed from the design doc.
