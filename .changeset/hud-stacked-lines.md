---
'pixi-reels': patch
---

Fix: `debugOverlay`'s `hud` layer is readable. It stacks its lines instead of overprinting them, and sits on a backing plate.

Each line was anchored at its own reel's top-left corner, which assumes a line fits inside a reel. It does not: roughly 40 characters at 11px monospace is ~230px against a cell that is typically ~100px wide. On any set past two reels every line ran across its neighbours into an unreadable smear, and it got worse the more reels you had -- which is exactly when the hud is worth reading.

The lines are now one left-aligned column anchored inside the mask's top-left, one per reel, so they read at any reel count and in either orientation. Stacking them *outside* the mask would keep the reels clear, but a host that framed its camera on the reel set before the overlay existed then renders the whole block off-screen, and an invisible hud is worse than a cluttered one. Drop `hud` from `layers` if it covers art you need to see.

Also: 10px on an 11px leading rather than 11/13, a translucent black plate behind the column so white text survives bright symbols, and `resolution = 1` on the lines so small glyphs rasterize blocky instead of grey-smeared.

The `r<n>` prefix still ties a line to its reel, and the `cells` layer still labels each cell `reel,cell`. Nothing about the reported fields changed.
