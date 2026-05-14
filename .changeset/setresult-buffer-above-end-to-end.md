---
'pixi-reels': minor
---

Add: `ColumnTarget` — explicit `{ visible, bufferAbove?, bufferBelow? }` input shape for `setResult`. Survives `structuredClone`, JSON, and `postMessage` (the legacy negative-index form does not). Either shape is accepted.

Fix: `setResult` (legacy `string[][]` form) now honours `frame[col][-1]…[-bufferAbove]` end-to-end. Previously the negative-index slots were dropped inside `_applyPinsToGrid` (when pins were active) and `_coordinateBigSymbols` (always) by plain spread clones, so the convention only worked through `initialFrame`. The clones now use a property-preserving helper.

Fix: `Reel.placeSymbols` (skip / turbo land path) now reads the negative-index slot for the buffer-above cell instead of always random-filling it. Buffer-below targeting via `symbolIds[visibleRows]` is unchanged.
