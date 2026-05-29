---
"pixi-reels": major
---

Remove the legacy `string[][]` form from `setResult` and `initialFrame`. Use the `ColumnTarget[]` shape, which survives `structuredClone` / JSON / `postMessage`.
