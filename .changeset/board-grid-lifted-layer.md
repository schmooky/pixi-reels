---
"pixi-reels": patch
---

Fix: `BoardGrid` (and so `HoldAndWinBoard`) now draws every cell's chrome beneath every reel and renders the unmasked, at-rest symbols of all cells on one `RenderLayer` above the whole board. A coin with `unmask: true` whose art overflows its cell used to be covered by the next cell's chrome and blank symbol, cutting it along the neighbour's edge.
