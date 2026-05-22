---
'pixi-reels': patch
---

Fix: `ReelSet.setResult` and `ReelSetBuilder.initialFrame` now throw a `RangeError` when a `ColumnTarget.bufferAbove` / `bufferBelow` carries more entries than the engine's configured `bufferSymbols(...)`, instead of silently dropping the extras.

Previously, calling `.bufferSymbols(1)` and passing `bufferAbove: ['X', 'Y']` would materialize both `arr[-1]='X'` and `arr[-2]='Y'`, but the next clone (`cloneColumn`) only iterates `-1..-bufferAbove` — `Y` was written to the array, dropped on the next pass, and never reached the reel. No error, no warning; the only symptom was "my targeted symbol never lands." Same problem on the `bufferBelow` side via indices past `visible + bufferBelow`.

The check now fails fast at the API entry point with a column-pointing message: `setResult column 2: bufferAbove has 2 entries but engine bufferSymbols=1 — extra entries would be silently dropped. Increase bufferSymbols(...) on the builder or remove the extra entries.` The legacy `frame[col][-k]` form is also validated for negative-index keys beyond `-bufferAbove`. The legacy form's array `length` is intentionally not checked — in MultiWays the per-reel `visibleRows` changes between `setShape()` and `setResult()`, and any length-based check would false-positive on legitimate post-reshape calls.

This is user-visible error behavior: input that previously silently failed now throws. Callers passing more entries than the configured buffer size should either increase `bufferSymbols(...)` or trim the extra entries.
