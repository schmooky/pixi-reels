---
"pixi-reels": minor
---

Add: `HorizontalReel` + `HorizontalReelBuilder` — a single sideways-scrolling
symbol strip for the "these symbols pay this round" banner above the reels.
One row (not a matrix, not a spin lifecycle), travels `ltr` or `rtl`, in either
`scroll` (smooth marquee) or `cascade` (discrete one-cell stepping) mode.
`setContent(ids)` swaps the paying set live; `symbol:entered` / `cascade:step`
events and `symbolAt(slot)` expose the strip to the game layer. Built on the
shared pool / ticker / event primitives, so it recycles instances and cleans up
via `destroy()`.
