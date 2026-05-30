---
"pixi-reels": patch
---

Fix: `setResult` / `initialFrame` buffer-count validation now measures the highest defined index, not raw array length. A sparse `bufferAbove: ['X', undefined, undefined]` (common from serializers that pre-size arrays) no longer throws a spurious `RangeError`, while a defined entry beyond the consumable range still throws.
