---
'pixi-reels': patch
---

Fix: negative indices in `initialFrame` now correctly populate buffer-above slots. Setting `frame[col][-1]` (or `[-2]` for deeper buffers) places the symbol in the corresponding buffer-above cell instead of being silently ignored.
